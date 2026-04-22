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

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setWikiConfig, getWikiConfig, DEFAULT_WIKI_CONFIG } from "./index.js";
import {
  loadWikiConfigFromDb,
  persistWikiConfigToDb,
  autoProvisionDefaultDomain,
  initWikiConfig,
} from "./bootstrap.js";

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
});
