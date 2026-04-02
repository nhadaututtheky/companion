# Phase 1: Core Performance

## Goal

Eliminate data loss on restart, reduce disk I/O, and prevent race conditions in multi-agent sessions. Pure performance wins for existing users.

## Tasks

### 1.1 Resume Detection
- [x] `resumeSessionId` / `cliSessionId` + `listResumableSessions()` + `findDeadSessionForChat()` — already implemented
- [x] On server startup, scan zombie sessions — `bulkEndSessions()` in index.ts
- [x] `POST /api/sessions/:id/resume` route — resume flow with `--resume` flag in ws-bridge
- [x] Resume button in web UI — `ResumeBanner` component in `packages/web/src/app/page.tsx`
- [x] Auto-detect resumable sessions — `cleanupZombieSessions()` on WsBridge init

### 1.2 Terminal Lock System
- [x] `TerminalLock` class with acquire/release/timeout (30s max) — `terminal-lock.ts`
- [x] Integrated lock into ws-bridge `handleUserMessageInternal` — wraps `sendToEngine` with lock
- [x] Lock status broadcast via `broadcastLockStatus()` → `lock_status` WS event
- [x] Lock indicator in web UI session header — "Writing..." badge with queue count

### 1.3 Debounced Save
- [x] `DebouncedWriter` utility — `debounced-writer.ts`
- [x] Batch message inserts (500ms delay, 50 batch size)
- [x] Batch session persistence (1000ms delay, 20 batch size)
- [x] Flush hook in graceful shutdown

### 1.4 Virtual Screen Reconstruction
- [x] `VirtualScreen` class — 2D character grid from PTY output — `virtual-screen.ts`
- [x] CSI cursor positioning codes (H, A, B, C, D, G, J, K)
- [x] Static `sanitize()` method for string cleaning
- [x] Integrated into ws-bridge: sanitize tool_result content blocks before broadcasting

### 1.5 Idle Detection & Notifications
- [x] `IdleDetector` class — `idle-detector.ts`
- [x] Agent idle: 2000ms threshold, 5s dedup window
- [x] Wired into ws-bridge: `recordOutput` on every CLI message
- [x] `session_idle` WS event emitted to browsers
- [x] Web UI: toast notification via Sonner when agent goes idle

## Acceptance Criteria
- [x] Restarting server shows previously active sessions as "resumable"
- [x] Clicking resume re-attaches to existing Claude CLI process
- [x] Lock timeout releases after 30s to prevent deadlocks
- [x] Two concurrent agents cannot write to same terminal simultaneously
- [x] Message save I/O reduced by 80%+ (batch inserts)
- [x] Graceful shutdown flushes all pending writes
- [x] Terminal output sanitization (ANSI stripped from tool results)
- [x] Agent idle detection with toast notification
- [x] Lock indicator shows "Writing..." in session header
- [x] Web UI resume button (ResumeBanner)

## Status: DONE

## Files Created/Modified
- `packages/server/src/services/terminal-lock.ts` — new
- `packages/server/src/services/debounced-writer.ts` — new
- `packages/server/src/services/virtual-screen.ts` — new
- `packages/server/src/services/idle-detector.ts` — new
- `packages/server/src/services/session-store.ts` — modified (debounced writers)
- `packages/server/src/services/ws-bridge.ts` — modified (idle detector, terminal lock, VirtualScreen sanitize, lock broadcast)
- `packages/server/src/index.ts` — modified (shutdown flush + lock cleanup)
- `packages/shared/src/types/session.ts` — modified (lock_status, session_idle, source in user_message)
- `packages/web/src/hooks/use-session.ts` — modified (lock_status, session_idle, source badge support)
- `packages/web/src/components/session/message-feed.tsx` — modified (SourceBadge component)
- `packages/web/src/app/sessions/[id]/session-page-client.tsx` — modified (TelegramStreamBadge, lock indicator)
