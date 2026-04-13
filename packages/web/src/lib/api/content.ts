import { request } from "./base";

export const templates = {
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
};

export const workflowTemplates = {
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
};

export const workflows = {
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
};

export const prompts = {
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
};

export const savedPrompts = {
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
};

export const schedules = {
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
};

export const customPersonas = {
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
};

export const wiki = {
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
};
