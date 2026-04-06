/**
 * WorkflowEngine — sequential multi-agent pipeline orchestrator.
 * Manages workflow lifecycle: start → advance steps → complete/fail.
 *
 * Flow: startWorkflow() creates a channel + spawns step 1 session.
 * When a step's session goes idle, advanceStep() spawns the next step.
 * On final step completion, the workflow is concluded with a summary.
 */

import { getDb } from "../db/client.js";
import { channels } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createLogger } from "../logger.js";
import { getWorkflowTemplate } from "./workflow-templates.js";
import { linkSession } from "./channel-manager.js";
import type { WsBridge } from "./ws-bridge.js";
import type { WorkflowState } from "@companion/shared";

const log = createLogger("workflow-engine");

const STEP_TIMEOUT_MS = 5 * 60_000; // 5 minutes per step
const _WORKFLOW_TIMEOUT_MS = 30 * 60_000; // 30 minutes total (reserved for future use)

/** Active workflow timeout timers */
const stepTimers = new Map<string, ReturnType<typeof setTimeout>>();

let bridgeRef: WsBridge | null = null;

/** Initialize the workflow engine with a reference to the WsBridge. */
export function initWorkflowEngine(bridge: WsBridge): void {
  bridgeRef = bridge;
}

/** Start a new workflow from a template. */
export async function startWorkflow(opts: {
  templateId: string;
  topic: string;
  projectSlug?: string;
  costCapUsd?: number;
  cwd?: string;
}): Promise<{ channelId: string; sessionId: string }> {
  if (!bridgeRef) throw new Error("WorkflowEngine not initialized");

  const template = getWorkflowTemplate(opts.templateId);
  if (!template) throw new Error("Workflow template not found");

  const db = getDb();
  const channelId = randomUUID();
  const now = new Date();

  // Build initial workflow state
  const workflowState: WorkflowState = {
    templateId: template.id,
    templateName: template.name,
    currentStep: 0,
    steps: template.steps.map((s) => ({
      role: s.role,
      sessionId: null,
      status: "pending" as const,
    })),
    topic: opts.topic,
    totalCostUsd: 0,
    costCapUsd: opts.costCapUsd ?? template.defaultCostCapUsd ?? 1.0,
    startedAt: now.toISOString(),
  };

  // Create workflow channel
  db.insert(channels)
    .values({
      id: channelId,
      projectSlug: opts.projectSlug ?? null,
      type: "workflow",
      topic: opts.topic,
      status: "active",
      workflowTemplateId: template.id,
      workflowState,
      createdAt: now,
    })
    .run();

  log.info("Workflow started", { channelId, template: template.name, topic: opts.topic });

  // Spawn first step
  const sessionId = await spawnStep(channelId, workflowState, 0, opts.cwd);

  return { channelId, sessionId };
}

