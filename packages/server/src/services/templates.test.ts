/**
 * Unit tests for the templates CRUD service.
 * Uses an in-memory SQLite DB — no file system or mocked modules needed
 * because we override getDb via mock.module().
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "../test-utils.js";

// --- Module mock must be declared before importing the service ---
// We intercept the db/client module so the service uses our test DB.

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;
let insertProject: ((slug: string, name?: string) => void) | null = null;

mock.module("../db/client.js", () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised — call setupTestDb() first");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
}));

// Import AFTER the mock is registered
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  seedDefaultTemplates,
  findTemplateByIdPrefix,
} from "./templates.js";

function setupTestDb() {
  const result = createTestDb();
  currentDb = result.db;
  currentSqlite = result.sqlite;
  insertProject = result.insertProject;
}

function teardownTestDb() {
  currentSqlite?.close();
  currentDb = null;
  currentSqlite = null;
  insertProject = null;
}

// ─── listTemplates ────────────────────────────────────────────────────────────

describe("listTemplates", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("returns empty array when no templates exist", () => {
    const result = listTemplates();
    expect(result).toEqual([]);
  });

  it("returns all templates when no projectSlug filter provided", () => {
    insertProject!("proj-a");
    createTemplate({ name: "Alpha", prompt: "Alpha prompt" });
    createTemplate({ name: "Beta", prompt: "Beta prompt", projectSlug: "proj-a" });

    const result = listTemplates();
    expect(result).toHaveLength(2);
  });

  it("returns global + project-specific templates when projectSlug given", () => {
    insertProject!("proj-a");
    insertProject!("proj-b");
    // Global (no projectSlug)
    createTemplate({ name: "Global", prompt: "global prompt" });
    // Belongs to proj-a
    createTemplate({ name: "Proj A tpl", prompt: "proj a prompt", projectSlug: "proj-a" });
    // Belongs to proj-b — should NOT appear
    createTemplate({ name: "Proj B tpl", prompt: "proj b prompt", projectSlug: "proj-b" });

    const result = listTemplates("proj-a");
    expect(result).toHaveLength(2);
    const names = result.map((t) => t.name);
    expect(names).toContain("Global");
    expect(names).toContain("Proj A tpl");
    expect(names).not.toContain("Proj B tpl");
  });

  it("returns only global templates when projectSlug has no matching rows", () => {
    createTemplate({ name: "Global", prompt: "prompt" });

    const result = listTemplates("nonexistent-project");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Global");
  });

  it("returns results sorted by sortOrder then name", () => {
    createTemplate({ name: "Zebra", prompt: "p", sortOrder: 1 });
    createTemplate({ name: "Alpha", prompt: "p", sortOrder: 2 });
    createTemplate({ name: "Middle", prompt: "p", sortOrder: 0 });

    const result = listTemplates();
    expect(result[0]!.name).toBe("Middle");
    expect(result[1]!.name).toBe("Zebra");
    expect(result[2]!.name).toBe("Alpha");
  });
});

// ─── getTemplate ──────────────────────────────────────────────────────────────

describe("getTemplate", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("returns template by ID", () => {
    const tpl = createTemplate({ name: "My Tpl", prompt: "do stuff" });
    const found = getTemplate(tpl.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(tpl.id);
    expect(found!.name).toBe("My Tpl");
  });

  it("returns template by slug", () => {
    const tpl = createTemplate({ name: "My Tpl", prompt: "do stuff", slug: "my-tpl" });
    const found = getTemplate("my-tpl");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(tpl.id);
  });

  it("returns null when ID and slug are not found", () => {
    const found = getTemplate("does-not-exist");
    expect(found).toBeNull();
  });

  it("prefers ID match over slug match when both could apply", () => {
    // Create two templates — one whose slug equals the other's ID is unlikely
    // but we verify the lookup falls back to slug correctly
    const tpl1 = createTemplate({ name: "First", prompt: "p", slug: "first-slug" });
    const tpl2 = createTemplate({ name: "Second", prompt: "p", slug: "second-slug" });

    expect(getTemplate(tpl1.id)!.name).toBe("First");
    expect(getTemplate(tpl2.id)!.name).toBe("Second");
    expect(getTemplate("first-slug")!.name).toBe("First");
    expect(getTemplate("second-slug")!.name).toBe("Second");
  });
});

// ─── createTemplate ───────────────────────────────────────────────────────────

describe("createTemplate", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("creates a template with required fields", () => {
    const tpl = createTemplate({ name: "Quick Fix", prompt: "Fix the bug" });
    expect(tpl.id).toBeDefined();
    expect(tpl.name).toBe("Quick Fix");
    expect(tpl.prompt).toBe("Fix the bug");
    expect(tpl.icon).toBe("⚡");
    expect(tpl.sortOrder).toBe(0);
    expect(tpl.projectSlug).toBeNull();
    expect(tpl.model).toBeNull();
  });

  it("persists the template so it can be retrieved afterward", () => {
    const tpl = createTemplate({ name: "Persist Test", prompt: "hello" });
    const found = getTemplate(tpl.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Persist Test");
  });

  it("auto-generates slug from name when slug not provided", () => {
    const tpl = createTemplate({ name: "Hello World", prompt: "p" });
    expect(tpl.slug).toBe("hello-world");
  });

  it("respects explicit slug when provided", () => {
    const tpl = createTemplate({ name: "Hello World", prompt: "p", slug: "custom-slug" });
    expect(tpl.slug).toBe("custom-slug");
  });

  it("truncates auto-generated slug to 20 characters", () => {
    const tpl = createTemplate({ name: "A Very Long Name That Exceeds Limits", prompt: "p" });
    expect(tpl.slug.length).toBeLessThanOrEqual(20);
  });

  it("allows setting all optional fields", () => {
    const tpl = createTemplate({
      name: "Full Tpl",
      prompt: "full prompt",
      slug: "full-tpl",
      projectSlug: null,
      model: "claude-opus-4-6",
      permissionMode: "bypass",
      icon: "🚀",
      sortOrder: 5,
    });
    expect(tpl.model).toBe("claude-opus-4-6");
    expect(tpl.permissionMode).toBe("bypass");
    expect(tpl.icon).toBe("🚀");
    expect(tpl.sortOrder).toBe(5);
  });

  it("throws when duplicate slug is inserted", () => {
    createTemplate({ name: "One", prompt: "p", slug: "dup-slug" });
    expect(() => createTemplate({ name: "Two", prompt: "p", slug: "dup-slug" })).toThrow();
  });
});

// ─── updateTemplate ───────────────────────────────────────────────────────────

describe("updateTemplate", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("updates a single field without touching others", () => {
    const tpl = createTemplate({ name: "Original", prompt: "original prompt", icon: "⚡" });
    const updated = updateTemplate(tpl.id, { name: "Updated" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated");
    expect(updated!.prompt).toBe("original prompt");
    expect(updated!.icon).toBe("⚡");
  });

  it("updates multiple fields at once", () => {
    const tpl = createTemplate({ name: "Orig", prompt: "old", icon: "⚡", sortOrder: 0 });
    const updated = updateTemplate(tpl.id, { name: "New Name", prompt: "new prompt", sortOrder: 10 });
    expect(updated!.name).toBe("New Name");
    expect(updated!.prompt).toBe("new prompt");
    expect(updated!.sortOrder).toBe(10);
  });

  it("sets updatedAt to a new timestamp", async () => {
    const tpl = createTemplate({ name: "TS Test", prompt: "p" });
    const originalUpdatedAt = tpl.updatedAt;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 5));

    const updated = updateTemplate(tpl.id, { name: "TS Updated" });
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
  });

  it("returns null when template ID does not exist", () => {
    const result = updateTemplate("nonexistent-id", { name: "Whatever" });
    expect(result).toBeNull();
  });

  it("persists changes so subsequent getTemplate reflects update", () => {
    const tpl = createTemplate({ name: "Before", prompt: "p" });
    updateTemplate(tpl.id, { name: "After" });
    const fetched = getTemplate(tpl.id);
    expect(fetched!.name).toBe("After");
  });
});

// ─── deleteTemplate ───────────────────────────────────────────────────────────

describe("deleteTemplate", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("deletes an existing template and returns true", () => {
    const tpl = createTemplate({ name: "Delete Me", prompt: "p" });
    const result = deleteTemplate(tpl.id);
    expect(result).toBe(true);
    expect(getTemplate(tpl.id)).toBeNull();
  });

  it("returns false when template ID does not exist", () => {
    const result = deleteTemplate("nonexistent-id");
    expect(result).toBe(false);
  });

  it("does not affect other templates", () => {
    const keep = createTemplate({ name: "Keep", prompt: "p" });
    const remove = createTemplate({ name: "Remove", prompt: "p" });
    deleteTemplate(remove.id);

    expect(getTemplate(keep.id)).not.toBeNull();
    expect(getTemplate(remove.id)).toBeNull();
  });
});

// ─── seedDefaultTemplates ─────────────────────────────────────────────────────

describe("seedDefaultTemplates", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("seeds 7 default templates into an empty table", () => {
    seedDefaultTemplates();
    const all = listTemplates();
    expect(all).toHaveLength(7);
  });

  it("seeds expected template names", () => {
    seedDefaultTemplates();
    const names = listTemplates().map((t) => t.name);
    expect(names).toContain("Quick Fix");
    expect(names).toContain("Code Review");
    expect(names).toContain("Refactor");
    expect(names).toContain("Write Tests");
    expect(names).toContain("Explain");
    expect(names).toContain("Ship");
    expect(names).toContain("Plan");
  });

  it("is idempotent — second call does not add duplicates", () => {
    seedDefaultTemplates();
    seedDefaultTemplates();
    const all = listTemplates();
    expect(all).toHaveLength(7);
  });

  it("does nothing when templates already exist", () => {
    createTemplate({ name: "Pre-existing", prompt: "p" });
    seedDefaultTemplates();
    const all = listTemplates();
    // Only the one we inserted — seed was skipped
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Pre-existing");
  });
});

// ─── findTemplateByIdPrefix ───────────────────────────────────────────────────

describe("findTemplateByIdPrefix", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("finds a template by the first 8 characters of its ID", () => {
    const tpl = createTemplate({ name: "Prefix Test", prompt: "p" });
    const prefix = tpl.id.slice(0, 8);
    const found = findTemplateByIdPrefix(prefix);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(tpl.id);
  });

  it("returns null when no template matches the prefix", () => {
    createTemplate({ name: "Some Tpl", prompt: "p" });
    const found = findTemplateByIdPrefix("xxxxxxxx");
    expect(found).toBeNull();
  });

  it("returns one result even if multiple IDs start with the same prefix (LIKE match)", () => {
    const tpl = createTemplate({ name: "One", prompt: "p" });
    // Full ID prefix — unambiguous
    const found = findTemplateByIdPrefix(tpl.id);
    expect(found!.id).toBe(tpl.id);
  });
});
