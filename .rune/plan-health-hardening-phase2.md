# Phase 2: Integration Gaps

## Goal
Connect disconnected systems, complete stub features, make existing features talk to each other.

## Tasks
- [ ] T2.1 — CodeGraph ↔ Wiki KB cross-reference
  - When CodeGraph detects file changes, surface related wiki articles in context budget
  - `packages/server/src/services/context-budget.ts` — modify: query wiki store for articles matching changed file paths/modules
  - `packages/server/src/codegraph/` — add export for "recently changed modules"
  - `packages/server/src/wiki/store.ts` — add method `findArticlesByRelatedFiles(paths: string[])`

- [ ] T2.2 — Broadcast CLI debate events to browsers
  - `packages/server/src/routes/channels.ts:286` — replace TODO stub with actual WS broadcast
  - Use `WsBridge.broadcastToAll()` pattern to push debate events to connected browser sockets

- [ ] T2.3 — Connect Debate engine to Mention system
  - `packages/server/src/services/debate-engine.ts` — add @mention support for debate agents
  - Debate agents should be addressable via @mention from other sessions
  - `packages/server/src/services/mention-router.ts` — add debate agent as valid mention target

- [ ] T2.4 — Complete Template Quick Picker
  - `packages/web/src/components/layout/template-quick-picker.tsx:66` — pass selected persona to NewSessionModal
  - `packages/web/src/components/session/new-session-modal.tsx` — accept `defaultPersonaId` prop

- [ ] T2.5 — Fix Wiki compiled tracking
  - `packages/server/src/wiki/store.ts:411` — track compilation state properly via compilation log timestamp
  - Compare article `updatedAt` vs last compilation timestamp

- [ ] T2.6 — Verify build + integration test

## Acceptance Criteria
- [ ] Wiki articles appear in context when CodeGraph reports related file changes
- [ ] CLI debate events visible in browser UI in real-time
- [ ] @mention can target debate agents from CLI sessions
- [ ] Template picker opens modal with persona pre-selected
- [ ] Wiki articles show correct compiled/uncompiled status
- [ ] Build passes

## Files Touched
- `packages/server/src/services/context-budget.ts` — modify
- `packages/server/src/codegraph/` — modify (add export)
- `packages/server/src/wiki/store.ts` — modify
- `packages/server/src/routes/channels.ts` — modify
- `packages/server/src/services/debate-engine.ts` — modify
- `packages/server/src/services/mention-router.ts` — modify
- `packages/web/src/components/layout/template-quick-picker.tsx` — modify
- `packages/web/src/components/session/new-session-modal.tsx` — modify

## Dependencies
- Phase 1 complete (error boundaries protect against integration regressions)
