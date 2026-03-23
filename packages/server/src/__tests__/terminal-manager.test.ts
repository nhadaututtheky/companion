/**
 * Unit / integration tests for TerminalManager.
 *
 * These tests exercise the actual Bun.spawn-based terminal lifecycle.
 * On Windows the shell is powershell.exe; on Linux/macOS it is $SHELL or /bin/bash.
 * Tests that check for shell output wait up to ~1 second for async pipe reads.
 */

import { describe, it, expect, afterEach, afterAll } from "bun:test";
import { terminalManager } from "../services/terminal-manager.js";

// ── Cleanup helpers ───────────────────────────────────────────────────────────

const spawned: string[] = [];

/** Spawn a terminal and track it so afterEach can clean up on test failure. */
function spawnTracked(cwd = process.cwd()): string {
  const id = terminalManager.spawn(cwd);
  spawned.push(id);
  return id;
}

afterEach(() => {
  // Kill any terminals left over by a failing test
  while (spawned.length) {
    const id = spawned.pop()!;
    terminalManager.kill(id);
  }
});

afterAll(() => {
  terminalManager.killAll();
});

// ── spawn ─────────────────────────────────────────────────────────────────────

describe("TerminalManager.spawn", () => {
  it("returns a non-empty string id", () => {
    const id = spawnTracked();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("each spawn returns a unique id", () => {
    const a = spawnTracked();
    const b = spawnTracked();
    expect(a).not.toBe(b);
  });

  it("spawned terminal appears in list()", () => {
    const id = spawnTracked();
    const found = terminalManager.list().find((t) => t.id === id);
    expect(found).toBeDefined();
    expect(found!.cwd).toBe(process.cwd());
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe("TerminalManager.list", () => {
  it("returns an array (possibly empty)", () => {
    expect(Array.isArray(terminalManager.list())).toBe(true);
  });

  it("includes createdAt timestamp for each terminal", () => {
    const id = spawnTracked();
    const entry = terminalManager.list().find((t) => t.id === id);
    expect(typeof entry!.createdAt).toBe("number");
    expect(entry!.createdAt).toBeGreaterThan(0);
  });
});

// ── kill ──────────────────────────────────────────────────────────────────────

describe("TerminalManager.kill", () => {
  it("returns true and removes the terminal from list()", () => {
    const id = spawnTracked();
    const result = terminalManager.kill(id);
    // Remove from our tracking array since we killed it manually
    spawned.splice(spawned.indexOf(id), 1);

    expect(result).toBe(true);
    expect(terminalManager.list().some((t) => t.id === id)).toBe(false);
  });

  it("returns false for a non-existent id", () => {
    expect(terminalManager.kill("does-not-exist")).toBe(false);
  });

  it("is idempotent — second kill returns false", () => {
    const id = spawnTracked();
    terminalManager.kill(id);
    spawned.splice(spawned.indexOf(id), 1);
    expect(terminalManager.kill(id)).toBe(false);
  });
});

// ── write ─────────────────────────────────────────────────────────────────────

describe("TerminalManager.write", () => {
  it("returns false for a non-existent terminal", () => {
    expect(terminalManager.write("no-such-id", "hello")).toBe(false);
  });

  it("returns true for an existing terminal", () => {
    const id = spawnTracked();
    const result = terminalManager.write(id, "echo hi\n");
    expect(result).toBe(true);
  });
});

// ── subscribe / unsubscribe ───────────────────────────────────────────────────

describe("TerminalManager.subscribe", () => {
  it("returns false for a non-existent terminal", () => {
    const sub = { send: () => {} };
    expect(terminalManager.subscribe("no-such-id", sub)).toBe(false);
  });

  it("returns true for an existing terminal", () => {
    const id = spawnTracked();
    const sub = { send: () => {} };
    const result = terminalManager.subscribe(id, sub);
    // Manually unsubscribe before the afterEach kill to avoid double-kill
    // (unsubscribe kills when 0 subscribers remain)
    terminalManager.unsubscribe(id, sub);
    spawned.splice(spawned.indexOf(id), 1); // already killed by unsubscribe
    expect(result).toBe(true);
  });

  it("subscriber receives JSON-encoded output messages", async () => {
    const id = spawnTracked();
    const messages: string[] = [];
    const sub = { send: (data: string) => messages.push(data) };

    terminalManager.subscribe(id, sub);

    // Use a unique sentinel value so we can unambiguously detect our output
    const sentinel = "sentinel_xyz_12345";

    if (process.platform === "win32") {
      // PowerShell
      terminalManager.write(id, `Write-Output "${sentinel}"\n`);
    } else {
      terminalManager.write(id, `echo ${sentinel}\n`);
    }

    // Wait up to 2 s for the output to arrive
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const found = messages.some((m) => {
        try {
          const parsed = JSON.parse(m) as { type: string; data?: string };
          return parsed.type === "output" && parsed.data?.includes(sentinel);
        } catch {
          return false;
        }
      });
      if (found) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const hasOutput = messages.some((m) => {
      try {
        const parsed = JSON.parse(m) as { type: string; data?: string };
        return parsed.type === "output" && parsed.data?.includes(sentinel);
      } catch {
        return false;
      }
    });

    // Clean up — unsubscribe kills terminal when no more subscribers
    terminalManager.unsubscribe(id, sub);
    spawned.splice(spawned.indexOf(id), 1);

    expect(hasOutput).toBe(true);
  });
});

// ── resize ────────────────────────────────────────────────────────────────────

describe("TerminalManager.resize", () => {
  it("returns true for an existing terminal (even without PTY resize)", () => {
    const id = spawnTracked();
    expect(terminalManager.resize(id, 80, 24)).toBe(true);
  });

  it("returns false for a non-existent terminal", () => {
    expect(terminalManager.resize("no-such-id", 80, 24)).toBe(false);
  });
});

// ── killAll ───────────────────────────────────────────────────────────────────

describe("TerminalManager.killAll", () => {
  it("removes all managed terminals", () => {
    spawnTracked();
    spawnTracked();
    const initialCount = terminalManager.list().length;
    expect(initialCount).toBeGreaterThanOrEqual(2);

    terminalManager.killAll();
    // Clear our tracking since killAll handled it
    spawned.length = 0;

    expect(terminalManager.list()).toHaveLength(0);
  });
});
