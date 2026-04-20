# Feature: Session Settings Unification

## Overview

Session settings (idleTimeoutMs, keepAlive, compactThreshold, thinking_mode, etc.) sống ở 5 nơi — 2 DB tables, 2 in-memory Maps, React local state — với 4 default values khác nhau. Resume path dùng DEFAULT thay vì đọc DB đã được fix 1 lần (2026-04-19) nhưng tái phát vì chỉ vá triệu chứng, không fix root cause. Kế hoạch này unify về **single source of truth + single writer + event-driven sync** để chặn đứng bug-regression cycle.

## Problem Statement

Bug lặp lại 3+ lần: user set `idleTimeoutMs = 10 phút` → start session → idle-kill → resume → timeout reset về 30 hoặc 60 phút. Root cause không phải một bug đơn lẻ mà là kiến trúc phân tán:

- **5 storage locations**: `sessions` table, `telegramSessionMappings` table, `WsBridge.sessionSettings` Map, `TelegramIdleManager.sessionConfigs` Map, React useState
- **4 default values khác nhau**: `constants.ts` = 30 phút, `schema.ts` = 60 phút, `telegram-idle-manager.ts` fallback = 60 phút, `session-settings.tsx` = 30 phút
- **Writers không đồng bộ**: Web `PATCH /settings` → Map only (không ghi DB); Telegram `/config` → Map + DB; scheduler → Map only
- **Guard lỗi silent**: `telegram-bridge.ts:420` `if (oldRow.idleTimeoutMs !== 3_600_000)` — user set đúng 1h bị miss
- **Web API resume hardcode default**: `sessions.ts:606` fallback `3_600_000` khi body không gửi
- **`sessions` table thiếu cột**: idleTimeoutMs/keepAlive/autoReinject/thinking_mode/context_mode → Web sessions mất setting khi kill
- **Không có contract test** cho "resume preserves settings"

## Target Architecture

```
       ┌─────────────────────────────────────────────┐
       │  SessionSettingsService (single writer)      │
       │  updateSessionSettings(id, patch)            │
       │   1. Validate patch                          │
       │   2. DB UPDATE sessions SET ...              │
       │   3. Invalidate caches + reload from DB      │
       │   4. Emit 'session:settings:updated' event   │
       └─────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   WsBridge cache  TelegramIdleMgr   Web UI
   (read-only)    (subscribes)      (refetch on event)
```

**Source of truth**: `sessions` table. `telegramSessionMappings.idleTimeoutMs` sẽ được migrate sang `sessions` rồi drop cột cũ.

## Phases

| # | Name | Status | Plan File | Effort | Risk |
|---|------|--------|-----------|--------|------|
| 1 | Schema unification + default consolidation | ✅ Done | plan-session-settings-unify-phase1.md | M | Low (additive migration + data backfill) |
| 2 | Single-writer service + event bus propagation | ✅ Done | plan-session-settings-unify-phase2.md | L | Med (touches hot paths) |
| 3 | Resume path cleanup + contract tests + deprecate old column | ✅ Partial | plan-session-settings-unify-phase3.md | M | Low (column drop deferred to a follow-up release per rollback-safety plan) |

**Total estimate**: 1 sprint, 3 sessions (Opus plans phase, Sonnet executes).

## Key Decisions

- **Source of truth = `sessions` table**: per-session, not per-mapping. Nếu session share qua nhiều chat, settings của session thắng (hiện tại không có feature share-session-across-chats nên không regress).
- **DEFAULT consolidated về `@companion/shared/constants.ts`**: một chỗ duy nhất, các default value trong SQL migration phải reference constant này qua codegen hoặc doc comment.
- **Event bus-driven cache invalidation**: thay vì mỗi writer phải biết update các Map khác, emit event và các cache subscribe.
- **Backwards-compatible migration**: Phase 1 thêm cột mới vào `sessions`, backfill từ `telegramSessionMappings`. Phase 3 mới drop cột cũ — cho phép rollback giữa 2 release.
- **Contract tests bắt buộc**: mỗi setting phải có test "set → kill → resume → value still there" cho 3 path (Web, Telegram, Scheduler).

## New Invariants (bổ sung vào `.rune/INVARIANTS.md` ở Phase 3)

- **INV-13**: Tất cả session settings reads MUST đi qua `SessionSettingsService.get(sessionId)`. Không được `Map.get()` trực tiếp ngoài service.
- **INV-14**: Tất cả session settings writes MUST đi qua `SessionSettingsService.update(sessionId, patch)`. Không được `Map.set()` hoặc UPDATE SQL trực tiếp.
- **INV-15**: Mỗi setting mới trong type `SessionSettings` MUST có cột DB tương ứng trong `sessions` + default trong `@companion/shared/constants.ts`.

## Success Criteria

- [ ] `idleTimeoutMs` persist qua mọi resume path (Web, Telegram /resume, Telegram /use @shortid, auto-reconnect, scheduler).
- [ ] Contract test suite pass: 5 settings × 3 paths = 15 test cases.
- [ ] Grep codebase: 0 hit cho `sessionSettings.set(` / `sessionConfigs.set(` ngoài `SessionSettingsService`.
- [ ] Bug report "timeout reset on resume" = 0 issue mới trong 2 release sau.

## Risk

- **Migration backfill edge case**: session có row trong `sessions` nhưng không có mapping trong `telegramSessionMappings` (Web-only session) → dùng DEFAULT. Session có mapping nhưng không có row `sessions` (shouldn't happen nhưng có thể do race) → skip.
- **Event bus race**: write → emit → cache update. Nếu read xảy ra giữa write và emit, đọc cache cũ. Giải pháp: cache lazy-load từ DB khi miss, TTL ngắn (30s), invalidate ngay khi event fires.
- **Test isolation**: `bun test` với mock.module persist globally (feedback_bun_mock_isolation.md) → mỗi contract test file chạy riêng invocation.
