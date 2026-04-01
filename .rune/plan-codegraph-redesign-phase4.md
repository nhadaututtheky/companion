# Phase 4: WebIntel Setup Flow — Guided Webclaw Bootstrap

## Goal
Make webclaw sidecar easy to start. Currently users see "Offline" + a Docker command and give up.

## Tasks
- [ ] Detect Docker availability on host (server-side: `docker info` check)
- [ ] "Start Docs Engine" button in AI Context panel:
  - If Docker available: one-click `docker run -d -p 3100:3000 ghcr.io/0xmassi/webclaw:latest`
  - If not: show install Docker link + manual command
- [ ] Health polling: check webclaw `/v1/health` every 30s, update status card live
- [ ] Auto-start option: checkbox "Start webclaw with Companion" → adds to docker-compose or startup script
- [ ] API key setup: optional section explaining what it unlocks (web search only)
  - Input field for `WEBCLAW_API_KEY` → save to `.env` or server config
  - Test button: verify key works
- [ ] Uncomment webclaw in `docker-compose.yml` as default (opt-out instead of opt-in)

## Acceptance Criteria
- [ ] New user can get webclaw running with 1 click from the panel
- [ ] Status card updates from Offline → Online after start
- [ ] Docker-less environments show clear manual instructions
- [ ] API key is clearly marked optional — scraping works without it

## Files Touched
- `packages/server/src/routes/webintel.ts` — new endpoint: `POST /webintel/start-sidecar`
- `packages/server/src/services/web-intel.ts` — Docker detection + start logic
- `packages/web/src/components/panels/ai-context-panel.tsx` — setup wizard UI
- `docker-compose.yml` — uncomment webclaw service

## Dependencies
- Phase 1 complete (unified panel exists)