/** Called when a workflow session goes idle — advance to next step. */
export async function onWorkflowSessionIdle(sessionId: string): Promise<void> {
  if (!bridgeRef) return;

  const db = getDb();

  // Find the workflow channel that owns this session
  const allWorkflows = db
    .select()
    .from(channels)
    .where(eq(channels.type, "workflow"))
    .all()
    .filter((ch) => ch.status === "active" && ch.workflowState);

  let targetChannel = null;
  let stepIndex = -1;

  for (const ch of allWorkflows) {
    const state = ch.workflowState as WorkflowState;
    const idx = state.steps.findIndex((s) => s.sessionId === sessionId && s.status === "running");
    if (idx !== -1) {
      targetChannel = ch;
      stepIndex = idx;
      break;
    }
  }

  if (!targetChannel || stepIndex === -1) return;

  const state = targetChannel.workflowState as WorkflowState;

  // Clear step timer
  const timerKey = `${targetChannel.id}:${stepIndex}`;
  if (stepTimers.has(timerKey)) {
    clearTimeout(stepTimers.get(timerKey)!);
    stepTimers.delete(timerKey);
  }

  // Extract output from the session (last assistant message summary)
  const stepOutput = await extractSessionOutput(sessionId);

  // Mark current step completed
  const currentStep = state.steps[stepIndex]!;
  state.steps[stepIndex] = {
    role: currentStep.role,
    sessionId: currentStep.sessionId,
    status: "completed",
    startedAt: currentStep.startedAt,
    completedAt: new Date().toISOString(),
    output: stepOutput,
  };
  state.currentStep = stepIndex + 1;

  // Accumulate cost
  const { getActiveSession } = await import("./session-store.js");
  const session = getActiveSession(sessionId);
  if (session?.state.total_cost_usd) {
    state.totalCostUsd += session.state.total_cost_usd;
  }

  // Check cost cap
  if (state.totalCostUsd >= state.costCapUsd) {
    log.warn("Workflow cost cap exceeded", {
      channelId: targetChannel.id,
      cost: state.totalCostUsd,
    });
    return concludeWorkflow(targetChannel.id, state, "Cost cap exceeded");
  }

  // Check if all steps done
  if (state.currentStep >= state.steps.length) {
    return concludeWorkflow(targetChannel.id, state);
  }

  // Persist state
  db.update(channels).set({ workflowState: state }).where(eq(channels.id, targetChannel.id)).run();

  // Spawn next step
  await spawnStep(targetChannel.id, state, state.currentStep);

  log.info("Workflow advanced", {
    channelId: targetChannel.id,
    step: state.currentStep,
    totalSteps: state.steps.length,
  });
}

/** Cancel a running workflow. */
export async function cancelWorkflow(channelId: string): Promise<boolean> {
  if (!bridgeRef) return false;

  const db = getDb();
  const ch = db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!ch || ch.type !== "workflow" || ch.status !== "active") return false;

  const state = ch.workflowState as WorkflowState;

  // Stop all running sessions
  for (const step of state.steps) {
    if (step.sessionId && step.status === "running") {
      try {
        await bridgeRef.killSession(step.sessionId);
      } catch {
        // best effort
      }
      step.status = "failed";
    }
    if (step.status === "pending") {
      step.status = "skipped";
    }
  }

  // Clear all timers
  for (const [key, timer] of stepTimers) {
    if (key.startsWith(channelId)) {
      clearTimeout(timer);
      stepTimers.delete(key);
    }
  }

  state.completedAt = new Date().toISOString();

  db.update(channels)
    .set({
      status: "concluded",
      workflowState: state,
      concludedAt: new Date(),
    })
    .where(eq(channels.id, channelId))
    .run();

  log.info("Workflow cancelled", { channelId });
  return true;
}

/** Get workflow status. */
export function getWorkflowStatus(channelId: string) {
  const db = getDb();
  const ch = db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!ch || ch.type !== "workflow") return null;

  return {
    channelId: ch.id,
    topic: ch.topic,
    status: ch.status,
    projectSlug: ch.projectSlug,
    workflowState: ch.workflowState as WorkflowState | null,
    createdAt:
      ch.createdAt instanceof Date
        ? ch.createdAt.toISOString()
        : new Date(ch.createdAt as number).toISOString(),
    concludedAt: ch.concludedAt
      ? ch.concludedAt instanceof Date
        ? ch.concludedAt.toISOString()
        : new Date(ch.concludedAt as number).toISOString()
      : null,
  };
}

