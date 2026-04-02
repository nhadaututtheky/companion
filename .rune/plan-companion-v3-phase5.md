# Phase 5: DevTools & Polish

## Goal

Add database browser, theme customization, auto-updater, and error tracking. Final polish pass for v3 release.

## Tasks

### 5.1 Database Browser (Read-Only)
- [x] Create `DbBrowser` service — connect to project databases — `packages/server/src/services/db-browser.ts` (new)
- [x] Support SQLite (file path), Postgres (connection string), MySQL (connection string)
- [x] All connections forced read-only (`PRAGMA query_only = ON` for SQLite, read-only user for others)
- [x] API routes — `packages/server/src/routes/database.ts` (new):
  - `GET /api/db/connections` — list saved connections
  - `POST /api/db/connections` — add connection (name, type, connectionString)
  - `POST /api/db/query` — execute SELECT query (parameterized, max 1000 rows)
  - `GET /api/db/tables/:connectionId` — list tables and schema
- [x] DB browser page — `packages/web/src/app/database/page.tsx` (new)
- [x] Table list sidebar, query editor (textarea), results table with pagination
- [x] Store connections in Companion's own SQLite — `packages/server/src/db/schema.ts`

### 5.2 Theme Customization
- [x] Define theme schema: colors, font, radius, shadows — `packages/shared/src/theme.ts` (new)
- [x] Theme settings page — `packages/web/src/app/settings/theme/page.tsx` (new)
- [x] CSS variable injection from theme config — `packages/web/src/lib/theme-provider.tsx` (new)
- [x] Ship 3 built-in themes: Default Dark, Monokai, Nord
- [x] VS Code theme import: parse `.json` theme file, extract colors, map to CSS vars
- [x] Persist theme choice in settings store

### 5.3 Auto-Updater
- [x] Configure Tauri 2 updater plugin — `src-tauri/tauri.conf.json`
- [x] Create update check endpoint — `packages/server/src/routes/health.ts` (modify)
- [x] GitHub Releases as update source (JSON manifest at known URL)
- [x] Update notification in system tray + settings page
- [x] Manual "Check for updates" button in settings

### 5.4 Error Tracking
- [x] Create `ErrorTracker` service — structured error collection — `packages/server/src/services/error-tracker.ts` (new)
- [x] `errors` table in DB: timestamp, source, message, stack, sessionId, context
- [x] Capture unhandled rejections and uncaught exceptions
- [x] Hook into existing logger to capture error-level logs
- [x] Error log viewer page — `packages/web/src/app/settings/errors/page.tsx` (new)
- [x] Export errors as JSON for bug reports

### 5.5 Startup Command Presets
- [x] Define preset categories and commands — `packages/shared/src/command-presets.ts` (new):
  - **Dev Servers**: `npm run dev`, `bun dev`, `vite`, `next dev`, `nuxt dev`
  - **Build & Test**: `npm test`, `vitest`, `jest --watch`, `playwright test`, `tsc --watch`
  - **Docker**: `docker compose up`, `docker compose logs -f`, `docker ps`
  - **Database**: `prisma studio`, `drizzle-kit studio`, `redis-cli`
  - **Git**: `git status`, `git log --oneline -20`, `git diff`
  - **AI Agents**: `claude`, `codex`, `gemini`
- [x] Quick-select dropdown in new session modal — `packages/web/src/components/session/new-session-modal.tsx` (modify)
- [x] Custom presets: user can save/edit/delete per project — `packages/server/src/routes/settings.ts` (modify)
- [x] Store custom presets in settings table (key: `command_presets`)

### 5.6 Prompt History
- [x] Create `promptHistory` table: id, sessionId, prompt, createdAt — `packages/server/src/db/schema.ts` (modify)
- [x] Extract clean prompt text from user messages (strip system/tool content) — `packages/server/src/services/prompt-history.ts` (new)
- [x] API routes — `packages/server/src/routes/prompts.ts` (new):
  - `GET /api/prompts?sessionId=&q=` — list/search prompts
  - `POST /api/prompts/:id/resend` — re-send prompt to active session
- [x] Prompt history panel in session view — `packages/web/src/components/session/prompt-history.tsx` (new)
- [x] Search across all sessions, filter by project
- [x] Click to re-send previous prompt

## Acceptance Criteria

- [x] Can browse SQLite database tables from project directory
- [x] SQL queries are parameterized and read-only enforced
- [x] Max 1000 rows returned per query (prevent OOM)
- [x] Theme changes apply instantly without page reload
- [x] VS Code theme JSON import produces usable theme
- [x] Tauri app checks for updates on launch (once per 24h)
- [x] Errors captured with full stack trace and session context
- [x] Error log viewable and exportable from settings
- [x] Command presets dropdown shows categorized commands in new session modal
- [x] Custom presets saveable per project
- [x] Prompt history searchable across sessions
- [x] Re-send prompt works on active sessions

## Files Touched

- `packages/server/src/services/db-browser.ts` — new
- `packages/server/src/services/error-tracker.ts` — new
- `packages/server/src/routes/database.ts` — new
- `packages/server/src/routes/health.ts` — modify
- `packages/server/src/db/schema.ts` — modify (connections, errors tables)
- `packages/shared/src/theme.ts` — new
- `packages/web/src/app/database/page.tsx` — new
- `packages/web/src/app/settings/theme/page.tsx` — new
- `packages/web/src/app/settings/errors/page.tsx` — new
- `packages/web/src/lib/theme-provider.tsx` — new
- `src-tauri/tauri.conf.json` — modify
- `packages/shared/src/command-presets.ts` — new
- `packages/server/src/services/prompt-history.ts` — new
- `packages/server/src/routes/prompts.ts` — new
- `packages/web/src/components/session/prompt-history.tsx` — new

## Dependencies

- Phase 1-4 completed
- Tauri updater requires code signing setup (separate infra task)
- DB browser Postgres/MySQL requires optional driver deps (bun install on demand)
