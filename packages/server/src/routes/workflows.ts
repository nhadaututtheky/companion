/**
 * Workflow routes — start, monitor, and cancel multi-agent workflows.
 * POST   /api/workflows           — start a workflow
 * GET    /api/workflows            — list workflows
 * GET    /api/workflows/:id        — get workflow status
 * POST   /api/workflows/:id/cancel — cancel a workflow
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  startWorkflow,
  getWorkflowStatus,
  listWorkflows,
  cancelWorkflow,
} from "../services/workflow-engine.js";
import type { WsBridge } from "../services/ws-bridge.js";

export function workflowRoutes(_bridge: WsBridge) {
  const routes = new Hono();

  const startSchema = z.object({
    templateId: z.string(),
    topic: z.string().min(1).max(2000),
    projectSlug: z.string().optional(),
    costCapUsd: z.number().min(0.1).max(100).optional(),
    cwd: z.string().optional(),
  });

  // Start workflow
  routes.post("/", zValidator("json", startSchema), async (c) => {
    const body = c.req.valid("json");
    try {
      const result = await startWorkflow(body);
      return c.json({ success: true, data: result }, 201);
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 400);
    }
  });

  // List workflows
  routes.get("/", (c) => {
    const status = c.req.query("status");
    const projectSlug = c.req.query("project");
    const workflows = listWorkflows({
      status: status || undefined,
      projectSlug: projectSlug || undefined,
    });
    return c.json({ success: true, data: workflows });
  });

  // Get workflow status
  routes.get("/:id", (c) => {
    const workflow = getWorkflowStatus(c.req.param("id"));
    if (!workflow) {
      return c.json({ success: false, error: "Workflow not found" }, 404);
    }
    return c.json({ success: true, data: workflow });
  });

  // Cancel workflow
  routes.post("/:id/cancel", async (c) => {
    const cancelled = await cancelWorkflow(c.req.param("id"));
    if (!cancelled) {
      return c.json({ success: false, error: "Workflow not found or not active" }, 404);
    }
    return c.json({ success: true });
  });

  return routes;
}
