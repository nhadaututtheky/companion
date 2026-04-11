import type { CLIPlatform } from "./cli-adapter";

/** Workspace configuration stored in DB */
export interface Workspace {
  id: string;
  name: string;
  projectSlug: string;
  cliSlots: CLIPlatform[];
  defaultExpert: string | null;
  autoConnect: boolean;
  wikiDomain: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Runtime state of a connected CLI within a workspace */
export interface WorkspaceCliStatus {
  platform: CLIPlatform;
  sessionId: string | null;
  status: "connected" | "idle" | "running" | "error" | "disconnected";
}

/** Workspace with runtime CLI connection state */
export interface WorkspaceWithStatus extends Workspace {
  clis: WorkspaceCliStatus[];
  /** Project directory path (resolved from project config) */
  projectPath: string | null;
}

/** Create workspace request body */
export interface WorkspaceCreateBody {
  name: string;
  projectSlug: string;
  cliSlots?: CLIPlatform[];
  defaultExpert?: string;
  autoConnect?: boolean;
  wikiDomain?: string;
}

/** Update workspace request body */
export interface WorkspaceUpdateBody {
  name?: string;
  cliSlots?: CLIPlatform[];
  defaultExpert?: string | null;
  autoConnect?: boolean;
  wikiDomain?: string | null;
}
