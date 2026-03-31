# Phase 7: Final Review + Ship

## Goal

Comprehensive review and testing of ALL changes from Phase 1-6 before shipping. No new features — only fixes found during review.

## Tasks

### Full Build Verification
- [ ] `bun run build` — server compiles clean
- [ ] `next build` — web compiles clean (both dev and static export)
- [ ] `docker compose build` — Docker image builds
- [ ] `docker compose up` — container runs, health check passes
- [ ] Tauri build — desktop app compiles (if Phase 6 complete)

### Telegram E2E Test Checklist
- [ ] `/start` → welcome message, setup guide for new users
- [ ] `/new` → create session → send message → receive response
- [ ] `/model` → switch to each model (haiku/sonnet/opus) → verify
- [ ] Send photo → Claude receives and acknowledges image
- [ ] Send document → file appears in session CWD
- [ ] `/allow` on safe operation → shows details → approve
- [ ] `/allow` on dangerous operation → shows ⚠️ warning
- [ ] `/stop` → session ends cleanly, shortId cleared
- [ ] `/resume` → session resumes with context
- [ ] `/export` → receives markdown file
- [ ] `/status` → shows correct session info + cost
- [ ] `/help` → shows categorized command list
- [ ] Budget exceeded → session blocks with clear message
- [ ] Long response → split with part indicators
- [ ] Command menu → shows ≤10 commands
- [ ] Auto-approve countdown → visual timer works
- [ ] Compact → identity re-injected

### Web E2E Test Checklist
- [ ] No API key → redirected to login page
- [ ] Enter API key → redirected to dashboard
- [ ] First-time → onboarding wizard appears
- [ ] Create session → chat works
- [ ] Mobile viewport (375px) → layout not broken
- [ ] Ctrl+K → command palette / search
- [ ] Ctrl+N → new session
- [ ] Session completes → browser notification fires
- [ ] Refresh page → messages persist
- [ ] Export session → downloads .md file
- [ ] Stats panel → shows heatmap, streak, KPIs
- [ ] Sort sessions by cost/date/tokens → correct order
- [ ] Tags → add/remove/filter
- [ ] Cost display → matches actual model rates
- [ ] Budget bar → shows progress, warns at 80%

### Desktop E2E Test (if Phase 6)
- [ ] Launch app → first-run wizard detects Claude CLI
- [ ] All web features work in Tauri webview
- [ ] System tray → shows session count
- [ ] Close app → sidecar process killed cleanly
- [ ] Auto-update → checks for updates on launch

### Regression Checklist
- [ ] Existing Docker users can upgrade without breaking
- [ ] No hardcoded secrets in committed code
- [ ] All env vars documented in .env.example
- [ ] Version numbers consistent (v0.4.0)
- [ ] No console.log in production code
- [ ] Error messages are user-friendly, no stack traces to users

### Ship
- [ ] Write CHANGELOG.md entry for v0.4.0
- [ ] Semantic commit: `feat: companion v0.4.0 — telegram UX, web responsive, desktop app`
- [ ] Tag: `v0.4.0`
- [ ] Docker image push
- [ ] Tauri release (GitHub Releases with platform binaries)
- [ ] Update landing page with download links + changelog

## Acceptance Criteria

- [ ] ALL test checklists pass
- [ ] Zero known P1 bugs
- [ ] Build succeeds on all targets (Docker, Tauri)
- [ ] CHANGELOG documents all changes

## Dependencies

- Phase 1-6 ALL completed
