# Phase 1: Data Model & Store

## Goal
Create the workspace entity — DB schema, server-side CRUD, REST API. Foundation for all other phases.

## Tasks
- [x] Add `workspaces` table in new migration (0031)
- [x] Add `workspace_id` FK to `sessions` table
- [x] Create `workspace-store.ts` server service (in-memory state + DB persistence)
- [x] Create REST routes: CRUD `/api/workspaces`
- [x] Create Zustand store on web side
- [x] Wire up to existing project config (workspace extends project)
- [x] Review fixes: project validation, error handling, typed updates, init on startup

## Data Model

### DB: `workspaces` table
```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,           -- nanoid
  name TEXT NOT NULL,            -- display name
  project_slug TEXT NOT NULL,    -- links to existing project config
  project_path TEXT NOT NULL,    -- filesystem path
  cli_slots TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["claude","codex","gemini","opencode"]
  default_expert TEXT,           -- persona ID for new sessions
  auto_connect INTEGER NOT NULL DEFAULT 0, -- auto-spawn CLIs on open
  wiki_domain TEXT,              -- linked wiki domain
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### DB: sessions table addition
```sql
ALTER TABLE sessions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
```

### Server runtime state
```typescript
interface WorkspaceState {
  id: string;
  name: string;
  projectSlug: string;
  projectPath: string;
  cliSlots: CliType[];
  connectedClis: Map<CliType, string | null>; // cli type → session ID or null
  defaultExpert: string | null;
  autoConnect: boolean;
  wikiDomain: string | null;
}
```

### REST API
```
GET    /api/workspaces              — list all
POST   /api/workspaces              — create
GET    /api/workspaces/:id          — get with connected CLI status
PUT    /api/workspaces/:id          — update config
DELETE /api/workspaces/:id          — delete (does NOT kill sessions)
POST   /api/workspaces/:id/connect  — connect a CLI (spawn session)
POST   /api/workspaces/:id/disconnect/:cli — disconnect a CLI
```

## Acceptance Criteria
- [ ] Migration runs clean, workspace created/read/updated/deleted via API
- [ ] Sessions can be linked to a workspace via workspace_id
- [ ] Server tracks which CLIs are connected (runtime state)
- [ ] Web store syncs workspace list + active workspace

## Files Touched
- `packages/server/src/db/migrations/00XX_workspaces.sql` — new
- `packages/server/src/db/schema.ts` — add workspaces table + sessions FK
- `packages/server/src/db/embedded-migrations.ts` — regenerate
- `packages/server/src/services/workspace-store.ts` — new
- `packages/server/src/routes/workspaces.ts` — new
- `packages/server/src/routes/index.ts` — mount routes
- `packages/web/src/lib/stores/workspace-store.ts` — new
- `packages/web/src/lib/api-client.ts` — add workspace endpoints

## Dependencies
- None — this is the foundation phase
