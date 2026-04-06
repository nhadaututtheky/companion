// Telegram types — kept for shared reference between server and grammY layer
// Note: grammY provides its own Bot API types. These are for Companion-specific config.

// ─── Bridge Config ──────────────────────────────────────────────────────────

export interface TelegramConfig {
  botToken: string;
  allowedChatIds: Set<number>;
  pollingTimeout?: number;
  role?: BotRole;
  label?: string;
}

// ─── Session Mapping ────────────────────────────────────────────────────────

export interface TelegramSessionMapping {
  chatId: number;
  sessionId: string;
  projectSlug: string;
  model: string;
  createdAt: number;
  lastActivityAt: number;
  pinnedMessageId?: number;
  topicId?: number;
  idleTimeoutEnabled?: boolean;
  idleTimeoutMs?: number;
  cliSessionId?: string;
}

export interface DeadSessionInfo {
  chatId: number;
  topicId: number;
  sessionId: string;
  cliSessionId: string;
  projectSlug: string;
  model: string;
  diedAt: number;
}

export interface IdleTimeoutConfig {
  enabled: boolean;
  timeoutMs: number;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 min

// ─── Multi-Bot Config ──────────────────────────────────────────────────────

export type BotRole = "claude" | "codex" | "gemini" | "opencode" | "general";

export interface BotInstanceConfig {
  id: string;
  label: string;
  role: BotRole;
  botToken: string;
  allowedChatIds: number[];
  enabled: boolean;
  notificationGroupId?: number;
}

// ─── Notification Config ─────────────────────────────────────────────────────

export interface TelegramNotificationConfig {
  groupChatId?: number;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  notifyOnPermission: boolean;
}
