# Phase 1: Session Templates

## Goal
Let users save reusable prompt templates (e.g., "code review", "refactor", "debug this") and start sessions with a pre-loaded initial prompt from Telegram or web. One-tap session start with context.

## Tasks

### 1.1 DB Schema — `session_templates` table
- [ ] Add `session_templates` table to `packages/server/src/db/schema.ts`
  ```
  id: text PK (nanoid)
  name: text NOT NULL (display name, e.g., "Code Review")
  slug: text NOT NULL UNIQUE (url-safe, e.g., "code-review")
  projectSlug: text NULLABLE FK → projects.slug (null = global)
  prompt: text NOT NULL (the initial message to send to Claude)
  model: text NULLABLE (override project default model)
  permissionMode: text NULLABLE (override project default)
  icon: text DEFAULT "⚡" (emoji for Telegram buttons)
  sortOrder: integer DEFAULT 0
  createdAt: integer timestamp
  updatedAt: integer timestamp
  ```
- [ ] Generate + run migration

### 1.2 Template CRUD Service
- [ ] Create `packages/server/src/services/templates.ts`
  - `listTemplates(projectSlug?: string): Template[]` — list global + project-specific
  - `getTemplate(idOrSlug: string): Template | null`
  - `createTemplate(data): Template`
  - `updateTemplate(id, data): Template`
  - `deleteTemplate(id): void`
- [ ] Input validation with Zod schema

### 1.3 REST API Routes
- [ ] Create `packages/server/src/routes/templates.ts`
  - `GET /api/templates?project=<slug>` — list (global + project-scoped)
  - `POST /api/templates` — create
  - `PUT /api/templates/:id` — update
  - `DELETE /api/templates/:id` — delete
- [ ] Register in main router

### 1.4 Telegram Commands
- [ ] Add `packages/server/src/telegram/commands/template.ts`
- [ ] `/templates` or `/t` — show template list as inline keyboard buttons
  - Global templates first, then project-specific
  - Each button: `{icon} {name}` → callback `tpl:use:{slug}`
  - Bottom row: "➕ New Template" → callback `tpl:new`
- [ ] Callback `tpl:use:{slug}`:
  1. If no active session → start session with template's project (or ask project)
  2. If active session → send template prompt as user message
  3. Apply model/permission overrides if specified
- [ ] `/template save <name> <prompt>` — quick create from Telegram
  - Associates with current session's project
  - Auto-generates slug from name
- [ ] `/template delete <name>` — delete a template
- [ ] Register in telegram-bridge.ts

### 1.5 Seed Default Templates
- [ ] Create 5-7 built-in templates on first run (if table empty):
  - ⚡ Quick Fix — "Fix the bug I'm about to describe:"
  - 🔍 Code Review — "Review the recent changes. Check for bugs, security issues, and suggest improvements."
  - 🔄 Refactor — "Refactor the following code for readability and maintainability:"
  - 🧪 Write Tests — "Write comprehensive tests for the module I'll specify."
  - 📖 Explain — "Explain this code in detail, including the design decisions:"
  - 🚀 Ship — "/ship"
  - 🏗️ Plan — "Create a plan for the feature I'll describe:"

### 1.6 Web UI (minimal)
- [ ] Add templates section to project settings page or as a sidebar section
- [ ] List templates with edit/delete
- [ ] Create template form (name, prompt, icon, model)
- [ ] "Use Template" button that starts session with template prompt

## Acceptance Criteria
- [ ] `/templates` on Telegram shows clickable template buttons
- [ ] Tapping a template starts a session (or sends prompt to active session)
- [ ] Templates are saved in DB, persist across restarts
- [ ] `/template save "Name" prompt text` creates from Telegram
- [ ] Default templates seeded on first run
- [ ] REST API works for web UI CRUD
- [ ] Templates can be global or project-specific

## Files Touched
- `packages/server/src/db/schema.ts` — modify (add session_templates)
- `packages/server/src/services/templates.ts` — new
- `packages/server/src/routes/templates.ts` — new
- `packages/server/src/routes/index.ts` — modify (register template routes)
- `packages/server/src/telegram/commands/template.ts` — new
- `packages/server/src/telegram/telegram-bridge.ts` — modify (register template commands)
- `packages/server/src/telegram/bot-factory.ts` — modify (add template to command list)
- `packages/web/src/app/templates/page.tsx` — new (optional)

## Dependencies
- Phase 1-4 completed (DB, sessions, Telegram, web)