/** List active workflows. */
export function listWorkflows(opts?: { status?: string; projectSlug?: string }) {
  const db = getDb();
  const rows = db.select().from(channels).where(eq(channels.type, "workflow")).all();

  return rows
    .filter((r) => {
      if (opts?.status && r.status !== opts.status) return false;
      if (opts?.projectSlug && r.projectSlug !== opts.projectSlug) return false;
      return true;
    })
    .map((r) => ({
      channelId: r.id,
      topic: r.topic,
      status: r.status,
      projectSlug: r.projectSlug,
      workflowState: r.workflowState as WorkflowState | null,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt as number).toISOString(),
    }));
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function spawnStep(
  channelId: string,
  state: WorkflowState,
  stepIndex: number,
  cwd?: string,
): Promise<string> {
  if (!bridgeRef) throw new Error("WorkflowEngine not initialized");

  const template = getWorkflowTemplate(state.templateId);
  if (!template) throw new Error("Template not found");

  const stepDef = template.steps[stepIndex];
  if (!stepDef) throw new Error(`Step ${stepIndex} not found in template`);

  // Resolve prompt template
  const previousOutput = stepIndex > 0 ? (state.steps[stepIndex - 1]?.output ?? "") : "";
  const prompt = stepDef.promptTemplate
    .replace(/\{\{topic\}\}/g, state.topic)
    .replace(/\{\{previousOutput\}\}/g, previousOutput);

  // Get project cwd if available
  const projectCwd = cwd ?? process.cwd();

  // Spawn session
  const sessionId = await bridgeRef.startSession({
    cwd: projectCwd,
    model: stepDef.model ?? "claude-sonnet-4-6",
    prompt,
    source: "workflow",
    channelId,
    name: `${state.templateName} — ${stepDef.label}`,
    permissionMode: "auto-accept",
  });

  // Workflow sessions should not auto-kill on idle
  bridgeRef.setSessionSettings(sessionId, { keepAlive: true });

  // Link session to channel
  linkSession(channelId, sessionId);

  // Update workflow state
  state.steps[stepIndex] = {
    role: state.steps[stepIndex]!.role,
    sessionId,
    status: "running",
    startedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.update(channels).set({ workflowState: state }).where(eq(channels.id, channelId)).run();

  // Set step timeout
  const timerKey = `${channelId}:${stepIndex}`;
  const timer = setTimeout(() => {
    handleStepTimeout(channelId, stepIndex);
  }, STEP_TIMEOUT_MS);
  stepTimers.set(timerKey, timer);

  return sessionId;
}

async function handleStepTimeout(channelId: string, stepIndex: number): Promise<void> {
  if (!bridgeRef) return;

  const db = getDb();
  const ch = db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!ch || ch.status !== "active") return;

  const state = ch.workflowState as WorkflowState;
  const step = state.steps[stepIndex];
  if (!step || step.status !== "running") return;

  log.warn("Workflow step timed out", { channelId, step: stepIndex, role: step.role });

  // Stop the session
  if (step.sessionId) {
    try {
      await bridgeRef.killSession(step.sessionId);
    } catch {
      /* best effort */
    }
  }

  // Mark step failed
  state.steps[stepIndex] = {
    ...step,
    status: "failed",
    completedAt: new Date().toISOString(),
    output: "Step timed out",
  };

  // Pause workflow — don't auto-advance, let user decide
  db.update(channels).set({ workflowState: state }).where(eq(channels.id, channelId)).run();
}

async function concludeWorkflow(
  channelId: string,
  state: WorkflowState,
  reason?: string,
): Promise<void> {
  state.completedAt = new Date().toISOString();

  const db = getDb();

  // Build summary verdict
  const summary = {
    templateName: state.templateName,
    topic: state.topic,
    totalSteps: state.steps.length,
    completedSteps: state.steps.filter((s) => s.status === "completed").length,
    failedSteps: state.steps.filter((s) => s.status === "failed").length,
    totalCostUsd: state.totalCostUsd,
    reason: reason ?? "All steps completed",
  };

  db.update(channels)
    .set({
      status: "concluded",
      workflowState: state,
      verdict: summary,
      concludedAt: new Date(),
    })
    .where(eq(channels.id, channelId))
    .run();

  log.info("Workflow concluded", { channelId, ...summary });
}

async function extractSessionOutput(sessionId: string): Promise<string> {
  // Get last few assistant messages from the session
  const db = getDb();
  const { sessionMessages } = await import("../db/schema.js");
  const { desc, eq: eqOp } = await import("drizzle-orm");

  const messages = db
    .select({ content: sessionMessages.content })
    .from(sessionMessages)
    .where(eqOp(sessionMessages.sessionId, sessionId))
    .orderBy(desc(sessionMessages.timestamp))
    .limit(3)
    .all();

  // Combine last assistant messages, cap at 2000 chars
  const combined = messages
    .reverse()
    .map((m) => m.content)
    .join("\n\n");

  return combined.length > 2000 ? combined.slice(-2000) : combined;
}
