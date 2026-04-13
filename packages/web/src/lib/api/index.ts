/**
 * Composed API client — re-exports all domain modules as a single `api` object.
 * Import from "@/lib/api-client" or "@/lib/api" — both work.
 */

export { request, BASE } from "./base";

export { sessions } from "./sessions";
export { channels } from "./channels";
export { fs, terminal, codegraph, webintel, review } from "./devtools";
export {
  settings,
  projects,
  telegram,
  mcpConfig,
  models,
  cliPlatforms,
  features,
  updateCheck,
} from "./settings";
export {
  templates,
  workflowTemplates,
  workflows,
  prompts,
  savedPrompts,
  schedules,
  customPersonas,
  wiki,
} from "./content";
export { health, license, stats, errors, snapshots, share, workspaces } from "./misc";

import { request } from "./base";
import { sessions } from "./sessions";
import { channels } from "./channels";
import { fs, terminal, codegraph, webintel, review } from "./devtools";
import {
  settings,
  projects,
  telegram,
  mcpConfig,
  models,
  cliPlatforms,
  features,
  updateCheck,
} from "./settings";
import {
  templates,
  workflowTemplates,
  workflows,
  prompts,
  savedPrompts,
  schedules,
  customPersonas,
  wiki,
} from "./content";
import { health, license, stats, errors, snapshots, share, workspaces } from "./misc";

export const api = {
  // Generic helpers
  get: <T = Record<string, unknown>>(path: string) => request<T>(path),
  post: <T = Record<string, unknown>>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T = Record<string, unknown>>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),

  health: health.check,
  license: license.get,

  sessions,
  channels,
  fs,
  terminal,
  codegraph,
  webintel,
  review,
  settings,
  projects,
  telegram,
  mcpConfig,
  models,
  cliPlatforms,
  features,
  updateCheck,
  templates,
  workflowTemplates,
  workflows,
  prompts,
  savedPrompts,
  schedules,
  customPersonas,
  wiki,
  stats,
  errors,
  snapshots,
  share,
  workspaces,
};
