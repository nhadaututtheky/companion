/**
 * Tests for `refreshStaleQuotas` — the Phase 2 JIT bulk refresher.
 *
 * Covers:
 *   - No-op when every row is fresh
 *   - Row-level skip rules (status != ready, skipInRotation, expired)
 *   - Concurrency cap honored
 *   - Per-call timeout bounds total latency
 *
 * Bun mock.module: lives in its own file, no sharing with other mockers.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestDb } from "./test-db.js";
import { accounts, sessions } from "../db/schema.js";

process.env.COMPANION_ENCRYPTION_KEY ??= "test-key-for-refresh-stale-quotas-only";

let testDbResult: ReturnType<typeof createTestDb>;

const dbClientMockFactory = () => ({
  getDb: () => testDbResult.db,
  getSqlite: () => testDbResult?.sqlite ?? null,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbClientMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../db/client.js"), dbClientMockFactory);

const { encrypt } = await import("../services/crypto.js");
const { __clearInFlightRefreshes } = await import("../services/oauth-token-service.js");
const { refreshStaleQuotas } = await import("../services/usage-fetcher.js");

// ─── Fetch router ──────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;
let fetchHandler: FetchHandler = () => {
  throw new Error("fetchHandler not set");
};
const originalFetch = globalThis.fetch;
globalThis.fetch = ((url: RequestInfo | URL, init?: RequestInit) =>
  Promise.resolve(fetchHandler(url instanceof URL ? url.toString() : String(url), init))) as typeof fetch;

// ─── Seed ──────────────────────────────────────────────────────────────────

interface SeedOpts {
  status?: string;
  skipInRotation?: boolean;
  quotaFetchedAt?: Date | null;
}

function seedAccount(opts: SeedOpts = {}): string {
  const id = randomUUID();
  testDbResult.db
    .insert(accounts)
    .values({
      id,
      label: "Test",
      fingerprint: "fp-" + id.slice(0, 8),
      identity: "idt-" + id.slice(0, 8),
      encryptedCredentials: encrypt(
        JSON.stringify({
          accessToken: "sk-ant-oat01-" + id.slice(0, 8),
          refreshToken: "sk-ant-ort01-" + id.slice(0, 8),
          expiresAt: Date.now() + 3_600_000,
          scopes: ["user:inference"],
        }),
      ),
      status: opts.status ?? "ready",
      skipInRotation: opts.skipInRotation ?? false,
      quotaFetchedAt: opts.quotaFetchedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return id;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

beforeAll(() => {
  testDbResult = createTestDb();
});

afterAll(() => {
  testDbResult.sqlite.close();
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  testDbResult.db.delete(sessions).run();
  testDbResult.db.delete(accounts).run();
  __clearInFlightRefreshes();
  fetchHandler = () => {
    throw new Error("fetchHandler not set");
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("refreshStaleQuotas", () => {
  test("no-op when no rows are stale", async () => {
    const fresh = new Date(Date.now() - 60_000); // under 5m
    seedAccount({ quotaFetchedAt: fresh });
    seedAccount({ quotaFetchedAt: fresh });

    let called = 0;
    fetchHandler = () => {
      called++;
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const result = await refreshStaleQuotas();
    expect(result.scanned).toBe(0);
    expect(called).toBe(0);
  });

  test("stale + null quota rows get refreshed in parallel", async () => {
    seedAccount({ quotaFetchedAt: null }); // never fetched
    seedAccount({ quotaFetchedAt: new Date(Date.now() - 10 * 60_000) }); // 10m stale

    let called = 0;
    const seenAuthHeaders = new Set<string>();
    fetchHandler = (_url, init) => {
      called++;
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.["Authorization"]) seenAuthHeaders.add(headers["Authorization"]);
      return new Response(
        JSON.stringify({
          five_hour: { utilization: 0.1, resets_at: Math.floor(Date.now() / 1000) + 600 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await refreshStaleQuotas();
    expect(result.scanned).toBe(2);
    expect(result.refreshed).toBe(2);
    expect(called).toBe(2);
    // Two distinct bearer tokens → two distinct accounts exercised
    expect(seenAuthHeaders.size).toBe(2);
  });

  test("skips rows with status != ready", async () => {
    seedAccount({ status: "expired", quotaFetchedAt: null });
    seedAccount({ status: "error", quotaFetchedAt: null });
    seedAccount({ status: "rate_limited", quotaFetchedAt: null });

    let called = 0;
    fetchHandler = () => {
      called++;
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const result = await refreshStaleQuotas();
    expect(result.scanned).toBe(0);
    expect(called).toBe(0);
  });

  test("skips rows with skipInRotation=true", async () => {
    seedAccount({ skipInRotation: true, quotaFetchedAt: null });
    seedAccount({ skipInRotation: false, quotaFetchedAt: null });

    let called = 0;
    fetchHandler = () => {
      called++;
      return new Response(
        JSON.stringify({
          five_hour: { utilization: 0.05, resets_at: Math.floor(Date.now() / 1000) + 600 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await refreshStaleQuotas();
    expect(result.scanned).toBe(1);
    expect(called).toBe(1);
  });

  test("concurrency cap — never more than N in-flight simultaneously", async () => {
    // Seed 6 stale rows; ask for concurrency=2; track peak in-flight count.
    for (let i = 0; i < 6; i++) seedAccount({ quotaFetchedAt: null });

    let inFlight = 0;
    let peak = 0;
    fetchHandler = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return new Response(
        JSON.stringify({
          five_hour: { utilization: 0.1, resets_at: Math.floor(Date.now() / 1000) + 600 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await refreshStaleQuotas(5 * 60_000, { concurrency: 2 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("per-call timeout falls back to stale data", async () => {
    seedAccount({ quotaFetchedAt: null });

    fetchHandler = () =>
      // Stall indefinitely — our per-call timeout must kick in.
      new Promise<Response>(() => {
        /* never resolves */
      });

    const started = Date.now();
    const result = await refreshStaleQuotas(5 * 60_000, { timeoutMs: 50 });
    const elapsed = Date.now() - started;
    // Timeout budget + tiny JS overhead — should be well under 500ms.
    expect(elapsed).toBeLessThan(500);
    expect(result.failed).toBe(1);
    expect(result.refreshed).toBe(0);
  });
});
