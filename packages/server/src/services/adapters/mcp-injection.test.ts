/**
 * Unit tests for mcp-injection — verify .mcp.json lifecycle doesn't clobber
 * user content and the cleanup function restores the original state.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  injectCompanionMcp,
  injectCompanionMcpGemini,
  injectCompanionMcpOpenCode,
  injectCompanionMcpCodex,
  COMPANION_MCP_SERVER_KEY,
} from "./mcp-injection.js";

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

describe("injectCompanionMcpGemini", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "companion-gemini-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .gemini/settings.json and cleanup removes it", () => {
    const settingsPath = join(tmpDir, ".gemini", "settings.json");
    expect(existsSync(settingsPath)).toBe(false);

    const cleanup = injectCompanionMcpGemini(tmpDir, "http://localhost:3579", "k", "slug");

    expect(existsSync(settingsPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(cfg.mcpServers[COMPANION_MCP_SERVER_KEY].command).toBe("bun");
    expect(cfg.mcpServers[COMPANION_MCP_SERVER_KEY].env.PROJECT_SLUG).toBe("slug");

    cleanup();
    expect(existsSync(settingsPath)).toBe(false);
  });

  it("preserves user settings outside mcpServers", () => {
    const settingsPath = join(tmpDir, ".gemini", "settings.json");
    const geminiDir = join(tmpDir, ".gemini");
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ theme: "dark", autoAccept: false }, null, 2));

    const cleanup = injectCompanionMcpGemini(tmpDir, "http://x", "k", "slug");

    const merged = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(merged.theme).toBe("dark");
    expect(merged.autoAccept).toBe(false);
    expect(merged.mcpServers[COMPANION_MCP_SERVER_KEY]).toBeDefined();

    cleanup();

    const restored = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(restored.theme).toBe("dark");
    expect(restored.autoAccept).toBe(false);
    expect(restored.mcpServers).toBeUndefined();
  });
});

describe("injectCompanionMcpOpenCode", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "companion-opencode-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("nests server under mcp.servers and cleanup removes it", () => {
    const cfgPath = join(tmpDir, "opencode.json");

    const cleanup = injectCompanionMcpOpenCode(tmpDir, "http://x", "k", "slug");

    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    expect(cfg.mcp.servers[COMPANION_MCP_SERVER_KEY].command).toBe("bun");

    cleanup();
    expect(existsSync(cfgPath)).toBe(false);
  });

  it("preserves user's mcp.servers entries and other mcp.* siblings", () => {
    const cfgPath = join(tmpDir, "opencode.json");
    const userConfig = {
      provider: "ollama",
      mcp: {
        servers: { "user-server": { command: "python", args: ["x.py"] } },
        enabled: true,
      },
    };
    writeFileSync(cfgPath, JSON.stringify(userConfig, null, 2));

    const cleanup = injectCompanionMcpOpenCode(tmpDir, "http://x", "k", "slug");

    const merged = JSON.parse(readFileSync(cfgPath, "utf-8"));
    expect(merged.provider).toBe("ollama");
    expect(merged.mcp.enabled).toBe(true);
    expect(merged.mcp.servers["user-server"]).toEqual({ command: "python", args: ["x.py"] });
    expect(merged.mcp.servers[COMPANION_MCP_SERVER_KEY]).toBeDefined();

    cleanup();

    const restored = JSON.parse(readFileSync(cfgPath, "utf-8"));
    expect(restored.provider).toBe("ollama");
    expect(restored.mcp.enabled).toBe(true);
    expect(restored.mcp.servers["user-server"]).toEqual({ command: "python", args: ["x.py"] });
    expect(restored.mcp.servers[COMPANION_MCP_SERVER_KEY]).toBeUndefined();
  });
});

describe("injectCompanionMcpCodex", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "companion-codex-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes TOML block with correct section headers and cleanup removes it", () => {
    const cfgPath = join(tmpDir, ".codex", "config.toml");

    const cleanup = injectCompanionMcpCodex(tmpDir, "http://localhost:3579", "key-123", "slug-A");

    const content = readFileSync(cfgPath, "utf-8");
    expect(content).toContain(`[mcp_servers.${COMPANION_MCP_SERVER_KEY}]`);
    expect(content).toContain(`command = "bun"`);
    expect(content).toContain(`[mcp_servers.${COMPANION_MCP_SERVER_KEY}.env]`);
    expect(content).toContain(`COMPANION_API_URL = "http://localhost:3579"`);
    expect(content).toContain(`API_KEY = "key-123"`);
    expect(content).toContain(`PROJECT_SLUG = "slug-A"`);

    cleanup();
    expect(existsSync(cfgPath)).toBe(false);
  });

  it("preserves user's existing TOML content and removes only our marker block", () => {
    const cfgPath = join(tmpDir, ".codex", "config.toml");
    mkdirSync(join(tmpDir, ".codex"), { recursive: true });
    const userContent =
      `model = "gpt-4o"\n\n` +
      `[mcp_servers.user-server]\n` +
      `command = "python"\n` +
      `args = ["user.py"]\n`;
    writeFileSync(cfgPath, userContent);

    const cleanup = injectCompanionMcpCodex(tmpDir, "http://x", "k", "slug");

    const merged = readFileSync(cfgPath, "utf-8");
    expect(merged).toContain(`model = "gpt-4o"`);
    expect(merged).toContain(`[mcp_servers.user-server]`);
    expect(merged).toContain(`[mcp_servers.${COMPANION_MCP_SERVER_KEY}]`);

    cleanup();

    const restored = readFileSync(cfgPath, "utf-8");
    expect(restored).toContain(`model = "gpt-4o"`);
    expect(restored).toContain(`[mcp_servers.user-server]`);
    expect(restored).not.toContain(`[mcp_servers.${COMPANION_MCP_SERVER_KEY}]`);
    expect(restored).not.toContain(`companion-agent`);
  });

  it("is idempotent — second call replaces our block without duplicating markers", () => {
    const cfgPath = join(tmpDir, ".codex", "config.toml");
    const cleanup1 = injectCompanionMcpCodex(tmpDir, "http://a", "key-A", "slug-A");
    injectCompanionMcpCodex(tmpDir, "http://b", "key-B", "slug-B");

    const content = readFileSync(cfgPath, "utf-8");
    // Only one occurrence of our section header
    const matches = content.match(/>>> companion-agent >>>/g) ?? [];
    expect(matches.length).toBe(1);
    expect(content).toContain(`COMPANION_API_URL = "http://b"`);
    expect(content).not.toContain(`http://a`);

    cleanup1(); // second cleanup is a no-op because block already stripped
    expect(existsSync(cfgPath)).toBe(false);
  });

  it("escapes backslashes and quotes in paths/values", () => {
    // AGENT_MCP_ENTRY on Windows contains backslashes that must be escaped
    const cfgPath = join(tmpDir, ".codex", "config.toml");
    const cleanup = injectCompanionMcpCodex(tmpDir, "http://x", 'key"with"quotes', "slug");

    const content = readFileSync(cfgPath, "utf-8");
    expect(content).toContain(`API_KEY = "key\\"with\\"quotes"`);
    // If Windows path is in args, verify no unescaped backslashes breaking TOML
    // (naive check: if \\ present, confirm it's \\\\ escaped in single quotes)
    cleanup();
  });
});
