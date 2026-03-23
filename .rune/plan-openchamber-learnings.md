# OpenChamber Learnings — Adoption Roadmap

> Source: github.com/openchamber/openchamber (2.1k stars, MIT)
> Analyzed: 2026-03-21
> Purpose: Prioritized list of patterns/features worth considering. NOT a blind todo list.
> Rule: **Review each item when starting** — ask "does Companion actually need this NOW?"

## How to use this plan

Each item has a **verdict gate** — a question to answer honestly before starting work.
If the answer is "no" or "not yet", skip it. Revisit next month.

---

## Tier 0 — Reliability fixes (adopt if broken)

### 0.1 Login-shell env snapshot
**What:** Before spawning CLI, run `shell -lic 'env -0'` to capture user's full PATH/env, merge into child process.
**Why:** Companion whitelist-filters env vars → Docker/WSL users get missing-tool errors → sessions die on start.
**Verdict gate:** Are users reporting "session ends immediately" or "command not found" in CLI stderr?
**Effort:** ~2h | **Files:** `cli-launcher.ts`
**Reference:** OpenChamber `server/index.js` line ~3914

### 0.2 HMR-safe subprocess persistence
**What:** Store CLI subprocess refs in `globalThis.__companionHmrState` so Bun --hot doesn't orphan processes.
**Why:** During dev, every code change spawns a new CLI process without killing the old one → zombie cascade.
**Verdict gate:** Do you see orphan `node claude` processes after editing server code?
**Effort:** ~1h | **Files:** `ws-bridge.ts`, `index.ts`
**Reference:** OpenChamber `globalThis.__openchamberHmrState`

---

## Tier 1 — UX quality gaps (adopt when polishing)

### 1.1 Permission diff preview
**What:** When CLI requests permission to edit a file, show the actual diff inline before user approves.
**Why:** Users currently approve blind — they see "Edit file X" but not what changes. Risky for production use.
**Verdict gate:** Are users hesitant to approve edits? Do they expand sessions just to check what changed?
**Effort:** ~6h | **Files:** `permission-gate.tsx`, new `DiffPreview` component
**OpenChamber ref:** `PermissionCard.tsx` + `DiffPreview.tsx`

### 1.2 Permission auto-accept with 3 levels
**What:** `once` | `always` | `reject` (not just allow/deny). Per-session toggle. Sub-sessions inherit parent setting.
**Why:** Power users want "just approve everything for this session" without clicking 50 times.
**Verdict gate:** Is permission fatigue a real complaint? Do users already use bypassPermissions mode to avoid it?
**Effort:** ~4h | **Files:** `ws-bridge.ts` (auto-approve logic), `permission-gate.tsx`

### 1.3 SSE heartbeat + idle abort
**What:** WebSocket heartbeat ping every 30s + `x-accel-buffering: no` header for proxy compatibility.
**Why:** Connections drop silently behind nginx/Cloudflare without heartbeat. Users think session froze.
**Verdict gate:** Are WebSocket connections dropping in production (especially behind reverse proxy)?
**Effort:** ~2h | **Files:** `index.ts` (ws handler), `use-websocket.ts`

---

## Tier 2 — Feature gaps (adopt when competing)

### 2.1 Timeline branching (undo/redo/fork)
**What:** `/undo` reverts to previous user message. `/redo` restores. Fork creates a new session from any turn.
**Why:** Lets users explore multiple approaches without losing context. Killer feature for iterative work.
**Verdict gate:** Do users restart sessions just to try a different approach? Is "I wish I could go back" a request?
**Effort:** ~16h | **Files:** New timeline store, message-feed changes, CLI `--resume` integration
**Depends on:** Claude Code CLI supporting session forking (check `--resume` + message filtering)

### 2.2 Multi-agent with isolated worktrees
**What:** Same prompt → N models (up to 5), each in its own git worktree. Compare results side-by-side.
**Why:** Extends debate mode from 2→N, each gets a clean sandbox. Users pick the best result.
**Verdict gate:** Is debate mode being used? Do users want to compare more than 2 models?
**Effort:** ~20h | **Files:** New multi-run store, worktree management, grid layout for N sessions
**Depends on:** Git worktree support on target platform

### 2.3 Cloudflare tunnel — managed mode
**What:** Persistent custom domain tunnels (not just ephemeral quick tunnels). Token-based auth.
**Why:** Quick tunnels get new URLs every restart. Managed tunnels keep the same URL → bookmarkable.
**Verdict gate:** Are users accessing Companion remotely? Is the current quick tunnel sufficient?
**Effort:** ~8h | **Files:** New tunnel service, settings UI
**Reference:** OpenChamber provider-registry pattern (pluggable tunnel backends)

