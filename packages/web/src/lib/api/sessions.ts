import { request } from "./base";
import type {
  ScannedSession,
  ScannedSessionDetail,
  ScanSessionsResponse,
  CLIPlatform,
} from "@companion/shared";
import type { TaskClassification, DispatchResult } from "@companion/shared/types";

export const sessions = {
  list: () => request<{ data: { sessions: unknown[] } }>("/api/sessions"),
  get: (id: string) => request<{ data: unknown }>(`/api/sessions/${id}`),
  start: (body: {
    projectSlug?: string;
    projectDir: string;
    model?: string;
    permissionMode?: string;
    prompt?: string;
    templateId?: string;
    templateVars?: Record<string, string>;
    resume?: boolean;
    idleTimeoutMs?: number;
    keepAlive?: boolean;
    personaId?: string;
    cliPlatform?: "claude" | "codex" | "gemini" | "opencode";
    platformOptions?: Record<string, unknown>;
    contextMode?: "200k" | "1m";
  }) =>
    request<{ data: { sessionId: string; projectCreated?: boolean } }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  stop: (id: string) =>
    request<{ success: boolean }>(`/api/sessions/${id}`, {
      method: "DELETE",
    }),
  message: (id: string, content: string) =>
    request<{ success: boolean }>(`/api/sessions/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  permission: (id: string, requestId: string, behavior: "allow" | "deny") =>
    request<{ success: boolean }>(`/api/sessions/${id}/permissions/${requestId}`, {
      method: "POST",
      body: JSON.stringify({ behavior }),
    }),
  switchPersona: (id: string, personaId: string | null) =>
    request<{ success: boolean }>(`/api/sessions/${id}/persona`, {
      method: "POST",
      body: JSON.stringify({ personaId }),
    }),
  cleanup: () =>
    request<{ success: boolean; data: { cleaned: number } }>("/api/sessions/cleanup", {
      method: "POST",
    }),
  killAll: async (ids: string[]) => {
    const results = await Promise.allSettled(
      ids.map((id) => request<{ success: boolean }>(`/api/sessions/${id}`, { method: "DELETE" })),
    );
    const killed = results.filter((r) => r.status === "fulfilled").length;
    return { killed };
  },
  updateSettings: (id: string, settings: { idleTimeoutMs?: number; keepAlive?: boolean }) =>
    request<{ success: boolean; data: { idleTimeoutMs: number; keepAlive: boolean } }>(
      `/api/sessions/${id}/settings`,
      {
        method: "PATCH",
        body: JSON.stringify(settings),
      },
    ),
  getSettings: (id: string) =>
    request<{ success: boolean; data: { idleTimeoutMs: number; keepAlive: boolean } }>(
      `/api/sessions/${id}/settings`,
    ),
  listResumable: (opts?: { q?: string; project?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.project) params.set("project", opts.project);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<{
      success: boolean;
      data: Array<{
        id: string;
        name?: string;
        projectSlug: string | null;
        model: string;
        source: string;
        cwd: string;
        cliSessionId: string;
        endedAt: number;
      }>;
    }>(`/api/sessions/resumable${qs ? `?${qs}` : ""}`);
  },
  dismissResumable: (id: string) =>
    request<{ success: boolean }>(`/api/sessions/resumable/${id}`, { method: "DELETE" }),
  resume: (id: string, opts?: { idleTimeoutMs?: number; keepAlive?: boolean }) =>
    request<{ success: boolean; data: { sessionId: string } }>(`/api/sessions/${id}/resume`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),
  streamTelegramStatus: (id: string) =>
    request<{
      success: boolean;
      data: { streaming: boolean; chatId?: number; topicId?: number };
    }>(`/api/sessions/${id}/stream/telegram`),
  streamTelegram: (id: string, chatId: number, topicId?: number) =>
    request<{
      success: boolean;
      data: { sessionId: string; chatId: number; streaming: boolean };
    }>(`/api/sessions/${id}/stream/telegram`, {
      method: "POST",
      body: JSON.stringify({ chatId, topicId: topicId ?? undefined }),
    }),
  detachTelegramStream: (id: string) =>
    request<{ success: boolean; data: { sessionId: string; detached: boolean } }>(
      `/api/sessions/${id}/stream/telegram`,
      { method: "DELETE" },
    ),
  rename: (id: string, name: string | null) =>
    request<{ success: boolean; data: { name: string | null } }>(`/api/sessions/${id}/rename`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  updateConfig: (
    id: string,
    config: { costBudgetUsd?: number | null; compactMode?: string; compactThreshold?: number },
  ) =>
    request<{ success: boolean }>(`/api/sessions/${id}/config`, {
      method: "PATCH",
      body: JSON.stringify(config),
    }),
  messages: (id: string, opts?: { limit?: number; before?: number }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.before) params.set("before", String(opts.before));
    const qs = params.toString();
    return request<{
      success: boolean;
      data: {
        messages: Array<{
          id: string;
          role: string;
          content: string;
          timestamp: number;
          source: string;
        }>;
        hasMore: boolean;
      };
      meta: { total: number; limit: number };
    }>(`/api/sessions/${id}/messages${qs ? `?${qs}` : ""}`);
  },
  exportUrl: (id: string, format: "md" | "json" = "md") =>
    `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/sessions/${id}/export?format=${format}`,
  updateTags: (id: string, tags: string[]) =>
    request<{ success: boolean; data: { tags: string[] } }>(`/api/sessions/${id}/tags`, {
      method: "PATCH",
      body: JSON.stringify({ tags }),
    }),
  // ─── Filesystem session scanner ─────────────────────────────────────
  scan: (opts?: {
    agent?: CLIPlatform;
    project?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts?.agent) params.set("agent", opts.agent);
    if (opts?.project) params.set("project", opts.project);
    if (opts?.q) params.set("q", opts.q);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return request<{ success: boolean; data: ScanSessionsResponse }>(
      `/api/sessions/scan${qs ? `?${qs}` : ""}`,
    );
  },
  scanDetail: (agent: CLIPlatform, id: string) =>
    request<{
      success: boolean;
      data: ScannedSessionDetail & { resumeCommand: string };
    }>(`/api/sessions/scan/${agent}/${id}`),
  scanRefresh: () =>
    request<{ success: boolean }>("/api/sessions/scan/refresh", { method: "POST" }),

  debate: {
    addParticipant: (id: string, model: string, personaId?: string) =>
      request<{
        success: boolean;
        data: { modelId: string; name: string; provider: string; personaId?: string };
      }>(`/api/sessions/${id}/debate/participants`, {
        method: "POST",
        body: JSON.stringify({ model, personaId }),
      }),
    removeParticipant: (id: string, modelId: string) =>
      request<{ success: boolean }>(
        `/api/sessions/${id}/debate/participants/${encodeURIComponent(modelId)}`,
        { method: "DELETE" },
      ),
    listParticipants: (id: string) =>
      request<{
        success: boolean;
        data: Array<{ modelId: string; provider: string; name: string; personaId?: string }>;
      }>(`/api/sessions/${id}/debate/participants`),
    startRound: (id: string, topic: string, format?: string) =>
      request<{ success: boolean; data: { channelId: string } }>(
        `/api/sessions/${id}/debate/round`,
        { method: "POST", body: JSON.stringify({ topic, format }) },
      ),
  },

  dispatch: {
    /** Sync preview (regex-only, instant) */
    previewSync: (message: string) =>
      request<{ success: boolean; data: TaskClassification }>(
        `/api/sessions/dispatch-preview?message=${encodeURIComponent(message)}`,
      ),
    /** Full AI preview */
    preview: (message: string, projectSlug?: string) =>
      request<{ success: boolean; data: TaskClassification }>("/api/sessions/dispatch-preview", {
        method: "POST",
        body: JSON.stringify({ message, projectSlug }),
      }),
    /** Confirm a dispatch suggestion */
    confirm: (opts: {
      sessionId: string;
      message: string;
      classification: TaskClassification;
      action: "accept" | "override";
      projectSlug?: string;
    }) =>
      request<{ success: boolean; data: DispatchResult }>("/api/sessions/dispatch-confirm", {
        method: "POST",
        body: JSON.stringify(opts),
      }),
  },
};
