/**
 * Integration tests for GET /api/fs/search
 *
 * Requires the server running at localhost:3579 with API_KEY=test-key.
 * Start before running:
 *
 *   API_KEY=test-key bun run dev:server &
 *   bun test packages/server/src/__tests__/search-endpoint.test.ts
 *
 * These tests are skipped automatically when the server is not reachable.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { resolve } from "path";

const BASE = "http://localhost:3579";
const API_KEY = process.env.API_KEY ?? "test-key";
const HEADERS = { "X-API-Key": API_KEY };

// ── Connectivity check ────────────────────────────────────────────────────────

let serverReachable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE}/api/health`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(2000),
    });
    serverReachable = res.ok || res.status < 500;
  } catch {
    serverReachable = false;
  }
});

function skipIfOffline() {
  if (!serverReachable) {
    console.warn("  [skip] Server not reachable — skipping integration test");
    return true;
  }
  return false;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/fs/search — parameter validation", () => {
  it("returns 400 when q is missing", async () => {
    if (skipIfOffline()) return;
    const res = await fetch(`${BASE}/api/fs/search?path=/tmp`, { headers: HEADERS });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when path is missing", async () => {
    if (skipIfOffline()) return;
    const res = await fetch(`${BASE}/api/fs/search?q=test`, { headers: HEADERS });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });

  it("returns 400 for a path that does not exist", async () => {
    if (skipIfOffline()) return;
    const res = await fetch(
      `${BASE}/api/fs/search?q=test&path=/nonexistent/path/xyz/abc`,
      { headers: HEADERS },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a path that is a file, not a directory", async () => {
    if (skipIfOffline()) return;
    // Use package.json from server package — guaranteed to exist, guaranteed to be a file
    const filePath = encodeURIComponent(
      resolve(process.cwd(), "packages/server/package.json"),
    );
    const res = await fetch(`${BASE}/api/fs/search?q=test&path=${filePath}`, {
      headers: HEADERS,
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/fs/search — successful searches", () => {
  it("returns 200 with matches when query is found", async () => {
    if (skipIfOffline()) return;
    // "Hono" is referenced throughout the server source — guaranteed hits
    const srcPath = encodeURIComponent(
      resolve(process.cwd(), "packages/server/src"),
    );
    const res = await fetch(`${BASE}/api/fs/search?q=Hono&path=${srcPath}`, {
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { matches: Array<{ file: string; line: number; text: string; col: number }> };
    };
    expect(body.success).toBe(true);
    expect(body.data.matches.length).toBeGreaterThan(0);
  });

  it("match objects contain file, line, text, and col fields", async () => {
    if (skipIfOffline()) return;
    const srcPath = encodeURIComponent(
      resolve(process.cwd(), "packages/server/src"),
    );
    const res = await fetch(`${BASE}/api/fs/search?q=Hono&path=${srcPath}`, {
      headers: HEADERS,
    });
    const body = (await res.json()) as {
      data: { matches: Array<{ file: string; line: number; text: string; col: number }> };
    };
    const first = body.data.matches[0]!;
    expect(typeof first.file).toBe("string");
    expect(typeof first.line).toBe("number");
    expect(typeof first.text).toBe("string");
    expect(typeof first.col).toBe("number");
  });

  it("returns empty matches array when query has no results", async () => {
    if (skipIfOffline()) return;
    const srcPath = encodeURIComponent(
      resolve(process.cwd(), "packages/server/src"),
    );
    const res = await fetch(
      `${BASE}/api/fs/search?q=xyzNonExistentToken999abc&path=${srcPath}`,
      { headers: HEADERS },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { matches: unknown[] };
    };
    expect(body.success).toBe(true);
    expect(body.data.matches).toHaveLength(0);
  });
});

describe("GET /api/fs/search — glob filter", () => {
  it("only returns files matching the glob pattern", async () => {
    if (skipIfOffline()) return;
    const srcPath = encodeURIComponent(
      resolve(process.cwd(), "packages/server/src"),
    );
    const res = await fetch(
      `${BASE}/api/fs/search?q=import&path=${srcPath}&glob=*.ts`,
      { headers: HEADERS },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { matches: Array<{ file: string }> };
    };
    for (const match of body.data.matches) {
      expect(match.file).toMatch(/\.ts$/);
    }
  });

  it("returns empty matches when glob excludes all files containing the query", async () => {
    if (skipIfOffline()) return;
    const srcPath = encodeURIComponent(
      resolve(process.cwd(), "packages/server/src"),
    );
    // Search for "import" in *.xyz files — there are none
    const res = await fetch(
      `${BASE}/api/fs/search?q=import&path=${srcPath}&glob=*.xyz`,
      { headers: HEADERS },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { matches: unknown[] };
    };
    expect(body.data.matches).toHaveLength(0);
  });
});

describe("GET /api/fs/search — response shape", () => {
  it("includes total and truncated fields in data", async () => {
    if (skipIfOffline()) return;
    const srcPath = encodeURIComponent(
      resolve(process.cwd(), "packages/server/src"),
    );
    const res = await fetch(`${BASE}/api/fs/search?q=import&path=${srcPath}`, {
      headers: HEADERS,
    });
    const body = (await res.json()) as {
      data: { matches: unknown[]; total: number; truncated: boolean };
    };
    expect(typeof body.data.total).toBe("number");
    expect(typeof body.data.truncated).toBe("boolean");
    expect(body.data.total).toBe(body.data.matches.length);
  });
});
