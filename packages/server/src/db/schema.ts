import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  dir: text("dir").notNull(),
  defaultModel: text("default_model").notNull().default("claude-sonnet-4-6"),
  permissionMode: text("permission_mode").notNull().default("default"),
  envVars: text("env_vars", { mode: "json" }).$type<Record<string, string>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Workspaces ─────────────────────────────────────────────────────────────

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    projectSlug: text("project_slug")
      .notNull()
      .references(() => projects.slug),
    /** JSON array of CLI platforms to connect: ["claude","codex","gemini","opencode"] */
    cliSlots: text("cli_slots", { mode: "json" })
      .$type<import("@companion/shared").CLIPlatform[]>()
      .notNull()
      .default(["claude"]),
    /** Default expert persona for new sessions */
    defaultExpert: text("default_expert"),
    /** Auto-spawn CLIs when workspace is opened */
    autoConnect: integer("auto_connect", { mode: "boolean" }).notNull().default(false),
    /** Linked wiki knowledge base domain */
    wikiDomain: text("wiki_domain"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_workspaces_project").on(table.projectSlug)],
);

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    /** Short memorable ID for @mentions (e.g. "fox", "bear") */
    shortId: text("short_id"),
    /** User-defined session name (persists after session end) */
    name: text("name"),
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
    /** Expert Mode persona ID (e.g. "tim-cook", "staff-sre") */
    personaId: text("persona_id"),
    /** Agent role in multi-brain workspace (e.g. "coordinator", "specialist") */
    role: text("role"),
    /** Workspace this session belongs to */
    workspaceId: text("workspace_id").references(() => workspaces.id),
    /** CLI platform (claude, codex, gemini, opencode) */
    cliPlatform: text("cli_platform").default("claude"),
    /** Account ID used for this session (multi-account management) */
    accountId: text("account_id"),

    // Session management config
    /** Cost warning threshold in USD (null = no budget) */
    costBudgetUsd: real("cost_budget_usd"),
    /** Budget warning state: 0=none, 1=warned at 80%, 2=warned at 100% */
    costWarned: integer("cost_warned").notNull().default(0),
    /** Compact mode: manual | smart | aggressive — see DEFAULT_COMPACT_MODE */
    compactMode: text("compact_mode").notNull().default("manual"),
    /** Context % threshold to trigger compact — see DEFAULT_COMPACT_THRESHOLD */
    compactThreshold: integer("compact_threshold").notNull().default(75),

    // Session settings (unified source of truth — migration 0044).
    // Defaults MUST match @companion/shared constants; see SessionSettings type.
    /** Idle timeout in milliseconds — see SESSION_IDLE_TIMEOUT_MS */
    idleTimeoutMs: integer("idle_timeout_ms").notNull().default(1_800_000),
    /** Whether the idle timer runs (false = suppressed) — see DEFAULT_IDLE_TIMEOUT_ENABLED */
    idleTimeoutEnabled: integer("idle_timeout_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    /** Keep-alive flag (scheduler/workflow sessions) — see DEFAULT_KEEP_ALIVE */
    keepAlive: integer("keep_alive", { mode: "boolean" }).notNull().default(false),
    /** Auto re-inject identity on compaction — see DEFAULT_AUTO_REINJECT_ON_COMPACT */
    autoReinjectOnCompact: integer("auto_reinject_on_compact", { mode: "boolean" })
      .notNull()
      .default(true),
    /** Persistent thinking mode — see DEFAULT_THINKING_MODE */
    thinkingMode: text("thinking_mode").notNull().default("adaptive"),
    /** Persistent context window mode — see DEFAULT_CONTEXT_MODE */
    contextMode: text("context_mode").notNull().default("200k"),

    // Accumulated metrics
    totalCostUsd: real("total_cost_usd").notNull().default(0),
    numTurns: integer("num_turns").notNull().default(0),
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    totalLinesAdded: integer("total_lines_added").notNull().default(0),
    totalLinesRemoved: integer("total_lines_removed").notNull().default(0),

    // RTK (Runtime Token Keeper) metrics
    rtkTokensSaved: integer("rtk_tokens_saved").notNull().default(0),
    rtkCompressions: integer("rtk_compressions").notNull().default(0),
    rtkCacheHits: integer("rtk_cache_hits").notNull().default(0),

    // File tracking (JSON arrays)
    filesRead: text("files_read", { mode: "json" }).$type<string[]>().default([]),
    filesModified: text("files_modified", { mode: "json" }).$type<string[]>().default([]),
    filesCreated: text("files_created", { mode: "json" }).$type<string[]>().default([]),

    /** Session tags for filtering/organization (JSON array of strings) */
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),

    /** Telegram target for session notifications */
    telegramTarget: text("telegram_target", { mode: "json" }).$type<
      import("@companion/shared").TelegramTarget
    >(),

    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_sessions_status").on(table.status),
    index("idx_sessions_project").on(table.projectSlug),
    index("idx_sessions_started_at").on(table.startedAt),
    index("idx_sessions_ended_at").on(table.endedAt),
    index("idx_sessions_workspace").on(table.workspaceId),
  ],
);

