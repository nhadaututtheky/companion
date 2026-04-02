/**
 * Schedule CRUD routes.
 *
 * GET    /api/schedules              — list all
 * POST   /api/schedules              — create
 * GET    /api/schedules/upcoming     — next N runs
 * GET    /api/schedules/:id          — get one
 * PATCH  /api/schedules/:id          — update
 * DELETE /api/schedules/:id          — delete
 * PATCH  /api/schedules/:id/toggle   — toggle enabled
 * POST   /api/schedules/:id/run-now  — manual trigger
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";
import { getDb } from "../db/client.js";
import { schedules, projects } from "../db/schema.js";
import { computeAndSetNextRun } from "../services/scheduler.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type { ApiResponse } from "@companion/shared";

// ── Validation ────────────────────────────────────────────────────────

const telegramTargetSchema = z.object({
  mode: z.enum(["off", "private", "group"]),
  botId: z.string().optional(),
  chatId: z.number().optional(),
  topicId: z.number().optional(),
});

const autoStopRulesSchema = z.object({
  maxCostUsd: z.number().positive().optional(),
  maxTurns: z.number().int().positive().optional(),
  maxDurationMs: z.number().int().positive().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  projectSlug: z.string().min(1),
  prompt: z.string().max(10000).optional(),
  templateId: z.string().optional(),
  templateVars: z.record(z.string()).optional(),
  model: z.string().default("claude-sonnet-4-6"),
  permissionMode: z.string().default("default"),
  triggerType: z.enum(["once", "cron"]),
  cronExpression: z.string().max(100).optional(),
  scheduledAt: z.number().optional(),
  timezone: z.string().max(50).default("UTC"),
  telegramTarget: telegramTargetSchema.optional(),
  autoStopRules: autoStopRulesSchema.optional(),
  enabled: z.boolean().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  prompt: z.string().max(10000).optional(),
  templateId: z.string().optional(),
  templateVars: z.record(z.string()).optional(),
  model: z.string().optional(),
  permissionMode: z.string().optional(),
  cronExpression: z.string().max(100).optional(),
  scheduledAt: z.number().optional(),
  timezone: z.string().max(50).optional(),
  telegramTarget: telegramTargetSchema.optional(),
  autoStopRules: autoStopRulesSchema.optional(),
  enabled: z.boolean().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────

function validateCron(expr: string): boolean {
  try {
    CronExpressionParser.parse(expr);
    return true;
  } catch {
    return false;
  }
}

function computeNextRunDate(
  triggerType: string,
  cronExpr: string | null,
  scheduledAt: number | null,
  timezone: string,
): Date | null {
  if (triggerType === "once" && scheduledAt) {
    return new Date(scheduledAt);
  }
  if (triggerType === "cron" && cronExpr) {
    try {
      const interval = CronExpressionParser.parse(cronExpr, { tz: timezone });
      return interval.next().toDate();
    } catch {
      return null;
    }
  }
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────

export function scheduleRoutes(bridge: WsBridge): Hono {
  const router = new Hono();

  // List all schedules
  router.get("/", (c) => {
    const db = getDb();
    const rows = db.select().from(schedules).orderBy(desc(schedules.createdAt)).all();
    return c.json({ success: true, data: rows } satisfies ApiResponse);
  });

  // Upcoming runs — next N computed from all enabled schedules
  router.get("/upcoming", (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);
    const db = getDb();
    const enabled = db.select().from(schedules).where(eq(schedules.enabled, true)).all();

    const upcoming: Array<{
      scheduleId: string;
      name: string;
      projectSlug: string | null;
      nextRunAt: number;
      triggerType: string;
    }> = [];

    for (const s of enabled) {
      if (s.nextRunAt) {
        const ts = s.nextRunAt instanceof Date ? s.nextRunAt.getTime() : Number(s.nextRunAt);
        upcoming.push({
          scheduleId: s.id,
          name: s.name,
          projectSlug: s.projectSlug,
          nextRunAt: ts,
          triggerType: s.triggerType,
        });
      }

      // For cron schedules, also compute next few runs
      if (s.triggerType === "cron" && s.cronExpression) {
        try {
          const interval = CronExpressionParser.parse(s.cronExpression, { tz: s.timezone });
          // Skip first (already added via nextRunAt), get next 4
          interval.next(); // skip
          for (let i = 0; i < 4; i++) {
            const next = interval.next().toDate();
            upcoming.push({
              scheduleId: s.id,
              name: s.name,
              projectSlug: s.projectSlug,
              nextRunAt: next.getTime(),
              triggerType: s.triggerType,
            });
          }
        } catch {
          // invalid cron — skip
        }
      }
    }

    // Sort by nextRunAt ascending, take limit
    upcoming.sort((a, b) => a.nextRunAt - b.nextRunAt);
    return c.json({
      success: true,
      data: upcoming.slice(0, limit),
    } satisfies ApiResponse);
  });

  // Get single schedule
  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const db = getDb();
    const row = db.select().from(schedules).where(eq(schedules.id, id)).get();

    if (!row) {
      return c.json({ success: false, error: "Schedule not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true, data: row } satisfies ApiResponse);
  });

  // Create schedule
  router.post("/", zValidator("json", createSchema), (c) => {
    const input = c.req.valid("json");

    // Validate cron expression if provided
    if (input.triggerType === "cron") {
      if (!input.cronExpression) {
        return c.json(
          {
            success: false,
            error: "cronExpression required for cron trigger type",
          } satisfies ApiResponse,
          400,
        );
      }
      if (!validateCron(input.cronExpression)) {
        return c.json(
          { success: false, error: "Invalid cron expression" } satisfies ApiResponse,
          400,
        );
      }
    }

    if (input.triggerType === "once" && !input.scheduledAt) {
      return c.json(
        {
          success: false,
          error: "scheduledAt required for one-time trigger",
        } satisfies ApiResponse,
        400,
      );
    }

    const id = randomUUID().slice(0, 12);
    const now = new Date();
    const nextRunAt = computeNextRunDate(
      input.triggerType,
      input.cronExpression ?? null,
      input.scheduledAt ?? null,
      input.timezone,
    );

    const db = getDb();
    db.insert(schedules)
      .values({
        id,
        name: input.name,
        projectSlug: input.projectSlug,
        prompt: input.prompt ?? null,
        templateId: input.templateId ?? null,
        templateVars: input.templateVars ?? {},
        model: input.model,
        permissionMode: input.permissionMode,
        triggerType: input.triggerType,
        cronExpression: input.cronExpression ?? null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        timezone: input.timezone,
        telegramTarget: input.telegramTarget ?? { mode: "off" as const },
        autoStopRules: input.autoStopRules ?? {},
        enabled: input.enabled,
        nextRunAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(schedules).where(eq(schedules.id, id)).get();
    return c.json({ success: true, data: row } satisfies ApiResponse, 201);
  });

  // Update schedule
  router.patch("/:id", zValidator("json", updateSchema), (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const db = getDb();

    const existing = db.select().from(schedules).where(eq(schedules.id, id)).get();
    if (!existing) {
      return c.json({ success: false, error: "Schedule not found" } satisfies ApiResponse, 404);
    }

    // Validate cron if being changed
    if (input.cronExpression && !validateCron(input.cronExpression)) {
      return c.json(
        { success: false, error: "Invalid cron expression" } satisfies ApiResponse,
        400,
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.prompt !== undefined) updates.prompt = input.prompt;
    if (input.templateId !== undefined) updates.templateId = input.templateId;
    if (input.templateVars !== undefined) updates.templateVars = input.templateVars;
    if (input.model !== undefined) updates.model = input.model;
    if (input.permissionMode !== undefined) updates.permissionMode = input.permissionMode;
    if (input.cronExpression !== undefined) updates.cronExpression = input.cronExpression;
    if (input.scheduledAt !== undefined) updates.scheduledAt = new Date(input.scheduledAt);
    if (input.timezone !== undefined) updates.timezone = input.timezone;
    if (input.telegramTarget !== undefined) updates.telegramTarget = input.telegramTarget;
    if (input.autoStopRules !== undefined) updates.autoStopRules = input.autoStopRules;
    if (input.enabled !== undefined) updates.enabled = input.enabled;

    db.update(schedules).set(updates).where(eq(schedules.id, id)).run();

    // Recompute nextRunAt
    computeAndSetNextRun(id);

    const row = db.select().from(schedules).where(eq(schedules.id, id)).get();
    return c.json({ success: true, data: row } satisfies ApiResponse);
  });

  // Delete schedule
  router.delete("/:id", (c) => {
    const id = c.req.param("id");
    const db = getDb();
    db.delete(schedules).where(eq(schedules.id, id)).run();
    return c.json({ success: true } satisfies ApiResponse);
  });

  // Toggle enabled
  router.patch("/:id/toggle", (c) => {
    const id = c.req.param("id");
    const db = getDb();

    const existing = db.select().from(schedules).where(eq(schedules.id, id)).get();
    if (!existing) {
      return c.json({ success: false, error: "Schedule not found" } satisfies ApiResponse, 404);
    }

    const newEnabled = !existing.enabled;
    db.update(schedules)
      .set({ enabled: newEnabled, updatedAt: new Date() })
      .where(eq(schedules.id, id))
      .run();

    // Recompute nextRunAt when re-enabling
    if (newEnabled) {
      computeAndSetNextRun(id);
    }

    const row = db.select().from(schedules).where(eq(schedules.id, id)).get();
    return c.json({ success: true, data: row } satisfies ApiResponse);
  });

  // Manual trigger — run now regardless of schedule time
  router.post("/:id/run-now", async (c) => {
    const id = c.req.param("id");
    const db = getDb();

    const schedule = db.select().from(schedules).where(eq(schedules.id, id)).get();
    if (!schedule) {
      return c.json({ success: false, error: "Schedule not found" } satisfies ApiResponse, 404);
    }

    // Resolve project cwd
    let cwd = ".";
    if (schedule.projectSlug) {
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.slug, schedule.projectSlug))
        .get();
      if (project) cwd = project.dir;
    }

    const prompt = schedule.prompt ?? "";
    if (!prompt) {
      return c.json({ success: false, error: "Schedule has no prompt" } satisfies ApiResponse, 400);
    }

    try {
      const sessionId = await bridge.startSession({
        projectSlug: schedule.projectSlug ?? undefined,
        cwd,
        model: schedule.model,
        permissionMode: schedule.permissionMode,
        prompt,
        source: "scheduler",
        name: `[manual] ${schedule.name}`,
      });

      // Update run count + lastRunAt
      db.update(schedules)
        .set({
          lastRunAt: new Date(),
          runCount: schedule.runCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(schedules.id, id))
        .run();

      return c.json({ success: true, data: { sessionId } } satisfies ApiResponse);
    } catch (err) {
      return c.json(
        {
          success: false,
          error: `Failed to launch session: ${String(err)}`,
        } satisfies ApiResponse,
        500,
      );
    }
  });

  return router;
}
