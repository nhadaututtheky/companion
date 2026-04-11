/**
 * API client for Companion server.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const storedKey = typeof window !== "undefined" ? (localStorage.getItem("api_key") ?? "") : "";
  const apiKey = storedKey === "__no_auth__" ? "" : storedKey;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string>) },
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

  license: () =>
    request<{
      data: {
        valid: boolean;
        tier: string;
        features: string[];
        maxSessions: number;
        expiresAt?: string;
      };
    }>("/api/license"),

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
      personaId?: string;
      cliPlatform?: "claude" | "codex" | "gemini" | "opencode";
      platformOptions?: Record<string, unknown>;
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
    delete: (slug: string) =>
      request<{ success: boolean }>(`/api/projects/${slug}`, {
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
      role: "claude" | "codex" | "gemini" | "opencode" | "general";
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
        role: "claude" | "codex" | "gemini" | "opencode" | "general";
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
      request<{ data: { username: string; firstName: string } }>(`/api/telegram/bots/${id}/test`),
  },

  // Settings (key-value store)
  settings: {
    list: (prefix?: string) =>
      request<{ data: Record<string, string> }>(
        `/api/settings${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
      ),

    get: (key: string) =>
      request<{ data: { key: string; value: string } }>(`/api/settings/${encodeURIComponent(key)}`),

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
    startDebate: (body: {
      topic: string;
      format?: "pro_con" | "red_team" | "review" | "brainstorm";
      projectSlug?: string;
      maxRounds?: number;
      agentModels?: Array<{ agentId: string; model: string; label?: string; personaId?: string }>;
    }) =>
      request<{
        success: boolean;
        data: {
          channelId: string;
          topic: string;
          format: string;
          agents: Array<{
            id: string;
            label: string;
            role: string;
            model?: string;
            modelLabel?: string;
          }>;
        };
      }>("/api/channels/debate", { method: "POST", body: JSON.stringify(body) }),
    startCLIDebate: (body: {
      topic: string;
      format?: "pro_con" | "code_review" | "architecture" | "benchmark";
      agents: Array<{
        id: string;
        role: string;
        label: string;
        emoji?: string;
        platform: "claude" | "codex" | "gemini" | "opencode";
        model: string;
        platformOptions?: Record<string, unknown>;
      }>;
      workingDir: string;
      projectSlug?: string;
      maxRounds?: number;
    }) =>
      request<{
        success: boolean;
        data: {
          channelId: string;
          topic: string;
          format: string;
          agents: Array<{
            id: string;
            label: string;
            role: string;
            platform: string;
            model: string;
          }>;
        };
      }>("/api/channels/cli-debate", { method: "POST", body: JSON.stringify(body) }),
    abortCLIDebate: (id: string) =>
      request<{ success: boolean }>(`/api/channels/${id}/abort-cli`, { method: "POST" }),
    conclude: (id: string) =>
      request<{ success: boolean; data: { verdict: unknown } }>(`/api/channels/${id}/conclude`, {
        method: "POST",
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
    spawn: (cwd?: string) =>
      request<{ data: { terminalId: string } }>("/api/terminal", {
        method: "POST",
        body: JSON.stringify(cwd ? { cwd } : {}),
      }),
    list: () =>
      request<{ data: { terminals: Array<{ id: string; cwd: string; createdAt: number }> } }>(
        "/api/terminal",
      ),
    kill: (id: string) =>
      request<{ success: boolean }>(`/api/terminal/${id}`, { method: "DELETE" }),
  },

  // Snapshots
  snapshots: {
    capture: (sessionId: string, label?: string) =>
      request<{ success: boolean; data: { id: number; contentLength: number } }>(
        `/api/sessions/${sessionId}/snapshots`,
        { method: "POST", body: JSON.stringify({ label }) },
      ),
    list: (sessionId: string) =>
      request<{
        success: boolean;
        data: Array<{
          id: number;
          label: string | null;
          contentLength: number;
          contentPreview: string;
          createdAt: string;
        }>;
      }>(`/api/sessions/${sessionId}/snapshots`),
    get: (sessionId: string, snapshotId: number) =>
      request<{
        success: boolean;
        data: {
          id: number;
          sessionId: string;
          content: string;
          label: string | null;
          createdAt: string;
        };
      }>(`/api/sessions/${sessionId}/snapshots/${snapshotId}`),
  },

  // Share tokens (QR Stream Sharing)
  share: {
    create: (
      sessionId: string,
      opts?: { permission?: "read-only" | "interactive"; expiresInHours?: number },
    ) =>
      request<{
        success: boolean;
        data: { token: string; permission: string; expiresAt: string };
      }>(`/api/sessions/${sessionId}/share`, {
        method: "POST",
        body: JSON.stringify(opts ?? {}),
      }),
    list: (sessionId: string) =>
      request<{
        success: boolean;
        data: Array<{
          token: string;
          permission: string;
          createdBy: string;
          expiresAt: string;
          createdAt: string;
        }>;
      }>(`/api/sessions/${sessionId}/shares`),
    revoke: (token: string) =>
      request<{ success: boolean }>(`/api/share/${token}`, { method: "DELETE" }),
    validate: (token: string) =>
      request<{
        success: boolean;
        data: {
          sessionId: string;
          sessionName: string | null;
          permission: string;
          expiresAt: string;
        };
      }>(`/api/share/${token}`),
  },

  // Workflow templates
  workflowTemplates: {
    list: (category?: string) =>
      request<{
        success: boolean;
        data: Array<{
          id: string;
          name: string;
          slug: string;
          description: string;
          icon: string;
          category: string;
          steps: Array<{
            role: string;
            label: string;
            promptTemplate: string;
            order: number;
            model?: string;
          }>;
          isBuiltIn: boolean;
          defaultCostCapUsd: number | null;
          createdAt: string;
          updatedAt: string;
        }>;
      }>(`/api/workflow-templates${category ? `?category=${category}` : ""}`),
    get: (id: string) =>
      request<{ success: boolean; data: unknown }>(`/api/workflow-templates/${id}`),
    create: (body: {
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      category?: string;
      steps: Array<{ role: string; label: string; promptTemplate: string; order: number }>;
      defaultCostCapUsd?: number;
    }) =>
      request<{ success: boolean; data: { id: string } }>("/api/workflow-templates", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Record<string, unknown>) =>
      request<{ success: boolean }>(`/api/workflow-templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/api/workflow-templates/${id}`, { method: "DELETE" }),
  },

  // Workflows
  workflows: {
    start: (body: {
      templateId: string;
      topic: string;
      projectSlug?: string;
      costCapUsd?: number;
      cwd?: string;
    }) =>
      request<{ success: boolean; data: { channelId: string; sessionId: string } }>(
        "/api/workflows",
        { method: "POST", body: JSON.stringify(body) },
      ),
    list: (opts?: { status?: string; project?: string }) => {
      const params = new URLSearchParams();
      if (opts?.status) params.set("status", opts.status);
      if (opts?.project) params.set("project", opts.project);
      const qs = params.toString();
      return request<{
        success: boolean;
        data: Array<{
          channelId: string;
          topic: string;
          status: string;
          projectSlug: string | null;
          workflowState: unknown;
          createdAt: string;
        }>;
      }>(`/api/workflows${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) =>
      request<{
        success: boolean;
        data: {
          channelId: string;
          topic: string;
          status: string;
          workflowState: unknown;
          createdAt: string;
          concludedAt: string | null;
        };
      }>(`/api/workflows/${id}`),
    cancel: (id: string) =>
      request<{ success: boolean }>(`/api/workflows/${id}/cancel`, { method: "POST" }),
  },

  // Error logs
  errors: {
    list: (opts?: { source?: string; sessionId?: string; limit?: number; offset?: number }) => {
      const params = new URLSearchParams();
      if (opts?.source) params.set("source", opts.source);
      if (opts?.sessionId) params.set("sessionId", opts.sessionId);
      if (opts?.limit) params.set("limit", String(opts.limit));
      if (opts?.offset) params.set("offset", String(opts.offset));
      const qs = params.toString();
      return request<{
        success: boolean;
        data: Array<{
          id: number;
          source: string;
          level: string;
          message: string;
          stack: string | null;
          sessionId: string | null;
          context: Record<string, unknown> | null;
          timestamp: string;
        }>;
        meta: { total: number; limit: number; offset: number };
      }>(`/api/errors${qs ? `?${qs}` : ""}`);
    },
    clear: () =>
      request<{ success: boolean; data: { cleared: number } }>("/api/errors", { method: "DELETE" }),
    exportUrl: () => `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/errors/export`,
  },

  // Prompt history
  prompts: {
    list: (opts?: { sessionId?: string; q?: string; limit?: number; offset?: number }) => {
      const params = new URLSearchParams();
      if (opts?.sessionId) params.set("sessionId", opts.sessionId);
      if (opts?.q) params.set("q", opts.q);
      if (opts?.limit) params.set("limit", String(opts.limit));
      if (opts?.offset) params.set("offset", String(opts.offset));
      const qs = params.toString();
      return request<{
        success: boolean;
        data: Array<{
          id: string;
          sessionId: string;
          sessionName: string | null;
          projectSlug: string | null;
          content: string;
          source: string;
          createdAt: string;
        }>;
        meta: { total: number; limit: number; offset: number };
      }>(`/api/prompts${qs ? `?${qs}` : ""}`);
    },
    resend: (sessionId: string, content: string) =>
      request<{ success: boolean }>("/api/prompts/resend", {
        method: "POST",
        body: JSON.stringify({ sessionId, content }),
      }),
  },

  // Stats
  stats: {
    get: () =>
      request<{
        success: boolean;
        data: {
          today: { sessions: number; tokens: number; cost: number };
          week: { sessions: number; tokens: number; cost: number };
          streak: number;
          totalSessions: number;
          modelBreakdown: Array<{ model: string; count: number; tokens: number }>;
          dailyActivity: Array<{ date: string; sessions: number; tokens: number }>;
          dailyCost: Array<{ date: string; cost: number }>;
          topProjects: Array<{ name: string; sessions: number }>;
          recentSessions: Array<{
            id: string;
            name: string | null;
            model: string;
            projectSlug: string | null;
            source: string;
            startedAt: number;
            cost: number;
            turns: number;
            tokens: number;
            durationMs: number | null;
            rtkTokensSaved: number;
            filesModified: string[];
            filesCreated: string[];
          }>;
          avgDurationMs: number;
          rtkSummary: {
            totalTokensSaved: number;
            totalCompressions: number;
            totalCacheHits: number;
            cacheHitRate: number;
            estimatedCostSaved: number;
          };
        };
      }>("/api/stats"),
    features: () =>
      request<{
        success: boolean;
        data: {
          rtk: {
            daily: Array<{ date: string; tokensSaved: number; compressions: number }>;
            totalTokensSaved: number;
            totalCompressions: number;
            cacheHitRate: number;
            estimatedCostSaved: number;
          };
          wiki: {
            domains: Array<{
              slug: string;
              name: string;
              articleCount: number;
              totalTokens: number;
              staleCount: number;
              lastCompiledAt: string | null;
              rawPending: number;
            }>;
            totalArticles: number;
            totalTokens: number;
          };
          codegraph: {
            projects: Array<{
              slug: string;
              files: number;
              nodes: number;
              edges: number;
              lastScannedAt: string | null;
              coveragePercent: number;
            }>;
          };
          context: {
            totalInjections: number;
            totalTokens: number;
            typeBreakdown: Array<{ type: string; count: number; tokens: number }>;
            daily: Array<{ date: string; injections: number; tokens: number }>;
            topSessions: Array<{ sessionId: string; injections: number; tokens: number }>;
          };
        };
      }>("/api/stats/features"),
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
      variables?: Array<{
        key: string;
        label: string;
        defaultValue?: string;
        required?: boolean;
      }> | null;
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

  // WebIntel
  webintel: {
    status: () =>
      request<{
        success: boolean;
        data: {
          available: boolean;
          cache: { size: number; maxSize: number; hits: number; misses: number };
        };
      }>("/api/webintel/status"),

    scrape: (url: string, opts?: { formats?: string[]; skipCache?: boolean }) =>
      request<{
        success: boolean;
        data: {
          url: string;
          metadata: Record<string, unknown>;
          markdown?: string;
          llm?: string;
          text?: string;
        };
      }>("/api/webintel/scrape", {
        method: "POST",
        body: JSON.stringify({ url, ...opts }),
      }),

    docs: (url: string, maxTokens?: number) =>
      request<{ success: boolean; data: { url: string; content: string } }>("/api/webintel/docs", {
        method: "POST",
        body: JSON.stringify({ url, maxTokens }),
      }),

    research: (query: string, maxTokens?: number) =>
      request<{
        success: boolean;
        data: {
          content: string;
          sources: Array<{ title: string; url: string }>;
        };
      }>("/api/webintel/research", {
        method: "POST",
        body: JSON.stringify({ query, maxTokens }),
      }),

    crawl: (url: string, opts?: { maxDepth?: number; maxPages?: number }) =>
      request<{ success: boolean; data: { jobId: string } }>("/api/webintel/crawl", {
        method: "POST",
        body: JSON.stringify({ url, ...opts }),
      }),

    jobs: () => request<{ success: boolean; data: unknown[] }>("/api/webintel/jobs"),

    job: (id: string) => request<{ success: boolean; data: unknown }>(`/api/webintel/jobs/${id}`),

    clearCache: () => request<{ success: boolean }>("/api/webintel/cache", { method: "DELETE" }),

    dockerStatus: () =>
      request<{
        success: boolean;
        data: {
          dockerAvailable: boolean;
          webclawRunning: boolean;
          webclawContainerId: string | null;
          webclawHealthy: boolean;
        };
      }>("/api/webintel/docker-status"),

    startWebclaw: (apiKey?: string) =>
      request<{
        success: boolean;
        data: { status: string; containerId?: string };
      }>("/api/webintel/start-webclaw", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      }),

    stopWebclaw: () =>
      request<{ success: boolean; data: { status: string } }>("/api/webintel/stop-webclaw", {
        method: "POST",
      }),
  },

  codegraph: {
    status: (project: string) =>
      request<{
        success: boolean;
        data: {
          ready: boolean;
          job: {
            id: number;
            status: string;
            totalFiles: number;
            scannedFiles: number;
            totalNodes: number;
            totalEdges: number;
            errorMessage: string | null;
            startedAt: string;
            completedAt: string | null;
          } | null;
        };
      }>(`/api/codegraph/status?project=${encodeURIComponent(project)}`),

    stats: (project: string) =>
      request<{
        success: boolean;
        data: { files: number; nodes: number; edges: number };
      }>(`/api/codegraph/stats?project=${encodeURIComponent(project)}`),

    scan: (projectSlug: string) =>
      request<{ success: boolean; data: { jobId: number } }>("/api/codegraph/scan", {
        method: "POST",
        body: JSON.stringify({ projectSlug }),
      }),

    rescan: (projectSlug: string, files?: string[]) =>
      request<{
        success: boolean;
        data: { updated: number; added: number; deleted: number };
      }>("/api/codegraph/rescan", {
        method: "POST",
        body: JSON.stringify({ projectSlug, files }),
      }),

    describe: (projectSlug: string) =>
      request<{ success: boolean; data: { described: number } }>("/api/codegraph/describe", {
        method: "POST",
        body: JSON.stringify({ projectSlug }),
      }),

    cancel: (projectSlug: string) =>
      request<{ success: boolean; data: { cancelled: boolean } }>("/api/codegraph/cancel", {
        method: "POST",
        body: JSON.stringify({ projectSlug }),
      }),

    search: (project: string, query: string) =>
      request<{ success: boolean; data: unknown[] }>(
        `/api/codegraph/search?project=${encodeURIComponent(project)}&q=${encodeURIComponent(query)}`,
      ),

    hotFiles: (project: string, limit = 10) =>
      request<{
        success: boolean;
        data: Array<{
          filePath: string;
          incomingEdges: number;
          outgoingEdges: number;
          totalTrust: number;
        }>;
      }>(`/api/codegraph/hot-files?project=${encodeURIComponent(project)}&limit=${limit}`),

    impact: (project: string, file: string) =>
      request<{ success: boolean; data: unknown[] }>(
        `/api/codegraph/impact?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`,
      ),

    reverseDeps: (project: string, file: string) =>
      request<{ success: boolean; data: unknown[] }>(
        `/api/codegraph/reverse-deps?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`,
      ),

    graph: (project: string) =>
      request<{
        success: boolean;
        data: {
          nodes: Array<{
            id: number;
            projectSlug: string;
            fileId: number;
            filePath: string;
            symbolName: string;
            symbolType: string;
            isExported: boolean;
            lineStart: number;
            lineEnd: number;
          }>;
          edges: Array<{
            id: number;
            sourceNodeId: number;
            targetNodeId: number;
            edgeType: string;
            trustWeight: number;
          }>;
          truncated: boolean;
          totalNodes: number;
        };
      }>(`/api/codegraph/graph?project=${encodeURIComponent(project)}`),

    getConfig: (project: string) =>
      request<{
        success: boolean;
        data: {
          projectSlug: string;
          injectionEnabled: boolean;
          projectMapEnabled: boolean;
          messageContextEnabled: boolean;
          planReviewEnabled: boolean;
          breakCheckEnabled: boolean;
          webDocsEnabled: boolean;
          excludePatterns: string[];
          maxContextTokens: number;
        };
      }>(`/api/codegraph/config?project=${encodeURIComponent(project)}`),

    updateConfig: (config: {
      projectSlug: string;
      injectionEnabled?: boolean;
      projectMapEnabled?: boolean;
      messageContextEnabled?: boolean;
      planReviewEnabled?: boolean;
      breakCheckEnabled?: boolean;
      webDocsEnabled?: boolean;
      excludePatterns?: string[];
      maxContextTokens?: number;
    }) =>
      request<{ success: boolean; data: unknown }>("/api/codegraph/config", {
        method: "PUT",
        body: JSON.stringify(config),
      }),
  },

  mcpConfig: {
    list: () =>
      request<{
        success: boolean;
        data: Array<{
          id: string;
          name: string;
          type: "stdio" | "streamableHttp" | "sse";
          command?: string;
          args?: string[];
          url?: string;
          env?: Record<string, string>;
          headers?: Record<string, string>;
          enabled: boolean;
          description?: string;
        }>;
      }>("/api/mcp-config/servers"),

    get: (id: string) =>
      request<{ success: boolean; data: unknown }>(
        `/api/mcp-config/servers/${encodeURIComponent(id)}`,
      ),

    save: (
      id: string,
      config: {
        name: string;
        type: "stdio" | "streamableHttp" | "sse";
        command?: string;
        args?: string[];
        url?: string;
        env?: Record<string, string>;
        headers?: Record<string, string>;
        enabled?: boolean;
        description?: string;
      },
    ) =>
      request<{ success: boolean; data: { id: string } }>(
        `/api/mcp-config/servers/${encodeURIComponent(id)}`,
        { method: "PUT", body: JSON.stringify(config) },
      ),

    delete: (id: string) =>
      request<{ success: boolean }>(`/api/mcp-config/servers/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),

    detect: () =>
      request<{
        success: boolean;
        data: Array<{
          id: string;
          name: string;
          type: "stdio" | "streamableHttp" | "sse";
          command?: string;
          args?: string[];
          url?: string;
          env?: Record<string, string>;
          headers?: Record<string, string>;
          source: string;
          alreadyImported: boolean;
        }>;
      }>("/api/mcp-config/detected"),

    import: (id: string) =>
      request<{ success: boolean; data: { id: string } }>(
        `/api/mcp-config/import/${encodeURIComponent(id)}`,
        { method: "POST" },
      ),
  },

  schedules: {
    list: () =>
      request<{ success: boolean; data: import("@companion/shared").Schedule[] }>("/api/schedules"),

    get: (id: string) =>
      request<{ success: boolean; data: import("@companion/shared").Schedule }>(
        `/api/schedules/${encodeURIComponent(id)}`,
      ),

    create: (input: import("@companion/shared").CreateScheduleInput) =>
      request<{ success: boolean; data: import("@companion/shared").Schedule }>("/api/schedules", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    update: (id: string, input: import("@companion/shared").UpdateScheduleInput) =>
      request<{ success: boolean; data: import("@companion/shared").Schedule }>(
        `/api/schedules/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),

    delete: (id: string) =>
      request<{ success: boolean }>(`/api/schedules/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),

    toggle: (id: string) =>
      request<{ success: boolean; data: import("@companion/shared").Schedule }>(
        `/api/schedules/${encodeURIComponent(id)}/toggle`,
        { method: "PATCH" },
      ),

    runNow: (id: string) =>
      request<{ success: boolean; data: { sessionId: string } }>(
        `/api/schedules/${encodeURIComponent(id)}/run-now`,
        { method: "POST" },
      ),

    upcoming: (limit = 20) =>
      request<{
        success: boolean;
        data: Array<{
          scheduleId: string;
          name: string;
          projectSlug: string | null;
          nextRunAt: number;
          triggerType: string;
        }>;
      }>(`/api/schedules/upcoming?limit=${limit}`),

    runs: (id: string, limit = 50) =>
      request<{
        success: boolean;
        data: Array<{
          id: number;
          scheduleId: string;
          sessionId: string | null;
          status: string;
          reason: string | null;
          startedAt: number;
        }>;
      }>(`/api/schedules/${encodeURIComponent(id)}/runs?limit=${limit}`),
  },

  // Saved Prompts (reusable prompt templates)
  models: {
    list: () =>
      request<{
        success: boolean;
        data: {
          free: Array<{
            provider: {
              id: string;
              name: string;
              type: string;
              enabled: boolean;
              healthStatus?: string;
            };
            models: Array<{
              id: string;
              name: string;
              provider: string;
              contextWindow: number;
              free: boolean;
              capabilities: {
                toolUse: boolean;
                streaming: boolean;
                vision: boolean;
                reasoning: boolean;
              };
            }>;
          }>;
          configured: Array<{
            provider: {
              id: string;
              name: string;
              type: string;
              enabled: boolean;
              healthStatus?: string;
            };
            models: Array<{
              id: string;
              name: string;
              provider: string;
              contextWindow: number;
              free: boolean;
              capabilities: {
                toolUse: boolean;
                streaming: boolean;
                vision: boolean;
                reasoning: boolean;
              };
            }>;
          }>;
        };
      }>("/api/models"),

    health: () =>
      request<{
        success: boolean;
        data: Array<{ id: string; status: string; latencyMs: number }>;
      }>("/api/models/health"),

    toggleProvider: (id: string, enabled: boolean) =>
      request<{ success: boolean }>(`/api/models/providers/${encodeURIComponent(id)}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
  },

  savedPrompts: {
    list: (project?: string) =>
      request<{
        success: boolean;
        data: Array<{
          id: string;
          name: string;
          content: string;
          projectSlug: string | null;
          tags: string[];
          sortOrder: number;
          createdAt: string;
          updatedAt: string;
        }>;
      }>(`/api/saved-prompts${project ? `?project=${encodeURIComponent(project)}` : ""}`),

    create: (body: {
      name: string;
      content: string;
      projectSlug?: string | null;
      tags?: string[];
    }) =>
      request<{ success: boolean; data: { id: string } }>("/api/saved-prompts", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    update: (
      id: string,
      body: {
        name?: string;
        content?: string;
        projectSlug?: string | null;
        tags?: string[];
        sortOrder?: number;
      },
    ) =>
      request<{ success: boolean }>(`/api/saved-prompts/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/api/saved-prompts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },

  customPersonas: {
    list: () =>
      request<{
        success: boolean;
        data: import("@companion/shared").Persona[];
        meta: { total: number };
      }>("/api/custom-personas"),

    get: (id: string) =>
      request<{ success: boolean; data: import("@companion/shared").Persona }>(
        `/api/custom-personas/${encodeURIComponent(id)}`,
      ),

    create: (body: {
      name: string;
      title: string;
      systemPrompt: string;
      icon?: string;
      intro?: string;
      mentalModels?: string[];
      decisionFramework?: string;
      redFlags?: string[];
      communicationStyle?: string;
      blindSpots?: string[];
      bestFor?: string[];
      strength?: string;
      avatarGradient?: [string, string];
      avatarInitials?: string;
      combinableWith?: string[];
    }) =>
      request<{ success: boolean; data: import("@companion/shared").Persona }>(
        "/api/custom-personas",
        { method: "POST", body: JSON.stringify(body) },
      ),

    update: (
      id: string,
      body: {
        name?: string;
        title?: string;
        systemPrompt?: string;
        icon?: string;
        intro?: string;
        mentalModels?: string[];
        decisionFramework?: string;
        redFlags?: string[];
        communicationStyle?: string;
        blindSpots?: string[];
        bestFor?: string[];
        strength?: string;
        avatarGradient?: [string, string];
        avatarInitials?: string;
        combinableWith?: string[];
      },
    ) =>
      request<{ success: boolean; data: import("@companion/shared").Persona }>(
        `/api/custom-personas/${encodeURIComponent(id)}`,
        { method: "PUT", body: JSON.stringify(body) },
      ),

    delete: (id: string) =>
      request<{ success: boolean }>(`/api/custom-personas/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),

    clone: (builtInId: string, overrides?: { name?: string }) =>
      request<{ success: boolean; data: import("@companion/shared").Persona }>(
        `/api/custom-personas/clone/${encodeURIComponent(builtInId)}`,
        { method: "POST", body: JSON.stringify(overrides ?? {}) },
      ),
  },

  // CLI Platforms
  cliPlatforms: {
    list: () =>
      request<{
        platforms: Array<{
          id: string;
          name: string;
          available: boolean;
          version?: string;
          path?: string;
          capabilities: {
            supportsResume: boolean;
            supportsStreaming: boolean;
            supportsTools: boolean;
            supportsMCP: boolean;
            outputFormat: string;
            inputFormat: string;
            supportsModelFlag: boolean;
            supportsThinking: boolean;
            supportsInteractive: boolean;
          };
        }>;
      }>("/api/cli-platforms"),

    refresh: () =>
      request<{
        platforms: Array<{
          id: string;
          available: boolean;
          version?: string;
        }>;
        refreshed: boolean;
      }>("/api/cli-platforms/refresh", { method: "POST" }),
  },

  // Wiki Knowledge Base
  wiki: {
    listDomains: () =>
      request<{
        success: boolean;
        data: Array<{
          slug: string;
          name: string;
          articleCount: number;
          totalTokens: number;
          lastCompiledAt: string | null;
          hasCore: boolean;
        }>;
      }>("/api/wiki"),
    createDomain: (slug: string, name: string) =>
      request<{ success: boolean; data: unknown }>("/api/wiki", {
        method: "POST",
        body: JSON.stringify({ slug, name }),
      }),
    deleteDomain: (domain: string) =>
      request<{ success: boolean }>(`/api/wiki/${domain}`, { method: "DELETE" }),
    getIndex: (domain: string) =>
      request<{ success: boolean; data: unknown }>(`/api/wiki/${domain}`),
    listArticles: (domain: string) =>
      request<{
        success: boolean;
        data: Array<{
          slug: string;
          title: string;
          tokens: number;
          tags: string[];
          compiledAt: string;
        }>;
      }>(`/api/wiki/${domain}/articles`),
    getArticle: (domain: string, slug: string) =>
      request<{
        success: boolean;
        data: {
          slug: string;
          meta: {
            title: string;
            domain: string;
            compiledFrom: string[];
            compiledBy: string;
            compiledAt: string;
            tokens: number;
            tags: string[];
            manuallyEdited: boolean;
          };
          content: string;
        };
      }>(`/api/wiki/${domain}/articles/${slug}`),
    updateArticle: (domain: string, slug: string, body: { content: string; tags?: string[] }) =>
      request<{ success: boolean }>(`/api/wiki/${domain}/articles/${slug}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    deleteArticle: (domain: string, slug: string) =>
      request<{ success: boolean }>(`/api/wiki/${domain}/articles/${slug}`, { method: "DELETE" }),
    getCore: (domain: string) =>
      request<{ success: boolean; data: { content: string } }>(`/api/wiki/${domain}/core`),
    updateCore: (domain: string, content: string) =>
      request<{ success: boolean }>(`/api/wiki/${domain}/core`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    compile: (domain: string, opts?: { overwrite?: boolean }) =>
      request<{
        success: boolean;
        data: { articlesCreated: number; articlesSkipped: number; errors: string[] };
      }>(`/api/wiki/${domain}/compile`, { method: "POST", body: JSON.stringify(opts ?? {}) }),
    listRawFiles: (domain: string) =>
      request<{
        success: boolean;
        data: Array<{
          name: string;
          ext: string;
          sizeBytes: number;
          modifiedAt: string;
          compiled: boolean;
        }>;
      }>(`/api/wiki/${domain}/raw`),
    uploadRaw: (domain: string, filename: string, content: string) =>
      request<{ success: boolean }>(`/api/wiki/${domain}/raw`, {
        method: "POST",
        body: JSON.stringify({ filename, content }),
      }),
    deleteRaw: (domain: string, filename: string) =>
      request<{ success: boolean }>(`/api/wiki/${domain}/raw/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      }),
    search: (domain: string, query: string) =>
      request<{
        success: boolean;
        data: Array<{ slug: string; title: string; score: number; snippet: string }>;
      }>(`/api/wiki/${domain}/query`, {
        method: "POST",
        body: JSON.stringify({ mode: "search", query }),
      }),
    lint: (domain: string) =>
      request<{
        success: boolean;
        data: {
          domain: string;
          issues: Array<{ target: string; severity: string; code: string; message: string }>;
          articlesChecked: number;
          rawFilesChecked: number;
          lintedAt: string;
        };
      }>(`/api/wiki/${domain}/lint`),

    getFlags: (domain: string) =>
      request<{
        success: boolean;
        data: Array<{ slug: string; reason?: string; flaggedAt: string; flaggedBy: string }>;
      }>(`/api/wiki/${domain}/flags`),

    flagStale: (domain: string, slug: string, reason?: string) =>
      request<{ success: boolean }>(`/api/wiki/${domain}/flag-stale/${slug}`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
  },

  // Feature toggles
  features: {
    getToggles: () =>
      request<{ success: boolean; data: Record<string, boolean> }>(
        "/api/settings/features/toggles",
      ),
    setToggle: (feature: string, enabled: boolean) =>
      request<{ success: boolean }>(`/api/settings/features/toggles/${feature}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      }),
  },

  // Update check
  updateCheck: {
    check: (force = false) =>
      request<{
        available: boolean;
        currentVersion: string;
        latestVersion: string;
        releaseUrl: string;
        releaseNotes: string;
        publishedAt: string;
      }>(`/api/health/update-check${force ? "?force=true" : ""}`),
  },

  workspaces: {
    list: () =>
      request<{
        success: boolean;
        data: import("@companion/shared").Workspace[];
      }>("/api/workspaces"),

    get: (id: string) =>
      request<{
        success: boolean;
        data: import("@companion/shared").WorkspaceWithStatus;
      }>(`/api/workspaces/${encodeURIComponent(id)}`),

    create: (body: import("@companion/shared").WorkspaceCreateBody) =>
      request<{ success: boolean; data: import("@companion/shared").Workspace }>(
        "/api/workspaces",
        { method: "POST", body: JSON.stringify(body) },
      ),

    update: (id: string, body: import("@companion/shared").WorkspaceUpdateBody) =>
      request<{ success: boolean; data: import("@companion/shared").Workspace }>(
        `/api/workspaces/${encodeURIComponent(id)}`,
        { method: "PUT", body: JSON.stringify(body) },
      ),

    delete: (id: string) =>
      request<{ success: boolean }>(`/api/workspaces/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),

    connect: (id: string, platform: string, sessionId: string) =>
      request<{ success: boolean }>(`/api/workspaces/${encodeURIComponent(id)}/connect`, {
        method: "POST",
        body: JSON.stringify({ platform, sessionId }),
      }),

    disconnect: (id: string, cli: string) =>
      request<{ success: boolean }>(
        `/api/workspaces/${encodeURIComponent(id)}/disconnect/${encodeURIComponent(cli)}`,
        { method: "POST" },
      ),
  },
};
