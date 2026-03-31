# Agent Support Engine — Architecture Brainstorm

> Deep architecture brainstorm for transforming Companion from PASSTHROUGH to INTELLIGENT MIDDLEWARE.
> Generated: 2026-03-31 | Status: BRAINSTORM (not committed to implementation)

## Executive Summary

Companion currently acts as a transparent pipe: user message -> ws-bridge.ts -> CLI stdin -> NDJSON stdout -> browser/Telegram. The only "intelligence" is:

1. `session-context.ts` — 10-line context block injected on first message
2. `session-summarizer.ts` — post-session Haiku summary stored in `session_summaries`
3. `buildSummaryInjection()` — last 3 session summaries prepended to first prompt
4. `mention-router.ts` — cross-session @mention forwarding

The Agent Support Engine (ASE) transforms Companion into an active participant that intercepts, enriches, analyzes, and learns from every message flowing through `ws-bridge.ts`.

---

## Architecture: Interception Points

The message flow in `ws-bridge.ts` has 4 key interception points:

```
USER MESSAGE IN                          CLI MESSAGE OUT
     |                                        |
     v                                        v
[1. Pre-Process]                    [3. Post-Process]
     |                                        |
     v                                        v
  sendToCLI()                       handleCLIMessage()
     |                                        |
     v                                        v
  CLI stdin  -----> Claude Code -----> CLI stdout
                                              |
                                              v
                                    [4. Result Analysis]
                                    (on handleResult)

[2. Background Workers] — run async, feed data into DB for future injections
```

**Current code locations:**

| Point | Method in ws-bridge.ts | Current behavior |
|-------|----------------------|------------------|
| 1. Pre-Process | `handleUserMessage()` → `sendToCLI()` | Wraps in NDJSON, checks @mentions |
| 2. Background | N/A | Nothing runs in background |
| 3. Post-Process | `handleAssistant()`, `handleStreamEvent()` | Forward to browsers/subscribers |
| 4. Result | `handleResult()` → `handleCLIExit()` | Persist metrics, auto-summarize |

---

## Category 1: Context Optimization Engine

### 1A. Smart Context Pre-Injection

**What**: Before each user message reaches CLI, analyze the message intent and auto-attach relevant context (file signatures, past decisions, error history) so the agent does not waste turns reading files.

**How it works**:
- New service: `packages/server/src/services/context-engine.ts`
- Intercept at `handleUserMessage()` in ws-bridge.ts (line ~719)
- Pipeline: `userMessage -> intentDetector -> relevantFilesFinder -> contextBuilder -> enrichedMessage`
- Intent detection via keyword/regex (cheap) or Haiku call (accurate):
  - "fix bug in X" -> attach X's content + recent git diff + related test file
  - "refactor Y" -> attach Y + its importers + type signatures
  - "add feature" -> attach CLAUDE.md + relevant existing patterns
- Store a `project_knowledge` table in SQLite:

```sql
CREATE TABLE project_knowledge (
  id INTEGER PRIMARY KEY,
  project_slug TEXT NOT NULL,
  file_path TEXT NOT NULL,
  knowledge_type TEXT NOT NULL, -- 'signature' | 'dependency' | 'pattern' | 'error_history'
  content TEXT NOT NULL,
  hash TEXT, -- file content hash for staleness detection
  updated_at INTEGER NOT NULL
);
```

- Context budget: max 2000 tokens injected per message (configurable per project)
- Injection format: `<ase-context type="pre-injection">...</ase-context>` so agent knows it's auto-generated

**Impact**: HIGH. Agents currently waste 2-5 turns just reading files. Pre-injection cuts that to 0 for common operations. A "fix the login bug" message that today requires the agent to Read 3-4 files before acting would arrive with those files already in context.

**Complexity**: Medium

**Dependencies**: Code Intelligence Layer (1B needs file index). Can start with simple file-matching before full AST.

---

### 1B. Compact-Aware Context Preservation

**What**: When Claude Code triggers compaction (detected via `handleSystemStatus` when `status === "compacting"`), Companion captures what matters and re-injects it post-compact, so the agent doesn't lose critical context.

