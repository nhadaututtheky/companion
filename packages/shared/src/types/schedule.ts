// ── Schedule Types ─────────────────────────────────────────────────────

export interface TelegramTarget {
  mode: "off" | "private" | "group";
  botId?: string;
  chatId?: number;
  topicId?: number;
}

export interface AutoStopRules {
  maxCostUsd?: number;
  maxTurns?: number;
  maxDurationMs?: number;
}

export interface Schedule {
  id: string;
  name: string;
  projectSlug: string | null;
  prompt: string | null;
  templateId: string | null;
  templateVars: Record<string, string>;
  model: string;
  permissionMode: string;
  triggerType: "once" | "cron";
  cronExpression: string | null;
  scheduledAt: number | null;
  timezone: string;
  telegramTarget: TelegramTarget;
  autoStopRules: AutoStopRules;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateScheduleInput {
  name: string;
  projectSlug: string;
  prompt?: string;
  templateId?: string;
  templateVars?: Record<string, string>;
  model?: string;
  permissionMode?: string;
  triggerType: "once" | "cron";
  cronExpression?: string;
  scheduledAt?: number;
  timezone?: string;
  telegramTarget?: TelegramTarget;
  autoStopRules?: AutoStopRules;
  enabled?: boolean;
}

export interface UpdateScheduleInput {
  name?: string;
  prompt?: string;
  templateId?: string;
  templateVars?: Record<string, string>;
  model?: string;
  permissionMode?: string;
  cronExpression?: string;
  scheduledAt?: number;
  timezone?: string;
  telegramTarget?: TelegramTarget;
  autoStopRules?: AutoStopRules;
  enabled?: boolean;
}
