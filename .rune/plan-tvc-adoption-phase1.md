# Phase 1 — Foundation: Session State Machine + Event Bus

## Goal
Replace implicit session status tracking with a formal state machine, and introduce
a typed event bus to decouple ws-bridge from other services.

## Tasks

- [x] 1.1 Session State Machine shared types — VALID_TRANSITIONS, guard functions
- [x] 1.2 SessionStateMachine class (server service)
- [x] 1.3 Integrate state machine into ws-bridge updateStatus()
- [x] 1.4 Typed Event Bus singleton with EventMap
- [x] 1.5 Wire event bus: session:created, session:ended, session:phase-changed
- [x] 1.6 Add machine field to ActiveSession interface

## Files Touched
- `packages/shared/src/types/session.ts` (modify — add VALID_TRANSITIONS, guards)
- `packages/server/src/services/session-state-machine.ts` (new)
- `packages/server/src/services/event-bus.ts` (new)
- `packages/server/src/services/ws-bridge.ts` (modify — updateStatus, events)
- `packages/server/src/services/session-store.ts` (modify — machine field)