**How it works**:
- Already partially exists: `identityPrompt` on `ActiveSession` and `autoReinjectOnCompact` setting
- Extend `handleSystemStatus()` in ws-bridge.ts (around line 744) to:
  1. Before compaction: snapshot the current "working set" — files being discussed, decisions made, current task
  2. After compaction (when status returns to idle): inject a `<ase-context type="post-compact">` block containing:
     - Active task description (extracted from last 3 user messages)
     - Files modified this session (already tracked in `session.state.files_modified`)
     - Key decisions from this session (run quick Haiku extraction on last 10 messages)
     - Type signatures of files being worked on (from project_knowledge cache)
- New field on `ActiveSession`: `compactSnapshot: CompactSnapshot | null`

```typescript
interface CompactSnapshot {
  activeTask: string;        // What the agent was working on
  filesInFocus: string[];    // Files being discussed/modified
  decisions: string[];       // Key decisions made so far
  typeSignatures: string;    // Relevant type sigs for files in focus
  capturedAt: number;
}
```

**Impact**: HIGH. Compaction is the #1 reason agents lose effectiveness mid-session. Currently `identityPrompt` re-injection is a static string. This makes it dynamic and contextual.

**Complexity**: Medium

**Dependencies**: Session message history (already exists in `sessionMessages` table). Haiku API (already exists via `ai-client.ts`).

---

### 1C. Project Knowledge Graph

**What**: Maintain a lightweight, always-fresh index of the project's code structure — file tree, exports, imports, function signatures — so any service can quickly answer "what files relate to X?"

**How it works**:
- New service: `packages/server/src/services/knowledge-graph.ts`
- New table:

```sql
CREATE TABLE code_index (
  id INTEGER PRIMARY KEY,
  project_slug TEXT NOT NULL,
  file_path TEXT NOT NULL,
  symbol_name TEXT,           -- function/class/type name
  symbol_type TEXT,           -- 'function' | 'class' | 'type' | 'export' | 'import'
  signature TEXT,             -- e.g. "function foo(a: string, b: number): Promise<Result>"
  imports_from TEXT,          -- JSON array of file paths this file imports
  imported_by TEXT,           -- JSON array of file paths that import this file
  file_hash TEXT NOT NULL,    -- SHA256 of file content for staleness
  line_start INTEGER,
  line_end INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_code_index_project ON code_index(project_slug);
CREATE INDEX idx_code_index_symbol ON code_index(symbol_name);
CREATE INDEX idx_code_index_path ON code_index(file_path);
```

- Indexing triggers:
  1. On project creation/update — full scan
  2. On session end — incremental re-index of `files_modified` and `files_created`
  3. Background periodic scan (every 30 min) via `setInterval`
- Parser strategy (incremental complexity):
  - **Phase 1**: Regex-based extraction of TypeScript exports/imports/function signatures. Fast, works in Bun, no native deps.
  - **Phase 2**: `@swc/core` (Rust-based, Bun-compatible) for AST parsing. More accurate, handles re-exports.
  - **Phase 3**: Tree-sitter via WASM (multi-language support: Python, Go, Rust).
- Query API: `getRelevantFiles(projectSlug, query)` returns ranked files + their signatures

**Impact**: VERY HIGH. This is the foundation for everything else — context injection, impact analysis, smart routing all depend on knowing what's in the codebase.

**Complexity**: High (but can be phased — regex-only Phase 1 is Medium)

**Dependencies**: Project profiles (already exist in `projects` table with `dir` field).

---

## Category 2: Code Intelligence Layer

### 2A. Dependency Graph & Impact Analysis

**What**: Track import/export relationships so Companion can warn "changing X will affect Y and Z" before the agent starts work.

**How it works**:
- Built on top of `code_index` table from 1C
- New function in `knowledge-graph.ts`:

```typescript
function getImpactRadius(
  projectSlug: string,
  filePath: string,
  depth: number = 2
): { directDependents: string[]; transitiveDependents: string[]; testFiles: string[] }
```

- Walk the `imported_by` graph up to `depth` levels
- Special handling: detect test files (match `*.test.ts`, `*.spec.ts`, `__tests__/*`)
- Inject as context: "WARNING: 5 files import from utils/auth.ts. Changes here may break: [list]"
- Also useful for post-processing: after agent modifies a file, suggest "you should also check [dependents]"

**Impact**: MEDIUM-HIGH. Prevents the classic "changed one file, broke three others" pattern.

**Complexity**: Low (once knowledge graph exists)

**Dependencies**: Knowledge Graph (1C)

---

### 2B. Git History Intelligence

