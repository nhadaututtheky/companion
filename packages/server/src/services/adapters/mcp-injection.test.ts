/**
 * Unit tests for mcp-injection — verify .mcp.json lifecycle doesn't clobber
 * user content and the cleanup function restores the original state.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { injectCompanionMcp, COMPANION_MCP_SERVER_KEY } from "./mcp-injection.js";

describe("injectCompanionMcp", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "companion-mcp-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .mcp.json when none exists and cleanup removes it", () => {
    const mcpPath = join(tmpDir, ".mcp.json");
    expect(existsSync(mcpPath)).toBe(false);

    const cleanup = injectCompanionMcp(tmpDir, "http://localhost:3579", "key-123", "companion");

    expect(existsSync(mcpPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(cfg.mcpServers[COMPANION_MCP_SERVER_KEY]).toBeDefined();
    expect(cfg.mcpServers[COMPANION_MCP_SERVER_KEY].env.COMPANION_API_URL).toBe(
      "http://localhost:3579",
    );
    expect(cfg.mcpServers[COMPANION_MCP_SERVER_KEY].env.API_KEY).toBe("key-123");
    expect(cfg.mcpServers[COMPANION_MCP_SERVER_KEY].env.PROJECT_SLUG).toBe("companion");

    cleanup();
    expect(existsSync(mcpPath)).toBe(false);
  });

  it("preserves user's existing mcpServers entries and cleanup only removes our key", () => {
    const mcpPath = join(tmpDir, ".mcp.json");
    const userConfig = {
      mcpServers: {
        "user-server": {
          command: "node",
          args: ["user-mcp.js"],
        },
      },
    };
    writeFileSync(mcpPath, JSON.stringify(userConfig, null, 2), "utf-8");

    const cleanup = injectCompanionMcp(tmpDir, "http://x", "k", "slug");

    const merged = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(merged.mcpServers["user-server"]).toEqual(userConfig.mcpServers["user-server"]);
    expect(merged.mcpServers[COMPANION_MCP_SERVER_KEY]).toBeDefined();

    cleanup();

    expect(existsSync(mcpPath)).toBe(true);
    const restored = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(restored.mcpServers["user-server"]).toEqual(userConfig.mcpServers["user-server"]);
    expect(restored.mcpServers[COMPANION_MCP_SERVER_KEY]).toBeUndefined();
  });

  it("preserves top-level keys outside mcpServers", () => {
    const mcpPath = join(tmpDir, ".mcp.json");
    const userConfig = {
      comment: "User's own config",
      customSetting: 42,
    };
    writeFileSync(mcpPath, JSON.stringify(userConfig, null, 2), "utf-8");

    const cleanup = injectCompanionMcp(tmpDir, "http://x", "k", "slug");

    const merged = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(merged.comment).toBe("User's own config");
    expect(merged.customSetting).toBe(42);

    cleanup();

    const restored = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(restored.comment).toBe("User's own config");
    expect(restored.customSetting).toBe(42);
    expect(restored.mcpServers).toBeUndefined();
  });

  it("is idempotent — second call overwrites our key without duplicating", () => {
    const cleanup1 = injectCompanionMcp(tmpDir, "http://a", "key-A", "slug-A");
    const cleanup2 = injectCompanionMcp(tmpDir, "http://b", "key-B", "slug-B");

    const cfg = JSON.parse(readFileSync(join(tmpDir, ".mcp.json"), "utf-8"));
    expect(cfg.mcpServers[COMPANION_MCP_SERVER_KEY].env.COMPANION_API_URL).toBe("http://b");
    expect(cfg.mcpServers[COMPANION_MCP_SERVER_KEY].env.API_KEY).toBe("key-B");

    cleanup2();
    cleanup1();
    expect(existsSync(join(tmpDir, ".mcp.json"))).toBe(false);
  });
});
