# Phase 4: New Session Flow

## Goal
Build the "New Session" modal with project browser, existing project selection, GitHub repo URL input, model/permission selection, and session launch. Uses the directory listing API from Phase 1.

## Tasks

### 4.1 Create New Session Modal
- [x] Create `packages/web/src/components/session/new-session-modal.tsx`
- [x] Glassmorphism modal (same style as expanded card, smaller: 600px max-width)
- [x] Steps flow (not tabs): 1) Select Project -> 2) Configure -> 3) Launch
- [x] Step indicator at top (3 dots/pills, active highlighted)

### 4.2 Step 1: Project Selection
- [x] Show existing projects from DB (fetch via `api.projects.list()`)
- [x] Each project card: name, directory path, default model, last session time
- [x] "Browse folder..." button opens directory browser sub-view
- [x] "Add from GitHub" button shows URL input field
  - Parse `github.com/<owner>/<repo>` — store as project metadata
  - Clone handled separately (out of scope for this phase, just store URL)
- [x] Search/filter for existing projects

### 4.3 Directory Browser Sub-View
- [x] Create `packages/web/src/components/session/directory-browser.tsx`
- [x] Fetch from `api.fs.roots()` for initial roots (home dir, configured paths)
- [x] Clickable breadcrumb path bar at top
- [x] Directory list: folder icons (FolderSimple from Phosphor), click to navigate deeper
- [x] "Select this folder" button at bottom
- [x] Back button to go up one level
- [x] Loading skeleton while fetching
- [x] Show `.git` indicator if dir contains `.git` folder (marks it as a project root)

### 4.4 Step 2: Configuration
- [x] Model selector: dropdown with options (sonnet, opus, haiku, opus-1m, sonnet-1m)
- [x] Permission mode: radio group (default, acceptEdits, bypassPermissions, plan)
  - Brief description for each mode
- [x] Initial prompt: optional textarea (placeholder: "Start with a specific task...")
- [x] Resume previous session: toggle + session selector (if project has previous sessions)
- [x] Project name input (auto-filled from folder name, editable)

### 4.5 Step 3: Launch
- [x] Summary card showing: project, directory, model, permission mode, prompt preview
- [x] "Start Session" button (primary, accent color)
- [x] On click: call `api.sessions.start()` with config
- [x] On success: add to grid, close modal, auto-select new session
- [x] On error: show error toast, stay on step 3
- [x] Loading state: button disabled + spinner

### 4.6 Wire Modal to Dashboard
- [x] "New Session" button in sidebar header opens modal
- [x] Command palette "New Session" action opens modal
- [x] If 6 sessions active: show "Maximum sessions reached" in modal, disable launch
- [x] Shortcut: Ctrl+N / Cmd+N opens new session modal

## Acceptance Criteria
- [x] "New Session" button opens modal
- [x] Can browse filesystem and select a project directory
- [x] Can select existing project from DB
- [x] Can configure model and permission mode
- [x] Starting session creates it and adds to grid
- [x] Cannot start 7th session (limit enforced)
- [x] GitHub URL stored as project metadata
- [x] Ctrl+N opens new session modal

## Files Touched
- `packages/web/src/components/session/new-session-modal.tsx` — new
- `packages/web/src/components/session/directory-browser.tsx` — new
- `packages/web/src/app/page.tsx` — wire "New Session" button to modal
- `packages/web/src/components/layout/command-palette.tsx` — add "New Session" action
- `packages/web/src/lib/api-client.ts` — already has session start, verify project upsert

## Dependencies
- Phase 1 completed (directory listing API, session limit)
- Phase 2 completed (grid layout to add new session to)
