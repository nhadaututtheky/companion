/**
 * Unit tests for wiki/bootstrap.ts — config persistence round-trip and
 * auto-provisioning fallback from PROJECT_SLUG.
 *
 * Mocks `settings-helpers.js` with an in-memory store so we don't need
 * a live SQLite DB for unit coverage.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ─── Module mocks (must be before imports) ───────────────────────────────────

const settingsStore: Map<string, string> = new Map();

const settingsHelpersMockFactory = () => ({
  getSetting: mock((key: string) => settingsStore.get(key)),
  getSettingBool: mock((key: string, fallback: boolean) => {
    const v = settingsStore.get(key);
    if (v === undefined) return fallback;
    return v === "true";
  }),
  getSettingInt: mock((key: string, fallback: number) => {
    const v = settingsStore.get(key);
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return isNaN(n) ? fallback : n;
  }),
  getSettingNumber: mock((key: string, fallback: number) => {
    const v = settingsStore.get(key);
    if (v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }),
  setSetting: mock((key: string, value: string) => {
    settingsStore.set(key, value);
  }),
  deleteSetting: mock((key: string) => {
    settingsStore.delete(key);
  }),
});
mock.module("../services/settings-helpers.js", settingsHelpersMockFactory);
if (process.platform !== "win32") {
  mock.module(
    import.meta.resolve("../services/settings-helpers.js"),
    settingsHelpersMockFactory,
  );
}

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setWikiConfig, getWikiConfig, DEFAULT_WIKI_CONFIG } from "./index.js";
import {
  loadWikiConfigFromDb,
  persistWikiConfigToDb,
  autoProvisionDefaultDomain,
  initWikiConfig,
} from "./bootstrap.js";
import { getSessionContext, writeCore, rebuildIndex } from "./index.js";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("wiki bootstrap", () => {
  let origCwd: () => string;
  let origProjectSlug: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    settingsStore.clear();
    // reset in-memory wiki config to default between tests
    setWikiConfig({ ...DEFAULT_WIKI_CONFIG });

    tmpDir = mkdtempSync(join(tmpdir(), "companion-wiki-bootstrap-"));
    origCwd = process.cwd;
    origProjectSlug = process.env.PROJECT_SLUG;
    process.cwd = () => tmpDir;
  });

  afterEach(() => {
    process.cwd = origCwd;
    if (origProjectSlug === undefined) delete process.env.PROJECT_SLUG;
    else process.env.PROJECT_SLUG = origProjectSlug;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("persist + load round-trip", () => {
    it("persists defaultDomain and reloads it after config reset", () => {
      setWikiConfig({ defaultDomain: "my-project", secondaryDomains: ["shared"] });
      persistWikiConfigToDb();

      // Simulate server restart — wipe in-memory back to default
      setWikiConfig({ ...DEFAULT_WIKI_CONFIG });
      expect(getWikiConfig().defaultDomain).toBeNull();

      loadWikiConfigFromDb();
      expect(getWikiConfig().defaultDomain).toBe("my-project");
      expect(getWikiConfig().secondaryDomains).toEqual(["shared"]);
    });

    it("persists enabled=false and rehydrates it", () => {
      setWikiConfig({ enabled: false });
      persistWikiConfigToDb();

      setWikiConfig({ ...DEFAULT_WIKI_CONFIG });
      expect(getWikiConfig().enabled).toBe(true);

      loadWikiConfigFromDb();
      expect(getWikiConfig().enabled).toBe(false);
    });

    it("clearing defaultDomain removes the DB key on next persist", () => {
      setWikiConfig({ defaultDomain: "old-project" });
      persistWikiConfigToDb();
      expect(settingsStore.get("wiki.defaultDomain")).toBe("old-project");

      setWikiConfig({ defaultDomain: null });
      persistWikiConfigToDb();
      expect(settingsStore.has("wiki.defaultDomain")).toBe(false);
    });
  });

  describe("autoProvisionDefaultDomain", () => {
    it("sets defaultDomain from PROJECT_SLUG and creates the domain directory", () => {
      process.env.PROJECT_SLUG = "test-proj";

      autoProvisionDefaultDomain();

      expect(getWikiConfig().defaultDomain).toBe("test-proj");
      expect(existsSync(join(tmpDir, "wiki", "test-proj"))).toBe(true);
      // Persisted too
      expect(settingsStore.get("wiki.defaultDomain")).toBe("test-proj");
    });

    it("sanitizes a slug with invalid chars into kebab-case lowercase", () => {
      process.env.PROJECT_SLUG = "My_Weird Project.Name!";

      autoProvisionDefaultDomain();

      expect(getWikiConfig().defaultDomain).toBe("my-weird-project-name");
    });

    it("falls back to cwd basename when PROJECT_SLUG is absent", () => {
      delete process.env.PROJECT_SLUG;

      autoProvisionDefaultDomain();

      const expected = tmpDir.split(/[\\/]/).filter(Boolean).pop()!.toLowerCase().slice(0, 50);
      expect(getWikiConfig().defaultDomain).toBe(
        expected.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      );
    });

    it("is a no-op when defaultDomain is already configured", () => {
      setWikiConfig({ defaultDomain: "already-set" });
      process.env.PROJECT_SLUG = "would-be-set-if-we-ran";

      autoProvisionDefaultDomain();

      expect(getWikiConfig().defaultDomain).toBe("already-set");
    });

    it("skips auto-provisioning when wiki is disabled", () => {
      setWikiConfig({ enabled: false });
      process.env.PROJECT_SLUG = "test-proj";

      autoProvisionDefaultDomain();

      expect(getWikiConfig().defaultDomain).toBeNull();
    });
  });

  describe("initWikiConfig integration", () => {
    it("loads first, then auto-provisions only if nothing loaded", () => {
      // Simulate a previously-configured install
      settingsStore.set("wiki.defaultDomain", "existing-domain");
      settingsStore.set("wiki.enabled", "true");
      process.env.PROJECT_SLUG = "different-slug";

      initWikiConfig();

      // Load wins over auto-provision
      expect(getWikiConfig().defaultDomain).toBe("existing-domain");
    });

    it("falls through to auto-provision on fresh install", () => {
      process.env.PROJECT_SLUG = "fresh-proj";

      initWikiConfig();

      expect(getWikiConfig().defaultDomain).toBe("fresh-proj");
    });
  });

  // ─── E2E: fresh-install bootstrap → Wiki L0 returns content ──────────────
  //
  // Validates the full chain users depend on: PROJECT_SLUG → auto-provision
  // creates the domain → seeded _core + _index combine into a session context
  // that is non-null and contains the expected rules. If this breaks, Wiki
  // L0 injection silently returns nothing even though the log says otherwise.
  describe("E2E: fresh install → Wiki L0 ready", () => {
    it("returns non-empty session context containing core rules", () => {
      process.env.PROJECT_SLUG = "e2e-proj";

      // Step 1: fresh-install bootstrap — creates domain + _index.md
      initWikiConfig();
      expect(getWikiConfig().defaultDomain).toBe("e2e-proj");
      const domainDir = join(tmpDir, "wiki", "e2e-proj");
      expect(existsSync(domainDir)).toBe(true);
      expect(existsSync(join(domainDir, "_index.md"))).toBe(true);

      // Step 2: seed _core.md via the public API (mirroring what the repo
      // ships as wiki/companion/_core.md)
      writeCore(
        "e2e-proj",
        [
          "# E2E Core Rules",
          "",
          "- Every session-ending path MUST clear cliSessionId.",
          "- Compact threshold is session.state.compact_threshold (not hardcoded).",
        ].join("\n"),
        tmpDir,
      );

      // Step 3: rebuild index so retriever has up-to-date metadata
      rebuildIndex("e2e-proj", tmpDir);

      // Step 4: call the retriever the way ws-message-handler's Wiki L0
      // injection does (3000 tokens is the L0 budget)
      const ctx = getSessionContext("e2e-proj", 3000, tmpDir);

      expect(ctx).not.toBeNull();
      expect(ctx!.tokens).toBeGreaterThan(0);
      expect(ctx!.content).toContain("e2e-proj");
      expect(ctx!.content).toContain("Core Rules");
      expect(ctx!.content).toContain("cliSessionId");
    });

    it("second boot is idempotent — doesn't overwrite existing seed content", () => {
      process.env.PROJECT_SLUG = "e2e-idempotent";

      initWikiConfig();
      writeCore("e2e-idempotent", "# Original core content", tmpDir);

      const beforeContent = getSessionContext("e2e-idempotent", 3000, tmpDir)?.content ?? "";
      expect(beforeContent).toContain("Original core content");

      // Simulate a server restart — in-memory config wiped, re-init
      setWikiConfig({ ...DEFAULT_WIKI_CONFIG });
      initWikiConfig();

      const afterContent = getSessionContext("e2e-idempotent", 3000, tmpDir)?.content ?? "";
      expect(afterContent).toContain("Original core content");
      expect(getWikiConfig().defaultDomain).toBe("e2e-idempotent");
    });
  });
});

// ─── E2E: adapter MCP injection files actually land ────────────────────────
//
// Smoke test that each non-Claude adapter's MCP injector writes the right
// config file at the right path. The unit tests in mcp-injection.test.ts
// cover the helpers themselves; this asserts each helper produces the
// CLI-specific schema.
describe("Adapter MCP injectors — config file schemas", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "companion-adapter-e2e-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("each injector writes its CLI-specific config with companion-agent key", async () => {
    const {
      injectCompanionMcp,
      injectCompanionMcpGemini,
      injectCompanionMcpOpenCode,
      injectCompanionMcpCodex,
      COMPANION_MCP_SERVER_KEY,
    } = await import("../services/adapters/mcp-injection.js");

    // Claude — .mcp.json at project root
    const claudeDir = join(tmpDir, "claude");
    mkdirSync(claudeDir);
    const claudeCleanup = injectCompanionMcp(claudeDir, "http://x", "k", "slug");
    expect(existsSync(join(claudeDir, ".mcp.json"))).toBe(true);
    claudeCleanup();

    // Gemini — .gemini/settings.json
    const geminiDir = join(tmpDir, "gemini");
    mkdirSync(geminiDir);
    const geminiCleanup = injectCompanionMcpGemini(geminiDir, "http://x", "k", "slug");
    expect(existsSync(join(geminiDir, ".gemini", "settings.json"))).toBe(true);
    geminiCleanup();

    // OpenCode — opencode.json with mcp.servers nesting
    const ocDir = join(tmpDir, "opencode");
    mkdirSync(ocDir);
    const ocCleanup = injectCompanionMcpOpenCode(ocDir, "http://x", "k", "slug");
    expect(existsSync(join(ocDir, "opencode.json"))).toBe(true);
    ocCleanup();

    // Codex — .codex/config.toml with marker-delimited block
    const codexDir = join(tmpDir, "codex");
    mkdirSync(codexDir);
    const codexCleanup = injectCompanionMcpCodex(codexDir, "http://x", "k", "slug");
    const codexConfigPath = join(codexDir, ".codex", "config.toml");
    expect(existsSync(codexConfigPath)).toBe(true);
    const codexContent = readFileSync(codexConfigPath, "utf-8");
    expect(codexContent).toContain(`[mcp_servers.${COMPANION_MCP_SERVER_KEY}]`);
    codexCleanup();
  });
});
