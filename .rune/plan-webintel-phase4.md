# Phase 4: Web UI + Telegram Commands

## Goal

Complete user-facing interfaces for WebIntel — web dashboard panel for managing scrapes/crawls/cache, and full Telegram command set for mobile users.

## Tasks

### Web UI: WebIntel Panel
- [ ] Create `packages/web/src/components/panels/webintel-panel.tsx`
  - **Status section**: webclaw health indicator (green/red dot), cache stats (hits/misses/size)
  - **Quick scrape**: URL input + format selector (markdown/llm/json) + scrape button → preview result
  - **Active jobs**: list of running crawl/research jobs with progress bars + cancel buttons
  - **Cache browser**: searchable list of cached docs, click to preview, manual invalidate button
  - **Settings**: toggle auto-injection on/off, adjust token budgets, WEBCLAW_API_KEY input

### Web UI: Session Integration
- [ ] In expanded session view, add "Web Context" indicator
  - Show which docs were auto-injected in current session
  - Badge: "3 docs injected" with expandable list
  - Click library name → show cached doc content
- [ ] Add `/docs` and `/research` as quick-action buttons in session input area

### Telegram Commands
- [ ] `/web <url>` — scrape URL, send as Telegram message (split long content)
  - Include metadata header: title, word count, source URL
  - Inline keyboard: [Full Text] [Summary] [LLM Format]
- [ ] `/research <query>` — trigger research, send synthesized result
  - Show "Researching..." typing indicator while processing
  - Send result with source links
- [ ] `/crawl <url>` — trigger crawl, send progress updates
  - Progress: "Crawling... 5/23 pages"
  - Send final summary when done
- [ ] `/webstatus` — show webclaw health, active jobs, cache stats
- [ ] `/webcache clear` — clear webclaw cache

### Telegram: Smart URL Detection
- [ ] In `handleTextMessage()`: detect URLs in user messages
  - If message contains URL and is sent to an active session:
    - Auto-scrape URL in background
    - Append scraped content to message before forwarding to agent
    - Show subtle "📄 Fetched content from URL" indicator
  - Configurable: enable/disable per chat via `/webintel on|off`

### MCP Tool Exposure
- [ ] Add WebIntel tools to Companion's MCP server (`packages/server/src/mcp/tools.ts`):
  - `companion_web_scrape` — scrape URL, return content
  - `companion_web_research` — research query, return synthesis
  - `companion_web_crawl` — crawl site, return structure + content
  - This allows external MCP clients to use Companion's webclaw integration

## Acceptance Criteria

- [ ] WebIntel panel shows webclaw status and cache stats
- [ ] Quick scrape from web UI returns formatted content
- [ ] Active crawl jobs show real-time progress
- [ ] `/web https://hono.dev` in Telegram sends formatted docs
- [ ] URLs in Telegram messages auto-scraped when webintel enabled
- [ ] MCP tools accessible from external clients
- [ ] All UI responsive on mobile (Telegram is primary)

## Files Touched

- `packages/web/src/components/panels/webintel-panel.tsx` — new: web panel
- `packages/web/src/components/grid/expanded-session.tsx` — add web context indicator
- `packages/web/src/app/page.tsx` — add WebIntel panel to sidebar/grid
- `packages/server/src/telegram/commands/utility.ts` — /web, /research, /crawl, /webstatus, /webcache
- `packages/server/src/telegram/telegram-bridge.ts` — smart URL detection
- `packages/server/src/mcp/tools.ts` — add web scrape/research/crawl tools

## Dependencies

- Phase 1 + 2 + 3 completed
- Web UI framework already exists (Next.js + Zustand)
- Telegram bot framework already exists (Grammy)
