/**
 * Unit tests for skill-loader — frontmatter parsing + filesystem scan.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHarnessSkills, _internals } from "./skill-loader.js";

const { parseHarnessFrontmatter } = _internals;

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "harness-skill-test-"));
  mkdirSync(join(tmp, ".claude", "skills"), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeSkill(name: string, body: string): string {
  const filePath = join(tmp, ".claude", "skills", name);
  writeFileSync(filePath, body, "utf-8");
  return filePath;
}

describe("parseHarnessFrontmatter", () => {
  it("parses string fields and array fields", () => {
    const raw = `---
id: foo
name: Foo
description: A foo skill
priority: 7
triggers:
  - "first phrase"
  - "second phrase"
tools:
  - tool_a
  - tool_b
---

Body content here.
`;
    const { fm, errors } = parseHarnessFrontmatter(raw);
    expect(errors).toEqual([]);
    expect(fm).not.toBeNull();
    expect(fm?.id).toBe("foo");
    expect(fm?.name).toBe("Foo");
    expect(fm?.priority).toBe(7);
    expect(fm?.triggers).toEqual(["first phrase", "second phrase"]);
    expect(fm?.tools).toEqual(["tool_a", "tool_b"]);
  });

  it("strips quotes from inline values", () => {
    const raw = `---
id: bar
name: "Bar Skill"
description: 'quoted'
triggers:
  - "x"
tools:
  - t
---
`;
    const { fm } = parseHarnessFrontmatter(raw);
    expect(fm?.name).toBe("Bar Skill");
    expect(fm?.description).toBe("quoted");
  });

  it("rejects when triggers array is empty", () => {
    const raw = `---
id: foo
name: Foo
description: x
triggers:
tools:
  - t
---
`;
    const { fm, errors } = parseHarnessFrontmatter(raw);
    expect(fm).toBeNull();
    expect(errors.some((e) => e.includes("triggers"))).toBe(true);
  });

  it("rejects when frontmatter delimiter is missing", () => {
    const { fm, errors } = parseHarnessFrontmatter("# Just a heading\n");
    expect(fm).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("defaults priority to 5 when omitted", () => {
    const raw = `---
id: x
name: X
description: y
triggers:
  - z
tools:
  - t
---
`;
    const { fm } = parseHarnessFrontmatter(raw);
    expect(fm?.priority).toBe(5);
  });
});

describe("loadHarnessSkills", () => {
  it("returns empty array when skills dir missing", () => {
    const skills = loadHarnessSkills(join(tmp, "no-such-project"));
    expect(skills).toEqual([]);
  });

  it("loads valid skill files and skips invalid ones", () => {
    writeSkill(
      "valid.md",
      `---
id: valid
name: Valid
description: ok
priority: 5
triggers:
  - "phrase"
tools:
  - tool_a
---

Body.
`,
    );

    writeSkill(
      "invalid.md",
      `---
id: bad
name: Bad
description: missing tools
triggers:
  - "x"
---
`,
    );

    writeSkill("plain.md", "# Just a plain markdown file, not a skill\n");

    const skills = loadHarnessSkills(tmp);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.id).toBe("valid");
  });

  it("sorts by priority desc, ties by id ascending", () => {
    writeSkill(
      "a.md",
      `---
id: a-skill
name: A
description: x
priority: 5
triggers: ["x"]
tools: [t]
---
`.replace("triggers: [\"x\"]", "triggers:\n  - \"x\"").replace("tools: [t]", "tools:\n  - t"),
    );

    writeSkill(
      "b.md",
      `---
id: b-skill
name: B
description: x
priority: 8
triggers:
  - "x"
tools:
  - t
---
`,
    );

    writeSkill(
      "c.md",
      `---
id: c-skill
name: C
description: x
priority: 5
triggers:
  - "x"
tools:
  - t
---
`,
    );

    const skills = loadHarnessSkills(tmp);
    const ids = skills.map((s) => s.id);
    expect(ids[0]).toBe("b-skill"); // priority 8 first
    expect(ids[1]).toBe("a-skill"); // 5, alpha first
    expect(ids[2]).toBe("c-skill");
  });

  it("dedupes by id when same skill appears twice", () => {
    writeSkill(
      "dup-1.md",
      `---
id: dup
name: Dup1
description: x
triggers:
  - "x"
tools:
  - t
---
`,
    );
    writeSkill(
      "dup-2.md",
      `---
id: dup
name: Dup2
description: x
triggers:
  - "x"
tools:
  - t
---
`,
    );
    const skills = loadHarnessSkills(tmp);
    expect(skills).toHaveLength(1);
  });
});
