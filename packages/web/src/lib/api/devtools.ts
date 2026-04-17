import { request } from "./base";

export const fs = {
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
};

export const terminal = {
  spawn: (cwd?: string) =>
    request<{ data: { terminalId: string } }>("/api/terminal", {
      method: "POST",
      body: JSON.stringify(cwd ? { cwd } : {}),
    }),
  list: () =>
    request<{ data: { terminals: Array<{ id: string; cwd: string; createdAt: number }> } }>(
      "/api/terminal",
    ),
  kill: (id: string) => request<{ success: boolean }>(`/api/terminal/${id}`, { method: "DELETE" }),
};

export const codegraph = {
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
    autoReindexEnabled?: boolean;
    excludePatterns?: string[];
    maxContextTokens?: number;
  }) =>
    request<{ success: boolean; data: unknown }>("/api/codegraph/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  diagram: (
    project: string,
    type: "architecture" | "module" | "flow",
    opts?: { file?: string; symbol?: string },
  ) => {
    const params = new URLSearchParams({ project, type });
    if (opts?.file) params.set("file", opts.file);
    if (opts?.symbol) params.set("symbol", opts.symbol);
    return request<{
      success: boolean;
      data: {
        mermaid: string;
        type: "architecture" | "module" | "flow";
        description: string;
        nodeCount: number;
        edgeCount: number;
      };
    }>(`/api/codegraph/diagram?${params.toString()}`);
  },

  generateSkills: (projectSlug: string) =>
    request<{
      success: boolean;
      data: { generated: string[]; skipped: string[]; dir: string };
    }>("/api/codegraph/generate-skills", {
      method: "POST",
      body: JSON.stringify({ projectSlug }),
    }),
};

export const webintel = {
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
};

export const review = {
  files: (project: string) =>
    request<{
      success: boolean;
      data: Array<{ name: string; path: string; size: number; modified: string }>;
    }>(`/api/review/files?project=${encodeURIComponent(project)}`),

  read: (project: string, file: string) =>
    request<{ success: boolean; data: { path: string; content: string } }>(
      `/api/review/read?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`,
    ),

  comment: (
    project: string,
    file: string,
    afterLine: number,
    comment: string,
    selectedText?: string,
  ) =>
    request<{ success: boolean; data: { insertedAt: number } }>("/api/review/comment", {
      method: "POST",
      body: JSON.stringify({ project, file, afterLine, comment, selectedText }),
    }),
};
