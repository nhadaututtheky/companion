import { BASE, request } from "./base";

export const health = {
  check: () => request<{ success: boolean; data: { status: string } }>("/api/health"),
};

export const license = {
  get: () =>
    request<{
      data: {
        valid: boolean;
        tier: string;
        features: string[];
        maxSessions: number;
        expiresAt?: string;
      };
    }>("/api/license"),
};

export const stats = {
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
  contextInjections: (sessionId: string) =>
    request<{
      success: boolean;
      data: Array<{ type: string; tokens: number; createdAt: number }>;
    }>(`/api/stats/context-injections?sessionId=${encodeURIComponent(sessionId)}`),
};

export const errors = {
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
    request<{ success: boolean; data: { cleared: number } }>("/api/errors", {
      method: "DELETE",
    }),
  exportUrl: () => `${BASE}/api/errors/export`,
};

export const snapshots = {
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
};

export const share = {
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
};

export const workspaces = {
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
    request<{ success: boolean; data: import("@companion/shared").Workspace }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(body),
    }),

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
};
