# Phase 6: Tauri 2 Desktop App

## Goal

Wrap Companion as a native desktop app using Tauri 2 sidecar architecture. Zero server/web code rewrite — purely additive packaging layer.

## Tasks

### 6A: Static Export Preparation (benefits Docker too)
- [ ] Add `output: "export"` to `packages/web/next.config.ts`
- [ ] Handle dynamic route `/sessions/[id]` — verify client-side routing works with static export
- [ ] Add static file serving to Hono server
  - Serve `packages/web/out/` at `/` with catch-all fallback to `index.html`
  - `packages/server/src/index.ts` — add static middleware
- [ ] Test: build static → serve from Hono → all pages work
- [ ] Update Docker setup to use static export (eliminate Next.js process)
  - `Dockerfile` — remove Next.js dev/build step, just copy `out/`
  - `docker-entrypoint.sh` — remove web process management (single process now)

### 6B: Tauri Shell Setup
- [ ] Initialize Tauri 2 project: `packages/tauri/` or `src-tauri/`
  - `cargo install create-tauri-app` if needed
  - Configure `tauri.conf.json`: window size, title, icon
- [ ] Configure Bun as sidecar binary
  - Bundle Bun binary per platform in `src-tauri/binaries/`
  - Sidecar config in `tauri.conf.json` → `shell.sidecar`
- [ ] Implement Rust `setup()` hook
  - Spawn Bun sidecar with correct env vars (DB_PATH, PORT, etc.)
  - Wait for health check (`GET /api/health`) before showing window
  - Set DB_PATH to platform app data dir (`%APPDATA%/Companion/` on Windows)
- [ ] Point webview to `http://localhost:3579`
- [ ] Implement graceful shutdown — kill sidecar on app close

### 6C: Desktop Polish
- [ ] System tray icon
  - Show active session count
  - Quick actions: new session, kill all, open web
- [ ] Native notifications (Tauri notification plugin)
  - Session complete, error, permission needed
- [ ] First-run wizard integration
  - Check Claude CLI in PATH → prompt install if missing
  - No Docker mount needed — detect user's home/project dirs natively
- [ ] Auto-update via Tauri updater plugin
  - Configure update endpoint

### 6D: Build Pipeline
- [ ] GitHub Actions workflow for Tauri builds
  - Matrix: Windows (x64), macOS (x64 + ARM), Linux (x64)
  - Artifact: .msi (Win), .dmg (Mac), .AppImage (Linux)
- [ ] Code signing setup (placeholder for future)
- [ ] Landing page download links integration

## Acceptance Criteria

- [ ] Static export works: `bun run build:web` → serve from Hono → all features functional
- [ ] Docker now runs single process (Bun only)
- [ ] Tauri app launches on Windows: shows Companion UI
- [ ] System tray shows session count
- [ ] First run detects Claude CLI presence
- [ ] Auto-update checks for new versions

## Files Touched

- `packages/web/next.config.ts` — static export config
- `packages/server/src/index.ts` — static file serving
- `Dockerfile` — simplified single process
- `docker-entrypoint.sh` — remove web process
- `src-tauri/` — new (entire Tauri project)
- `.github/workflows/tauri-build.yml` — new

## Dependencies

- Phase 1-5 completed (stable, polished app to wrap)

## Review Gate

- [ ] Static export: `next build` succeeds, all pages render from Hono
- [ ] Docker: `docker compose up` works with single-process setup
- [ ] Tauri: app launches, creates session, sends message, receives response
- [ ] System tray functional
- [ ] Test on Windows (primary target)
