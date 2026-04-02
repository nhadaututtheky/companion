# Phase 1: Template Engine

## Goal

Define workflow template schema, ship built-in templates, and add template CRUD API.

## Tasks

### 1.1 Workflow Template Schema
- [ ] Add `workflowTemplates` table — `packages/server/src/db/schema.ts`:
  ```
  id, name, slug, description, icon, category,
  steps: JSON (Array<{ role, agentConfig, promptTemplate, order }>),
  createdAt, updatedAt, isBuiltIn
  ```
- [ ] Define `WorkflowStep` type — `packages/shared/src/types/workflow.ts` (new):
  ```ts
  type WorkflowStep = {
    role: string           // "planner" | "builder" | "verifier" | "reviewer" | custom
    label: string          // Display name
    promptTemplate: string // Supports {{topic}}, {{previousOutput}} placeholders
    order: number          // Execution order
    model?: string         // Optional model override per step
  }
  ```
- [ ] Define `WorkflowTemplate` type with category enum: `review`, `build`, `test`, `deploy`, `custom`

### 1.2 Built-in Templates
- [ ] Seed 8 built-in workflow templates on first startup — `packages/server/src/services/workflow-templates.ts` (new):

  **REVIEW category:**
  - **Plan Review** (2 steps): Planner presents → Reviewer critiques
  - **Code Review** (2 steps): Author explains changes → Reviewer finds issues + suggests fixes
  - **PR Review** (2 steps): Author summarizes PR → Reviewer audits with checklist

  **BUILD category:**
  - **Fix Bug** (2 steps): Diagnoser analyzes root cause → Fixer implements solution
  - **Implement Feature** (2 steps): Planner designs approach → Builder implements
  - **Multi-Agent Build** (3 steps): Planner designs → Builder implements → Verifier tests + validates

  **TEST category:**
  - **Write Tests** (2 steps): Analyzer identifies test gaps → Writer creates test suite
  - **Review & Test** (2 steps): Reviewer finds issues → Tester writes tests for findings

### 1.3 Template CRUD API
- [ ] API routes — `packages/server/src/routes/workflow-templates.ts` (new):
  - `GET /api/workflow-templates` — list all (filter by category)
  - `GET /api/workflow-templates/:id` — get single template
  - `POST /api/workflow-templates` — create custom template
  - `PUT /api/workflow-templates/:id` — update (only non-builtin)
  - `DELETE /api/workflow-templates/:id` — delete (only non-builtin)
- [ ] Validate step count (min 2, max 5)
- [ ] Validate prompt templates have required `{{topic}}` placeholder

## Acceptance Criteria

- [ ] 8 built-in templates seeded on fresh install
- [ ] Templates categorized and queryable by category
- [ ] Custom template CRUD works
- [ ] Built-in templates cannot be modified or deleted
- [ ] Workflow step schema validated (role, prompt, order required)

## Files Touched

- `packages/server/src/db/schema.ts` — modify (add workflowTemplates table)
- `packages/shared/src/types/workflow.ts` — new
- `packages/server/src/services/workflow-templates.ts` — new
- `packages/server/src/routes/workflow-templates.ts` — new

## Dependencies

- None — standalone, can be built independently