**What**: Analyze git history to give agents context about file stability, recent changes, and patterns.

**How it works**:
- New service: `packages/server/src/services/git-intel.ts`
- Uses `Bun.spawn(["git", ...])` in project directory
- Cached queries (refresh on session start):

```typescript
interface GitIntel {
  // Per-file metrics
  getFileHistory(projectDir: string, filePath: string): {
    lastModified: Date;
    changeFrequency: number;   // commits in last 30 days
    recentAuthors: string[];
    lastCommitMessage: string;
    isHotspot: boolean;        // changed >5 times in 30 days
  };
  
  // Project-level
  getRecentChanges(projectDir: string, days: number): {
    filePath: string;
    changeCount: number;
    lastMessage: string;
  }[];
  
  // Blame-aware context
  getRecentDiffContext(projectDir: string, filePath: string): string;
}
```

- Injection use cases:
  - "This file was modified 3 times in the last week — it's a hotspot, be extra careful"
  - "Last change to this file: 'fix: auth token expiry' — related to your current task?"
  - On session start: "Recent project activity: [last 5 commits with messages]"

**Impact**: MEDIUM. Gives agents temporal awareness they completely lack today.

**Complexity**: Low

**Dependencies**: Git installed (always true for code projects). No other ASE deps.

---

### 2C. Type Signature Extraction

**What**: Extract and cache function/type signatures so agents get a "map" of the codebase without reading full files.

**How it works**:
- Part of Knowledge Graph (1C), but specifically the signature extraction
- For TypeScript: regex or SWC to extract:
  - `export function name(params): returnType`
  - `export interface Name { ... }` (compact form)
  - `export type Name = ...`
  - `export class Name extends/implements ...`
- Compact representation: 50-100 tokens per file vs 500-2000 for full file
- Injection format example:

```
<ase-context type="type-map" files="3">
// packages/server/src/services/session-store.ts
export function createActiveSession(id: string, initialState: SessionState): ActiveSession
export function getActiveSession(id: string): ActiveSession | undefined
export function persistSession(activeSession: ActiveSession): void
export function createSessionRecord(opts: {...}): string
export function endSessionRecord(id: string, status?: SessionStatus): void

// packages/shared/src/types/session.ts  
export type SessionStatus = "starting" | "connected" | "idle" | "busy" | ...
export interface SessionState { session_id: string; model: string; ... }
</ase-context>
```

**Impact**: HIGH. Agents spend enormous amounts of tokens reading files just to understand interfaces. A type map gives them 80% of the understanding at 10% of the token cost.

**Complexity**: Medium (regex Phase 1), High (AST Phase 2)

**Dependencies**: Knowledge Graph (1C)

---

## Category 3: Agent Coordination / Multi-Agent

### 3A. Worker/Supervisor Pattern

**What**: Allow a session to spawn lightweight "worker" sub-sessions for specific tasks, collect results, and continue. The supervisor stays alive; workers are ephemeral.

**How it works**:
- Extend `ws-bridge.ts` `startSession()` to accept `parentId` (already in schema!) and `workerConfig`:

```typescript
interface WorkerConfig {
  /** Task for the worker — injected as first prompt */
  task: string;
  /** Model for worker (default: haiku for cheap tasks) */
  model?: string;
  /** Max turns before auto-kill */
  maxTurns?: number;
  /** Max cost before auto-kill */
  maxCostUsd?: number;
  /** Callback session ID to receive results */
  callbackSessionId: string;
}
```

- New route: `POST /api/sessions/:id/spawn-worker`
- Worker lifecycle:
  1. Supervisor sends "spawn worker for task X"
  2. Companion creates child session with `parentId` set
  3. Worker runs with injected task + relevant context from parent
  4. On worker `handleResult()`, extract the result text
  5. Inject result back into supervisor's stdin as `<worker-result task="X">...</worker-result>`
  6. Worker session auto-kills
- Use cases:
  - "Read all test files and summarize coverage" — spawn Haiku worker
  - "Check if this change breaks any imports" — spawn Haiku worker with dependency graph
  - "Review this diff for security issues" — spawn Sonnet worker

**Impact**: VERY HIGH. This is the foundation for intelligent multi-agent workflows. Currently Companion can run parallel sessions but they can't coordinate.

**Complexity**: Medium (the `parentId` and session machinery already exist, need worker lifecycle + result routing)

