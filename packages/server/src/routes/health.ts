import { Hono } from "hono";
import { getSqlite } from "../db/client.js";
import { APP_VERSION } from "@companion/shared";
import { countActiveSessions } from "../services/session-store.js";
import type { HealthResponse } from "@companion/shared";

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  let dbStatus: "connected" | "error" = "error";
  let tableCount = 0;

  try {
    const sqlite = getSqlite();
    const result = sqlite
      .prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'")
      .get() as { count: number } | undefined;
    tableCount = result?.count ?? 0;
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }

  const response: HealthResponse = {
    status: dbStatus === "connected" ? "ok" : "error",
    version: APP_VERSION,
    uptime: Date.now() - startTime,
    db: {
      status: dbStatus,
      tables: tableCount,
    },
    sessions: {
      active: countActiveSessions(),
      total: 0,
    },
  };

  return c.json(response, dbStatus === "connected" ? 200 : 503);
});
