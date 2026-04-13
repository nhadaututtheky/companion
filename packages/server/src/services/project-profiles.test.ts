/**
 * Unit tests for project-profiles — CRUD for project profiles.
 * Uses an in-memory SQLite DB.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "../test-utils.js";

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;

const dbClientMockFactory = () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbClientMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../db/client.js"), dbClientMockFactory);

// Import AFTER mock
import {
  getProject,
  listProjects,
  upsertProject,
  deleteProject,
  findProjectByDir,
} from "./project-profiles.js";

function setup() {
  const result = createTestDb();
  currentDb = result.db;
  currentSqlite = result.sqlite;
  return result;
}

describe("project-profiles", () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
  });

  describe("upsertProject + getProject", () => {
    it("creates and retrieves a project", () => {
      upsertProject({
        slug: "my-app",
        name: "My App",
        dir: "/home/user/projects/my-app",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
      });

      const project = getProject("my-app");
      expect(project).not.toBeNull();
      expect(project!.slug).toBe("my-app");
      expect(project!.name).toBe("My App");
      expect(project!.dir).toBe("/home/user/projects/my-app");
      expect(project!.defaultModel).toBe("claude-sonnet-4-6");
    });

    it("updates existing project", () => {
      upsertProject({
        slug: "my-app",
        name: "My App",
        dir: "/old/path",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
      });

      upsertProject({
        slug: "my-app",
        name: "My App v2",
        dir: "/new/path",
        defaultModel: "claude-opus-4-6",
        permissionMode: "plan",
      });

      const project = getProject("my-app");
      expect(project!.name).toBe("My App v2");
      expect(project!.dir).toBe("/new/path");
      expect(project!.defaultModel).toBe("claude-opus-4-6");
    });

    it("returns null for non-existent project", () => {
      expect(getProject("nonexistent")).toBeNull();
    });
  });

  describe("listProjects", () => {
    it("returns empty list when no projects exist", () => {
      expect(listProjects()).toEqual([]);
    });

    it("returns all projects", () => {
      upsertProject({
        slug: "alpha",
        name: "Alpha",
        dir: "/a",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
      });
      upsertProject({
        slug: "beta",
        name: "Beta",
        dir: "/b",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
      });
      upsertProject({
        slug: "gamma",
        name: "Gamma",
        dir: "/c",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
      });

      const projects = listProjects();
      expect(projects).toHaveLength(3);
      const slugs = projects.map((p) => p.slug).sort();
      expect(slugs).toEqual(["alpha", "beta", "gamma"]);
    });
  });

  describe("deleteProject", () => {
    it("deletes existing project and returns true", () => {
      upsertProject({
        slug: "to-delete",
        name: "Delete Me",
        dir: "/d",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
      });
      expect(deleteProject("to-delete")).toBe(true);
      expect(getProject("to-delete")).toBeNull();
    });

    it("returns false for non-existent project", () => {
      expect(deleteProject("nonexistent")).toBe(false);
    });
  });

  describe("findProjectByDir", () => {
    it("finds project by directory path", () => {
      upsertProject({
        slug: "my-app",
        name: "My App",
        dir: "/home/user/my-app",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
      });

      const project = findProjectByDir("/home/user/my-app");
      expect(project).not.toBeNull();
      expect(project!.slug).toBe("my-app");
    });

    it("returns null when dir does not match", () => {
      expect(findProjectByDir("/nonexistent")).toBeNull();
    });
  });

  describe("envVars handling", () => {
    it("stores and retrieves envVars", () => {
      upsertProject({
        slug: "env-test",
        name: "Env Test",
        dir: "/e",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
        envVars: { NODE_ENV: "production", API_URL: "https://api.example.com" },
      });

      const project = getProject("env-test");
      expect(project!.envVars).toBeDefined();
    });

    it("handles undefined envVars", () => {
      upsertProject({
        slug: "no-env",
        name: "No Env",
        dir: "/f",
        defaultModel: "claude-sonnet-4-6",
        permissionMode: "default",
      });

      const project = getProject("no-env");
      expect(project!.envVars).toBeUndefined();
    });
  });
});
