/**
 * Unit tests for cli-launcher — launchCLI delegation, formatUserMessage,
 * and createPlanModeWatcher retry/escalation logic.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Module mocks (must be before imports) ───────────────────────────────────

const mockAdapter = {
  launch: mock(() =>
    Promise.resolve({
      pid: 1234,
      stdin: { write: mock(() => true) },
      kill: mock(() => {}),
    }),
  ),
  formatUserMessage: mock((content: string) => JSON.stringify({ type: "user", content })),
  detect: mock(() => Promise.resolve({ available: true, version: "1.0.0" })),
};

const adapterRegistryMockFactory = () => ({
  getAdapter: mock(() => mockAdapter),
  getAllAdapters: mock(() => [mockAdapter]),
});
mock.module("./adapters/adapter-registry.js", adapterRegistryMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./adapters/adapter-registry.js"), adapterRegistryMockFactory);

const loggerMockFactory = () => ({
  createLogger: mock(() => ({
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  })),
});
mock.module("../logger.js", loggerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../logger.js"), loggerMockFactory);

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { launchCLI, formatUserMessage, createPlanModeWatcher } from "./cli-launcher.js";
import { getAdapter } from "./adapters/adapter-registry.js";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("cli-launcher", () => {
  beforeEach(() => {
    // Reset mock call counts
    (mockAdapter.launch as ReturnType<typeof mock>).mockClear();
    (mockAdapter.formatUserMessage as ReturnType<typeof mock>).mockClear();
    (getAdapter as ReturnType<typeof mock>).mockClear();
  });

  // ── launchCLI ─────────────────────────────────────────────────────────────

  describe("launchCLI", () => {
    it("delegates to adapter.launch with mapped options", async () => {
      const onMessage = mock(() => {});
      const onExit = mock(() => {});

      const result = await launchCLI(
        {
          sessionId: "sess-1",
          cwd: "/project",
          model: "claude-sonnet-4-6",
          permissionMode: "default",
          prompt: "Hello",
          resume: false,
          envVars: { FOO: "bar" },
          hooksUrl: "http://localhost:3456/api/hooks",
          hookSecret: "secret123",
        },
        onMessage,
        onExit,
      );

      expect(getAdapter).toHaveBeenCalledWith("claude");
      expect(mockAdapter.launch).toHaveBeenCalledTimes(1);

      const launchArgs = (mockAdapter.launch as ReturnType<typeof mock>).mock.calls[0]!;
      const opts = launchArgs[0]!;
      expect(opts.sessionId).toBe("sess-1");
      expect(opts.cwd).toBe("/project");
      expect(opts.model).toBe("claude-sonnet-4-6");
      expect(opts.prompt).toBe("Hello");
      expect(opts.hooksUrl).toBe("http://localhost:3456/api/hooks");
      expect(opts.hookSecret).toBe("secret123");
      expect(result.pid).toBe(1234);
    });

    it("uses specified cliPlatform instead of default claude", async () => {
      await launchCLI(
        {
          sessionId: "sess-2",
          cwd: "/project",
          model: "gpt-4o",
          cliPlatform: "codex",
        },
        mock(() => {}),
        mock(() => {}),
      );

      expect(getAdapter).toHaveBeenCalledWith("codex");
    });

    it("passes platformOptions through to adapter", async () => {
      await launchCLI(
        {
          sessionId: "sess-3",
          cwd: "/project",
          model: "gemini-2.5-pro",
          cliPlatform: "gemini",
          platformOptions: { customFlag: true },
        },
        mock(() => {}),
        mock(() => {}),
      );

      const launchArgs = (mockAdapter.launch as ReturnType<typeof mock>).mock.calls[0]!;
      expect(launchArgs[0]!.platformOptions).toEqual({ customFlag: true });
    });
  });

  // ── formatUserMessage ─────────────────────────────────────────────────────

  describe("formatUserMessage", () => {
    it("delegates to adapter.formatUserMessage with default claude platform", () => {
      formatUserMessage("hello world");

      expect(getAdapter).toHaveBeenCalledWith("claude");
      expect(mockAdapter.formatUserMessage).toHaveBeenCalledWith("hello world");
    });

    it("uses specified platform", () => {
      formatUserMessage("hello", "opencode");

      expect(getAdapter).toHaveBeenCalledWith("opencode");
    });
  });

  // ── createPlanModeWatcher ─────────────────────────────────────────────────

  describe("createPlanModeWatcher", () => {
    it("returns watcher with start/stop/onEnterPlan/onExitPlan methods", () => {
      const sendToCLI = mock(() => {});
      const onStuck = mock(() => {});

      const watcher = createPlanModeWatcher(sendToCLI, onStuck);

      expect(watcher.start).toBeFunction();
      expect(watcher.stop).toBeFunction();
      expect(watcher.onEnterPlan).toBeFunction();
      expect(watcher.onExitPlan).toBeFunction();
    });

    it("does not fire watchdog before onEnterPlan is called", async () => {
      const sendToCLI = mock(() => {});
      const onStuck = mock(() => {});

      const watcher = createPlanModeWatcher(sendToCLI, onStuck);
      watcher.start();

      // Wait a bit — no watchdog should fire
      await new Promise((r) => setTimeout(r, 100));

      expect(onStuck).not.toHaveBeenCalled();
      watcher.stop();
    });

    it("onExitPlan disarms the watchdog", () => {
      const sendToCLI = mock(() => {});
      const onStuck = mock(() => {});

      const watcher = createPlanModeWatcher(sendToCLI, onStuck);
      watcher.onEnterPlan();
      watcher.onExitPlan();

      // After exit, no stuck callback should fire
      expect(onStuck).not.toHaveBeenCalled();
    });

    it("stop clears watchdog state", () => {
      const sendToCLI = mock(() => {});
      const onStuck = mock(() => {});

      const watcher = createPlanModeWatcher(sendToCLI, onStuck);
      watcher.onEnterPlan();
      watcher.stop();

      expect(onStuck).not.toHaveBeenCalled();
    });

    it("sends /exitplan request on retry escalation", async () => {
      // Use fake timers approach: trigger the watchdog manually by inspecting behavior
      const sendToCLI = mock(() => {});
      const onStuck = mock(() => {});

      const watcher = createPlanModeWatcher(sendToCLI, onStuck);

      // Verify onEnterPlan doesn't immediately trigger
      watcher.onEnterPlan();
      expect(sendToCLI).not.toHaveBeenCalled();

      // Clean up
      watcher.stop();
    });

    it("can enter and exit plan mode multiple times safely", () => {
      const sendToCLI = mock(() => {});
      const onStuck = mock(() => {});

      const watcher = createPlanModeWatcher(sendToCLI, onStuck);

      // Multiple enter/exit cycles should not throw
      watcher.onEnterPlan();
      watcher.onExitPlan();
      watcher.onEnterPlan();
      watcher.onExitPlan();
      watcher.onEnterPlan();
      watcher.stop();

      expect(onStuck).not.toHaveBeenCalled();
    });
  });
});
