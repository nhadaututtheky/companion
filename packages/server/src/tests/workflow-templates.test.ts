/**
 * Tests for workflow-templates CRUD operations.
 * Uses in-memory SQLite to test real DB interactions.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { createTestDb } from "./test-db.js";

// Mock getDb to return our test database
const testDbResult = createTestDb();
const dbClientMockFactory = () => ({
  getDb: () => testDbResult.db,
  getSqlite: () => testDbResult.sqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbClientMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../db/client.js"), dbClientMockFactory);

// Import after mocking
const {
  seedWorkflowTemplates,
  listWorkflowTemplates,
  getWorkflowTemplate,
  createWorkflowTemplate,
  updateWorkflowTemplate,
  deleteWorkflowTemplate,
} = await import("../services/workflow-templates.js");

describe("workflow-templates", () => {
  beforeAll(() => {
    seedWorkflowTemplates();
  });

  afterAll(() => {
    testDbResult.sqlite.close();
  });

  describe("seed", () => {
    test("creates built-in templates", () => {
      const templates = listWorkflowTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(7);
      expect(templates.every((t) => t.isBuiltIn)).toBe(true);
    });

    test("seed is idempotent", () => {
      const before = listWorkflowTemplates().length;
      seedWorkflowTemplates();
      const after = listWorkflowTemplates().length;
      expect(after).toBe(before);
    });
  });

  describe("list + filter", () => {
    test("lists all templates", () => {
      const all = listWorkflowTemplates();
      expect(all.length).toBeGreaterThan(0);
    });

    test("filters by category", () => {
      const reviews = listWorkflowTemplates("review");
      expect(reviews.every((t) => t.category === "review")).toBe(true);
    });

    test("returns empty for nonexistent category", () => {
      const empty = listWorkflowTemplates("nonexistent");
      expect(empty).toHaveLength(0);
    });
  });

  describe("get", () => {
    test("gets template by ID", () => {
      const all = listWorkflowTemplates();
      const first = all[0]!;
      const fetched = getWorkflowTemplate(first.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(first.id);
      expect(fetched!.name).toBe(first.name);
    });

    test("returns null for nonexistent ID", () => {
      const result = getWorkflowTemplate("nonexistent-id");
      expect(result).toBeNull();
    });
  });

  describe("CRUD — custom templates", () => {
    let customId: string;

    test("create custom template", () => {
      customId = createWorkflowTemplate({
        name: "Test Workflow",
        slug: "test-workflow",
        description: "A test workflow",
        icon: "🧪",
        category: "custom",
        steps: [
          { role: "analyzer", label: "Analyze", promptTemplate: "Analyze {{topic}}", order: 0 },
          {
            role: "builder",
            label: "Build",
            promptTemplate: "Build based on {{previousOutput}}",
            order: 1,
          },
        ],
        defaultCostCapUsd: 2.5,
      });

      expect(customId).toBeTruthy();
      expect(typeof customId).toBe("string");
    });

    test("get custom template", () => {
      const t = getWorkflowTemplate(customId);
      expect(t).not.toBeNull();
      expect(t!.name).toBe("Test Workflow");
      expect(t!.slug).toBe("test-workflow");
      expect(t!.isBuiltIn).toBe(false);
      expect(t!.steps).toHaveLength(2);
      expect(t!.defaultCostCapUsd).toBe(2.5);
    });

    test("update custom template", () => {
      const success = updateWorkflowTemplate(customId, {
        name: "Updated Workflow",
        description: "Updated description",
      });
      expect(success).toBe(true);

      const t = getWorkflowTemplate(customId);
      expect(t!.name).toBe("Updated Workflow");
      expect(t!.description).toBe("Updated description");
    });

    test("cannot update built-in template", () => {
      const builtIn = listWorkflowTemplates().find((t) => t.isBuiltIn);
      expect(builtIn).toBeTruthy();
      const success = updateWorkflowTemplate(builtIn!.id, { name: "Hacked" });
      expect(success).toBe(false);
    });

    test("cannot delete built-in template", () => {
      const builtIn = listWorkflowTemplates().find((t) => t.isBuiltIn);
      expect(builtIn).toBeTruthy();
      const success = deleteWorkflowTemplate(builtIn!.id);
      expect(success).toBe(false);
    });

    test("delete custom template", () => {
      const success = deleteWorkflowTemplate(customId);
      expect(success).toBe(true);
      const t = getWorkflowTemplate(customId);
      expect(t).toBeNull();
    });

    test("delete nonexistent returns false", () => {
      const success = deleteWorkflowTemplate("nonexistent");
      expect(success).toBe(false);
    });
  });
});
