# Phase 3: Web Research + Crawl

## Goal

Enable agents to perform multi-page web research and site crawling — for users who need agents to gather, synthesize, and work with web data. This is the "agents crawl data" use case.

## Tasks

### Research Command
- [ ] Add `/research <topic>` command detection in ws-bridge.ts
  - Agent or user sends `/research how to implement rate limiting in Hono`
  - Flow:
    1. webclaw search API: `POST /v1/search { query, num: 5 }` → top 5 URLs
    2. webclaw batch scrape: `POST /v1/batch { urls, formats: ["llm"] }` → content
    3. Synthesize: call Companion's ai-client (Haiku tier) to summarize all pages into one coherent brief
    4. Inject summary into session context (max 3000 tokens)
  - Output format:
    ```xml
    <web-research query="rate limiting in Hono" sources="5" synthesized="true">
    {AI-synthesized summary with source citations}
    
    Sources:
    1. [Title](url) — key point
    2. [Title](url) — key point
    ...
    </web-research>
    ```
  - Requires `WEBCLAW_API_KEY` for search. If not set, return error message suggesting user provide URL directly

### Crawl Command
- [ ] Add `/crawl <url> [--depth N] [--max N]` command detection
  - Initiates async crawl job via webclaw: `POST /v1/crawl { url, max_depth, max_pages }`
  - Poll status: `GET /v1/crawl/{jobId}` every 3s
  - On completion: summarize all pages via ai-client (Haiku)
  - Inject crawl summary into session (max 5000 tokens)
  - Broadcast crawl progress to web UI via WebSocket (`crawl_progress` event)
  - Output format:
    ```xml
    <web-crawl url="https://docs.example.com" pages="23" depth="2">
    {Site structure + summarized content}
    </web-crawl>
    ```

### Crawl Job Management
- [ ] Create `packages/server/src/services/web-intel-jobs.ts`
  - Track active crawl jobs per session
  - Max 1 concurrent crawl per session, max 3 globally
  - Job timeout: 5 minutes
  - Cancel: `/crawl --stop` or session kill cleans up
  - Store results in web_intel_docs table for cross-session reuse

### Batch Extract for Data Collection
- [ ] Add `/extract <url> --schema '{"field": "type"}'` command
  - Uses webclaw's LLM-powered extraction: `POST /v1/extract { url, schema }`
  - Returns structured JSON matching user's schema
  - Useful for: product data, API responses, tables, contact info
  - Requires Ollama or AI API key on webclaw side

### Research Results Cache
- [ ] Extend web-intel-cache with research result storage:
  - Key: query hash + date (research expires faster)
  - TTL: 15 minutes for research, 30 minutes for crawls
  - Dedup: same query within TTL returns cached result

### REST API Extensions
- [ ] `POST /api/webintel/research` — trigger research job, return job ID
- [ ] `POST /api/webintel/crawl` — trigger crawl job, return job ID
- [ ] `GET /api/webintel/jobs` — list active jobs
- [ ] `GET /api/webintel/jobs/:id` — job status + partial results
- [ ] `DELETE /api/webintel/jobs/:id` — cancel job

## Acceptance Criteria

- [ ] `/research Next.js 16 app router changes` returns synthesized summary from 5 sources
- [ ] `/crawl https://hono.dev/docs --depth 2` crawls site and produces structured summary
- [ ] `/extract https://example.com/product --schema '{"price":"string","name":"string"}'` returns JSON
- [ ] Crawl progress visible in web UI via WebSocket
- [ ] Max concurrency enforced (1 per session, 3 global)
- [ ] Graceful error when WEBCLAW_API_KEY not set for search features

## Files Touched

- `packages/server/src/services/web-intel.ts` — add research(), crawl(), extract() methods
- `packages/server/src/services/web-intel-jobs.ts` — new: crawl job tracker
- `packages/server/src/services/ws-bridge.ts` — /research, /crawl, /extract command detection
- `packages/server/src/routes/webintel.ts` — add research/crawl/jobs endpoints
- `packages/server/src/services/ai-client.ts` — add summarizePages() helper (Haiku tier)

## Dependencies

- Phase 1 + Phase 2 completed
- `WEBCLAW_API_KEY` for search features (optional — scrape/crawl work without it)
- ai-client.ts for synthesis (already exists)
