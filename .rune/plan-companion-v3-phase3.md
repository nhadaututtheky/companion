# Phase 3: QR Stream Sharing (Flagship)

## Goal

Generate a shareable URL + QR code that lets team members view a live coding session in real-time. Spectator mode for AI coding. The marketing differentiator for Companion.

## Tasks

### 3.1 Share Token System — DONE
- [x] `share_tokens` table with token, sessionId, permission, expiresAt, createdBy, revokedAt
- [x] Migration `0013_share_tokens.sql`
- [x] `ShareManager` service — create/validate/revoke/listActive/revokeAllForSession
- [x] Permissions: `read-only` (view stream) or `interactive` (can type in chat)
- [x] Auto-expire (configurable 1h-7d, default 24h)
- [x] Rate limit: max 10 active tokens per session

### 3.2 Spectator WebSocket — DONE
- [x] `/ws/spectate/:token` upgrade endpoint with token validation (no API key auth)
- [x] `SpectatorBridge` — addSpectator, removeSpectator, broadcastToSpectators, disconnectAll
- [x] Fan-out from ws-bridge `broadcastToAll` → spectators receive same messages as browsers
- [x] Interactive mode: spectators with `interactive` permission can send `user_message` via WS
- [x] `spectator_count` event broadcast to session browsers
- [x] Disconnect spectators on session end + token revoke

### 3.3 Share UI (Owner Side) — DONE
- [x] "Share" button in session header with `ShareNetwork` icon
- [x] `ShareModal` — permission selector, expiry selector, create button
- [x] QR code generation using `qrcode` npm package (dataURL)
- [x] Copy link button, active shares list with revoke
- [x] Spectator count badge in header (`Users` icon)

### 3.4 Spectator View (Viewer Side) — DONE
- [x] `/spectate/[token]` page — dark theme, mobile-optimized
- [x] Token validation on load, error state for expired/invalid
- [x] WebSocket connection with live message streaming
- [x] Chat bubble layout (user right, assistant left, system yellow)
- [x] Interactive mode: chat input + send button when permission allows
- [x] LIVE/Reconnecting badge, permission badge
- [x] No login required — token is the auth

### 3.5 API Routes — DONE
- [x] `POST /api/sessions/:id/share` — create share token (protected)
- [x] `GET /api/share/:token` — validate token (public, no auth)
- [x] `DELETE /api/share/:token` — revoke token (protected)
- [x] `GET /api/sessions/:id/shares` — list active shares (protected)

## Acceptance Criteria

- [x] Owner generates QR code in 1 click from session view
- [x] Scanning QR opens spectator view on mobile browser (no app install)
- [x] Spectator sees live messages via WebSocket
- [x] Interactive spectators can send messages visible to session
- [x] Revoking token immediately disconnects spectators (via disconnectByToken)
- [x] Expired tokens show "Share Link Unavailable" page
- [x] Works on LAN (no internet required for self-hosted)

## Status: DONE

## Files Created/Modified

- `packages/server/src/db/schema.ts` — modified (shareTokens table)
- `packages/server/src/db/migrations/0013_share_tokens.sql` — new
- `packages/server/src/services/share-manager.ts` — new
- `packages/server/src/services/spectator-bridge.ts` — new
- `packages/server/src/routes/share.ts` — new
- `packages/server/src/routes/index.ts` — modified (share routes + spectator WS)
- `packages/server/src/index.ts` — modified (spectator WS upgrade + handlers)
- `packages/server/src/services/ws-bridge.ts` — modified (spectator fan-out + disconnect on end)
- `packages/shared/src/types/session.ts` — modified (spectator_count event)
- `packages/web/src/lib/api-client.ts` — modified (share API methods)
- `packages/web/src/hooks/use-session.ts` — modified (spectatorCount state)
- `packages/web/src/components/session/share-modal.tsx` — new
- `packages/web/src/app/sessions/[id]/session-page-client.tsx` — modified (share button + modal + spectator badge)
- `packages/web/src/app/spectate/[token]/page.tsx` — new
- `packages/web/package.json` — added `qrcode` dependency
