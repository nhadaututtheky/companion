import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  dir: text("dir").notNull(),
  defaultModel: text("default_model").notNull().default("claude-sonnet-4-6"),
  permissionMode: text("permission_mode").notNull().default("default"),
  envVars: text("env_vars", { mode: "json" }).$type<Record<string, string>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  projectSlug: text("project_slug").references(() => projects.slug),
  model: text("model").notNull(),
  status: text("status").notNull().default("starting"),
  cwd: text("cwd").notNull(),
  pid: integer("pid"),
  permissionMode: text("permission_mode").notNull().default("default"),
  claudeCodeVersion: text("claude_code_version"),
  cliSessionId: text("cli_session_id"),
  /** Source that created this session */
  source: text("source").notNull().default("api"),
  /** Parent session ID for forking */
  parentId: text("parent_id"),
  /** Shared channel ID for debate/collab */
  channelId: text("channel_id"),

  // Accumulated metrics
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  numTurns: integer("num_turns").notNull().default(0),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  totalLinesAdded: integer("total_lines_added").notNull().default(0),
  totalLinesRemoved: integer("total_lines_removed").notNull().default(0),

  // File tracking (JSON arrays)
  filesRead: text("files_read", { mode: "json" }).$type<string[]>().default([]),
  filesModified: text("files_modified", { mode: "json" }).$type<string[]>().default([]),
  filesCreated: text("files_created", { mode: "json" }).$type<string[]>().default([]),

  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
});

// ─── Session Messages ────────────────────────────────────────────────────────

export const sessionMessages = sqliteTable("session_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  /** Where the message came from */
  source: text("source").notNull().default("api"), // 'telegram' | 'web' | 'api' | 'agent' | 'system'
  /** External message ID (e.g., telegram_message_id) */
  sourceId: text("source_id"),
  /** For agent messages in debates */
  agentRole: text("agent_role"),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Telegram Bots ───────────────────────────────────────────────────────────

export const telegramBots = sqliteTable("telegram_bots", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  role: text("role").notNull().default("claude"), // 'claude' | 'anti' | 'general'
  botToken: text("bot_token").notNull(),
  allowedChatIds: text("allowed_chat_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
  allowedUserIds: text("allowed_user_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  notificationGroupId: integer("notification_group_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Telegram Session Mappings ───────────────────────────────────────────────

export const telegramSessionMappings = sqliteTable("telegram_session_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id").notNull(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  projectSlug: text("project_slug").notNull(),
  model: text("model").notNull(),
  topicId: integer("topic_id"),
  pinnedMessageId: integer("pinned_message_id"),
  idleTimeoutEnabled: integer("idle_timeout_enabled", { mode: "boolean" }).notNull().default(true),
  idleTimeoutMs: integer("idle_timeout_ms").notNull().default(3_600_000),
  cliSessionId: text("cli_session_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Daily Costs ─────────────────────────────────────────────────────────────

export const dailyCosts = sqliteTable("daily_costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  projectSlug: text("project_slug"),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  totalSessions: integer("total_sessions").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
});

// ─── Settings (key-value) ────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Shared Channels (for debate/collab) ─────────────────────────────────────

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  projectSlug: text("project_slug").references(() => projects.slug),
  type: text("type").notNull().default("debate"), // 'debate' | 'review' | 'red_team' | 'brainstorm'
  topic: text("topic").notNull(),
  format: text("format", { mode: "json" }),
  status: text("status").notNull().default("active"), // 'active' | 'concluding' | 'concluded'
  maxRounds: integer("max_rounds").notNull().default(5),
  currentRound: integer("current_round").notNull().default(0),
  verdict: text("verdict", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  concludedAt: integer("concluded_at", { mode: "timestamp_ms" }),
});

// ─── Channel Messages ────────────────────────────────────────────────────────

export const channelMessages = sqliteTable("channel_messages", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => channels.id),
  agentId: text("agent_id").notNull(),
  role: text("role").notNull(), // 'advocate' | 'challenger' | 'judge' | 'reviewer' | 'human'
  content: text("content").notNull(),
  round: integer("round").notNull().default(0),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Session Summaries ───────────────────────────────────────────────────────

export const sessionSummaries = sqliteTable("session_summaries", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  summary: text("summary").notNull(),
  keyDecisions: text("key_decisions", { mode: "json" }).$type<string[]>(),
  filesModified: text("files_modified", { mode: "json" }).$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
