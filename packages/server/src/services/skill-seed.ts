/**
 * First-run seeding of default harness skills into `.claude/skills/`.
 *
 * Skill files are checked into the repo for normal projects, but for fresh
 * projects (or when the user has a custom CWD) Companion writes the three
 * starter skills lazily on server startup. Subsequent runs detect existing
 * files and skip — never overwrites user edits.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger.js";

const log = createLogger("skill-seed");

interface DefaultSkill {
  filename: string;
  body: string;
}

const COMPANION_IMPACT_MD = `---
id: companion-impact
name: Impact Analysis
description: Use BEFORE editing a file to discover what else depends on it
priority: 8
triggers:
  - "impact of changing"
  - "what depends on"
  - "if I edit"
  - "if I change"
  - "before changing"
  - "blast radius"
  - "ripple effect"
  - "what calls"
  - "who imports"
tools:
  - companion_codegraph_impact
  - companion_explain
---

# Impact Analysis

Before modifying any file with exports used elsewhere, query the code
graph to find reverse dependencies. Saves accidental breakage of callers
you didn't notice.

## When to use

The user mentions changing a file, or you (the agent) are about to write
an edit that touches an exported symbol. Examples:

- "If I change the signature of \`startSession\`, what breaks?"
- "Refactor \`auth.ts\` — but check what depends on it first"
- Agent self-check before the first Edit tool call on a non-trivial file.

## Tools

- \`companion_codegraph_impact\` — Reverse dependencies + risk scores +
  related wiki articles. Single call, ~500ms.
- \`companion_explain\` — Wider context: documentation + dependedOnBy +
  impact radius in one response.

## Output handling

The result is JSON; cite the top 3 reverse dependents in your reasoning
before editing. If the impact list is empty AND the file has no exports,
proceed without further checks.
`;

const COMPANION_KNOWLEDGE_MD = `---
id: companion-knowledge
name: Project Knowledge Base
description: Search the wiki for documented decisions, patterns, and known issues
priority: 7
triggers:
  - "how does"
  - "why is"
  - "where is documented"
  - "explain architecture"
  - "what is the pattern"
  - "is there a known"
  - "documented somewhere"
  - "decision record"
  - "ADR"
tools:
  - companion_wiki_search
  - companion_wiki_read
  - companion_wiki_note
---

# Project Knowledge Base

The wiki holds documented architecture, ADRs, known issues, and runbooks.
Querying it BEFORE writing code surfaces decisions already made and
patterns already established.

## When to use

- User asks "how does X work" or "why was X done this way"
- You're about to introduce a pattern (caching, retry, queue) — check if
  the project already has one
- A bug looks like a known issue — search before reporting

## Tools

- \`companion_wiki_search\` — Returns ranked articles + related code symbols
  in one call. Fast, broad.
- \`companion_wiki_read\` — Full article body by slug. Use after search
  when an entry looks relevant.
- \`companion_wiki_note\` — Save a discovery, decision, or pattern back
  into the wiki for future sessions. 1-3 paragraphs max.

## Save discipline

When you discover a non-obvious pattern, save it via \`companion_wiki_note\`
rather than only mentioning it in chat — the next session will benefit.
`;

const COMPANION_ASK_MD = `---
id: companion-ask
name: Ask the Project
description: One-shot question routed to wiki + code graph + RTK compress
priority: 9
triggers:
  - "explain"
  - "what does"
  - "how does"
  - "where is"
  - "tell me about"
  - "ask the project"
  - "summarise"
  - "summarize"
  - "give me an overview"
tools:
  - companion_ask
---

# Ask the Project

When you have a natural-language question about this project — about a
concept, a flow, a file's role — call \`companion_ask\` ONCE instead of
chaining wiki_search + codegraph_impact + read manually.

## When to use

- "How does the session lifecycle work?"
- "Where is the auth flow documented?"
- "Summarise what \`startSessionWithSdk\` does."

The tool fans out to wiki + code graph in parallel, ranks the matches,
folds the answer to a token budget, and returns one structured payload
with cited sources. Cite the sources back to the user before acting.

## When NOT to use

- You already have the answer in conversation history.
- The question is trivially Bash/Read-able (e.g., "show me the file").
- You want the raw wiki article — use \`companion_wiki_read\` instead.
`;

const COMPANION_EXPLORE_MD = `---
id: companion-explore
name: File Context Explorer
description: Get the full role of a file (docs + reverse deps + impact) in one call
priority: 6
triggers:
  - "what does this file do"
  - "explain this file"
  - "role of"
  - "tell me about"
  - "context for"
  - "purpose of"
  - "how is X used"
  - "what's in"
tools:
  - companion_explain
---

# File Context Explorer

When you encounter a file you have not seen, or the user asks about a
specific module, fetch unified context in one MCP call instead of
chaining grep + read + cross-reference manually.

## When to use

- First time touching a file in this session
- User points at a file and asks for an overview
- About to do a non-trivial edit and you want the full picture

## Tool

- \`companion_explain\` — Returns three views in one response:
  - \`documentation\` — wiki articles related to the file's domain
  - \`dependedOnBy\` — modules that import / reference this file
  - \`impactRadius\` — what changes here propagate to

## When NOT to use

- Trivial files (constants, types-only) — overkill, use Read instead
- File you already analyzed earlier in this session — context already
  in your message history
`;

const DEFAULT_SKILLS: DefaultSkill[] = [
  { filename: "companion-impact.md", body: COMPANION_IMPACT_MD },
  { filename: "companion-knowledge.md", body: COMPANION_KNOWLEDGE_MD },
  { filename: "companion-explore.md", body: COMPANION_EXPLORE_MD },
  { filename: "companion-ask.md", body: COMPANION_ASK_MD },
];

/**
 * Sentinels that mark `projectDir` as a real project. We REFUSE to seed
 * skills into directories that look like the OS root, the user's home,
 * or any random scratch path the agent might receive — that would litter
 * unrelated trees with `.claude/skills/`.
 */
const PROJECT_SENTINELS = [
  ".git",
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  "deno.json",
  "tsconfig.json",
];

function looksLikeProject(projectDir: string): boolean {
  return PROJECT_SENTINELS.some((s) => existsSync(join(projectDir, s)));
}

/**
 * Write default harness skills into `<projectDir>/.claude/skills/` if missing.
 *
 * Guards:
 *   - Project sentinel REQUIRED (refuses to write into `/`, `~`, `/etc`, etc.)
 *   - Existing files are never overwritten — user edits are sacred
 *   - Atomic create via `flag: "wx"` so concurrent callers don't double-write
 *
 * Returns the list of filenames that were written this call.
 */
export function seedDefaultHarnessSkills(projectDir: string): string[] {
  if (!looksLikeProject(projectDir)) {
    log.debug("Refusing to seed skills — projectDir lacks project sentinel", { projectDir });
    return [];
  }

  const dir = join(projectDir, ".claude", "skills");
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      log.warn("Failed to create .claude/skills directory", { dir, error: String(err) });
      return [];
    }
  }

  const written: string[] = [];
  for (const { filename, body } of DEFAULT_SKILLS) {
    const target = join(dir, filename);
    try {
      // `wx` = write-exclusive. Throws EEXIST on race (then we treat the
      // existing file as authoritative — never clobber user edits).
      writeFileSync(target, body, { encoding: "utf-8", flag: "wx" });
      written.push(filename);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") continue;
      log.warn("Failed to seed default skill", { target, error: String(err) });
    }
  }

  if (written.length > 0) {
    log.info("Seeded default harness skills", { dir, written });
  }
  return written;
}
