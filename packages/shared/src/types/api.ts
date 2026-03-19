// Shared API response types

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface HealthResponse {
  status: "ok" | "error";
  version: string;
  uptime: number;
  db: {
    status: "connected" | "error";
    tables: number;
  };
  sessions: {
    active: number;
    total: number;
  };
}

/** Source of a message (for multi-interface tracking) */
export type MessageSource = "telegram" | "web" | "api" | "agent" | "system";

/** Stored message in session_messages table */
export interface StoredMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  source: MessageSource;
  sourceId?: string;
  timestamp: number;
}
