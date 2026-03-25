/**
 * Unit tests for settings-helpers — getSetting, getSettingInt, getSettingBool.
 * Uses an in-memory SQLite DB.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "../test-utils.js";

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;

mock.module("../db/client.js", () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
}));

// Import AFTER mock
import { getSetting, getSettingInt, getSettingBool } from "./settings-helpers.js";

function setup() {
  const result = createTestDb();
  currentDb = result.db;
  currentSqlite = result.sqlite;
  return result;
}

function insertSetting(sqlite: Database, key: string, value: string) {
  sqlite.run(
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
    [key, value, Date.now()],
  );
}

describe("getSetting", () => {
  let sqlite: Database;

  beforeEach(() => {
    const result = setup();
    sqlite = result.sqlite;
  });

  afterEach(() => {
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
  });

  it("returns undefined for missing key", () => {
    expect(getSetting("nonexistent")).toBeUndefined();
  });

  it("returns stored value", () => {
    insertSetting(sqlite, "anti.cdpHost", "192.168.1.100");
    expect(getSetting("anti.cdpHost")).toBe("192.168.1.100");
  });

  it("returns undefined for empty string value", () => {
    insertSetting(sqlite, "anti.empty", "");
    expect(getSetting("anti.empty")).toBeUndefined();
  });
});

describe("getSettingInt", () => {
  let sqlite: Database;

  beforeEach(() => {
    const result = setup();
    sqlite = result.sqlite;
  });

  afterEach(() => {
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
  });

  it("returns fallback for missing key", () => {
    expect(getSettingInt("missing", 9000)).toBe(9000);
  });

  it("returns parsed int from stored value", () => {
    insertSetting(sqlite, "anti.cdpBasePort", "9222");
    expect(getSettingInt("anti.cdpBasePort", 9000)).toBe(9222);
  });

  it("returns fallback for non-numeric value", () => {
    insertSetting(sqlite, "anti.cdpBasePort", "notanumber");
    expect(getSettingInt("anti.cdpBasePort", 9000)).toBe(9000);
  });
});

describe("getSettingBool", () => {
  let sqlite: Database;

  beforeEach(() => {
    const result = setup();
    sqlite = result.sqlite;
  });

  afterEach(() => {
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
  });

  it("returns fallback for missing key", () => {
    expect(getSettingBool("missing", false)).toBe(false);
    expect(getSettingBool("missing", true)).toBe(true);
  });

  it("returns true when value is 'true'", () => {
    insertSetting(sqlite, "anti.autoApprove", "true");
    expect(getSettingBool("anti.autoApprove", false)).toBe(true);
  });

  it("returns false when value is 'false'", () => {
    insertSetting(sqlite, "anti.autoApprove", "false");
    expect(getSettingBool("anti.autoApprove", true)).toBe(false);
  });

  it("returns false for any non-'true' string", () => {
    insertSetting(sqlite, "anti.autoApprove", "yes");
    expect(getSettingBool("anti.autoApprove", true)).toBe(false);
  });
});
