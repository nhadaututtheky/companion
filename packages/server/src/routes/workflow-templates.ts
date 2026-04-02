/**
 * Workflow template routes — CRUD for multi-agent workflow templates.
 * GET    /api/workflow-templates          — list (filter by ?category=)
 * GET    /api/workflow-templates/:id      — get single
 * POST   /api/workflow-templates          — create custom
 * PUT    /api/workflow-templates/:id      — update custom
 * DELETE /api/workflow-templates/:id      — delete custom
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  listWorkflowTemplates,
  getWorkflowTemplate,
  createWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
} from "../services/workflow-templates.js";

export const workflowTemplateRoutes = new Hono();

const stepSchema = z.object({
  role: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  promptTemplate: z.string().min(1).max(10000),
  order: z.number().int().min(1),
  model: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  category: z.enum(["review", "build", "test", "deploy", "custom"]).optional(),
  steps: z.array(stepSchema).min(2).max(5),
  defaultCostCapUsd: z.number().min(0.1).max(100).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  category: z.enum(["review", "build", "test", "deploy", "custom"]).optional(),
  steps: z.array(stepSchema).min(2).max(5).optional(),
  defaultCostCapUsd: z.number().min(0.1).max(100).optional(),
});

// List templates
workflowTemplateRoutes.get("/", (c) => {
  const category = c.req.query("category");
  const templates = listWorkflowTemplates(category || undefined);
  return c.json({ success: true, data: templates });
});

// Get single template
workflowTemplateRoutes.get("/:id", (c) => {
  const template = getWorkflowTemplate(c.req.param("id"));
  if (!template) {
    return c.json({ success: false, error: "Template not found" }, 404);
  }
  return c.json({ success: true, data: template });
});

// Create custom template
workflowTemplateRoutes.post("/", zValidator("json", createSchema), (c) => {
  const body = c.req.valid("json");

  // Validate {{topic}} placeholder exists in at least the first step
  const firstStep = body.steps.find((s) => s.order === 1);
  if (!firstStep?.promptTemplate.includes("{{topic}}")) {
    return c.json({ success: false, error: "First step must include {{topic}} placeholder" }, 400);
  }

  try {
    const id = createWorkflowTemplate(body);
    return c.json({ success: true, data: { id } }, 201);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("UNIQUE")) {
      return c.json({ success: false, error: "Template slug already exists" }, 409);
    }
    return c.json({ success: false, error: msg }, 500);
  }
});

// Update custom template
workflowTemplateRoutes.put("/:id", zValidator("json", updateSchema), (c) => {
  const body = c.req.valid("json");
  const updated = updateWorkflowTemplate(c.req.param("id"), body);
  if (!updated) {
    return c.json({ success: false, error: "Template not found or is built-in" }, 404);
  }
  return c.json({ success: true });
});

// Delete custom template
workflowTemplateRoutes.delete("/:id", (c) => {
  const deleted = deleteWorkflowTemplate(c.req.param("id"));
  if (!deleted) {
    return c.json({ success: false, error: "Template not found or is built-in" }, 404);
  }
  return c.json({ success: true });
});
