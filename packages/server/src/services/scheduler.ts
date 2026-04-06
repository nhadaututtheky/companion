/**
 * Scheduler Service — Evaluates pending schedules every 60s and launches sessions.
 *
 * - Cron expressions evaluated via `cron-parser`
 * - One-time schedules auto-disable after execution
 * - Missed runs (e.g. server was down) executed on boot
 * - Respects max session limits
 * - Overlap prevention: skips if previous run from same schedule is still active
 * - Concurrent tick protection via mutex flag
 * - All runs logged to `schedule_runs` table for audit trail
 */

import { CronExpressionParser } from "cron-parser";
import { eq, and, lte, desc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { schedules, projects, sessionTemplates, scheduleRuns, sessions } from "../db/schema.js";
import { createLogger } from "../logger.js";
import type { WsBridge } from "./ws-bridge.js";
import type { Schedule } from "@companion/shared";

const log = createLogger("scheduler");

const TICK_INTERVAL_MS = 60_000; // 60 seconds

let tickInterval: ReturnType<typeof setInterval> | null = null;
let bridgeRef: WsBridge | null = null;
let tickInProgress = false; // Concurrent tick protection

// ── Cron Helpers ──────────────────────────────────────────────────────

function computeNextRun(cronExpr: string, timezone: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpr, {
      tz: timezone,
      currentDate: new Date(),
    });
    return interval.next().toDate();
  } catch (err) {
    log.warn("Invalid cron expression", { cronExpr, error: String(err) });
    return null;
  }
}

// ── Run Logging ─────────────────────────────────────────────────────

function logRun(
  scheduleId: string,
  status: "success" | "failed" | "skipped",
  sessionId?: string,
  reason?: string,
) {
  try {
    const db = getDb();
    db.insert(scheduleRuns)
      .values({
        scheduleId,
        sessionId: sessionId ?? null,
        status,
        reason: reason ?? null,
        startedAt: new Date(),
      })
      .run();
  } catch (err) {
    log.error("Failed to log schedule run", { scheduleId, error: String(err) });
  }
}

// ── Overlap Detection ───────────────────────────────────────────────

function hasActiveSession(scheduleId: string): boolean {
  const db = getDb();

  // Check if the last run for this schedule resulted in a still-active session
  const lastRun = db
    .select()
    .from(scheduleRuns)
    .where(and(eq(scheduleRuns.scheduleId, scheduleId), eq(scheduleRuns.status, "success")))
    .orderBy(desc(scheduleRuns.startedAt))
    .limit(1)
    .get();

  if (!lastRun?.sessionId) return false;

  // Check if that session is still running
  const session = db
    .select({ status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, lastRun.sessionId))
    .get();

  if (!session) return false;

  const activeStatuses = ["starting", "running", "waiting", "idle", "busy"];
  return activeStatuses.includes(session.status);
}

// ── Core Tick ─────────────────────────────────────────────────────────

async function tick() {
  if (!bridgeRef) return;

  // Concurrent tick protection
  if (tickInProgress) {
    log.debug("Tick already in progress — skipping");
    return;
  }

  tickInProgress = true;
  try {
    await tickInner();
  } finally {
    tickInProgress = false;
  }
}

async function tickInner() {
  if (!bridgeRef) return;

  const db = getDb();
  const now = Date.now();

  // Find all enabled schedules whose nextRunAt has passed
  const dueSchedules = db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, true), lte(schedules.nextRunAt, new Date(now))))
    .all();

  if (dueSchedules.length === 0) return;

  log.info("Scheduler tick: found due schedules", { count: dueSchedules.length });

  for (const schedule of dueSchedules) {
    try {
      await executeSchedule(schedule as unknown as Schedule);
    } catch (err) {
      log.error("Failed to execute schedule", {
        scheduleId: schedule.id,
        error: String(err),
      });
      logRun(schedule.id, "failed", undefined, String(err));
    }
  }
}

