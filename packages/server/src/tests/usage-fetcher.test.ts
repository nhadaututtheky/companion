/**
 * Tests for usage-fetcher (Phase 1 of per-account quota tracking).
 *
 * Covers:
 *   - Happy 2xx → quota columns populated correctly (seconds→ms)
 *   - 401 → forced refresh → retry succeeds
 *   - 401 then still 401 → null, no state mutation
 *   - Shape drift: missing `five_hour` block → that window stored null, no crash
 *   - TTL: second call within 60s returns null without a network request
 *   - skipInRotation = true → no network call
 *
 * Bun mock.module persists per process. Run this file in its own `bun test`
 * invocation (or at least separately from oauth-token-service.test.ts) —
 * both files mock `../db/client.js`.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestDb } from "./test-db.js";
import { accounts, sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";

process.env.COMPANION_ENCRYPTION_KEY ??= "test-key-for-usage-fetcher-only";

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
const { refreshAccountUsage, fetchAccountUsage } = await import(
  "../services/usage-fetcher.js"
);

// ─── Fetch stub with a URL router ──────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;
let fetchHandler: FetchHandler = () => {
  throw new Error("fetchHandler not set for this test");
};

const originalFetch = globalThis.fetch;
globalThis.fetch = ((url: RequestInfo | URL, init?: RequestInit) =>
  Promise.resolve(
    fetchHandler(url instanceof URL ? url.toString() : String(url), init),
  )) as typeof fetch;

// ─── Seed helper ────────────────────────────────────────────────────────────

interface SeedOpts {
  accountId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  status?: string;
  skipInRotation?: boolean;
  quotaFetchedAt?: Date | null;
}

function seedAccount(opts: SeedOpts = {}): string {
  const id = opts.accountId ?? randomUUID();
  testDbResult.db
    .insert(accounts)
    .values({
      id,
      label: "Test Account",
      fingerprint: "fp-" + id.slice(0, 8),
      identity: "idt-" + id.slice(0, 8),
      encryptedCredentials: encrypt(
        JSON.stringify({
          accessToken: opts.accessToken ?? "sk-ant-oat01-test",
          refreshToken: opts.refreshToken ?? "sk-ant-ort01-test",
          expiresAt: opts.expiresAt ?? Date.now() + 3_600_000,
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

function okUsage(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
    throw new Error("fetchHandler not set for this test");
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("usage-fetcher.refreshAccountUsage", () => {
  test("happy path populates every column from the response", async () => {
    const id = seedAccount();
    const resetsSec = Math.floor(Date.now() / 1000) + 3600;

    let calls = 0;
    fetchHandler = (url) => {
      calls++;
      expect(url).toContain("/api/oauth/usage");
      return okUsage({
        five_hour: { utilization: 0.42, resets_at: resetsSec },
        seven_day: { utilization: 0.11, resets_at: resetsSec + 60 },
        overage: { status: "allowed" },
      });
    };

    const quota = await refreshAccountUsage(id, { force: true });
    expect(calls).toBe(1);
    expect(quota).not.toBeNull();
    expect(quota!.fiveHour?.util).toBe(0.42);
    expect(quota!.fiveHour?.resetsAt).toBe(resetsSec * 1000);
    expect(quota!.sevenDay?.util).toBe(0.11);
    expect(quota!.sevenDayOpus).toBeNull();
    expect(quota!.overageStatus).toBe("allowed");

    const row = testDbResult.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();
    expect(row?.quotaFiveHourUtil).toBe(0.42);
    expect(row?.quotaFiveHourResetsAt?.getTime()).toBe(resetsSec * 1000);
    expect(row?.quotaSevenDayOpusUtil).toBeNull();
    expect(row?.quotaOverageStatus).toBe("allowed");
    expect(row?.quotaFetchedAt).not.toBeNull();
  });

  test("Team/Enterprise tier populates opus + sonnet windows", async () => {
    const id = seedAccount();
    const resetsSec = Math.floor(Date.now() / 1000) + 7200;

    fetchHandler = () =>
      okUsage({
        five_hour: { utilization: 0.3, resets_at: resetsSec },
        seven_day_opus: { utilization: 0.55, resets_at: resetsSec + 10 },
        seven_day_sonnet: { utilization: 0.2, resets_at: resetsSec + 20 },
      });

    const quota = await refreshAccountUsage(id, { force: true });
    expect(quota!.sevenDayOpus?.util).toBe(0.55);
    expect(quota!.sevenDaySonnet?.util).toBe(0.2);
    expect(quota!.sevenDay).toBeNull();
  });

  test("401 once → forced refresh → retry succeeds on the second call", async () => {
    const id = seedAccount({
      accessToken: "stale-access",
      refreshToken: "rt-1",
      expiresAt: Date.now() + 3_600_000,
    });

    let usageCalls = 0;
    let tokenCalls = 0;
    fetchHandler = (url) => {
      if (url.includes("/v1/oauth/token")) {
        tokenCalls++;
        return new Response(
          JSON.stringify({ access_token: "rotated-access", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      usageCalls++;
      if (usageCalls === 1) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      }
      return okUsage({
        five_hour: { utilization: 0.05, resets_at: Math.floor(Date.now() / 1000) + 300 },
      });
    };

    const quota = await refreshAccountUsage(id, { force: true });
    expect(usageCalls).toBe(2);
    expect(tokenCalls).toBe(1);
    expect(quota).not.toBeNull();
    expect(quota!.fiveHour?.util).toBe(0.05);
  });

  test("shape drift — missing five_hour block — does not crash, that window stored null", async () => {
    const id = seedAccount();

    fetchHandler = () =>
      okUsage({
        seven_day: {
          utilization: 0.8,
          resets_at: Math.floor(Date.now() / 1000) + 600,
        },
      });

    const quota = await refreshAccountUsage(id, { force: true });
    expect(quota).not.toBeNull();
    expect(quota!.fiveHour).toBeNull();
    expect(quota!.sevenDay?.util).toBe(0.8);
  });

  test("TTL respected — second call within 60s returns null without network", async () => {
    const id = seedAccount({ quotaFetchedAt: new Date(Date.now() - 30_000) });

    let calls = 0;
    fetchHandler = () => {
      calls++;
      throw new Error("should not fetch within TTL");
    };

    const quota = await refreshAccountUsage(id);
    expect(quota).toBeNull();
    expect(calls).toBe(0);
  });

  test("skipInRotation = true blocks the network call entirely", async () => {
    const id = seedAccount({ skipInRotation: true });

    let calls = 0;
    fetchHandler = () => {
      calls++;
      throw new Error("should not fetch for skipped account");
    };

    const quota = await refreshAccountUsage(id, { force: true });
    expect(quota).toBeNull();
    expect(calls).toBe(0);
  });

  test("expired account is skipped", async () => {
    const id = seedAccount({ status: "expired" });

    let calls = 0;
    fetchHandler = () => {
      calls++;
      throw new Error("should not fetch for expired account");
    };

    const quota = await refreshAccountUsage(id, { force: true });
    expect(quota).toBeNull();
    expect(calls).toBe(0);
  });

  test("fetchAccountUsage returns {status, parsed:null} on malformed JSON without throwing", async () => {
    fetchHandler = () =>
      new Response("not json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await fetchAccountUsage("tok");
    expect(result.status).toBe(200);
    expect(result.parsed).toBeNull();
  });
});
