/**
 * Unit tests for profile-fetcher — Anthropic OAuth profile lookup +
 * persistence of canonical account.uuid / email onto the accounts row.
 *
 * Uses an in-memory SQLite DB and a mocked `fetch` global. Because
 * `mock.module` is process-wide in bun:test, this file should run in its
 * own `bun test` invocation (see feedback_bun_mock_isolation).
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { createTestDb } from "../test-utils.js";

// Encryption key MUST be set before importing crypto consumers.
process.env.COMPANION_ENCRYPTION_KEY = process.env.COMPANION_ENCRYPTION_KEY ?? "test-key-profile";

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;

const dbMockFactory = () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../db/client.js"), dbMockFactory);

// Import AFTER mock so the service binds to the mocked db client.
import {
  fetchOAuthProfile,
  refreshAccountProfile,
  backfillAccountProfiles,
} from "./profile-fetcher.js";
import { encrypt } from "./crypto.js";
import { accounts } from "../db/schema.js";
import { eq } from "drizzle-orm";

const VALID_PROFILE = {
  account: {
    uuid: "b9418a33-5794-4e9c-8354-b4958df49802",
    email: "test@example.com",
    display_name: "Test User",
    full_name: "Test Full",
    has_claude_max: true,
  },
  organization: {
    uuid: "ce114897-2b5a-4264-9f9a-78f35c1fdd8d",
    name: "Test Org",
  },
};

function makeResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup() {
  const result = createTestDb();
  currentDb = result.db;
  currentSqlite = result.sqlite;
  return result;
}

function insertAccount(opts: {
  id?: string;
  fingerprint?: string;
  identity?: string;
  accessToken?: string;
  refreshToken?: string;
  profileFetchedAt?: number | null;
}): string {
  const id = opts.id ?? randomUUID();
  const creds = {
    accessToken: opts.accessToken ?? "sk-ant-oat01-test-access",
    refreshToken: opts.refreshToken ?? "sk-ant-ort01-test-refresh",
    expiresAt: Date.now() + 3_600_000,
    scopes: ["user:profile"],
    subscriptionType: "max",
    rateLimitTier: "default_claude_max_20x",
  };
  const encrypted = encrypt(JSON.stringify(creds));
  const now = Date.now();
  currentSqlite!.run(
    `INSERT INTO accounts
       (id, label, fingerprint, identity, encrypted_credentials, subscription_type, rate_limit_tier,
        is_active, status, total_cost_usd, skip_in_rotation, profile_fetched_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'ready', 0, 0, ?, ?, ?)`,
    [
      id,
      "Test #1",
      opts.fingerprint ?? `fp${id.slice(0, 12)}`,
      opts.identity ?? `id${id.slice(0, 12)}`,
      encrypted,
      "max",
      "default_claude_max_20x",
      opts.profileFetchedAt ?? null,
      now,
      now,
    ],
  );
  return id;
}

describe("fetchOAuthProfile", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("parses a valid profile response", async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, VALID_PROFILE));
    const profile = await fetchOAuthProfile("token-abc");
    expect(profile).toEqual({
      accountUuid: VALID_PROFILE.account.uuid,
      email: VALID_PROFILE.account.email,
      displayName: VALID_PROFILE.account.display_name,
      organizationUuid: VALID_PROFILE.organization.uuid,
      organizationName: VALID_PROFILE.organization.name,
    });
  });

  it("falls back to full_name when display_name missing", async () => {
    const body = {
      account: {
        uuid: "11111111-2222-3333-4444-555555555555",
        full_name: "Only Full",
      },
      organization: { uuid: "66666666-7777-8888-9999-000000000000", name: "Org" },
    };
    fetchSpy.mockResolvedValue(makeResponse(200, body));
    const profile = await fetchOAuthProfile("t");
    expect(profile?.displayName).toBe("Only Full");
    expect(profile?.email).toBeNull();
  });

  it("returns null on non-2xx status", async () => {
    fetchSpy.mockResolvedValue(makeResponse(401, { type: "error" }));
    expect(await fetchOAuthProfile("t")).toBeNull();
  });

  it("returns null when account.uuid is missing", async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { account: {} }));
    expect(await fetchOAuthProfile("t")).toBeNull();
  });

  // F4: defend oauth_subject from crafted/garbage values that would otherwise
  // poison merge groups (e.g. a malicious upstream that returns "admin").
  it("returns null when account.uuid is not RFC-4122", async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, { account: { uuid: "not-a-uuid", email: "x@y.z" } }),
    );
    expect(await fetchOAuthProfile("t")).toBeNull();
  });

  // F3: redirect: error means a 3xx from the upstream becomes a fetch reject —
  // we should swallow it and return null rather than follow the redirect with
  // our Bearer token attached.
  it("does not follow redirects (token-exfil defense)", async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, VALID_PROFILE));
    await fetchOAuthProfile("t");
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.redirect).toBe("error");
  });

  it("returns null on network error (does not throw)", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchOAuthProfile("t")).toBeNull();
  });

  it("sends Bearer auth header", async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, VALID_PROFILE));
    await fetchOAuthProfile("my-token-xyz");
    const call = fetchSpy.mock.calls[0]!;
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-token-xyz");
  });
});

describe("refreshAccountProfile", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setup();
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
  });

  it("persists profile fields onto the account row", async () => {
    const id = insertAccount({});
    fetchSpy.mockResolvedValue(makeResponse(200, VALID_PROFILE));

    const result = await refreshAccountProfile(id);

    expect(result?.accountUuid).toBe(VALID_PROFILE.account.uuid);
    const row = currentDb!.select().from(accounts).where(eq(accounts.id, id)).get();
    expect(row?.oauthSubject).toBe(VALID_PROFILE.account.uuid);
    expect(row?.email).toBe(VALID_PROFILE.account.email);
    expect(row?.displayName).toBe(VALID_PROFILE.account.display_name);
    expect(row?.organizationUuid).toBe(VALID_PROFILE.organization.uuid);
    expect(row?.organizationName).toBe(VALID_PROFILE.organization.name);
    expect(row?.profileFetchedAt).toBeInstanceOf(Date);
  });

  it("returns null when account does not exist (no DB write)", async () => {
    const result = await refreshAccountProfile("nonexistent-id");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips network call when within TTL", async () => {
    const id = insertAccount({ profileFetchedAt: Date.now() - 60_000 }); // 1 min ago
    const result = await refreshAccountProfile(id);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("force=true bypasses the TTL", async () => {
    const id = insertAccount({ profileFetchedAt: Date.now() - 60_000 });
    fetchSpy.mockResolvedValue(makeResponse(200, VALID_PROFILE));

    const result = await refreshAccountProfile(id, { force: true });
    expect(result?.accountUuid).toBe(VALID_PROFILE.account.uuid);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not crash on fetch failure (returns null, no DB change)", async () => {
    const id = insertAccount({});
    fetchSpy.mockResolvedValue(makeResponse(500, { type: "error" }));

    const result = await refreshAccountProfile(id);
    expect(result).toBeNull();

    const row = currentDb!.select().from(accounts).where(eq(accounts.id, id)).get();
    expect(row?.oauthSubject).toBeNull();
    expect(row?.profileFetchedAt).toBeNull();
  });

  it("merges sibling rows once subject is written", async () => {
    // Two rows with different identities (distinct refresh-token hashes) but
    // owned by the same Anthropic account. After fetch fills oauthSubject on
    // the second row, it should collapse into the first.
    const idA = insertAccount({
      identity: "id-aaa",
      accessToken: "sk-ant-oat01-A",
      refreshToken: "sk-ant-ort01-A",
    });
    // Pre-seed subject on idA so the merge has a target.
    currentDb!
      .update(accounts)
      .set({ oauthSubject: VALID_PROFILE.account.uuid })
      .where(eq(accounts.id, idA))
      .run();

    const idB = insertAccount({
      identity: "id-bbb",
      accessToken: "sk-ant-oat01-B",
      refreshToken: "sk-ant-ort01-B",
    });
    fetchSpy.mockResolvedValue(makeResponse(200, VALID_PROFILE));

    await refreshAccountProfile(idB, { force: true });

    const remaining = currentDb!.select().from(accounts).all();
    expect(remaining).toHaveLength(1);
    // Survivor priority: neither row is active, so most-recent createdAt wins.
    // Both rows are inserted with `now`, so order depends on iteration; assert
    // by surviving subject instead of id.
    expect(remaining[0]?.oauthSubject).toBe(VALID_PROFILE.account.uuid);
  });
});

describe("backfillAccountProfiles", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setup();
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
  });

  it("returns zeros when no rows need backfill", async () => {
    insertAccount({}); // already has profileFetchedAt? No — but oauthSubject is null
    // Pre-fill subject so the row is excluded.
    currentDb!.update(accounts).set({ oauthSubject: "preset" }).run();

    const result = await backfillAccountProfiles();
    expect(result).toEqual({ scanned: 0, fetched: 0, failed: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and persists for each row missing oauth_subject", async () => {
    const ids = [
      insertAccount({ accessToken: "tok-1", refreshToken: "ref-1" }),
      insertAccount({ accessToken: "tok-2", refreshToken: "ref-2" }),
    ];
    // Mark one row as already having subject — backfill must skip it.
    insertAccount({ accessToken: "tok-3", refreshToken: "ref-3" });
    currentDb!
      .update(accounts)
      .set({ oauthSubject: "preset-3" })
      .where(eq(accounts.id, currentDb!.select().from(accounts).all()[2]!.id))
      .run();

    let counter = 0;
    fetchSpy.mockImplementation(async () => {
      counter++;
      // Synthesize a deterministic per-call UUID so each backfill row gets a
      // unique canonical subject. Matches RFC-4122 to satisfy F4 validation.
      const c = String(counter).padStart(2, "0");
      const uuid = `aaaaaaaa-bbbb-cccc-dddd-0000000000${c}`;
      return makeResponse(200, {
        ...VALID_PROFILE,
        account: { ...VALID_PROFILE.account, uuid },
      });
    });

    const result = await backfillAccountProfiles();
    expect(result.scanned).toBe(2);
    expect(result.fetched).toBe(2);
    expect(result.failed).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    for (const id of ids) {
      const row = currentDb!.select().from(accounts).where(eq(accounts.id, id)).get();
      expect(row?.oauthSubject).toMatch(/^aaaaaaaa-bbbb-cccc-dddd-\d+$/);
    }
  }, 10_000);

  it("counts failed fetches without aborting the loop", async () => {
    insertAccount({ accessToken: "tok-1", refreshToken: "ref-1" });
    insertAccount({ accessToken: "tok-2", refreshToken: "ref-2" });

    let call = 0;
    fetchSpy.mockImplementation(async () => {
      call++;
      if (call === 1) return makeResponse(500, { type: "error" });
      return makeResponse(200, VALID_PROFILE);
    });

    const result = await backfillAccountProfiles();
    expect(result.scanned).toBe(2);
    expect(result.fetched).toBe(1);
    expect(result.failed).toBe(1);
  }, 10_000);
});
