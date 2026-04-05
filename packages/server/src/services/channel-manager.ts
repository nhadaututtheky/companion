/**
 * ChannelManager — DB operations for shared context channels.
 */

import { eq, desc, and, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "../db/client.js";
import { channels, channelMessages, sessions } from "../db/schema.js";
import { createLogger } from "../logger.js";

const log = createLogger("channel-manager");

export type ChannelType = "debate" | "review" | "red_team" | "brainstorm";
export type ChannelStatus = "active" | "concluding" | "concluded";

export interface Channel {
  id: string;
  projectSlug: string | null;
  type: string;
  topic: string;
  status: string;
  maxRounds: number;
  currentRound: number;
  verdict: unknown;
  createdAt: Date | null;
  concludedAt: Date | null;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  agentId: string;
  role: string;
  content: string;
  round: number;
  personaId: string | null;
  timestamp: Date | null;
}

export interface ChannelWithMessages extends Channel {
  messages: ChannelMessage[];
  linkedSessions: Array<{
    id: string;
    model: string;
    status: string;
    cwd: string;
    projectSlug: string | null;
  }>;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export function createChannel(opts: {
  projectSlug?: string;
  type: ChannelType;
  topic: string;
  maxRounds?: number;
}): Channel {
  const db = getDb();
  const id = randomUUID();

  db.insert(channels)
    .values({
      id,
      projectSlug: opts.projectSlug ?? null,
      type: opts.type,
      topic: opts.topic,
      status: "active",
      maxRounds: opts.maxRounds ?? 5,
      currentRound: 0,
      createdAt: new Date(),
    })
    .run();

  log.info("Channel created", { id, type: opts.type, topic: opts.topic });

  const row = db.select().from(channels).where(eq(channels.id, id)).get();
  if (!row) throw new Error("Failed to create channel");
  return row as Channel;
}

// ─── Link session ─────────────────────────────────────────────────────────────

export function linkSession(channelId: string, sessionId: string): void {
  const db = getDb();

  // Verify channel exists
  const channel = db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) throw new Error(`Channel not found: ${channelId}`);

  db.update(sessions).set({ channelId }).where(eq(sessions.id, sessionId)).run();

  log.info("Session linked to channel", { channelId, sessionId });
}

// ─── Unlink session ───────────────────────────────────────────────────────────

export function unlinkSession(sessionId: string): void {
  const db = getDb();

  db.update(sessions).set({ channelId: null }).where(eq(sessions.id, sessionId)).run();

  log.info("Session unlinked from channel", { sessionId });
}

// ─── Post message ─────────────────────────────────────────────────────────────

export function postMessage(opts: {
  channelId: string;
  agentId: string;
  role: string;
  content: string;
  round?: number;
  personaId?: string;
}): ChannelMessage {
  const db = getDb();
  const id = randomUUID();

  db.insert(channelMessages)
    .values({
      id,
      channelId: opts.channelId,
      agentId: opts.agentId,
      role: opts.role,
      content: opts.content,
      round: opts.round ?? 0,
      personaId: opts.personaId ?? null,
      timestamp: new Date(),
    })
    .run();

  const row = db.select().from(channelMessages).where(eq(channelMessages.id, id)).get();
  if (!row) throw new Error("Failed to store channel message");
  return row as ChannelMessage;
}

// ─── Get messages ─────────────────────────────────────────────────────────────

export function getChannelMessages(channelId: string, limit = 50): ChannelMessage[] {
  const db = getDb();

  return db
    .select()
    .from(channelMessages)
    .where(eq(channelMessages.channelId, channelId))
    .orderBy(desc(channelMessages.timestamp))
    .limit(limit)
    .all()
    .reverse() as ChannelMessage[];
}

// ─── Get channel with details ─────────────────────────────────────────────────

export function getChannel(channelId: string): ChannelWithMessages | null {
  const db = getDb();

  const channel = db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) return null;

  const messages = getChannelMessages(channelId, 50);

  const linkedSessions = db
    .select({
      id: sessions.id,
      model: sessions.model,
      status: sessions.status,
      cwd: sessions.cwd,
      projectSlug: sessions.projectSlug,
    })
    .from(sessions)
    .where(eq(sessions.channelId, channelId))
    .all();

  return {
    ...(channel as Channel),
    messages,
    linkedSessions,
  };
}

// ─── List channels ────────────────────────────────────────────────────────────

export function listChannels(opts?: {
  projectSlug?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): { items: Channel[]; total: number } {
  const db = getDb();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const conditions = [];
  if (opts?.projectSlug) conditions.push(eq(channels.projectSlug, opts.projectSlug));
  if (opts?.status) conditions.push(eq(channels.status, opts.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRow = db.select({ total: count() }).from(channels).where(where).get();
  const total = totalRow?.total ?? 0;

  const rows = db
    .select()
    .from(channels)
    .where(where)
    .orderBy(desc(channels.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return { items: rows as Channel[], total };
}

// ─── Update channel status ────────────────────────────────────────────────────

export function updateChannelStatus(channelId: string, status: ChannelStatus): void {
  const db = getDb();

  db.update(channels)
    .set({
      status,
      concludedAt: status === "concluded" ? new Date() : undefined,
    })
    .where(eq(channels.id, channelId))
    .run();

  log.info("Channel status updated", { channelId, status });
}

// ─── Delete channel ───────────────────────────────────────────────────────────

export function deleteChannel(channelId: string): boolean {
  const db = getDb();

  const existing = db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!existing) return false;

  // Unlink all sessions first
  db.update(sessions).set({ channelId: null }).where(eq(sessions.channelId, channelId)).run();

  // Delete messages
  db.delete(channelMessages).where(eq(channelMessages.channelId, channelId)).run();

  // Delete channel
  db.delete(channels).where(eq(channels.id, channelId)).run();

  log.info("Channel deleted", { channelId });
  return true;
}
