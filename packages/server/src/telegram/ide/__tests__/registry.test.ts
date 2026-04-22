/**
 * IDE registry — sanity tests. These don't exercise `listAvailablePacks`
 * because it spawns subprocesses; the pure lookups + capability flags
 * are the part commands depend on.
 */

import { describe, expect, it } from "bun:test";
import { ALL_PACKS, getPack } from "../registry.js";
import { defaultModel, defaultApproval } from "../types.js";

describe("ide/registry", () => {
  it("has exactly four packs in picker order", () => {
    expect(ALL_PACKS.map((p) => p.platform)).toEqual([
      "claude",
      "codex",
      "gemini",
      "opencode",
    ]);
  });

  it("every pack has at least one model", () => {
    for (const pack of ALL_PACKS) {
      expect(pack.models.length).toBeGreaterThan(0);
      expect(defaultModel(pack)).toBe(pack.models[0]!.value);
    }
  });

  it("getPack resolves known platforms", () => {
    expect(getPack("claude").platform).toBe("claude");
    expect(getPack("codex").platform).toBe("codex");
    expect(getPack("gemini").platform).toBe("gemini");
    expect(getPack("opencode").platform).toBe("opencode");
  });

  it("getPack falls back to Claude for unknown / missing platform", () => {
    expect(getPack(undefined).platform).toBe("claude");
  });

  it("Codex is the only pack with approval modes", () => {
    for (const pack of ALL_PACKS) {
      const has = pack.approvalModes.length > 0;
      expect(has).toBe(pack.platform === "codex");
      expect(has).toBe(pack.supports.approval);
    }
  });

  it("thinking + compact are Claude-exclusive at capability level", () => {
    for (const pack of ALL_PACKS) {
      if (pack.supports.compact) {
        expect(pack.platform).toBe("claude");
      }
    }
  });

  it("defaultApproval returns the first approval mode or empty", () => {
    expect(defaultApproval(getPack("codex"))).toBe("plan");
    expect(defaultApproval(getPack("claude"))).toBe("");
  });
});
