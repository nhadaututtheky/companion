# Phase 1: webclaw Sidecar + Scrape Service

## Goal

Add webclaw as an optional Docker sidecar and build a TypeScript client service in Companion that wraps webclaw's REST API. Expose a basic `/docs <url>` command for agents and a health check system.

## Tasks

### Docker Setup
- [ ] Add `webclaw` service to `docker-compose.yml` — `ghcr.io/0xmassi/webclaw:latest`, port 3100 internal, health check, env vars
- [ ] Add `WEBCLAW_URL` env var to companion service (default: `http://webclaw:3100`)
- [ ] Add `WEBCLAW_API_KEY` optional env var (for search/cloud features)
- [ ] Test webclaw container starts and responds on `/v1/scrape`
- [ ] If webclaw Docker image lacks REST server: build custom image with server entrypoint, or use MCP stdio fallback

### TypeScript Client
- [ ] Create `packages/server/src/services/web-intel.ts` — main service module
  - `isAvailable(): Promise<boolean>` — health check webclaw endpoint (GET with timeout 2s, cache result 30s)
  - `scrape(url: string, opts?: ScrapeOptions): Promise<ScrapeResult>` — POST /v1/scrape wrapper
  - `scrapeForContext(url: string, maxTokens?: number): Promise<string | null>` — scrape + truncate to token budget
  - `batchScrape(urls: string[], opts?: BatchOptions): Promise<ScrapeResult[]>` — POST /v1/batch
  - Types: `ScrapeOptions { formats, includeSelectors, excludeSelectors, onlyMainContent }`
  - Types: `ScrapeResult { url, metadata, markdown, llm, text, error }`
- [ ] Error handling: timeout (5s default), webclaw down → return null (never throw), log warnings
- [ ] Token estimation: rough `content.length / 4` for English text

### Cache Layer
- [ ] Create `packages/server/src/services/web-intel-cache.ts`
  - In-memory LRU cache (Map with max 200 entries)
  - Key: URL + format hash
  - TTL: configurable per call (default 1hr for docs, 15min for research)
  - `get(key): CachedResult | null`
  - `set(key, result, ttlMs): void`
  - `invalidate(urlPattern): void` — regex-based cache bust
  - `stats(): { hits, misses, size }` — for debugging

### REST API Routes
- [ ] Create `packages/server/src/routes/webintel.ts`
  - `POST /api/webintel/scrape` — proxy to webclaw with auth, rate limit (10 req/min)
  - `GET /api/webintel/status` — webclaw health + cache stats
  - `POST /api/webintel/docs` — fetch URL in LLM format, return processed content
- [ ] Register routes in `packages/server/src/index.ts`

### Agent Command: /docs
- [ ] In `ws-bridge.ts handleUserMessage()`: detect `/docs <url>` prefix in user message
  - Extract URL from message
  - Call `scrapeForContext(url, 4000)`
  - Replace `/docs <url>` with fetched content wrapped in XML: `<web-docs url="...">\n{content}\n</web-docs>`
  - If webclaw unavailable: pass message through unchanged, log info
- [ ] Support `/docs <url> --refresh` to bypass cache

### Telegram Integration (basic)
- [ ] Add `/web <url>` command to Telegram bot
  - Scrapes URL via webclaw
  - Sends markdown result as Telegram message (split if >4000 chars)
  - Shows metadata (title, word count) in header

## Acceptance Criteria

- [ ] `docker compose up` starts webclaw sidecar alongside companion
- [ ] `GET /api/webintel/status` returns `{ available: true, cache: { hits: 0, misses: 0, size: 0 } }`
- [ ] `POST /api/webintel/scrape` with valid URL returns markdown content
- [ ] Agent message `/docs https://hono.dev` fetches and injects Hono docs into context
- [ ] Companion starts normally even if webclaw container is missing (graceful degradation)
- [ ] Cache hit on second request for same URL (within TTL)

## Files Touched

- `docker-compose.yml` — add webclaw service
- `packages/server/src/services/web-intel.ts` — new: webclaw REST client
- `packages/server/src/services/web-intel-cache.ts` — new: LRU cache
- `packages/server/src/routes/webintel.ts` — new: REST routes
- `packages/server/src/index.ts` — register webintel routes
- `packages/server/src/services/ws-bridge.ts` — /docs command detection
- `packages/server/src/telegram/commands/utility.ts` — /web command

## Dependencies

- webclaw Docker image: `ghcr.io/0xmassi/webclaw:latest`
- No new npm packages needed (native fetch)
