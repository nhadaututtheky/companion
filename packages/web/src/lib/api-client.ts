/**
 * API client for Companion server.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const apiKey = typeof window !== "undefined" ? localStorage.getItem("api_key") ?? "" : "";

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...opts?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Health ─────────────────────────────────────────────────────────────────

export const api = {
  // Generic helpers
  get: <T = Record<string, unknown>>(path: string) => request<T>(path),
  post: <T = Record<string, unknown>>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T = Record<string, unknown>>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),

  health: () => request<{ success: boolean; data: { status: string } }>("/api/health"),

  license: () => request<{ data: { valid: boolean; tier: string; features: string[]; maxSessions: number; expiresAt?: string } }>("/api/license"),

  // Sessions
  sessions: {
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
    }) => request<{ data: { sessionId: string; projectCreated?: boolean } }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    stop: (id: string) => request<{ success: boolean }>(`/api/sessions/${id}`, {
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
    cleanup: () =>
      request<{ success: boolean; data: { cleaned: number } }>("/api/sessions/cleanup", {
        method: "POST",
      }),
    killAll: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          request<{ success: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
        ),
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
    listResumable: () =>
      request<{
        success: boolean;
        data: Array<{
          id: string;
          projectSlug: string | null;
          model: string;
          source: string;
          cwd: string;
          cliSessionId: string;
          endedAt: number;
        }>;
      }>("/api/sessions/resumable"),
    dismissResumable: (id: string) =>
      request<{ success: boolean }>(`/api/sessions/resumable/${id}`, { method: "DELETE" }),
    resume: (id: string) =>
      request<{ success: boolean; data: { sessionId: string } }>(`/api/sessions/${id}/resume`, {
        method: "POST",
      }),
    streamTelegramStatus: (id: string) =>
      request<{ success: boolean; data: { streaming: boolean; chatId?: number; topicId?: number } }>(
        `/api/sessions/${id}/stream/telegram`,
      ),
    streamTelegram: (id: string, chatId: number, topicId?: number) =>
      request<{ success: boolean; data: { sessionId: string; chatId: number; streaming: boolean } }>(
        `/api/sessions/${id}/stream/telegram`,
        { method: "POST", body: JSON.stringify({ chatId, topicId: topicId || undefined }) },
      ),
    detachTelegramStream: (id: string) =>
      request<{ success: boolean; data: { sessionId: string; detached: boolean } }>(
        `/api/sessions/${id}/stream/telegram`,
        { method: "DELETE" },
      ),
  },

  // Projects
  projects: {
    list: () => request<{ data: unknown[] }>("/api/projects"),
    get: (slug: string) => request<{ data: unknown }>(`/api/projects/${slug}`),
    upsert: (slug: string, body: unknown) =>
      request<{ data: { slug: string } }>(`/api/projects/${slug}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (slug: string) => request<{ success: boolean }>(`/api/projects/${slug}`, {
      method: "DELETE",
    }),
  },

  // Telegram
  telegram: {
    status: () =>
      request<{
        data: {
          totalBots: number;
          runningBots: number;
          bots: Array<{ botId: string; label: string; role: string; running: boolean }>;
        };
      }>("/api/telegram/status"),

    bots: () =>
      request<{
        data: {
          running: Array<{ botId: string; label: string; role: string; running: boolean }>;
          configs: Array<{
            id: string;
            label: string;
            role: string;
            enabled: boolean;
            allowedChatIds: number[];
          }>;
        };
      }>("/api/telegram/bots"),

    createBot: (body: {
      label: string;
      role: "claude" | "anti" | "general";
      botToken: string;
      allowedChatIds?: number[];
      allowedUserIds?: number[];
      enabled?: boolean;
      notificationGroupId?: number | null;
    }) =>
      request<{ data: { id: string } }>("/api/telegram/bots", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    saveBot: (
      id: string,
      body: {
        id: string;
        label: string;
        role: "claude" | "anti" | "general";
        botToken: string;
        allowedChatIds?: number[];
        allowedUserIds?: number[];
        enabled?: boolean;
        notificationGroupId?: number | null;
      },
    ) =>
      request<{ data: { id: string } }>(`/api/telegram/bots/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),

    deleteBot: (id: string) =>
      request<{ success: boolean }>(`/api/telegram/bots/${id}`, {
        method: "DELETE",
      }),

    startBot: (id: string) =>
      request<{ success: boolean }>(`/api/telegram/bots/${id}/start`, {
        method: "POST",
      }),

    stopBot: (id: string) =>
      request<{ success: boolean }>(`/api/telegram/bots/${id}/stop`, {
        method: "POST",
      }),

    testBot: (id: string) =>
      request<{ data: { username: string; firstName: string } }>(
        `/api/telegram/bots/${id}/test`,
      ),
  },

  // Settings (key-value store)
  settings: {
    list: (prefix?: string) =>
      request<{ data: Record<string, string> }>(
        `/api/settings${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
      ),

    get: (key: string) =>
      request<{ data: { key: string; value: string } }>(
        `/api/settings/${encodeURIComponent(key)}`,
      ),

    set: (key: string, value: string) =>
      request<{ data: { key: string } }>(`/api/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),

    del: (key: string) =>
      request<{ success: boolean }>(`/api/settings/${encodeURIComponent(key)}`, {
        method: "DELETE",
      }),
  },

  // Channels
  channels: {
    list: (params?: { project?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.project) q.set("project", params.project);
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return request<{ data: unknown[]; meta: { total: number } }>(
        `/api/channels${qs ? `?${qs}` : ""}`,
      );
    },
    get: (id: string) =>
      request<{
        data: {
          id: string;
          projectSlug: string | null;
          type: string;
          topic: string;
          status: string;
          maxRounds: number;
          currentRound: number;
          verdict: unknown;
          createdAt: string | null;
          concludedAt: string | null;
          messages: Array<{
            id: string;
            channelId: string;
            agentId: string;
            role: string;
            content: string;
            round: number;
            timestamp: string | null;
          }>;
          linkedSessions: Array<{
            id: string;
            model: string;
            status: string;
            cwd: string;
            projectSlug: string | null;
          }>;
        };
      }>(`/api/channels/${id}`),
    create: (body: {
      projectSlug?: string;
      type: "debate" | "review" | "red_team" | "brainstorm";
      topic: string;
      maxRounds?: number;
    }) =>
      request<{ data: unknown }>("/api/channels", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    postMessage: (
      id: string,
      body: {
        agentId: string;
        role: "advocate" | "challenger" | "judge" | "reviewer" | "human";
        content: string;
        round?: number;
      },
    ) =>
      request<{ data: unknown }>(`/api/channels/${id}/messages`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patch: (id: string, body: { status: "active" | "concluding" | "concluded" }) =>
      request<{ success: boolean }>(`/api/channels/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    linkSession: (id: string, sessionId: string) =>
      request<{ success: boolean }>(`/api/channels/${id}/link`, {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      }),
    unlinkSession: (id: string, sessionId: string) =>
      request<{ success: boolean }>(`/api/channels/${id}/sessions/${sessionId}`, {
        method: "DELETE",
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/api/channels/${id}`, {
        method: "DELETE",
      }),
  },

  // Filesystem browsing
  fs: {
    browse: (path: string, includeFiles = false) =>
      request<{
        data: { path: string; dirs: string[]; files: string[] };
      }>(`/api/fs/browse?path=${encodeURIComponent(path)}${includeFiles ? "&files=true" : ""}`),

    roots: () =>
      request<{
        data: { roots: { label: string; path: string }[] };
      }>("/api/fs/roots"),

    read: (path: string) =>
      request<{
        data: { path: string; name: string; ext: string; content: string; size: number };
      }>(`/api/fs/read?path=${encodeURIComponent(path)}`),

    search: (query: string, path: string, glob?: string) =>
      request<{
        data: {
          matches: Array<{ file: string; line: number; col: number; text: string }>;
          total: number;
          truncated: boolean;
        };
      }>(
        `/api/fs/search?q=${encodeURIComponent(query)}&path=${encodeURIComponent(path)}${glob ? `&glob=${encodeURIComponent(glob)}` : ""}`,
      ),
  },

  // Terminal
  terminal: {
    spawn: (cwd: string) =>
      request<{ data: { terminalId: string } }>("/api/terminal", {
        method: "POST",
        body: JSON.stringify({ cwd }),
      }),
    list: () =>
      request<{ data: { terminals: Array<{ id: string; cwd: string; createdAt: number }> } }>("/api/terminal"),
    kill: (id: string) =>
      request<{ success: boolean }>(`/api/terminal/${id}`, { method: "DELETE" }),
  },

  // Templates
  templates: {
    list: (project?: string) =>
      request<{
        success: boolean;
        data: Array<{
          id: string;
          name: string;
          slug: string;
          projectSlug: string | null;
          prompt: string;
          model: string | null;
          permissionMode: string | null;
          icon: string;
          sortOrder: number;
          variables: Array<{
            key: string;
            label: string;
            defaultValue?: string;
            required?: boolean;
          }> | null;
        }>;
      }>(`/api/templates${project ? `?project=${encodeURIComponent(project)}` : ""}`),

    create: (body: {
      name: string;
      prompt: string;
      slug?: string;
      projectSlug?: string | null;
      icon?: string;
      model?: string | null;
      sortOrder?: number;
      variables?: Array<{ key: string; label: string; defaultValue?: string; required?: boolean }> | null;
    }) =>
      request<{ success: boolean; data: { id: string } }>("/api/templates", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    update: (id: string, body: Record<string, unknown>) =>
      request<{ success: boolean }>(`/api/templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/api/templates/${id}`, {
        method: "DELETE",
      }),
  },
};