async function executeSchedule(schedule: Schedule) {
  if (!bridgeRef) return;

  const db = getDb();

  // Overlap prevention: skip if previous run is still active
  if (hasActiveSession(schedule.id)) {
    log.info("Skipping schedule — previous run still active", {
      scheduleId: schedule.id,
      name: schedule.name,
    });
    logRun(schedule.id, "skipped", undefined, "Previous run still active");

    // Still compute next run for cron schedules so they don't fire again immediately
    if (schedule.triggerType === "cron" && schedule.cronExpression) {
      const nextRun = computeNextRun(schedule.cronExpression, schedule.timezone);
      if (nextRun) {
        db.update(schedules)
          .set({ nextRunAt: nextRun, updatedAt: new Date() })
          .where(eq(schedules.id, schedule.id))
          .run();
      }
    }
    return;
  }

  // Resolve project directory
  let cwd = ".";
  if (schedule.projectSlug) {
    const project = db.select().from(projects).where(eq(projects.slug, schedule.projectSlug)).get();
    if (project) {
      cwd = project.dir;
    } else {
      log.warn("Schedule references unknown project", {
        scheduleId: schedule.id,
        projectSlug: schedule.projectSlug,
      });
    }
  }

  // Resolve prompt — either direct or from template
  let prompt = schedule.prompt ?? "";
  if (schedule.templateId && !prompt) {
    try {
      const tmpl = db
        .select()
        .from(sessionTemplates)
        .where(eq(sessionTemplates.id, schedule.templateId))
        .get();

      if (tmpl) {
        prompt = tmpl.prompt;
        if (schedule.templateVars) {
          for (const [key, value] of Object.entries(schedule.templateVars)) {
            prompt = prompt.replaceAll(`{{${key}}}`, value);
          }
        }
      }
    } catch {
      log.warn("Failed to resolve template", { templateId: schedule.templateId });
    }
  }

  if (!prompt) {
    log.warn("Schedule has no prompt — skipping", { scheduleId: schedule.id });
    logRun(schedule.id, "skipped", undefined, "No prompt configured");
    return;
  }

  log.info("Executing schedule", {
    scheduleId: schedule.id,
    name: schedule.name,
    triggerType: schedule.triggerType,
  });

  // Launch session via bridge
  let sessionId: string | undefined;
  try {
    sessionId = await bridgeRef.startSession({
      projectSlug: schedule.projectSlug ?? undefined,
      cwd,
      model: schedule.model,
      permissionMode: schedule.permissionMode,
      prompt,
      source: "scheduler",
      name: `[scheduled] ${schedule.name}`,
    });

    // Scheduled sessions should not auto-kill on idle
    bridgeRef.setSessionSettings(sessionId, { keepAlive: true });
  } catch (err) {
    log.error("Failed to start scheduled session", {
      scheduleId: schedule.id,
      error: String(err),
    });
    logRun(schedule.id, "failed", undefined, `Launch failed: ${String(err)}`);
    // Don't disable the schedule on launch failure — it may be transient
    return;
  }

  // Log successful run
  logRun(schedule.id, "success", sessionId);

  // Update schedule state
  const now = Date.now();

  if (schedule.triggerType === "once") {
    // One-time: disable after execution
    db.update(schedules)
      .set({
        enabled: false,
        lastRunAt: new Date(now),
        runCount: schedule.runCount + 1,
        updatedAt: new Date(now),
      })
      .where(eq(schedules.id, schedule.id))
      .run();
  } else if (schedule.triggerType === "cron" && schedule.cronExpression) {
    // Cron: compute next run
    const nextRun = computeNextRun(schedule.cronExpression, schedule.timezone);
    db.update(schedules)
      .set({
        lastRunAt: new Date(now),
        nextRunAt: nextRun ?? undefined,
        runCount: schedule.runCount + 1,
        updatedAt: new Date(now),
      })
      .where(eq(schedules.id, schedule.id))
      .run();
  }
}

// ── Boot: Check Missed Runs ──────────────────────────────────────────

function checkMissedRuns() {
  const db = getDb();
  const now = Date.now();

  // Find one-time schedules that were missed (scheduledAt < now, never ran, still enabled)
  const missed = db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.enabled, true),
        eq(schedules.triggerType, "once"),
        lte(schedules.nextRunAt, new Date(now)),
      ),
    )
    .all();

  if (missed.length > 0) {
    log.info("Found missed one-time schedules — will fire on next tick", {
      count: missed.length,
    });
  }

  // For cron schedules that are overdue, recompute nextRunAt fresh
  const overdueCron = db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.enabled, true),
        eq(schedules.triggerType, "cron"),
        lte(schedules.nextRunAt, new Date(now)),
      ),
    )
    .all();

  for (const s of overdueCron) {
    if (s.cronExpression) {
      const nextRun = computeNextRun(s.cronExpression, s.timezone);
      if (nextRun) {
        db.update(schedules)
          .set({ nextRunAt: nextRun, updatedAt: new Date(now) })
          .where(eq(schedules.id, s.id))
          .run();
        log.debug("Recomputed nextRunAt for overdue cron", {
          scheduleId: s.id,
          nextRunAt: nextRun.toISOString(),
        });
      }
    }
  }

  if (overdueCron.length > 0) {
    log.info("Recomputed nextRunAt for overdue cron schedules", {
      count: overdueCron.length,
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────

export function startScheduler(bridge: WsBridge) {
  bridgeRef = bridge;

  log.info("Starting scheduler (tick every 60s)");

  // Check for missed runs on boot
  checkMissedRuns();

  // Start tick loop
  tickInterval = setInterval(() => {
    tick().catch((err) => {
      log.error("Scheduler tick error", { error: String(err) });
    });
  }, TICK_INTERVAL_MS);

  // Run first tick immediately
  tick().catch((err) => {
    log.error("Initial scheduler tick error", { error: String(err) });
  });
}

export function stopScheduler() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  bridgeRef = null;
  tickInProgress = false;
  log.info("Scheduler stopped");
}

/**
 * Compute and set nextRunAt for a schedule based on its trigger type.
 * Called when creating/updating a schedule.
 */
export function computeAndSetNextRun(scheduleId: string) {
  const db = getDb();
  const s = db.select().from(schedules).where(eq(schedules.id, scheduleId)).get();
  if (!s) return;

  let nextRunAt: Date | null = null;

  if (s.triggerType === "once" && s.scheduledAt) {
    nextRunAt = new Date(
      s.scheduledAt instanceof Date ? s.scheduledAt.getTime() : Number(s.scheduledAt),
    );
  } else if (s.triggerType === "cron" && s.cronExpression) {
    nextRunAt = computeNextRun(s.cronExpression, s.timezone);
  }

  if (nextRunAt) {
    db.update(schedules)
      .set({ nextRunAt, updatedAt: new Date() })
      .where(eq(schedules.id, s.id))
      .run();
  }
}
