/**
 * Template service — CRUD for session templates.
 */

import { eq, or, isNull, asc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "../db/client.js";
import { sessionTemplates } from "../db/schema.js";
import { createLogger } from "../logger.js";

const log = createLogger("templates");

export interface TemplateVariable {
  key: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}

export interface Template {
  id: string;
  name: string;
  slug: string;
  projectSlug: string | null;
  prompt: string;
  model: string | null;
  permissionMode: string | null;
  icon: string;
  sortOrder: number;
  variables: TemplateVariable[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateInput {
  name: string;
  slug?: string;
  projectSlug?: string | null;
  prompt: string;
  model?: string | null;
  permissionMode?: string | null;
  icon?: string;
  sortOrder?: number;
  variables?: TemplateVariable[] | null;
}

export interface UpdateTemplateInput {
  name?: string;
  slug?: string;
  prompt?: string;
  model?: string | null;
  permissionMode?: string | null;
  icon?: string;
  sortOrder?: number;
  variables?: TemplateVariable[] | null;
}

/** Max slug length — must fit within Telegram's 64-byte callback_data limit */
const MAX_SLUG_LENGTH = 20;

/** Generate a URL-safe slug from a name */
function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return slug || randomUUID().slice(0, 8);
}

/** Parse variables JSON string from a raw DB row */
function parseVariables(raw: unknown): TemplateVariable[] | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TemplateVariable[]) : null;
  } catch {
    return null;
  }
}

/** Deserialize a raw DB row into a Template with parsed variables */
function rowToTemplate(row: Record<string, unknown>): Template {
  return {
    ...(row as Omit<Template, "variables">),
    variables: parseVariables(row["variables"]),
  } as Template;
}

/** List templates: global + project-specific, sorted by sortOrder then name */
export function listTemplates(projectSlug?: string): Template[] {
  const db = getDb();

  const condition = projectSlug
    ? or(isNull(sessionTemplates.projectSlug), eq(sessionTemplates.projectSlug, projectSlug))
    : undefined;

  const rows = db
    .select()
    .from(sessionTemplates)
    .where(condition)
    .orderBy(asc(sessionTemplates.sortOrder), asc(sessionTemplates.name))
    .all();

  return rows.map((r) => rowToTemplate(r as Record<string, unknown>));
}

/** Get a single template by ID or slug */
export function getTemplate(idOrSlug: string): Template | null {
  const db = getDb();

  const byId = db.select().from(sessionTemplates).where(eq(sessionTemplates.id, idOrSlug)).get();
  if (byId) return rowToTemplate(byId as Record<string, unknown>);

  const bySlug = db
    .select()
    .from(sessionTemplates)
    .where(eq(sessionTemplates.slug, idOrSlug))
    .get();
  if (!bySlug) return null;
  return rowToTemplate(bySlug as Record<string, unknown>);
}

/** Find a template by ID prefix (for short callback_data) */
export function findTemplateByIdPrefix(prefix: string): Template | null {
  const db = getDb();
  const row = db
    .select()
    .from(sessionTemplates)
    .where(sql`${sessionTemplates.id} LIKE ${prefix + "%"}`)
    .limit(1)
    .get();
  if (!row) return null;
  return rowToTemplate(row as Record<string, unknown>);
}

/** Create a new template */
export function createTemplate(input: CreateTemplateInput): Template {
  const db = getDb();
  const id = randomUUID();
  const slug = input.slug ?? toSlug(input.name);
  const now = new Date();

  const variablesJson = input.variables != null ? JSON.stringify(input.variables) : null;

  const row = {
    id,
    name: input.name,
    slug,
    projectSlug: input.projectSlug ?? null,
    prompt: input.prompt,
    model: input.model ?? null,
    permissionMode: input.permissionMode ?? null,
    icon: input.icon ?? "⚡",
    sortOrder: input.sortOrder ?? 0,
    variables: variablesJson,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(sessionTemplates).values(row).run();
  log.info("Template created", { id, name: input.name, slug });

  return { ...row, variables: input.variables ?? null };
}

/** Update an existing template */
export function updateTemplate(id: string, input: UpdateTemplateInput): Template | null {
  const db = getDb();
  const existing = db.select().from(sessionTemplates).where(eq(sessionTemplates.id, id)).get();
  if (!existing) return null;

  const patch: Record<string, unknown> = Object.fromEntries(
    Object.entries(input).filter(([k, v]) => k !== "variables" && v !== undefined),
  );

  if ("variables" in input) {
    patch["variables"] = input.variables != null ? JSON.stringify(input.variables) : null;
  }

  const updated = {
    ...existing,
    ...patch,
    updatedAt: new Date(),
  };

  db.update(sessionTemplates).set(updated).where(eq(sessionTemplates.id, id)).run();
  log.info("Template updated", { id });
  return rowToTemplate(updated as Record<string, unknown>);
}

/** Delete a template */
export function deleteTemplate(id: string): boolean {
  const db = getDb();
  const existing = db.select().from(sessionTemplates).where(eq(sessionTemplates.id, id)).get();
  if (!existing) return false;
  db.delete(sessionTemplates).where(eq(sessionTemplates.id, id)).run();
  log.info("Template deleted", { id });
  return true;
}

/**
 * Replace `{{key}}` placeholders in a template prompt with the supplied values.
 * Unresolved placeholders (keys not in `variables`) are kept as-is.
 */
export function resolveTemplateVariables(
  prompt: string,
  variables: Record<string, string>,
): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return variables[key] ?? _match;
  });
}

/** Seed default templates if table is empty */
export function seedDefaultTemplates(): void {
  const db = getDb();
  const existing = db.select().from(sessionTemplates).limit(1).get();
  if (existing) return;

  const defaults: CreateTemplateInput[] = [
    { name: "Quick Fix", icon: "⚡", prompt: "Fix the bug I'm about to describe:", sortOrder: 0 },
    {
      name: "Code Review",
      icon: "🔍",
      prompt:
        "Review the recent changes. Check for bugs, security issues, and suggest improvements.",
      sortOrder: 1,
    },
    {
      name: "Refactor",
      icon: "🔄",
      prompt: "Refactor the following code for readability and maintainability:",
      sortOrder: 2,
    },
    {
      name: "Write Tests",
      icon: "🧪",
      prompt: "Write comprehensive tests for the module I'll specify.",
      sortOrder: 3,
    },
    {
      name: "Explain",
      icon: "📖",
      prompt: "Explain this code in detail, including the design decisions:",
      sortOrder: 4,
    },
    { name: "Ship", icon: "🚀", prompt: "/ship", sortOrder: 5 },
    {
      name: "Plan",
      icon: "🏗️",
      prompt: "Create a plan for the feature I'll describe:",
      sortOrder: 6,
    },
  ];

  for (const tpl of defaults) {
    createTemplate(tpl);
  }

  log.info("Seeded default templates", { count: defaults.length });
}
