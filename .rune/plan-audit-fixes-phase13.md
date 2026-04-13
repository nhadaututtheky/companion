# Phase 13: WsBridge Decomposition (2718 → <500 LOC)

## Goal
Break the ws-bridge.ts god object into focused modules. Keep WsBridge as thin facade.

## Analysis Summary
- 65 methods, 16 properties, 14 responsibilities
- Already extracted: ws-broadcast, ws-permission-handler, ws-stream-handler, ws-multi-brain, ws-context-tracker
- Remaining to extract: session-lifecycle, message-routing, health-idle, enrichment, config

## Extraction Plan (by domain)

### Extract 1: `ws-session-lifecycle.ts` (~400 LOC)
Methods to move:
- `startSessionWithSdk` (line 539, ~200 LOC)
- `startSessionWithCli` (line 736, ~100 LOC)
- `sendInitialPrompt` (line 841, ~60 LOC)
- `handleSystemInit` (line 1418, ~60 LOC)
- `handleSystemStatus` (line 1482, ~25 LOC)
- `handleCLIExit` (line 1985, ~138 LOC)
State moved: `cliProcesses`, `sdkHandles`, `planWatchers`
Interface: `SessionLifecycleBridge` (like existing bridge pattern)

### Extract 2: `ws-message-handler.ts` (~400 LOC)
Methods to move:
- `handleNormalizedMessage` (line 1242, ~120 LOC)
- `handleCLIMessage` (line 1368, deprecated ~50 LOC)
- `handleAssistant` (line 1542, ~227 LOC — largest method)
- `handleResult` (line 1799, ~116 LOC)
- `routeBrowserMessage` (line 2127, ~48 LOC)
Interface: `MessageHandlerBridge`

### Extract 3: `ws-user-message.ts` (~300 LOC)
Methods to move:
- `handleUserMessage` (line 2175, ~66 LOC — command routing)
- `handleUserMessageInternal` (line 2273, ~168 LOC)
- `maybeEnrichWithDocs` (line 2443, ~7 LOC wrapper)
- `handleDocsCommand`, `handleResearchCommand`, `handleCrawlCommand` (wrappers)
- `sendToEngine` (line 2450, ~37 LOC)
- `sendToCLI` (line 2614, ~14 LOC)
Interface: `UserMessageBridge`

### Extract 4: `ws-health-idle.ts` (~150 LOC)
Methods to move:
- `startHealthCheck` (line 318, ~23 LOC)
- `startCleanupSweep` (line 272, ~16 LOC)
- `scheduleCleanup`, `cancelCleanupTimer` (~30 LOC)
- `startIdleTimer`, `clearIdleTimer` (~60 LOC)
State moved: `idleTimers`, `idleWarningTimers`, `cleanupTimers`, `cleanupSweepInterval`, `healthCheckInterval`
Interface: `HealthIdleBridge`

### After extractions, WsBridge retains (~400 LOC):
- Constructor + property declarations
- Public API surface (19 methods as thin delegates)
- State maps: `sessionSettings`, `permissionResolvers`
- Bridge getters (5 existing + 4 new)
- `startSession` (orchestrator — calls lifecycle)
- `killSession` (orchestrator — calls lifecycle + health)
- `addBrowser`, `removeBrowser` (thin)
- `updateStatus` (thin)

## Tasks
- [ ] Extract ws-session-lifecycle.ts with SessionLifecycleBridge interface
- [ ] Extract ws-message-handler.ts with MessageHandlerBridge interface
- [ ] Extract ws-user-message.ts with UserMessageBridge interface
- [ ] Extract ws-health-idle.ts with HealthIdleBridge interface
- [ ] Update WsBridge to delegate via bridge getters
- [ ] Verify all tests pass
- [ ] Verify ws-bridge.ts < 500 LOC

## Acceptance Criteria
- [ ] ws-bridge.ts < 500 LOC
- [ ] All 31 test files pass
- [ ] No new functionality (pure refactor)
- [ ] All WebSocket flows work: start, message, permission, stop, resume

## Risk
HIGH — touching the core message router. Each extraction must be verified independently.