**Dependencies**: None (can work without knowledge graph, but much better with it)

---

### 3B. Cross-Session Knowledge Bus

**What**: When one session discovers something important (a pattern, a bug, a decision), broadcast it to other active sessions working on the same project.

**How it works**:
- New service: `packages/server/src/services/knowledge-bus.ts`
- New table:

```sql
CREATE TABLE project_insights (
  id INTEGER PRIMARY KEY,
  project_slug TEXT NOT NULL,
  session_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,  -- 'pattern' | 'bug' | 'decision' | 'warning' | 'discovery'
  content TEXT NOT NULL,
  file_paths TEXT,             -- JSON array of related files
  confidence REAL DEFAULT 0.5,
  expires_at INTEGER,          -- TTL for temporary insights
  created_at INTEGER NOT NULL
);
```

- Detection: analyze `handleAssistant()` output for patterns:
  - Agent says "I found a bug in X" -> extract and store
  - Agent says "I decided to use pattern Y because Z" -> extract and store
  - Agent creates a new shared type/interface -> notify other sessions
- Injection: when a session sends a message mentioning a file that has insights, attach them:
  - "NOTE from session 'fox': there's a known bug in auth.ts line 45 — off-by-one in token expiry check"
- Lightweight: use regex pattern matching on assistant output, not full AI analysis (save costs)

**Impact**: MEDIUM-HIGH. Prevents duplicate work and conflicting changes across sessions.

**Complexity**: Medium

**Dependencies**: Mention router (already exists for basic cross-session comms)

---

### 3C. Specialized Agent Roles via Templates

**What**: Pre-configured session templates with role-specific system prompts, tool permissions, and context injection — so spawning a "reviewer" or "tester" is one click.

**How it works**:
- Already partially exists: `sessionTemplates` table in schema.ts
- Extend template system with role-specific context injection:

```typescript
interface AgentRole {
  slug: string;           // 'reviewer' | 'tester' | 'debugger' | 'architect' | 'security'
  systemPrompt: string;   // Role-specific instructions
  model: string;          // Recommended model tier
  permissionMode: string; // e.g. tester needs bash, reviewer doesn't
  contextInjection: {
    includeTypeMap: boolean;
    includeGitHistory: boolean;
    includeDependencyGraph: boolean;
    includeRecentInsights: boolean;
    customContext?: string;
  };
  maxTurns?: number;
  maxCostUsd?: number;
}
```

- Built-in roles:
  - **Reviewer**: Sonnet, read-only permissions, inject type map + dependency graph + diff
  - **Tester**: Sonnet, bash allowed, inject test file patterns + coverage data
  - **Debugger**: Opus, full permissions, inject error history + git blame + stack traces
  - **Architect**: Opus, read-only, inject full type map + dependency graph + project structure
  - **Security Auditor**: Opus, read-only, inject known vulnerability patterns + dependency audit

**Impact**: MEDIUM. Reduces friction for multi-agent workflows. Combined with 3A (workers), enables one-command "review my changes."

**Complexity**: Low (mostly template data + UI, the infrastructure exists)

**Dependencies**: Template system (exists). Better with Knowledge Graph (1C) for context injection.

---

## Category 4: Quality Feedback Loop

### 4A. Code Acceptance Tracker

**What**: Track whether code generated by agents was accepted (kept), modified, or reverted — building a quality signal over time.

**How it works**:
- New table:

```sql
CREATE TABLE code_outcomes (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  file_path TEXT NOT NULL,
  action TEXT NOT NULL,        -- 'created' | 'modified' | 'deleted'
  lines_added INTEGER,
  lines_removed INTEGER,
  outcome TEXT,                -- 'accepted' | 'modified_later' | 'reverted' | 'unknown'
  outcome_detected_at INTEGER,
  session_model TEXT,          -- which model generated this
  created_at INTEGER NOT NULL
);
```

- Detection pipeline:
  1. On session end: record all `files_modified` and `files_created` with their git diff hashes
  2. Background job (runs hourly): check git log for those files
     - File unchanged since session -> `accepted`
     - File modified by a later session/manual edit -> `modified_later`  
     - File reverted (git revert or content matches pre-session state) -> `reverted`
  3. Aggregate per-project: "Model X has 85% acceptance rate on this project"
- Injection: "Historical note: code generated for auth.ts has been modified 3 out of 4 times — pay extra attention to edge cases"

