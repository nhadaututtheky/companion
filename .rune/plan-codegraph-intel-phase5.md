# Phase 5: Architecture Diagrams

## Goal
Auto-generate architecture documentation from the code graph — Mermaid diagrams showing module relationships, community clusters, and data flows. Exportable as Mermaid markdown or rendered SVG.

## Tasks
- [ ] Create `codegraph/diagram-generator.ts` — generates Mermaid diagram strings:
  - `generateArchitectureDiagram(projectSlug)` — high-level community graph (boxes = clusters, arrows = cross-cluster edges)
  - `generateModuleDiagram(projectSlug, filePath)` — single file's dependency tree (2 levels deep)
  - `generateFlowDiagram(projectSlug, entrySymbol)` — execution flow from entry point (BFS, max depth 4)
- [ ] Mermaid output formats:
  - `flowchart TD` for architecture + module diagrams
  - `sequenceDiagram` for execution flows (if linear chain detected)
  - Cluster labels from Phase 2 Leiden communities
  - Edge labels show trust weight categories (strong/medium/weak)
- [ ] REST endpoints:
  - `GET /codegraph/diagram?project=slug&type=architecture` — returns Mermaid string
  - `GET /codegraph/diagram?project=slug&type=module&file=path` — module diagram
  - `GET /codegraph/diagram?project=slug&type=flow&symbol=name` — flow diagram
- [ ] MCP tool `companion_codegraph_diagram` — agent can request architecture docs
- [ ] Web UI: Add "Architecture" tab to AI Context panel
  - Render Mermaid diagrams inline (use mermaid.js or pre-rendered SVG)
  - Type selector: Architecture / Module / Flow
  - Copy Mermaid source button
- [ ] Telegram: `/architecture` command — generates and sends diagram as image
  - Use mermaid CLI or kroki.io API to render SVG → PNG

## Acceptance Criteria
- [ ] `GET /codegraph/diagram?type=architecture` returns valid Mermaid syntax
- [ ] Mermaid renders correctly in standard viewers (mermaid.live)
- [ ] Web UI shows interactive architecture diagram
- [ ] MCP tool returns diagram + text description
- [ ] Community labels appear as subgraph names in Mermaid

## Files Touched
- `packages/server/src/codegraph/diagram-generator.ts` — new
- `packages/server/src/routes/codegraph.ts` — add diagram endpoints
- `packages/server/src/mcp/tools.ts` — add MCP tool
- `packages/web/src/components/panels/ai-context-panel.tsx` — add Architecture tab
- `packages/server/src/telegram/commands/utility.ts` — add /architecture command

## Dependencies
- Phase 2 (Leiden communities for cluster labels)
- Phase 3 (impact analyzer for flow tracing)