### 2.4 Voice input + TTS
**What:** Speech-to-text for message input + server-side TTS to read responses aloud.
**Why:** Mobile/tablet users. Accessibility. Hands-free coding assistance.
**Verdict gate:** Is mobile usage significant? Are users asking for voice features?
**Effort:** ~12h | **Files:** New voice service (server), audio components (web)
**Depends on:** OpenAI Whisper/TTS API or browser Web Speech API

---

## Tier 3 — Platform plays (adopt when scaling)

### 3.1 Theme system (JSON schema + custom themes)
**What:** Structured theme JSON with colors/fonts/radius/transitions. Custom themes via file drop, hot-reload.
**Why:** Community engagement. Personalization. "Make it mine" factor.
**Verdict gate:** Are users asking for more themes? Is the current dark/light toggle sufficient?
**Effort:** ~16h | **Files:** Theme schema, CSS variable generator, settings UI, file watcher
**OpenChamber ref:** 30 themes, `cssGenerator.ts` (772 lines)

### 3.2 Skills marketplace
**What:** Browse/install community skill files (CLAUDE.md equivalents) from a registry.
**Why:** Ecosystem play — turns Companion from a tool into a platform. Network effects.
**Verdict gate:** Is there a community creating skills? Would a marketplace actually be used?
**Effort:** ~24h | **Files:** Skills catalog service, browse/install UI, registry API
**Depends on:** Community size, skill format standardization

### 3.3 VS Code extension
**What:** Sidebar chat, agent manager panel, file-open integration, right-click actions.
**Why:** Meet developers where they already work. Some prefer VS Code over a separate web UI.
**Verdict gate:** Are users asking for VS Code integration? Would it cannibalize the web UI?
**Effort:** ~40h | **Files:** Entire new package (`packages/vscode/`)
**Risk:** High maintenance burden for a separate client

### 3.4 Desktop app (Tauri)
**What:** Native macOS/Windows/Linux app wrapping the web UI with system integrations.
**Why:** Native feel, Finder shortcuts, SSH remote mode, system tray, auto-update.
**Verdict gate:** Is "open browser tab" friction significant enough to justify a native app?
**Effort:** ~30h+ | **Files:** Entire new package (`packages/desktop/`)
**Risk:** Tauri + Rust expertise needed, cross-platform testing burden

### 3.5 PWA push notifications
**What:** Web Push with VAPID keys. Notify when session completes, permission needed, etc.
**Why:** Users leave Companion in a background tab while working. Miss important events.
**Verdict gate:** Do users complain about missing notifications? Is browser tab awareness enough?
**Effort:** ~8h | **Files:** Service worker, notification service (server), settings UI

---

## Patterns to adopt incrementally (no dedicated phase)

These are code-level improvements to integrate whenever touching the relevant file:

| Pattern | When to apply | Reference |
|---------|--------------|-----------|
| 1 Zustand store per feature domain | When adding new stores or refactoring | OpenChamber: 30+ focused stores |
| `DOCUMENTATION.md` per server module | When creating new services | OpenChamber: `server/lib/*/DOCUMENTATION.md` |
| Provider registry pattern | When adding tunnel/auth/notification providers | `createTunnelProviderRegistry([...])` |
| Terminal WS protocol (binary control + text input) | When improving terminal latency | `TERMINAL_INPUT_WS_PROTOCOL.md` |
| Slug-based worktree naming | When implementing multi-agent worktrees | `{groupSlug}/{modelSlug}` convention |

---

## Companion advantages to protect

These are areas where Companion is ahead — don't regress:

- **Claude Code native NDJSON pipe** — deeper integration than HTTP proxy
- **Telegram bot** — mobile access without a native app
- **Channel system** — shared context between sessions (OpenChamber lacks this)
- **Magic Ring UI** — unique interaction pattern, not just another sidebar
- **Docker-first production** — battle-tested containerized deployment
- **Plan mode watchdog** — auto-detect + fix stuck plan mode (unique to Companion)

---

## Review cadence

- **Monthly:** Scan this list, update verdict gates based on user feedback
- **Per-session:** When starting work that touches a relevant area, check if an item here should be bundled
- **Quarterly:** Re-check OpenChamber releases for new patterns worth learning
