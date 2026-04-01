/**
 * ProjectProfileStore — CRUD for project profiles using Drizzle/SQLite.
 * Replaces old file-based JSON store.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { projects } from "../db/schema.js";
import { createLogger } from "../logger.js";
import type { ProjectProfile } from "@companion/shared";

const log = createLogger("project-profiles");

export function getProject(slug: string): ProjectProfile | null {
  const db = getDb();
  const row = db.select().from(projects).where(eq(projects.slug, slug)).get();
  if (!row) return null;

  return {
    slug: row.slug,
    name: row.name,
    dir: row.dir,
    defaultModel: row.defaultModel,
    permissionMode: row.permissionMode,
    envVars: row.envVars ?? undefined,
  };
}

export function listProjects(): ProjectProfile[] {
  const db = getDb();
  const rows = db.select().from(projects).all();

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    dir: row.dir,
    defaultModel: row.defaultModel,
    permissionMode: row.permissionMode,
    envVars: row.envVars ?? undefined,
  }));
}

export function upsertProject(profile: ProjectProfile): void {
  const db = getDb();

  const existing = db.select().from(projects).where(eq(projects.slug, profile.slug)).get();

  if (existing) {
    db.update(projects)
      .set({
        name: profile.name,
        dir: profile.dir,
        defaultModel: profile.defaultModel,
        permissionMode: profile.permissionMode,
        envVars: profile.envVars,
        updatedAt: new Date(),
      })
      .where(eq(projects.slug, profile.slug))
      .run();

    log.info("Project updated", { slug: profile.slug });
  } else {
    db.insert(projects)
      .values({
        slug: profile.slug,
        name: profile.name,
        dir: profile.dir,
        defaultModel: profile.defaultModel,
        permissionMode: profile.permissionMode,
        envVars: profile.envVars,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    log.info("Project created", { slug: profile.slug });
  }
}

export function deleteProject(slug: string): boolean {
  const db = getDb();
  const existing = db.select().from(projects).where(eq(projects.slug, slug)).get();
  if (!existing) return false;
  db.delete(projects).where(eq(projects.slug, slug)).run();
  return true;
}

/**
 * Find project by directory path.
 * Useful for auto-detecting project from session cwd.
 */
export function findProjectByDir(dir: string): ProjectProfile | null {
  const db = getDb();
  const row = db.select().from(projects).where(eq(projects.dir, dir)).get();
  if (!row) return null;

  return {
    slug: row.slug,
    name: row.name,
    dir: row.dir,
    defaultModel: row.defaultModel,
    permissionMode: row.permissionMode,
    envVars: row.envVars ?? undefined,
  };
}
