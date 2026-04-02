# Phase 3: UI & Polish

## Goal

Add workflow template picker UI, pipeline progress visualization, and Telegram integration.

## Tasks

### 3.1 Workflow Template Picker
- [ ] "New Workflow" button in dashboard — opens template picker modal
- [ ] Template picker modal — `packages/web/src/components/workflow/template-picker.tsx` (new):
  - Grid of template cards grouped by category (Review / Build / Test)
  - Each card shows: icon, name, description, step count, step role labels
  - "Blank Workflow" option for custom setup
  - Click template → configuration form
- [ ] Workflow configuration form — `packages/web/src/components/workflow/workflow-config.tsx` (new):
  - Topic/description input (required)
  - Per-step model override (optional dropdown)
  - Cost cap slider (default $1.00)
  - "Start Workflow" button
  - Prompt preview showing resolved templates

### 3.2 Pipeline Progress View
- [ ] Workflow detail page — `packages/web/src/app/workflows/[id]/page.tsx` (new):
  - Horizontal step pipeline visualization (step 1 → step 2 → step 3)
  - Each step shows: role label, status badge, duration, cost
  - Active step highlighted with pulsing indicator
  - Click step to expand and see session messages
  - Final summary card when workflow completes
- [ ] Workflow list view — `packages/web/src/app/workflows/page.tsx` (new):
  - List of all workflows with status, template name, created date
  - Filter by: active / completed / failed
  - Quick actions: cancel, retry failed step

### 3.3 Dashboard Integration
- [ ] Add "Active Workflows" section to main dashboard
- [ ] Show running workflow count in header badge
- [ ] Workflow completion triggers toast notification

### 3.4 Telegram Integration
- [ ] `/workflow` command — list available templates inline keyboard
- [ ] `/workflow <template> <topic>` — start workflow from Telegram
- [ ] Progress updates sent to Telegram chat as workflow advances steps
- [ ] Step completion notification with output summary
- [ ] `/workflow status` — show active workflow progress
- [ ] `/workflow cancel` — cancel running workflow

### 3.5 Custom Template Editor
- [ ] Template editor page — `packages/web/src/app/workflows/templates/page.tsx` (new):
  - Create custom workflow templates
  - Add/remove/reorder steps
  - Edit prompt template per step with placeholder hints
  - Preview resolved prompts
  - Save as project-scoped or global template

## Acceptance Criteria

- [ ] User can start a workflow from template picker in ≤3 clicks
- [ ] Pipeline visualization shows real-time progress
- [ ] Telegram workflow start and status works
- [ ] Custom template creation and editing works
- [ ] Workflow completion shows summary with all step outputs
- [ ] Active workflows visible on dashboard

## Files Touched

- `packages/web/src/components/workflow/template-picker.tsx` — new
- `packages/web/src/components/workflow/workflow-config.tsx` — new
- `packages/web/src/app/workflows/page.tsx` — new
- `packages/web/src/app/workflows/[id]/page.tsx` — new
- `packages/web/src/app/workflows/templates/page.tsx` — new
- `packages/web/src/components/dashboard/` — modify (active workflows section)
- `packages/server/src/telegram/commands/` — modify (workflow commands)

## Dependencies

- Phase 1 + Phase 2 completed
- Existing Telegram bot infrastructure
- Existing dashboard components
