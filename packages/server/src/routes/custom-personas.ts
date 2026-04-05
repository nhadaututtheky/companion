/**
 * Custom Personas REST routes — CRUD for user-created personas.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  listCustomPersonas,
  getCustomPersona,
  createCustomPersona,
  updateCustomPersona,
  deleteCustomPersona,
  cloneBuiltInPersona,
} from "../services/custom-personas.js";
import type { ApiResponse } from "@companion/shared";

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

const personaInputSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(10).optional(),
  title: z.string().min(1).max(200),
  intro: z.string().max(500).optional(),
  systemPrompt: z.string().min(1).max(10000),
  mentalModels: z.array(z.string().max(200)).max(10).optional(),
  decisionFramework: z.string().max(5000).optional(),
  redFlags: z.array(z.string().max(200)).max(10).optional(),
  communicationStyle: z.string().max(2000).optional(),
  blindSpots: z.array(z.string().max(200)).max(10).optional(),
  bestFor: z.array(z.string().max(100)).max(10).optional(),
  strength: z.string().max(200).optional(),
  avatarGradient: z
    .tuple([z.string().regex(hexColorRegex), z.string().regex(hexColorRegex)])
    .optional(),
  avatarInitials: z.string().min(1).max(3).optional(),
  combinableWith: z.array(z.string().max(100)).max(10).optional(),
});

const personaUpdateSchema = personaInputSchema.partial();

const cloneOverridesSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
  })
  .optional();

export function customPersonaRoutes(): Hono {
  const routes = new Hono();

  // GET / — list all custom personas
  routes.get("/", (c) => {
    const personas = listCustomPersonas();
    return c.json({
      success: true,
      data: personas,
      meta: { total: personas.length, page: 1, limit: personas.length },
    } satisfies ApiResponse);
  });

  // GET /:id — get single custom persona
  routes.get("/:id", (c) => {
    const id = c.req.param("id");
    const persona = getCustomPersona(id);

    if (!persona) {
      return c.json(
        { success: false, error: "Custom persona not found" } satisfies ApiResponse,
        404,
      );
    }

    return c.json({ success: true, data: persona } satisfies ApiResponse);
  });

  // POST / — create custom persona
  routes.post("/", zValidator("json", personaInputSchema), (c) => {
    const body = c.req.valid("json");

    try {
      const persona = createCustomPersona(body);
      return c.json({ success: true, data: persona } satisfies ApiResponse, 201);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("Maximum")) {
        return c.json({ success: false, error: msg } satisfies ApiResponse, 409);
      }
      return c.json(
        { success: false, error: "Failed to create persona" } satisfies ApiResponse,
        500,
      );
    }
  });

  // PUT /:id — update custom persona
  routes.put("/:id", zValidator("json", personaUpdateSchema), (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const updated = updateCustomPersona(id, body);
    if (!updated) {
      return c.json(
        { success: false, error: "Custom persona not found" } satisfies ApiResponse,
        404,
      );
    }

    return c.json({ success: true, data: updated } satisfies ApiResponse);
  });

  // DELETE /:id — delete custom persona
  routes.delete("/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteCustomPersona(id);

    if (!deleted) {
      return c.json(
        { success: false, error: "Custom persona not found" } satisfies ApiResponse,
        404,
      );
    }

    return c.json({ success: true } satisfies ApiResponse);
  });

  // POST /clone/:builtInId — clone a built-in persona
  routes.post(
    "/clone/:builtInId",
    zValidator("json", cloneOverridesSchema),
    (c) => {
      const builtInId = c.req.param("builtInId");
      const body = c.req.valid("json");

      try {
        const persona = cloneBuiltInPersona(builtInId, body ?? undefined);
        return c.json({ success: true, data: persona } satisfies ApiResponse, 201);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("not found")) {
          return c.json({ success: false, error: msg } satisfies ApiResponse, 404);
        }
        if (msg.includes("Maximum")) {
          return c.json({ success: false, error: msg } satisfies ApiResponse, 409);
        }
        return c.json(
          { success: false, error: "Failed to clone persona" } satisfies ApiResponse,
          500,
        );
      }
    },
  );

  return routes;
}
