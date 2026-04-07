# Phase 5: Wiki KB Advanced — NM Graduation, Obsidian, Auto-Lint

## Goal
Advanced wiki features: Neural Memory insights auto-graduate to wiki articles,
Obsidian vault bridge via MCP, freshness linting, and CodeGraph cross-references.

## Tasks

### A. Neural Memory → Wiki Graduation Pipeline
- [ ] `packages/server/src/wiki/nm-bridge.ts`
  - Scan Neural Memory for recurring patterns (same topic, 3+ memories)
  - Group related memories by tags/concepts
  - Generate wiki article draft from grouped memories
  - Present to user for review before committing to wiki
- [ ] Graduation trigger:
  - Manual: button in wiki panel "Import from Memory"
  - Auto-suggest: after `nmem_consolidate`, surface candidates
- [ ] Graduated memories get tagged in NM: `graduated_to_wiki:<slug>`
  - Prevents re-graduation
  - NM keeps episodic record, wiki has compiled knowledge

### B. Obsidian Import Bridge (reads from USER's existing MCP)
**Important:** Companion does NOT build or bundle any Obsidian MCP server.
User installs their own (obsidian-mcp-server, mcpvault, etc.) via MCP Settings.
This bridge ONLY reads from a user-configured MCP to import notes as raw material.

- [ ] `packages/server/src/wiki/obsidian-bridge.ts`
  - Detect if user has an Obsidian-compatible MCP server configured
  - One-way import: read notes via MCP tools → save to wiki/raw/
  - Filter by tag or folder (user configures which folders to import)
- [ ] Settings UI: Integration tab → "Import from Obsidian" section
  - Dropdown: select MCP server (from user's configured servers)
  - Folder/tag filter
  - Manual import button + last import timestamp
  - Status: "No Obsidian MCP detected" → link to setup guide
- [ ] Import preserves Obsidian backlinks as references in wiki articles
- [ ] Recommend popular MCP servers in Settings tooltip:
  - obsidian-mcp-server (full featured)
  - mcpvault (lightweight)
  - obsidian-sync-mcp (offline capable)

### C. Wiki Auto-Lint (Freshness Check) — ✅ DONE
- [x] `packages/server/src/wiki/linter.ts`
  - Check article freshness: `compiled_at` vs raw material modification dates
  - Flag stale articles (raw updated after last compile)
  - Detect missing source files, empty articles, uncompiled raw, untagged articles
- [x] Lint report:
  - `GET /api/wiki/:domain/lint` → returns issues
  - Web UI: LintButton in wiki panel with issue count badge + dropdown results
  - Telegram: `/wiki lint <domain>` command → sends report

### D. CodeGraph Cross-References
- [ ] When compiler generates articles, auto-detect code references:
  - Function names → link to CodeGraph nodes
  - File paths → validate existence
  - API endpoints → link to route definitions
- [ ] Article footer: "Referenced Code" section (auto-generated)
  ```markdown
  ## Referenced Code
  - `checkEntry()` in `trading/rules.ts:42` — [View in CodeGraph]
  - `getVolume()` in `trading/data.ts:18` — [View in CodeGraph]
  ```
- [ ] Lint checks these references for staleness

### E. Telegram Wiki Commands — ✅ DONE
- [x] `/wiki` — list domains (with inline keyboard buttons)
- [x] `/wiki <domain>` — show index (with article buttons + compile button)
- [x] `/wiki <domain> <article>` — read article (truncated at 2000 chars)
- [x] `/wiki compile <domain>` — trigger compilation
- [x] `/wiki search <query>` — search across default domain
- [x] `/wiki lint <domain>` — run freshness lint
- [ ] `/wiki drop` — reply to a message to save as raw material (deferred)

## Acceptance Criteria
- [ ] NM memories can graduate to wiki articles (manual trigger)
- [ ] Obsidian vault notes importable as raw material (if MCP configured)
- [ ] Lint detects stale articles and broken code references
- [ ] Articles have auto-generated code cross-references
- [ ] All wiki features accessible from Telegram
- [ ] Graduation pipeline doesn't create duplicate content

## Files Touched
- `packages/server/src/wiki/nm-bridge.ts` — new
- `packages/server/src/wiki/obsidian-bridge.ts` — new
- `packages/server/src/wiki/linter.ts` — new
- `packages/server/src/wiki/compiler.ts` — modify (code xref extraction)
- `packages/server/src/telegram/commands/wiki.ts` — new
- `packages/server/src/routes/wiki.ts` — modify (lint endpoint)
- `packages/web/src/components/panels/wiki-panel.tsx` — modify (lint badges, NM import)
- `packages/web/src/components/settings/settings-tabs.tsx` — modify (Obsidian section)

## Dependencies
- Phase 1-3 complete (core wiki engine + UI)
- Neural Memory MCP server running
- Obsidian MCP server (optional, user-provided)
- CodeGraph indexed (for cross-references)
