# Phase 3: Polish & Shortcuts (Drag-Drop, Template Variables, Command Palette)

## Goal
Add quality-of-life features: drag files from explorer to composer, template variables with fill-in UI, and a fully populated command palette with real actions.

---

## Task 8: Drag & Drop File from Explorer to Composer

### Web
- [ ] Add `draggable` attribute + `onDragStart` to TreeNode items in `file-explorer-panel.tsx`
- [ ] Set drag data: `application/x-companion-file` with JSON `{ path, name }`
- [ ] Add `onDragOver` + `onDrop` handler to composer area in `message-composer.tsx`
- [ ] On drop: call `composerStore.addAttachment({ type: "file", path, name })`
- [ ] Show visual drop zone indicator (dashed border + "Drop file to attach") during drag
- [ ] Prevent duplicate attachments (check by path)

### Files
| File | Action |
|------|--------|
| `packages/web/src/components/panels/file-explorer-panel.tsx` | modify — add draggable to tree nodes |
| `packages/web/src/components/session/message-composer.tsx` | modify — add drop zone handler |

### Acceptance Criteria
- [ ] Dragging a file from explorer shows a drag ghost with file name
- [ ] Hovering over composer area highlights it as a drop target
- [ ] Dropping adds the file as an attachment chip in the composer
- [ ] Dragging the same file twice does not create duplicate attachment
- [ ] Works for both files and folders (folder attaches as path reference)

---

## Task 9: Session Templates with Variables

### Server
- [ ] Add `variables` JSON column to `templates` table in `schema.ts`
- [ ] Type: `Array<{ key: string, label: string, defaultValue?: string, required?: boolean }>`
- [ ] Update template CRUD in `templates.ts` route to handle `variables` field
- [ ] On session start with template: validate all required variables are provided
- [ ] Replace `{{key}}` placeholders in prompt before passing to CLI

### Web
- [ ] Update new-session-modal template selection to detect variables
- [ ] Create `template-variables-form.tsx` — renders form fields for each variable
- [ ] Show form between template selection and session start button
- [ ] Pre-fill default values, mark required fields
- [ ] Pass filled variables in session start payload
- [ ] Update template editor (if exists) to define variables

### Files
| File | Action |
|------|--------|
| `packages/server/src/db/schema.ts` | modify — add variables column |
| `packages/server/src/routes/templates.ts` | modify — handle variables in CRUD |
| `packages/server/src/routes/sessions.ts` | modify — resolve template variables on start |
| `packages/server/src/services/templates.ts` | modify — variable substitution logic |
| `packages/web/src/components/session/template-variables-form.tsx` | new |
| `packages/web/src/components/session/new-session-modal.tsx` | modify — show variables form |
| `packages/web/src/lib/api-client.ts` | modify — add templateVars to session start |

### Acceptance Criteria
- [ ] Template with `{{project_name}}` prompts user to fill in the value on session creation
- [ ] Required variables prevent session start until filled
- [ ] Default values are pre-populated in the form
- [ ] Placeholders are fully resolved in the prompt sent to Claude CLI
- [ ] Templates without variables work exactly as before (no regression)

---

## Task 10: Command Palette Enhancement

### Web
- [ ] Populate `command-palette.tsx` with categorized actions:
  - **Sessions**: New session, switch to session (list all), stop session, resume session
  - **Panels**: Toggle file explorer, toggle terminal, toggle browser preview, toggle search
  - **Navigation**: Go to settings, go to dashboard, go to Telegram config
  - **Actions**: Search files (triggers Ctrl+Shift+F), compare sessions, toggle theme
- [ ] Add fuzzy search across all actions (cmdk handles this natively)
- [ ] Add keyboard shortcut hints next to each action (e.g., "Ctrl+Shift+F")
- [ ] Group actions with section headers (Sessions, Panels, Navigation, Actions)
- [ ] Add recent actions section at the top (store last 5 in localStorage)

### Files
| File | Action |
|------|--------|
| `packages/web/src/components/layout/command-palette.tsx` | modify — add all actions |
| `packages/web/src/lib/stores/ui-store.ts` | modify — add panel toggle helpers if needed |

### Acceptance Criteria
- [ ] Cmd+K opens palette with all actions organized in groups
- [ ] Typing filters actions fuzzy-match style
- [ ] Selecting "Toggle File Explorer" opens/closes the panel immediately
- [ ] Selecting "Switch to Session X" navigates to that session
- [ ] Selecting "Search Files" opens the search panel and focuses the input
- [ ] Recent actions appear at top for quick re-access
- [ ] Keyboard shortcut labels shown next to applicable actions