**Impact**: MEDIUM. Long-term quality improvement. The real value is the data — enables model routing decisions.

**Complexity**: Medium

**Dependencies**: Git Intel (2B) for history analysis.

---

### 4B. Pattern Library (Project-Specific)

**What**: Extract and store recurring code patterns from a project so agents automatically follow project conventions.

**How it works**:
- New table:

```sql
CREATE TABLE project_patterns (
  id INTEGER PRIMARY KEY,
  project_slug TEXT NOT NULL,
  pattern_name TEXT NOT NULL,
  description TEXT NOT NULL,
  example_code TEXT,
  file_paths TEXT,             -- JSON: where this pattern is used
  frequency INTEGER DEFAULT 1, -- how many times detected
  source TEXT,                 -- 'auto_detected' | 'user_defined' | 'review_feedback'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- Detection sources:
  1. **Auto-detection**: After N sessions on a project, run Haiku analysis on stored messages:
     "What coding patterns does this project consistently use? (error handling, API response format, state management, etc.)"
  2. **User-defined**: Admin can manually add patterns via API/UI
  3. **Review feedback**: When a reviewer session says "in this project we always use X", extract as pattern
- Injection: when user asks to create something, inject relevant patterns:
  "Project convention: API routes use Zod validation + Hono middleware. Error responses follow ApiResponse<T> shape. See packages/server/src/routes/sessions.ts for reference."

**Impact**: MEDIUM-HIGH. Eliminates the #1 complaint: "the agent keeps writing code that doesn't match our style."

**Complexity**: Medium

**Dependencies**: Session messages (exists). AI client (exists).

---

### 4C. Error Pattern Memory

**What**: When an agent's code causes errors (build failures, test failures, runtime errors), store the pattern so future sessions avoid the same mistake.

**How it works**:
- New table:

```sql
CREATE TABLE error_patterns (
  id INTEGER PRIMARY KEY,
  project_slug TEXT NOT NULL,
  error_type TEXT NOT NULL,     -- 'build' | 'test' | 'runtime' | 'lint'
  error_message TEXT NOT NULL,
  root_cause TEXT,
  fix_description TEXT,
  file_paths TEXT,              -- JSON array
  occurrences INTEGER DEFAULT 1,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

- Detection: monitor `handleResult()` for `subtype: "error_during_execution"` — parse error messages
- Also: if agent runs tsc/eslint and gets errors, extract from tool output in `handleAssistant()`
- Store: error message + which files + what the fix was (if agent fixed it in same session)
- Injection: before sending message to agent, check if mentioned files have error history:
  "WARNING: Previous sessions hit 'TypeError: Cannot read properties of undefined' in session-store.ts when accessing session.state without null check. Ensure defensive coding."

**Impact**: MEDIUM. Prevents repeated mistakes — especially valuable for complex projects.

**Complexity**: Low-Medium

**Dependencies**: Result messages (already parsed in ws-bridge.ts).

---

## Category 5: Smart Message Pipeline

### 5A. Intent Detection & Context Router

**What**: Classify each user message by intent, then attach the right context automatically.

**How it works**:
- New service: `packages/server/src/services/intent-detector.ts`
- Classification (cheapest first):

```typescript
type MessageIntent = 
  | 'bug_fix'      // "fix", "bug", "error", "broken", "crash"
  | 'refactor'     // "refactor", "clean up", "reorganize", "extract"
  | 'new_feature'  // "add", "create", "implement", "build"
  | 'question'     // "what", "how", "why", "explain", "where"
  | 'review'       // "review", "check", "audit", "look at"
  | 'test'         // "test", "coverage", "spec", "e2e"
  | 'general';     // fallback

function detectIntent(message: string): MessageIntent {
  // Phase 1: keyword matching (free, instant)
  // Phase 2: Haiku classification (if ambiguous)
}
```

- Context routing rules:

| Intent | Auto-Inject |
|--------|------------|
| bug_fix | Error history + git blame + recent diffs + test files |
| refactor | Type map + dependency graph + impact radius |
| new_feature | Project patterns + CLAUDE.md + similar existing code |
| question | Type map + project structure overview |
| review | Full diff + dependency graph + security patterns |
| test | Existing test patterns + coverage data + test config |

- Budget: each intent has a max token budget for injected context (configurable)

**Impact**: HIGH. This is the "brain" that makes all other services useful. Without intent detection, you can't decide what context to inject.

**Complexity**: Low (keyword phase), Medium (Haiku phase)

**Dependencies**: All other services feed into this. But keyword-only version works standalone.

---

### 5B. Post-Processing Verification

**What**: After the agent generates code, automatically run verification (tsc, lint, tests) and inject results back before the user even asks.

**How it works**:
- Intercept at `handleResult()` in ws-bridge.ts — when a result arrives with `subtype: "success"`:
  1. Check `session.state.files_modified` — any .ts/.tsx files changed?
  2. Spawn background verification:
     ```bash
     # In project directory
     npx tsc --noEmit 2>&1 | head -50
     npx eslint {changed_files} 2>&1 | head -30
     ```
  3. If errors found, inject as follow-up message to CLI:
     "Auto-verification detected issues: [errors]. Please fix before proceeding."
  4. If clean, inject: "Auto-verification passed (tsc + eslint clean)."
- Use `Bun.spawn()` with timeout (30s max) to avoid blocking
- Configurable per project: `projects.env_vars` can include `ASE_AUTO_VERIFY=tsc,eslint,test`

**Impact**: HIGH. Catches errors immediately instead of waiting for the user to discover them 5 turns later.

**Complexity**: Medium

**Dependencies**: Project profiles (for knowing which tools to run). Can work standalone.

---

### 5C. Diff Analysis & Drift Detection

**What**: After each agent turn, analyze what actually changed vs what was asked, and flag drift.

**How it works**:
- On `handleResult()`, compare:
  1. Last user message intent (from 5A)
  2. Files actually modified (from `session.state.files_modified`)
  3. Lines added/removed ratio
- Flag conditions:
  - Agent modified files not mentioned in the request -> "DRIFT: agent also modified X — was this intended?"
  - Agent added >200 lines for a "small fix" request -> "SCOPE: large change for a targeted request"
  - Agent didn't modify the file mentioned in request -> "MISS: user asked about X but agent didn't touch it"
- Surface as `BrowserIncomingMessage` type `ase_alert` to web UI (non-blocking notification)

**Impact**: MEDIUM. Helps users catch when agents go off track, which is common with complex requests.

**Complexity**: Low

**Dependencies**: Intent detector (5A) for comparison. Can work with simple heuristics without it.

---

## Category 6: Intelligent Model Routing

### 6A. Auto-Tier Selection

**What**: Automatically select the optimal model tier (Haiku/Sonnet/Opus) based on task complexity, instead of the user choosing manually.

**How it works**:
- New service: `packages/server/src/services/model-router.ts`
- Decision tree:

```typescript
function selectModel(
  message: string,
  intent: MessageIntent,
  projectComplexity: number,  // from code_index: file count, avg file size
  sessionHistory: number,     // turns so far
): { model: string; reason: string } {
  
  // Rule 1: Short questions -> Haiku
  if (intent === 'question' && message.length < 200) {
    return { model: 'claude-haiku-4-5', reason: 'Simple question' };
  }
  
  // Rule 2: Architecture/design mentions -> Opus
  if (intent === 'new_feature' && projectComplexity > 50) {
    return { model: 'claude-opus-4-6', reason: 'Complex feature in large codebase' };
  }
  
  // Rule 3: Bug fixes in danger zones -> Opus
  if (intent === 'bug_fix' && isDangerZone(fileMentioned)) {
    return { model: 'claude-opus-4-6', reason: 'Bug in critical path' };
  }
  
  // Rule 4: Multi-file refactors -> Sonnet (good balance)
  if (intent === 'refactor' && estimatedFileCount > 3) {
    return { model: 'claude-sonnet-4-6', reason: 'Multi-file refactor' };
  }
  
  // Default: Sonnet
  return { model: 'claude-sonnet-4-6', reason: 'Default coding model' };
}
```

- Integration: when `startSession()` is called without explicit model, or when user sends message and model could be optimized
- UI: show the routing reason in web dashboard ("Model: Sonnet - auto-selected for bug fix")
- Override: user can always pin a model manually

**Impact**: MEDIUM. Cost savings (Haiku is 12x cheaper than Sonnet) + quality improvement (Opus for hard tasks).

**Complexity**: Low

**Dependencies**: Intent detector (5A). Project complexity from Knowledge Graph (1C). Works with simple heuristics alone.

---

### 6B. Mid-Session Model Switching

**What**: Detect when a session's complexity changes mid-conversation and suggest (or auto-switch) model tier.

**How it works**:
- Monitor signals in `handleAssistant()`:
  - Agent is struggling (multiple failed tool calls, repeated reads of same file) -> suggest Opus upgrade
  - Agent completed complex part, now doing simple cleanup -> suggest Haiku downgrade
  - Context usage >70% (from `context_update` messages) -> suggest more efficient model
- Implementation: new method `evaluateModelFit()` called on each `handleResult()`:

```typescript
function evaluateModelFit(session: ActiveSession): ModelSuggestion | null {
  const { num_turns, total_cost_usd, files_modified, files_read } = session.state;
  
  // High read:write ratio = agent is exploring, not producing -> maybe wrong model
  const readWriteRatio = files_read.length / Math.max(files_modified.length, 1);
  
  // Many turns with few modifications = struggling
  if (num_turns > 10 && files_modified.length < 2 && readWriteRatio > 5) {
    return { suggestedModel: 'opus', reason: 'Agent appears to be exploring extensively — Opus may resolve faster' };
  }
  
  return null;
}
```

- Surface as notification in web UI, not auto-applied (user decides)

**Impact**: LOW-MEDIUM. Nice optimization but not critical.

**Complexity**: Low

**Dependencies**: Session state metrics (already tracked).

---

## Implementation Priority Matrix

| # | Feature | Impact | Complexity | Dependencies | Priority |
|---|---------|--------|-----------|--------------|----------|
| 2B | Git History Intelligence | MEDIUM | Low | None | **P0 — Start here** |
| 5A | Intent Detection (keyword) | HIGH | Low | None | **P0 — Start here** |
| 1A | Smart Context Pre-Injection | HIGH | Medium | 5A | **P1** |
| 5B | Post-Processing Verification | HIGH | Medium | None | **P1** |
| 1C | Project Knowledge Graph (regex) | VERY HIGH | Medium | None | **P1** |
| 1B | Compact-Aware Preservation | HIGH | Medium | Haiku API | **P1** |
| 3A | Worker/Supervisor Pattern | VERY HIGH | Medium | None | **P2** |
| 2A | Dependency Graph | MED-HIGH | Low | 1C | **P2** |
| 2C | Type Signature Extraction | HIGH | Medium | 1C | **P2** |
| 4B | Pattern Library | MED-HIGH | Medium | AI client | **P2** |
| 4C | Error Pattern Memory | MEDIUM | Low-Med | None | **P2** |
| 3B | Cross-Session Knowledge Bus | MED-HIGH | Medium | 3A | **P3** |
| 3C | Specialized Agent Roles | MEDIUM | Low | Templates | **P3** |
| 4A | Code Acceptance Tracker | MEDIUM | Medium | 2B | **P3** |
| 6A | Auto-Tier Selection | MEDIUM | Low | 5A | **P3** |
| 5C | Diff Drift Detection | MEDIUM | Low | 5A | **P3** |
| 6B | Mid-Session Model Switch | LOW-MED | Low | None | **P4** |

---

## Phased Implementation Plan

### Phase 1: Foundation (1-2 weeks)
**Goal**: Basic intelligence with zero external deps.

- **Git Intel (2B)**: `git log`, `git blame` wrappers. Inject recent changes on session start.
- **Intent Detector (5A)**: Keyword-based classification. Route context decisions.
- **Post-Verify (5B)**: Run `tsc --noEmit` after agent edits .ts files. Inject errors back.
- DB migrations: `project_knowledge` table.

**Deliverable**: Agent gets recent git context on start, errors auto-detected after each turn.

### Phase 2: Context Engine (2-3 weeks)
**Goal**: Agents stop wasting turns reading files.

- **Knowledge Graph (1C)**: Regex-based TS export/import parser. Build file index.
- **Type Map (2C)**: Extract signatures, serve as compact context.
- **Smart Injection (1A)**: Combine intent + type map + git intel into pre-injection.
- **Compact Preservation (1B)**: Snapshot before compact, re-inject after.

**Deliverable**: Each user message arrives with relevant context pre-attached.

### Phase 3: Multi-Agent (2-3 weeks)
**Goal**: Sessions can spawn workers and share knowledge.

- **Worker Pattern (3A)**: Spawn/collect/inject worker results.
- **Dependency Graph (2A)**: Impact analysis from knowledge graph.
- **Knowledge Bus (3B)**: Cross-session insight sharing.
- **Error Memory (4C)**: Store and inject error patterns.

**Deliverable**: "Spawn a reviewer for my changes" works end-to-end.

### Phase 4: Learning & Optimization (2-3 weeks)
**Goal**: System gets smarter over time.

- **Pattern Library (4B)**: Auto-detect and inject project conventions.
- **Acceptance Tracker (4A)**: Track code quality outcomes.
- **Model Router (6A)**: Auto-select optimal model tier.
- **Agent Roles (3C)**: Pre-built templates for common roles.

**Deliverable**: Companion learns project patterns and routes to optimal models.

---

## Data Flow Diagram (Final State)

```
User Message
    |
    v
[Intent Detector] --> intent: bug_fix
    |
    v
[Context Router] --> decides: need git_blame + error_history + type_map
    |
    +---> [Git Intel] --> recent diffs for mentioned file
    +---> [Error Memory] --> past errors in this file  
    +---> [Knowledge Graph] --> type signatures + dependencies
    +---> [Pattern Library] --> project conventions
    +---> [Knowledge Bus] --> insights from other sessions
    |
    v
[Context Builder] --> assemble <ase-context> block (max 2000 tokens)
    |
    v
[Enriched Message] = original + <ase-context>
    |
    v
  sendToCLI()
    |
    v
  Claude Code CLI
    |
    v
  NDJSON Response
    |
    v
[Post-Processor]
    +---> [Verification] --> tsc, eslint, test (background)
    +---> [Drift Detector] --> compare intent vs actual changes
    +---> [Insight Extractor] --> detect decisions/bugs/patterns
    +---> [Acceptance Tracker] --> record what was changed
    |
    v
  Browser / Telegram
```

---

## Key Design Decisions

1. **SQLite over external DB**: All new tables in existing Drizzle/SQLite. No new infrastructure. Companion is self-hosted Docker — keep it simple.

2. **Regex before AST**: Start with regex parsing for TypeScript. It covers 80% of cases. SWC/tree-sitter can come later.

3. **Token budgets on everything**: Every injection has a max token budget. Context window is precious. Default 2000 tokens for pre-injection, 500 for post-compact.

4. **Haiku for analysis, Sonnet for coding**: All ASE internal AI calls (intent detection, pattern extraction, summarization) use Haiku tier via existing `ai-client.ts`. The coding agent uses whatever model the user selected.

5. **Non-blocking always**: All ASE processing is async. Never delay the message from reaching CLI. Pre-injection is the exception — it adds ~100ms for keyword matching, or ~1-2s if Haiku is called.

6. **Graceful degradation**: Every ASE feature is independently toggleable. If knowledge graph is empty, skip injection. If AI client is not configured, skip Haiku-dependent features. The system should never break the passthrough flow.

---

## New Files to Create

```
packages/server/src/services/
  context-engine.ts      -- Orchestrates all context injection (1A)
  knowledge-graph.ts     -- Code index + dependency graph (1C, 2A, 2C)
  git-intel.ts           -- Git history analysis (2B)
  intent-detector.ts     -- Message classification (5A)
  model-router.ts        -- Auto model selection (6A)
  knowledge-bus.ts       -- Cross-session insight sharing (3B)
  post-verify.ts         -- Auto-verification after edits (5B)
  error-memory.ts        -- Error pattern storage (4C)
  pattern-library.ts     -- Project convention detection (4B)
  code-tracker.ts        -- Code acceptance tracking (4A)

packages/server/src/db/
  schema.ts              -- Add 4 new tables (extend existing)

packages/server/src/routes/
  ase.ts                 -- API routes for ASE config/status
```

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Context injection confuses the agent | Use clear XML tags (`<ase-context>`), test with real sessions |
| Token budget overflow | Hard caps per injection type, total cap per message |
| Stale knowledge graph | Hash-based staleness detection, re-index on session end |
| AI client costs for Haiku calls | Budget tracking per ASE feature, disable if over threshold |
| Performance: pre-injection latency | Keyword intent is <1ms. Haiku call adds ~1-2s but only for ambiguous messages |
| SQLite write contention | WAL mode (already configured). Knowledge graph writes are batched |
