/**
 * Tests for oauth-token-service (Phase 1 of per-account quota tracking).
 *
 * Covers:
 *   - Cached token returned when fresh (no network)
 *   - Expired token triggers refresh and persists new access_token
 *   - 5× concurrent callers share ONE refresh (per-account mutex)
 *   - 400 invalid_grant marks account expired + emits `account:expired`
 *   - Network error returns null, does NOT touch DB state
 *   - Missing refresh_token in stored blob marks account expired
 *
 * Bun mock.module persists per process — see memory
 * `feedback_bun_mock_isolation.md`. If another test file starts mocking the
 * same modules, run this file in its own `bun test` invocation.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestDb } from "./test-db.js";
import { accounts, sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";

process.env.COMPANION_ENCRYPTION_KEY ??= "test-key-for-oauth-token-service-only";

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

const { encrypt, decrypt } = await import("../services/crypto.js");
const { eventBus } = await import("../services/event-bus.js");
const {
  getAccessToken,
  refreshAccessToken,
  __clearInFlightRefreshes,
  CLAUDE_CODE_OAUTH_CLIENT_ID,
} = await import("../services/oauth-token-service.js");

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;
let fetchHandler: FetchHandler = () => {
  throw new Error("fetchHandler not set for this test");
};

const originalFetch = globalThis.fetch;
globalThis.fetch = ((url: RequestInfo | URL, init?: RequestInit) =>
  Promise.resolve(
    fetchHandler(url instanceof URL ? url.toString() : String(url), init),
  )) as typeof fetch;

// ─── Seed helpers ───────────────────────────────────────────────────────────

interface SeedOpts {
  accountId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  status?: string;
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
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return id;
}

function readStoredCreds(id: string): { accessToken: string; refreshToken: string; expiresAt: number } {
  const row = testDbResult.db
    .select({ encryptedCredentials: accounts.encryptedCredentials })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();
  if (!row) throw new Error(`account ${id} not found`);
  return JSON.parse(decrypt(row.encryptedCredentials));
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

describe("oauth-token-service.getAccessToken", () => {
  test("returns cached access token when not near expiry (no network)", async () => {
    const id = seedAccount({
      accessToken: "cached-token",
      expiresAt: Date.now() + 3_600_000,
    });
    let fetchCalls = 0;
    fetchHandler = () => {
      fetchCalls++;
      throw new Error("should not fetch");
    };

    const token = await getAccessToken(id);
    expect(token).toBe("cached-token");
    expect(fetchCalls).toBe(0);
  });

  test("refreshes when stored token is within the 60s skew window", async () => {
    const id = seedAccount({
      accessToken: "stale-token",
      refreshToken: "refresh-abc",
      // 30s from now — inside the 60s skew, so refresh is required.
      expiresAt: Date.now() + 30_000,
    });

    let capturedBody = "";
    fetchHandler = (_url, init) => {
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          access_token: "fresh-token",
          refresh_token: "refresh-def",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const token = await getAccessToken(id);
    expect(token).toBe("fresh-token");
    expect(capturedBody).toContain("grant_type=refresh_token");
    expect(capturedBody).toContain(`client_id=${CLAUDE_CODE_OAUTH_CLIENT_ID}`);
    expect(capturedBody).toContain("refresh_token=refresh-abc");

    const stored = readStoredCreds(id);
    expect(stored.accessToken).toBe("fresh-token");
    expect(stored.refreshToken).toBe("refresh-def");
    expect(stored.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
  });

  test("five concurrent callers share exactly one network refresh", async () => {
    const id = seedAccount({
      accessToken: "stale",
      expiresAt: Date.now() - 1_000,
    });

    let fetchCalls = 0;
    fetchHandler = async () => {
      fetchCalls++;
      // Hold the promise open for a tick so concurrent callers all queue up
      // on the same in-flight refresh.
      await new Promise((r) => setTimeout(r, 20));
      return new Response(
        JSON.stringify({
          access_token: "shared-fresh",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const tokens = await Promise.all([
      getAccessToken(id),
      getAccessToken(id),
      getAccessToken(id),
      getAccessToken(id),
      getAccessToken(id),
    ]);
    expect(tokens.every((t) => t === "shared-fresh")).toBe(true);
    expect(fetchCalls).toBe(1);
  });

  test("400 invalid_grant marks account expired and emits event", async () => {
    const id = seedAccount({
      accessToken: "stale",
      expiresAt: Date.now() - 1_000,
    });

    fetchHandler = () =>
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "refresh token revoked" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );

    let expiredEvent: { accountId: string; reason: string } | null = null;
    const off = eventBus.on("account:expired", (payload) => {
      expiredEvent = { accountId: payload.accountId, reason: payload.reason };
    });

    const token = await getAccessToken(id);
    off();

    expect(token).toBeNull();
    const row = testDbResult.db
      .select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();
    expect(row?.status).toBe("expired");
    expect(expiredEvent).not.toBeNull();
    expect(expiredEvent!.accountId).toBe(id);
    expect(expiredEvent!.reason).toMatch(/invalid_grant/);
  });

  test("network error returns null without mutating stored credentials", async () => {
    const id = seedAccount({
      accessToken: "stale",
      refreshToken: "refresh-xyz",
      expiresAt: Date.now() - 1_000,
    });

    fetchHandler = () => {
      throw new Error("simulated ECONNRESET");
    };

    const token = await getAccessToken(id);
    expect(token).toBeNull();

    const stored = readStoredCreds(id);
    // Original access_token still stored — no partial write on failure.
    expect(stored.accessToken).toBe("stale");
    expect(stored.refreshToken).toBe("refresh-xyz");

    const row = testDbResult.db
      .select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();
    // Network failure should NOT mark the account expired — transient.
    expect(row?.status).toBe("ready");
  });

  test("missing refresh_token in stored blob marks account expired", async () => {
    const id = randomUUID();
    testDbResult.db
      .insert(accounts)
      .values({
        id,
        label: "Broken Account",
        fingerprint: "fp-broken",
        identity: "idt-broken",
        encryptedCredentials: encrypt(
          JSON.stringify({
            accessToken: "stale",
            // refreshToken intentionally missing
            expiresAt: Date.now() - 1_000,
            scopes: [],
          }),
        ),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    let fetchCalls = 0;
    fetchHandler = () => {
      fetchCalls++;
      throw new Error("should not fetch without refresh_token");
    };

    const token = await refreshAccessToken(id);
    expect(token).toBeNull();
    expect(fetchCalls).toBe(0);

    const row = testDbResult.db
      .select({ status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();
    expect(row?.status).toBe("expired");
  });
});
