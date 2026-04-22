/**
 * Tests for `findNextReadyAsync` — the Phase 2 quota-gated round-robin.
 *
 * Covers the quota-gate decision matrix, the deadlock fallback, the stale
 * bypass rule, and the JIT refresh hand-off. Fetch is stubbed so no
 * network calls leave the machine.
 *
 * Bun mock.module isolation: this file mocks `../db/client.js`; run in its
 * own `bun test` invocation alongside usage-fetcher / oauth-token-service
 * tests to avoid cross-file leakage.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestDb } from "./test-db.js";
import { accounts, sessions, settings } from "../db/schema.js";

process.env.COMPANION_ENCRYPTION_KEY ??= "test-key-for-find-next-ready-async-only";

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
const { findNextReadyAsync, findNextReady } = await import(
  "../services/credential-manager.js"
);
const {
  ACCOUNT_SWITCH_THRESHOLD_KEY,
  ACCOUNT_WARN_THRESHOLD_KEY,
} = await import("@companion/shared");

// ─── Fetch stub ────────────────────────────────────────────────────────────
//
// These tests seed `quotaFetchedAt` + util columns directly via Drizzle.
// findNextReadyAsync's JIT refresh (`refreshStaleQuotas`) must not clobber
// those seeds when it runs — so the stub returns a 503 which makes the
// usage-fetcher bail early with parsed=null and persistUsage is never
// called. Result: quota columns stay exactly as we seeded them.

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls++;
  return new Response(JSON.stringify({ error: "stubbed" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}) as unknown as typeof fetch;

// ─── Seed helpers ───────────────────────────────────────────────────────────

interface SeedOpts {
  label?: string;
  isActive?: boolean;
  skipInRotation?: boolean;
  status?: string;
  lastUsedAt?: Date | null;
  quotaFiveHourUtil?: number | null;
  quotaSevenDayUtil?: number | null;
  quotaFetchedAt?: Date | null;
}

function seedAccount(opts: SeedOpts = {}): string {
  const id = randomUUID();
  // `rowToAccountQuota` only builds a window when BOTH util and resetsAt
  // are present. Fill in a dummy resets_at alongside any util so the test
  // rows actually surface through maxQuotaUtil().
  const resetsAt = new Date(Date.now() + 3_600_000);
  testDbResult.db
    .insert(accounts)
    .values({
      id,
      label: opts.label ?? "Test Account",
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
      isActive: opts.isActive ?? false,
      skipInRotation: opts.skipInRotation ?? false,
      lastUsedAt: opts.lastUsedAt ?? null,
      quotaFiveHourUtil: opts.quotaFiveHourUtil ?? null,
      quotaFiveHourResetsAt: opts.quotaFiveHourUtil != null ? resetsAt : null,
      quotaSevenDayUtil: opts.quotaSevenDayUtil ?? null,
      quotaSevenDayResetsAt: opts.quotaSevenDayUtil != null ? resetsAt : null,
      quotaFetchedAt: opts.quotaFetchedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return id;
}

function setSetting(key: string, value: string): void {
  testDbResult.db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    })
    .run();
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
  testDbResult.db.delete(settings).run();
  fetchCalls = 0;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("findNextReadyAsync — quota-gated round-robin", () => {
  test("picks account under threshold even if it's not the LRU", async () => {
    // Seed: alpha (under) is NEWER than beta (over). Sync picker would pick
    // beta (oldest lastUsedAt). Async must pick alpha because beta is over
    // the 0.9 switch threshold.
    const fresh = new Date(Date.now() - 60_000); // fresh quota
    const alpha = seedAccount({
      label: "alpha",
      lastUsedAt: new Date(Date.now() - 1_000_000), // more recent
      quotaFiveHourUtil: 0.2,
      quotaSevenDayUtil: 0.1,
      quotaFetchedAt: fresh,
    });
    seedAccount({
      label: "beta",
      lastUsedAt: new Date(Date.now() - 5_000_000), // older
      quotaFiveHourUtil: 0.95,
      quotaSevenDayUtil: 0.1,
      quotaFetchedAt: fresh,
    });

    const pick = await findNextReadyAsync();
    expect(pick?.id).toBe(alpha);
  });

  test("weekly window drives the MAX-util gate", async () => {
    // alpha 5h=20%, weekly=92% → maxUtil=0.92, above 0.9 default threshold
    // beta 5h=5%, weekly=5% → under threshold
    const fresh = new Date(Date.now() - 60_000);
    seedAccount({
      label: "alpha-weekly-hot",
      lastUsedAt: new Date(Date.now() - 10_000_000),
      quotaFiveHourUtil: 0.2,
      quotaSevenDayUtil: 0.92,
      quotaFetchedAt: fresh,
    });
    const beta = seedAccount({
      label: "beta",
      lastUsedAt: new Date(Date.now() - 5_000_000),
      quotaFiveHourUtil: 0.05,
      quotaSevenDayUtil: 0.05,
      quotaFetchedAt: fresh,
    });

    const pick = await findNextReadyAsync();
    expect(pick?.id).toBe(beta);
  });

  test("custom switchThreshold 0.95 lets a 0.92 account through", async () => {
    const fresh = new Date(Date.now() - 60_000);
    const alpha = seedAccount({
      label: "alpha",
      lastUsedAt: new Date(Date.now() - 10_000_000),
      quotaFiveHourUtil: 0.2,
      quotaSevenDayUtil: 0.92,
      quotaFetchedAt: fresh,
    });
    seedAccount({
      label: "beta",
      lastUsedAt: new Date(Date.now() - 5_000_000),
      quotaFiveHourUtil: 0.5,
      quotaSevenDayUtil: 0.5,
      quotaFetchedAt: fresh,
    });
    setSetting(ACCOUNT_SWITCH_THRESHOLD_KEY, "0.95");

    const pick = await findNextReadyAsync();
    expect(pick?.id).toBe(alpha); // LRU wins because gate no longer blocks
  });

  test("all accounts over threshold → picks least-over-limit (fallback)", async () => {
    const fresh = new Date(Date.now() - 60_000);
    seedAccount({
      label: "high",
      quotaFiveHourUtil: 0.99,
      quotaFetchedAt: fresh,
    });
    const medium = seedAccount({
      label: "medium",
      quotaFiveHourUtil: 0.91,
      quotaFetchedAt: fresh,
    });
    seedAccount({
      label: "also-high",
      quotaFiveHourUtil: 0.95,
      quotaFetchedAt: fresh,
    });

    const pick = await findNextReadyAsync();
    expect(pick?.id).toBe(medium);
  });

  test("stale quota → gate skipped for that row (treated as maxUtil=0)", async () => {
    // alpha has an OLD quota reading (>5m) that's over threshold. Without
    // the stale bypass, the gate would exclude it; with the bypass, the
    // async picker trusts the row and lets the reactive path catch any
    // real rate limit.
    const stale = new Date(Date.now() - 10 * 60_000);
    const alpha = seedAccount({
      label: "alpha",
      lastUsedAt: new Date(Date.now() - 10_000_000),
      quotaFiveHourUtil: 0.99,
      quotaFetchedAt: stale,
    });
    seedAccount({
      label: "beta",
      lastUsedAt: new Date(Date.now() - 5_000_000),
      quotaFiveHourUtil: 0.2,
      quotaFetchedAt: new Date(Date.now() - 60_000),
    });

    const pick = await findNextReadyAsync();
    // alpha is older, so LRU picks it. Stale bypass rules it in.
    expect(pick?.id).toBe(alpha);
  });

  test("null quota (never fetched) → treated as maxUtil=0, not excluded", async () => {
    const alpha = seedAccount({ label: "alpha", lastUsedAt: new Date(Date.now() - 1_000) });
    const pick = await findNextReadyAsync();
    expect(pick?.id).toBe(alpha);
  });

  test("skipInRotation accounts are excluded unless includeSkipped=true", async () => {
    seedAccount({ label: "alpha", skipInRotation: true });
    const beta = seedAccount({ label: "beta", skipInRotation: false });

    expect((await findNextReadyAsync())?.id).toBe(beta);
    // includeSkipped=true still picks non-skipped first because LRU ties,
    // but seedAccount uses fresh UUIDs so we test the include path with a
    // scenario where ONLY a skipped account exists.
    testDbResult.db.delete(accounts).run();
    const onlySkipped = seedAccount({ label: "only-skipped", skipInRotation: true });
    expect(await findNextReadyAsync(undefined, false)).toBeUndefined();
    expect((await findNextReadyAsync(undefined, true))?.id).toBe(onlySkipped);
  });

  test("excludeId filters the active account", async () => {
    const active = seedAccount({ label: "active" });
    const other = seedAccount({ label: "other" });
    expect((await findNextReadyAsync(active))?.id).toBe(other);
    expect(findNextReady(active)?.id).toBe(other); // sync parity sanity check
  });
});