// ─── Session Messages ────────────────────────────────────────────────────────

export const sessionMessages = sqliteTable("session_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  /** Where the message came from */
  source: text("source").notNull().default("api"), // 'telegram' | 'web' | 'api' | 'agent' | 'system'
  /** External message ID (e.g., telegram_message_id) */
  sourceId: text("source_id"),
  /** For agent messages in debates */
  agentRole: text("agent_role"),
  timestamp: integer("timestamp", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Telegram Bots ───────────────────────────────────────────────────────────

export const telegramBots = sqliteTable("telegram_bots", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  role: text("role").notNull().default("claude"), // 'claude' | 'anti' | 'general'
  botToken: text("bot_token").notNull(),
  allowedChatIds: text("allowed_chat_ids", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  allowedUserIds: text("allowed_user_ids", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  notificationGroupId: integer("notification_group_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Telegram Session Mappings ───────────────────────────────────────────────

export const telegramSessionMappings = sqliteTable("telegram_session_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id").notNull(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  projectSlug: text("project_slug").notNull(),
  model: text("model").notNull(),
  topicId: integer("topic_id"),
  pinnedMessageId: integer("pinned_message_id"),
  // `idle_timeout_ms` + `idle_timeout_enabled` lived here until migration
  // 0045. Source of truth is now `sessions` via SessionSettingsService.
  cliSessionId: text("cli_session_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Telegram Forum Topics (1 project = 1 forum topic per group) ────────────

export const telegramForumTopics = sqliteTable(
  "telegram_forum_topics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: integer("chat_id").notNull(),
    projectSlug: text("project_slug")
      .notNull()
      .references(() => projects.slug),
    topicId: integer("topic_id").notNull(),
    topicName: text("topic_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_forum_chat_project").on(table.chatId, table.projectSlug),
    index("idx_forum_chat").on(table.chatId),
  ],
);

// ─── Daily Costs ─────────────────────────────────────────────────────────────

export const dailyCosts = sqliteTable("daily_costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  projectSlug: text("project_slug"),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  totalSessions: integer("total_sessions").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
});

// ─── Accounts (Multi-Account Manager) ──────────────────────────────────────

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  label: text("label").notNull(), // "Work Max", "Personal Pro"
  fingerprint: text("fingerprint").notNull().unique(), // sha256(accessToken)[:16] — legacy, volatile (rotates on OAuth refresh)
  identity: text("identity"), // sha256(refreshToken)[:16] — stable across access-token refreshes, secondary dedup key
  // Canonical Anthropic identity from /api/oauth/profile. Populated async after
  // saveAccount() succeeds. Phase 2 will upsert by oauth_subject so re-logins
  // with a fresh refresh token still merge into the same row.
  oauthSubject: text("oauth_subject"), // account.uuid from profile API
  email: text("email"),
  displayName: text("display_name"),
  organizationUuid: text("organization_uuid"),
  organizationName: text("organization_name"),
  profileFetchedAt: integer("profile_fetched_at", { mode: "timestamp_ms" }),
  encryptedCredentials: text("encrypted_credentials").notNull(), // AES-256-GCM encrypted claudeAiOauth JSON
  subscriptionType: text("subscription_type"), // "max", "pro", "free"
  rateLimitTier: text("rate_limit_tier"), // "default_claude_max_20x"
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false), // only one active at a time
  status: text("status").notNull().default("ready"), // ready | rate_limited | expired | error
  statusUntil: integer("status_until", { mode: "timestamp_ms" }), // when rate_limited status expires
  totalCostUsd: real("total_cost_usd").notNull().default(0), // aggregated from sessions
  // Custom budget limits (null = no limit). Used to drive ProgressBar + toast alerts.
  session5hBudget: real("session_5h_budget"),
  weeklyBudget: real("weekly_budget"),
  monthlyBudget: real("monthly_budget"),
  // When true, auto-switch rotation will skip this account (manual switch still works).
  skipInRotation: integer("skip_in_rotation", { mode: "boolean" }).notNull().default(false),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Account Merge Events (Phase 3 dedup conflict resolution) ───────────────

/** One row in the `before_state` JSON snapshot. Mirrors the budget-relevant
 *  columns of an account row at merge time so the UI can re-render choices. */
export interface AccountMergeBeforeRow {
  id: string;
  label: string;
  session5hBudget: number | null;
  weeklyBudget: number | null;
  monthlyBudget: number | null;
  totalCostUsd: number;
}

export const accountMergeEvents = sqliteTable(
  "account_merge_events",
  {
    id: text("id").primaryKey(),
    survivorAccountId: text("survivor_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    oauthSubject: text("oauth_subject").notNull(),
    /** JSON array of {@link AccountMergeBeforeRow}. */
    beforeState: text("before_state", { mode: "json" })
      .$type<AccountMergeBeforeRow[]>()
      .notNull(),
    appliedSession5hBudget: real("applied_session5h_budget"),
    appliedWeeklyBudget: real("applied_weekly_budget"),
    appliedMonthlyBudget: real("applied_monthly_budget"),
    mergedAt: integer("merged_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    /** "kept" or "applied:<accountId>". Audit only — UI does not depend on it. */
    resolvedChoice: text("resolved_choice"),
  },
  (table) => [
    // Partial index: only pending events. Matches the SQL migration 0043 so
    // drizzle-kit generate doesn't drift. Pruning resolved events keeps the
    // index small + the planner can satisfy listPendingMergeEvents() from it.
    index("idx_account_merge_events_pending")
      .on(table.survivorAccountId)
      .where(sql`${table.resolvedAt} IS NULL`),
  ],
);

// ─── Settings (key-value) ────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Shared Channels (for debate/collab) ─────────────────────────────────────

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  projectSlug: text("project_slug").references(() => projects.slug),
  type: text("type").notNull().default("debate"), // 'debate' | 'review' | 'red_team' | 'brainstorm' | 'workflow'
  topic: text("topic").notNull(),
  format: text("format", { mode: "json" }),
  status: text("status").notNull().default("active"), // 'active' | 'concluding' | 'concluded'
  maxRounds: integer("max_rounds").notNull().default(5),
  currentRound: integer("current_round").notNull().default(0),
  verdict: text("verdict", { mode: "json" }),
  workflowTemplateId: text("workflow_template_id"),
  workflowState: text("workflow_state", { mode: "json" }).$type<
    import("@companion/shared").WorkflowState
  >(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  concludedAt: integer("concluded_at", { mode: "timestamp_ms" }),
});

// ─── Channel Messages ────────────────────────────────────────────────────────

export const channelMessages = sqliteTable("channel_messages", {
  id: text("id").primaryKey(),
  channelId: text("channel_id")
    .notNull()
    .references(() => channels.id),
  agentId: text("agent_id").notNull(),
  role: text("role").notNull(), // 'advocate' | 'challenger' | 'judge' | 'reviewer' | 'human'
  content: text("content").notNull(),
  round: integer("round").notNull().default(0),
  /** Expert Mode persona ID for this agent message */
  personaId: text("persona_id"),
  timestamp: integer("timestamp", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Custom Personas ────────────────────────────────────────────────────────

export const customPersonas = sqliteTable(
  "custom_personas",
  {
    id: text("id").primaryKey(), // custom-{nanoid}
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    icon: text("icon").notNull().default("🧠"),
    title: text("title").notNull(),
    intro: text("intro").notNull().default(""),
    systemPrompt: text("system_prompt").notNull(),
    mentalModels: text("mental_models", { mode: "json" }).$type<string[]>().notNull().default([]),
    decisionFramework: text("decision_framework").notNull().default(""),
    redFlags: text("red_flags", { mode: "json" }).$type<string[]>().notNull().default([]),
    communicationStyle: text("communication_style").notNull().default(""),
    blindSpots: text("blind_spots", { mode: "json" }).$type<string[]>().notNull().default([]),
    bestFor: text("best_for", { mode: "json" }).$type<string[]>().notNull().default([]),
    strength: text("strength").notNull().default(""),
    avatarGradient: text("avatar_gradient", { mode: "json" })
      .$type<[string, string]>()
      .notNull()
      .default(["#6366f1", "#8b5cf6"]),
    avatarInitials: text("avatar_initials").notNull().default("CP"),
    combinableWith: text("combinable_with", { mode: "json" }).$type<string[]>(),
    /** Built-in persona ID this was cloned from */
    clonedFrom: text("cloned_from"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_custom_personas_slug").on(table.slug)],
);

// ─── Session Templates ──────────────────────────────────────────────────────

export const sessionTemplates = sqliteTable("session_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  projectSlug: text("project_slug").references(() => projects.slug),
  prompt: text("prompt").notNull(),
  model: text("model"),
  permissionMode: text("permission_mode"),
  icon: text("icon").notNull().default("⚡"),
  sortOrder: integer("sort_order").notNull().default(0),
  variables: text("variables"), // JSON string: Array<{ key: string, label: string, defaultValue?: string, required?: boolean }>
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Session Notes ──────────────────────────────────────────────────────────

export const sessionNotes = sqliteTable("session_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Session Summaries ───────────────────────────────────────────────────────

export const sessionSummaries = sqliteTable("session_summaries", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  summary: text("summary").notNull(),
  keyDecisions: text("key_decisions", { mode: "json" }).$type<string[]>(),
  filesModified: text("files_modified", { mode: "json" }).$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── WebIntel Docs Cache ───────────────────────────────────────────────────

export const webIntelDocs = sqliteTable(
  "web_intel_docs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    libraryName: text("library_name").notNull(),
    docsUrl: text("docs_url").notNull(),
    contentHash: text("content_hash").notNull(),
    llmContent: text("llm_content").notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    accessCount: integer("access_count").notNull().default(1),
    lastAccessedAt: integer("last_accessed_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_webintel_docs_library").on(table.libraryName)],
);

// ─── Session Snapshots ──────────────────────────────────────────────────────

export const sessionSnapshots = sqliteTable(
  "session_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    content: text("content").notNull(),
    label: text("label"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_snapshots_session").on(table.sessionId)],
);

// ─── Share Tokens (QR Stream Sharing) ────────────────────────────────────────

export const shareTokens = sqliteTable(
  "share_tokens",
  {
    token: text("token").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    /** 'read-only' = view stream, 'interactive' = can type in chat */
    permission: text("permission").notNull().default("read-only"),
    createdBy: text("created_by").notNull().default("owner"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_share_tokens_session").on(table.sessionId),
    index("idx_share_tokens_expires").on(table.expiresAt),
  ],
);

// ─── CodeGraph: Files ─────────────────────────────────────────────────────────

export const codeFiles = sqliteTable(
  "code_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    filePath: text("file_path").notNull(),
    fileHash: text("file_hash").notNull(),
    totalLines: integer("total_lines").notNull().default(0),
    language: text("language").notNull().default("typescript"),
    description: text("description"),
    lastScannedAt: integer("last_scanned_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    scanVersion: integer("scan_version").notNull().default(1),
  },
  (table) => [
    index("idx_code_files_project").on(table.projectSlug),
    uniqueIndex("idx_code_files_path").on(table.projectSlug, table.filePath),
  ],
);

// ─── CodeGraph: Nodes (symbols) ──────────────────────────────────────────────

export const codeNodes = sqliteTable(
  "code_nodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    fileId: integer("file_id").notNull(),
    filePath: text("file_path").notNull(),
    symbolName: text("symbol_name").notNull(),
    symbolType: text("symbol_type").notNull(),
    signature: text("signature"),
    description: text("description"),
    isExported: integer("is_exported", { mode: "boolean" }).notNull().default(false),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    bodyPreview: text("body_preview"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_code_nodes_project").on(table.projectSlug),
    index("idx_code_nodes_file").on(table.fileId),
    index("idx_code_nodes_symbol").on(table.projectSlug, table.symbolName),
    index("idx_code_nodes_type").on(table.projectSlug, table.symbolType),
  ],
);

// ─── CodeGraph: Edges (relationships) ────────────────────────────────────────

export const codeEdges = sqliteTable(
  "code_edges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    sourceNodeId: integer("source_node_id").notNull(),
    targetNodeId: integer("target_node_id").notNull(),
    edgeType: text("edge_type").notNull(),
    trustWeight: real("trust_weight").notNull().default(0.5),
    context: text("context"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_code_edges_source").on(table.sourceNodeId),
    index("idx_code_edges_target").on(table.targetNodeId),
    index("idx_code_edges_project").on(table.projectSlug),
    index("idx_code_edges_type").on(table.projectSlug, table.edgeType),
  ],
);

// ─── CodeGraph: Scan Jobs ────────────────────────────────────────────────────

export const codeScanJobs = sqliteTable("code_scan_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectSlug: text("project_slug").notNull(),
  status: text("status").notNull().default("pending"),
  totalFiles: integer("total_files").notNull().default(0),
  scannedFiles: integer("scanned_files").notNull().default(0),
  totalNodes: integer("total_nodes").notNull().default(0),
  totalEdges: integer("total_edges").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

// ─── Workflow Templates ─────────────────────────────────────────────────────

export const workflowTemplates = sqliteTable("workflow_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("🔄"),
  category: text("category").notNull().default("custom"), // review | build | test | deploy | custom
  steps: text("steps", { mode: "json" }).notNull().$type<
    Array<{
      role: string;
      label: string;
      promptTemplate: string;
      order: number;
      model?: string;
    }>
  >(),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  defaultCostCapUsd: real("default_cost_cap_usd").default(1.0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Schedules ──────────────────────────────────────────────────────────────

export const schedules = sqliteTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    projectSlug: text("project_slug").references(() => projects.slug),
    prompt: text("prompt"),
    templateId: text("template_id"),
    templateVars: text("template_vars", { mode: "json" })
      .$type<Record<string, string>>()
      .default({}),
    model: text("model").notNull().default("claude-sonnet-4-6"),
    permissionMode: text("permission_mode").notNull().default("default"),
    triggerType: text("trigger_type").notNull().default("once"), // 'once' | 'cron'
    cronExpression: text("cron_expression"),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
    timezone: text("timezone").notNull().default("UTC"),
    telegramTarget: text("telegram_target", { mode: "json" })
      .$type<import("@companion/shared").TelegramTarget>()
      .default({ mode: "off" }),
    autoStopRules: text("auto_stop_rules", { mode: "json" })
      .$type<import("@companion/shared").AutoStopRules>()
      .default({}),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
    runCount: integer("run_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_schedules_enabled_next").on(table.enabled, table.nextRunAt),
    index("idx_schedules_project").on(table.projectSlug),
  ],
);

// ─── Schedule Runs (audit trail) ────────────────────────────────────────────

export const scheduleRuns = sqliteTable(
  "schedule_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    status: text("status").notNull(), // 'success' | 'failed' | 'skipped'
    reason: text("reason"),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_schedule_runs_schedule").on(table.scheduleId),
    index("idx_schedule_runs_started_at").on(table.startedAt),
  ],
);

// ─── Error Tracking ─────────────────────────────────────────────────────────

// ─── CodeGraph Config ──────────────────────────────────────────────────────

export const codegraphConfig = sqliteTable("codegraph_config", {
  projectSlug: text("project_slug").primaryKey(),
  injectionEnabled: integer("injection_enabled", { mode: "boolean" }).notNull().default(true),
  projectMapEnabled: integer("project_map_enabled", { mode: "boolean" }).notNull().default(true),
  messageContextEnabled: integer("message_context_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  planReviewEnabled: integer("plan_review_enabled", { mode: "boolean" }).notNull().default(true),
  breakCheckEnabled: integer("break_check_enabled", { mode: "boolean" }).notNull().default(true),
  webDocsEnabled: integer("web_docs_enabled", { mode: "boolean" }).notNull().default(true),
  autoReindexEnabled: integer("auto_reindex_enabled", { mode: "boolean" }).notNull().default(true),
  excludePatterns: text("exclude_patterns", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  maxContextTokens: integer("max_context_tokens").notNull().default(800),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ─── Error Logs ───────────────────────────────────────────────────────────

export const errorLogs = sqliteTable(
  "error_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(), // 'server' | 'cli' | 'ws' | 'api'
    level: text("level").notNull().default("error"), // 'error' | 'fatal'
    message: text("message").notNull(),
    stack: text("stack"),
    sessionId: text("session_id"),
    context: text("context", { mode: "json" }).$type<Record<string, unknown>>(),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_error_logs_timestamp").on(table.timestamp),
    index("idx_error_logs_source").on(table.source),
    index("idx_error_logs_session").on(table.sessionId),
  ],
);

// ── Saved Prompts ──────────────────────────────────────────────────────────

export const savedPrompts = sqliteTable(
  "saved_prompts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    projectSlug: text("project_slug"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
    sortOrder: integer("sort_order").default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_saved_prompts_project").on(table.projectSlug)],
);

// ─── CodeGraph: Query Telemetry Log ─────────────────────────────────────────

export const codeQueryLog = sqliteTable(
  "code_query_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    queryType: text("query_type").notNull(), // e.g. "find_symbol", "impact", "temporal", "hot_files"
    queryText: text("query_text"),
    resultCount: integer("result_count").notNull().default(0),
    tokensReturned: integer("tokens_returned").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    agentSource: text("agent_source"), // e.g. "mcp", "http", "internal"
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_cql_slug_created").on(t.projectSlug, t.createdAt),
    index("idx_cql_query_type").on(t.projectSlug, t.queryType),
  ],
);

// ─── Context Injection Log ──────────────────────────────────────────────────

export const contextInjectionLog = sqliteTable(
  "context_injection_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    projectSlug: text("project_slug").notNull().default(""),
    injectionType: text("injection_type").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_ctx_injection_session").on(table.sessionId),
    index("idx_ctx_injection_type").on(table.injectionType),
    index("idx_ctx_injection_created").on(table.createdAt),
  ],
);

// ─── Session Insights (cross-session learning) ────────────────────────────

export const sessionInsights = sqliteTable(
  "session_insights",
  {
    id: text("id").primaryKey(),
    projectSlug: text("project_slug").notNull().default(""),
    type: text("type").notNull(), // pattern | mistake | preference | hotspot
    content: text("content").notNull(),
    sourceSessionId: text("source_session_id").notNull().default(""),
    sourceFiles: text("source_files", { mode: "json" }).$type<string[]>().default([]),
    relevanceScore: real("relevance_score").notNull().default(0.5),
    hitCount: integer("hit_count").notNull().default(1),
    contentHash: text("content_hash").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    lastUsedAt: text("last_used_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_insights_project").on(table.projectSlug),
    index("idx_insights_type").on(table.type),
    index("idx_insights_hash").on(table.contentHash),
  ],
);
