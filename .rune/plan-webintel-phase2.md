# Phase 2: Agent Auto-Injection (Docs & Context)

## Goal

Automatically detect when an agent encounters an unknown library/API and inject relevant documentation into the session context — without the user asking. This is the "90% context optimization" feature: agents get docs they need before wasting tokens searching.

## Tasks

### Library Detection Engine
- [ ] Create `packages/server/src/services/web-intel-detector.ts`
  - `detectLibraryMentions(message: string): string[]` — extract library/package names from user messages
    - Pattern: "use X", "install X", "import X", "how does X work", "X docs", "X API"
    - Pattern: npm package names (`@scope/name`, `kebab-case-name`)
    - Pattern: tech names from known list (React, Next.js, Hono, Drizzle, Tailwind, etc.)
  - `detectErrorLibrary(message: string): string | null` — extract library from error messages
    - Pattern: `Cannot find module 'X'`, `X is not a function`, stack traces with package paths
  - Dedup: don't re-detect libraries already injected in this session (track in session state)

### Docs URL Resolution
- [ ] Create `packages/server/src/services/web-intel-resolver.ts`
  - `resolveDocsUrl(libraryName: string): Promise<string | null>`
  - Strategy chain:
    1. **Known map** — hardcoded top 100 libraries → docs URL (React, Next.js, Hono, Drizzle, Tailwind, Prisma, etc.)
    2. **npm registry** — `GET https://registry.npmjs.org/{name}` → extract `homepage` or `repository` URL
    3. **PyPI** — `GET https://pypi.org/pypi/{name}/json` → extract `project_urls.Documentation`
    4. **GitHub README** — if repo URL found, scrape README as fallback
  - Cache resolved URLs permanently (they rarely change)

### Context Injection in ws-bridge.ts
- [ ] In `handleUserMessage()`, after existing processing, before sending to CLI:
  - Call `detectLibraryMentions(content)`
  - For each new library (not already injected this session):
    - Resolve docs URL
    - `scrapeForContext(docsUrl, 2000)` via web-intel.ts
    - Append to message as XML block:
      ```xml
      <web-docs library="hono" url="https://hono.dev/docs" auto-injected="true">
      {truncated docs content}
      </web-docs>
      ```
  - Track injected libraries in `session.webIntelInjected: Set<string>`
  - Total injection cap: 4000 tokens per message (across all auto-injections)
  - Skip if webclaw unavailable (silent)

### Session-Level Doc Context
- [ ] On session start (`startSessionWithCli()`):
  - If project has `package.json`, scan dependencies
  - Pre-resolve docs URLs for top 5 dependencies (by import frequency if CodeGraph available, else alphabetical)
  - Store as `session.preloadedDocs: Map<string, string>` (library → cached content)
  - Don't inject all at once — inject on-demand when agent first mentions the library

### Settings & Control
- [ ] Add web-intel settings to DB settings system:
  - `webintel.autoInject`: boolean (default true) — enable/disable auto doc injection
  - `webintel.maxTokensPerInjection`: number (default 2000)
  - `webintel.maxTokensPerMessage`: number (default 4000)
- [ ] Add `/webintel` toggle command in Telegram and web UI
- [ ] Add setting in web project config: per-project enable/disable

### contextplus-Inspired: Doc Memory
- [ ] Extend web-intel-cache to persist across sessions:
  - When docs are fetched, store in `web_intel_docs` SQLite table:
    - `library_name`, `docs_url`, `content_hash`, `llm_content`, `fetched_at`, `access_count`
  - On subsequent sessions with same project, skip re-fetch if cache valid
  - Decay: docs accessed recently ranked higher for pre-loading
  - This pattern mirrors contextplus's memory graph but simpler (flat table, no graph traversal needed)

## Acceptance Criteria

- [ ] User message "help me set up Drizzle ORM migrations" → agent automatically receives Drizzle docs
- [ ] Same library not re-injected twice in same session
- [ ] Total auto-injection stays under 4000 tokens per message
- [ ] Companion works normally when webclaw is offline (zero injection, no errors)
- [ ] `/webintel off` disables auto-injection for session
- [ ] Second session for same project loads cached docs instantly (no re-fetch)

## Files Touched

- `packages/server/src/services/web-intel-detector.ts` — new: library mention detection
- `packages/server/src/services/web-intel-resolver.ts` — new: docs URL resolution
- `packages/server/src/services/web-intel.ts` — extend with auto-injection logic
- `packages/server/src/services/web-intel-cache.ts` — extend with SQLite persistence
- `packages/server/src/services/ws-bridge.ts` — auto-injection hook in handleUserMessage
- `packages/server/src/db/schema.ts` — add web_intel_docs table
- `packages/server/src/db/migrations/00XX_web_intel.sql` — migration

## Dependencies

- Phase 1 completed (webclaw client + cache)
- npm registry API (public, no auth needed)
