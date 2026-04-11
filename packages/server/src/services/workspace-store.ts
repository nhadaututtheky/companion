/**
 * Workspace Store — CRUD + runtime CLI connection tracking.
 * Workspaces group multiple CLI sessions under a single project context.
 */

import { eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { workspaces, projects, sessions } from "../db/schema.js";
import { createLogger } from "../logger.js";
import type {
  CLIPlatform,
  Workspace,
  WorkspaceWithStatus,
  WorkspaceCliStatus,
  WorkspaceCreateBody,
  WorkspaceUpdateBody,
} from "@companion/shared";

const log = createLogger("workspace-store");

// ─── Runtime state (in-memory, not persisted) ────────────────────────────────

/** Maps workspaceId → Map<CLIPlatform, sessionId | null> */
const cliConnections = new Map<string, Map<CLIPlatform, string | null>>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToWorkspace(row: typeof workspaces.$inferSelect): Workspace {
  return {
    id: row.id,
    name: row.name,
    projectSlug: row.projectSlug,
    cliSlots: row.cliSlots as CLIPlatform[],
    defaultExpert: row.defaultExpert,
    autoConnect: row.autoConnect,
    wikiDomain: row.wikiDomain,
    createdAt: row.createdAt?.toISOString() ?? new Date(0).toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date(0).toISOString(),
  };
}

function getCliStatuses(workspaceId: string, slots: CLIPlatform[]): WorkspaceCliStatus[] {
  const connections = cliConnections.get(workspaceId);
  return slots.map((platform) => {
    const sessionId = connections?.get(platform) ?? null;
    return {
      platform,
      sessionId,
      status: sessionId ? "connected" : "disconnected",
    };
  });
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function listWorkspaces(): Workspace[] {
  const db = getDb();
  const rows = db.select().from(workspaces).all();
  return rows.map(rowToWorkspace);
}

export function getWorkspace(id: string): WorkspaceWithStatus | null {
  const db = getDb();
  const row = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!row) return null;

  const ws = rowToWorkspace(row);

  // Resolve project path
  const project = db.select().from(projects).where(eq(projects.slug, ws.projectSlug)).get();

  return {
    ...ws,
    clis: getCliStatuses(id, ws.cliSlots),
    projectPath: project?.dir ?? null,
  };
}

export function createWorkspace(body: WorkspaceCreateBody): Workspace {
  const db = getDb();

  // Validate project exists
  const project = db.select().from(projects).where(eq(projects.slug, body.projectSlug)).get();
  if (!project) {
    throw new Error(`Project "${body.projectSlug}" not found`);
  }

  const id = crypto.randomUUID();
  const now = new Date();

  const row = {
    id,
    name: body.name,
    projectSlug: body.projectSlug,
    cliSlots: body.cliSlots ?? (["claude"] as CLIPlatform[]),
    defaultExpert: body.defaultExpert ?? null,
    autoConnect: body.autoConnect ?? false,
    wikiDomain: body.wikiDomain ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(workspaces).values(row).run();

  // Initialize runtime connection map
  cliConnections.set(id, new Map());

  return rowToWorkspace({ ...row });
}

export function updateWorkspace(id: string, body: WorkspaceUpdateBody): Workspace | null {
  const db = getDb();
  const existing = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!existing) return null;

  const updates: Partial<typeof workspaces.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.cliSlots !== undefined) updates.cliSlots = body.cliSlots;
  if (body.defaultExpert !== undefined) updates.defaultExpert = body.defaultExpert;
  if (body.autoConnect !== undefined) updates.autoConnect = body.autoConnect;
  if (body.wikiDomain !== undefined) updates.wikiDomain = body.wikiDomain;

  db.update(workspaces).set(updates).where(eq(workspaces.id, id)).run();

  const updated = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  return updated ? rowToWorkspace(updated) : null;
}

export function deleteWorkspace(id: string): boolean {
  const db = getDb();
  const existing = db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!existing) return false;
  db.delete(workspaces).where(eq(workspaces.id, id)).run();
  cliConnections.delete(id);
  return true;
}

// ─── Runtime CLI connection tracking ────────────────────────────────────────

export function connectCli(workspaceId: string, platform: CLIPlatform, sessionId: string): void {
  let connections = cliConnections.get(workspaceId);
  if (!connections) {
    connections = new Map();
    cliConnections.set(workspaceId, connections);
  }
  connections.set(platform, sessionId);
}

export function disconnectCli(workspaceId: string, platform: CLIPlatform): void {
  cliConnections.get(workspaceId)?.set(platform, null);
}

export function getConnectedSession(
  workspaceId: string,
  platform: CLIPlatform,
): string | null {
  return cliConnections.get(workspaceId)?.get(platform) ?? null;
}

/** Get the in-memory CLI connections map for a workspace (no DB hit) */
export function getWorkspaceCliConnections(
  workspaceId: string,
): Map<CLIPlatform, string | null> | null {
  return cliConnections.get(workspaceId) ?? null;
}

export function getWorkspaceForSession(sessionId: string): string | null {
  for (const [wsId, connections] of cliConnections) {
    for (const [, sid] of connections) {
      if (sid === sessionId) return wsId;
    }
  }
  return null;
}

/** Initialize runtime state from DB on server start + reconnect active sessions */
export function initWorkspaceRuntime(): void {
  const db = getDb();
  const all = listWorkspaces();

  for (const ws of all) {
    if (!cliConnections.has(ws.id)) {
      cliConnections.set(ws.id, new Map());
    }
  }

  // Reconnect active sessions that have workspaceId and haven't ended
  const activeSessions = db
    .select()
    .from(sessions)
    .where(isNotNull(sessions.workspaceId))
    .all()
    .filter((s) => s.endedAt === null || s.endedAt === undefined);

  let reconnected = 0;
  for (const s of activeSessions) {
    if (!s.workspaceId) continue;
    const connections = cliConnections.get(s.workspaceId);
    if (!connections) continue;

    const platform = (s.cliPlatform as CLIPlatform) ?? "claude";
    connections.set(platform, s.id);
    reconnected++;
  }

  if (reconnected > 0) {
    log.info("Reconnected active sessions to workspaces", { count: reconnected });
  }
}
