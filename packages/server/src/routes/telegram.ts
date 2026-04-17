/**
 * Telegram bot management REST routes.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BotRegistry } from "../telegram/bot-registry.js";
import type { ApiResponse } from "@companion/shared";
import { hasFeature } from "../services/license.js";
import { decrypt } from "../services/crypto.js";

const botConfigSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.enum(["claude", "codex", "gemini", "opencode", "general"]).default("claude"),
  // Pass "KEEP_EXISTING" to leave the stored token unchanged
  botToken: z.string().min(1),
  allowedChatIds: z.array(z.number()).default([]),
  allowedUserIds: z.array(z.number()).default([]),
  enabled: z.boolean().default(true),
  notificationGroupId: z.number().nullable().optional(),
});

const createBotSchema = z.object({
  label: z.string().min(1),
  role: z.enum(["claude", "codex", "gemini", "opencode", "general"]).default("claude"),
  botToken: z.string().min(10),
  allowedChatIds: z.array(z.number()).default([]),
  allowedUserIds: z.array(z.number()).default([]),
  enabled: z.boolean().default(true),
  notificationGroupId: z.number().nullable().optional(),
});

export function telegramRoutes(registry: BotRegistry) {
  const app = new Hono();

  // List all bots — tokens are masked for security
  app.get("/bots", (c) => {
    const running = registry.getAll();
    const configs = registry.listBotConfigs().map((c) => ({
      ...c,
      // Never expose bot tokens via API
      botToken: undefined,
    }));

    return c.json({
      success: true,
      data: { running, configs },
    } satisfies ApiResponse);
  });

  // Get bot status
  app.get("/status", (c) => {
    const bots = registry.getAll();
    return c.json({
      success: true,
      data: {
        totalBots: bots.length,
        runningBots: bots.filter((b) => b.running).length,
        bots,
      },
    } satisfies ApiResponse);
  });

  // Create bot config (POST /bots — auto-generates ID, auto-starts if enabled)
  app.post("/bots", zValidator("json", createBotSchema), async (c) => {
    const body = c.req.valid("json");

    // FREE tier: max 1 bot. PRO: unlimited.
    const existingBots = registry.listBotConfigs();
    if (existingBots.length >= 1 && !hasFeature("multi_bot_telegram")) {
      return c.json(
        {
          success: false,
          error:
            "Free tier runs 1 Telegram bot. Go Pro to command a whole fleet → companion.theio.vn",
        } satisfies ApiResponse,
        403,
      );
    }

    const id = `bot_${Date.now()}`;

    try {
      registry.saveBotConfig({
        id,
        ...body,
        notificationGroupId: body.notificationGroupId ?? null,
      });
    } catch {
      return c.json(
        {
          success: false,
          error: "Failed to save bot config",
        } satisfies ApiResponse,
        500,
      );
    }

    // Auto-start if enabled
    if (body.enabled !== false) {
      try {
        await registry.startBot({
          token: body.botToken,
          botId: id,
          label: body.label,
          role: body.role,
          allowedChatIds: body.allowedChatIds ?? [],
          allowedUserIds: body.allowedUserIds ?? [],
        });
      } catch {
        // Bot saved but failed to start — return success with error detail
        return c.json({
          success: true,
          data: { id, startError: "Failed to start bot" },
        } satisfies ApiResponse);
      }
    }

    return c.json({ success: true, data: { id } } satisfies ApiResponse);
  });

  // Test bot token validity (getMe)
  app.get("/bots/:id/test", async (c) => {
    const id = c.req.param("id");

    // Fetch token from DB
    const { getDb } = await import("../db/client.js");
    const { telegramBots } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    const row = db.select().from(telegramBots).where(eq(telegramBots.id, id)).get();

    if (!row) {
      return c.json({ success: false, error: "Bot not found" } satisfies ApiResponse, 404);
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${decrypt(row.botToken)}/getMe`);
      const json = (await res.json()) as {
        ok: boolean;
        result?: { username: string; first_name: string };
      };

      if (!json.ok) {
        return c.json({ success: false, error: "Invalid bot token" } satisfies ApiResponse);
      }

      return c.json({
        success: true,
        data: {
          username: json.result?.username,
          firstName: json.result?.first_name,
        },
      } satisfies ApiResponse);
    } catch {
      return c.json(
        { success: false, error: "Failed to test bot token" } satisfies ApiResponse,
        500,
      );
    }
  });

  // Add/update bot config
  app.put("/bots/:id", zValidator("json", botConfigSchema), async (c) => {
    const body = c.req.valid("json");

    let botToken = body.botToken;

    // If the client didn't supply a new token, read existing from DB
    if (botToken === "KEEP_EXISTING") {
      const { getDb } = await import("../db/client.js");
      const { telegramBots } = await import("../db/schema.js");
      const { eq } = await import("drizzle-orm");

      const db = getDb();
      const row = db.select().from(telegramBots).where(eq(telegramBots.id, body.id)).get();
      if (!row) {
        return c.json({ success: false, error: "Bot not found" } satisfies ApiResponse, 404);
      }
      botToken = decrypt(row.botToken);
    }

    registry.saveBotConfig({
      ...body,
      botToken,
      notificationGroupId: body.notificationGroupId ?? null,
    });

    // Hot-reload: restart the bot if it's currently running so new config takes effect
    const runningBots = registry.getAll();
    const isRunning = runningBots.some((b) => b.botId === body.id && b.running);
    if (isRunning) {
      try {
        await registry.stopBot(body.id);
        await registry.startBot({
          token: botToken,
          botId: body.id,
          label: body.label,
          role: body.role,
          allowedChatIds: body.allowedChatIds ?? [],
          allowedUserIds: body.allowedUserIds ?? [],
        });
      } catch {
        return c.json({
          success: true,
          data: { id: body.id, restartError: "Config saved but bot failed to restart" },
        } satisfies ApiResponse);
      }
    }

    return c.json({ success: true, data: { id: body.id } } satisfies ApiResponse);
  });

  // Delete bot config
  app.delete("/bots/:id", async (c) => {
    const id = c.req.param("id");
    await registry.stopBot(id);
    registry.deleteBotConfig(id);

    return c.json({ success: true } satisfies ApiResponse);
  });

  // Start bot
  app.post("/bots/:id/start", async (c) => {
    const id = c.req.param("id");
    const configs = registry.listBotConfigs();
    const config = configs.find((b) => b.id === id);

    if (!config) {
      return c.json({ success: false, error: "Bot not found" } satisfies ApiResponse, 404);
    }

    // Need the full config with token — get from DB
    const { getDb } = await import("../db/client.js");
    const { telegramBots } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    const row = db.select().from(telegramBots).where(eq(telegramBots.id, id)).get();
    if (!row) {
      return c.json({ success: false, error: "Bot config not found" } satisfies ApiResponse, 404);
    }

    const started = await registry.startBot({
      token: row.botToken,
      botId: row.id,
      label: row.label,
      role: row.role as "claude" | "codex" | "gemini" | "opencode" | "general",
      allowedChatIds: row.allowedChatIds ?? [],
      allowedUserIds: row.allowedUserIds ?? [],
    });

    return c.json({
      success: started,
      error: started ? undefined : "Failed to start bot",
    } satisfies ApiResponse);
  });

  // Stop bot
  app.post("/bots/:id/stop", async (c) => {
    const id = c.req.param("id");
    await registry.stopBot(id);

    return c.json({ success: true } satisfies ApiResponse);
  });

  return app;
}
