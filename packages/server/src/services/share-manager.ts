/**
 * ShareManager — Generate, validate, and revoke share tokens for session streaming.
 * Each token grants read-only or interactive access to a live session via QR code / link.
 */

import { randomBytes } from "crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { shareTokens, sessions } from "../db/schema.js";
import { createLogger } from "../logger.js";

const log = createLogger("share-manager");

export type SharePermission = "read-only" | "interactive";

export interface ShareToken {
  token: string;
  sessionId: string;
  permission: SharePermission;
  createdBy: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreateShareOptions {
  sessionId: string;
  permission?: SharePermission;
  expiresInMs?: number;
  createdBy?: string;
}

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_ACTIVE_PER_SESSION = 10;
const TOKEN_BYTES = 16; // 32 hex chars

/** Generate a cryptographically random share token */
function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** Create a new share token for a session */
export function createShareToken(opts: CreateShareOptions): ShareToken {
  const db = getDb();

  // Check active token count
  const activeCount = db
    .select({ token: shareTokens.token })
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.sessionId, opts.sessionId),
        isNull(shareTokens.revokedAt),
        gt(shareTokens.expiresAt, new Date()),
      ),
    )
    .all().length;

  if (activeCount >= MAX_ACTIVE_PER_SESSION) {
    throw new Error(`Max ${MAX_ACTIVE_PER_SESSION} active share tokens per session`);
  }

  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (opts.expiresInMs ?? DEFAULT_EXPIRY_MS));

  db.insert(shareTokens)
    .values({
      token,
      sessionId: opts.sessionId,
      permission: opts.permission ?? "read-only",
      createdBy: opts.createdBy ?? "owner",
      expiresAt,
      createdAt: now,
    })
    .run();

  log.info("Share token created", {
    token: token.slice(0, 8) + "...",
    sessionId: opts.sessionId,
    permission: opts.permission ?? "read-only",
    expiresAt: expiresAt.toISOString(),
  });

  return {
    token,
    sessionId: opts.sessionId,
    permission: opts.permission ?? "read-only",
    createdBy: opts.createdBy ?? "owner",
    expiresAt,
    revokedAt: null,
    createdAt: now,
  };
}

/** Validate a share token — returns token data if valid, null if expired/revoked/not found */
export function validateShareToken(
  token: string,
): (ShareToken & { sessionName: string | null }) | null {
  const db = getDb();

  const row = db
    .select({
      token: shareTokens.token,
      sessionId: shareTokens.sessionId,
      permission: shareTokens.permission,
      createdBy: shareTokens.createdBy,
      expiresAt: shareTokens.expiresAt,
      revokedAt: shareTokens.revokedAt,
      createdAt: shareTokens.createdAt,
      sessionName: sessions.name,
    })
    .from(shareTokens)
    .leftJoin(sessions, eq(shareTokens.sessionId, sessions.id))
    .where(eq(shareTokens.token, token))
    .get();

  if (!row) return null;

  const expiresAt =
    row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt as number);
  const revokedAt = row.revokedAt
    ? row.revokedAt instanceof Date
      ? row.revokedAt
      : new Date(row.revokedAt as number)
    : null;
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as number);

  // Check expired or revoked
  if (revokedAt || expiresAt < new Date()) return null;

  return {
    token: row.token,
    sessionId: row.sessionId,
    permission: row.permission as SharePermission,
    createdBy: row.createdBy,
    expiresAt,
    revokedAt,
    createdAt,
    sessionName: row.sessionName,
  };
}

/** Revoke a share token */
export function revokeShareToken(token: string): boolean {
  const db = getDb();
  // Check if token exists and is active
  const existing = db
    .select({ token: shareTokens.token })
    .from(shareTokens)
    .where(and(eq(shareTokens.token, token), isNull(shareTokens.revokedAt)))
    .get();

  if (!existing) return false;

  db.update(shareTokens).set({ revokedAt: new Date() }).where(eq(shareTokens.token, token)).run();

  log.info("Share token revoked", { token: token.slice(0, 8) + "..." });
  return true;
}

/** List active (non-expired, non-revoked) share tokens for a session */
export function listActiveShares(sessionId: string): ShareToken[] {
  const db = getDb();
  const rows = db
    .select()
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.sessionId, sessionId),
        isNull(shareTokens.revokedAt),
        gt(shareTokens.expiresAt, new Date()),
      ),
    )
    .all();

  return rows.map((r) => ({
    token: r.token,
    sessionId: r.sessionId,
    permission: r.permission as SharePermission,
    createdBy: r.createdBy,
    expiresAt: r.expiresAt instanceof Date ? r.expiresAt : new Date(r.expiresAt as number),
    revokedAt: null,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as number),
  }));
}

/** Revoke all active tokens for a session (called when session ends) */
export function revokeAllForSession(sessionId: string): number {
  const db = getDb();
  const activeTokens = db
    .select({ token: shareTokens.token })
    .from(shareTokens)
    .where(and(eq(shareTokens.sessionId, sessionId), isNull(shareTokens.revokedAt)))
    .all();

  if (activeTokens.length > 0) {
    db.update(shareTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareTokens.sessionId, sessionId), isNull(shareTokens.revokedAt)))
      .run();
    log.info("Revoked all share tokens for session", { sessionId, count: activeTokens.length });
  }
  return activeTokens.length;
}
