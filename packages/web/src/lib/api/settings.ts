import { request } from "./base";

export const settings = {
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
};

export const projects = {
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
};

export const telegram = {
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
};

export const mcpConfig = {
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
};

export const models = {
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
};

export const cliPlatforms = {
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
};

export const features = {
  getToggles: () =>
    request<{ success: boolean; data: Record<string, boolean> }>(
      "/api/settings/features/toggles",
    ),
  setToggle: (feature: string, enabled: boolean) =>
    request<{ success: boolean }>(`/api/settings/features/toggles/${feature}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
};

export const updateCheck = {
  check: (force = false) =>
    request<{
      available: boolean;
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
      releaseNotes: string;
      publishedAt: string;
    }>(`/api/health/update-check${force ? "?force=true" : ""}`),
};
