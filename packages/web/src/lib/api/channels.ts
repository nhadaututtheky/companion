import { request } from "./base";

export const channels = {
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
};
