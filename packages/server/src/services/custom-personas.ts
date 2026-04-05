/**
 * Custom Personas — CRUD service for user-created personas stored in SQLite.
 */

import { eq, count, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "../db/client.js";
import { customPersonas } from "../db/schema.js";
import { getPersonaById, BUILT_IN_PERSONAS, type Persona } from "@companion/shared";
import { createLogger } from "../logger.js";

const log = createLogger("custom-personas");

const MAX_CUSTOM_PERSONAS = 50;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a DB row to a Persona object */
function rowToPersona(row: typeof customPersonas.$inferSelect): Persona {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    category: "custom",
    title: row.title,
    intro: row.intro,
    systemPrompt: row.systemPrompt,
    mentalModels: row.mentalModels,
    decisionFramework: row.decisionFramework,
    redFlags: row.redFlags,
    communicationStyle: row.communicationStyle,
    blindSpots: row.blindSpots,
    bestFor: row.bestFor,
    strength: row.strength,
    avatarGradient: row.avatarGradient,
    avatarInitials: row.avatarInitials,
    builtIn: false,
    combinableWith: row.combinableWith ?? undefined,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function listCustomPersonas(): Persona[] {
  const db = getDb();
  const rows = db
    .select()
    .from(customPersonas)
    .orderBy(desc(customPersonas.createdAt))
    .all();
  return rows.map(rowToPersona);
}

export function getCustomPersona(id: string): Persona | undefined {
  const db = getDb();
  const row = db.select().from(customPersonas).where(eq(customPersonas.id, id)).get();
  return row ? rowToPersona(row) : undefined;
}

/**
 * Resolve a persona by ID — built-in first, then custom DB fallback.
 * Use this server-side instead of the shared getPersonaById when custom personas may be involved.
 */
export function resolvePersona(id: string): Persona | undefined {
  // Built-in lookup is O(12), cheap
  const builtIn = getPersonaById(id);
  if (builtIn) return builtIn;

  // Only check DB if ID looks like a custom persona
  if (id.startsWith("custom-")) {
    return getCustomPersona(id);
  }

  return undefined;
}

export interface CreatePersonaInput {
  name: string;
  icon?: string;
  title: string;
  intro?: string;
  systemPrompt: string;
  mentalModels?: string[];
  decisionFramework?: string;
  redFlags?: string[];
  communicationStyle?: string;
  blindSpots?: string[];
  bestFor?: string[];
  strength?: string;
  avatarGradient?: [string, string];
  avatarInitials?: string;
  combinableWith?: string[];
  clonedFrom?: string;
}

export function createCustomPersona(input: CreatePersonaInput): Persona {
  const db = getDb();

  // Enforce limit
  const total = db.select({ total: count() }).from(customPersonas).get();
  if (total && total.total >= MAX_CUSTOM_PERSONAS) {
    throw new Error(`Maximum ${MAX_CUSTOM_PERSONAS} custom personas reached`);
  }

  const id = `custom-${randomUUID().slice(0, 12)}`;
  const slug = slugify(input.name) || `persona-${randomUUID().slice(0, 6)}`;

  db.insert(customPersonas)
    .values({
      id,
      name: input.name,
      slug,
      icon: input.icon ?? "🧠",
      title: input.title,
      intro: input.intro ?? "",
      systemPrompt: input.systemPrompt,
      mentalModels: input.mentalModels ?? [],
      decisionFramework: input.decisionFramework ?? "",
      redFlags: input.redFlags ?? [],
      communicationStyle: input.communicationStyle ?? "",
      blindSpots: input.blindSpots ?? [],
      bestFor: input.bestFor ?? [],
      strength: input.strength ?? "",
      avatarGradient: input.avatarGradient ?? ["#6366f1", "#8b5cf6"],
      avatarInitials: input.avatarInitials ?? input.name.slice(0, 2).toUpperCase(),
      combinableWith: input.combinableWith ?? null,
      clonedFrom: input.clonedFrom ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  log.info("Custom persona created", { id, name: input.name });

  const row = db.select().from(customPersonas).where(eq(customPersonas.id, id)).get();
  if (!row) throw new Error("Failed to create custom persona");
  return rowToPersona(row);
}

export function updateCustomPersona(
  id: string,
  input: Partial<CreatePersonaInput>,
): Persona | undefined {
  const db = getDb();

  const existing = db.select().from(customPersonas).where(eq(customPersonas.id, id)).get();
  if (!existing) return undefined;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    updates.name = input.name;
    updates.slug = slugify(input.name) || existing.slug;
  }
  if (input.icon !== undefined) updates.icon = input.icon;
  if (input.title !== undefined) updates.title = input.title;
  if (input.intro !== undefined) updates.intro = input.intro;
  if (input.systemPrompt !== undefined) updates.systemPrompt = input.systemPrompt;
  if (input.mentalModels !== undefined) updates.mentalModels = input.mentalModels;
  if (input.decisionFramework !== undefined) updates.decisionFramework = input.decisionFramework;
  if (input.redFlags !== undefined) updates.redFlags = input.redFlags;
  if (input.communicationStyle !== undefined) updates.communicationStyle = input.communicationStyle;
  if (input.blindSpots !== undefined) updates.blindSpots = input.blindSpots;
  if (input.bestFor !== undefined) updates.bestFor = input.bestFor;
  if (input.strength !== undefined) updates.strength = input.strength;
  if (input.avatarGradient !== undefined) updates.avatarGradient = input.avatarGradient;
  if (input.avatarInitials !== undefined) updates.avatarInitials = input.avatarInitials;
  if (input.combinableWith !== undefined) updates.combinableWith = input.combinableWith;

  db.update(customPersonas).set(updates).where(eq(customPersonas.id, id)).run();

  log.info("Custom persona updated", { id });

  const row = db.select().from(customPersonas).where(eq(customPersonas.id, id)).get();
  return row ? rowToPersona(row) : undefined;
}

export function deleteCustomPersona(id: string): boolean {
  const db = getDb();

  const existing = db.select().from(customPersonas).where(eq(customPersonas.id, id)).get();
  if (!existing) return false;

  db.delete(customPersonas).where(eq(customPersonas.id, id)).run();

  log.info("Custom persona deleted", { id, name: existing.name });
  return true;
}

export function cloneBuiltInPersona(
  builtInId: string,
  overrides?: Partial<CreatePersonaInput>,
): Persona {
  const source = BUILT_IN_PERSONAS.find((p) => p.id === builtInId);
  if (!source) throw new Error(`Built-in persona not found: ${builtInId}`);

  return createCustomPersona({
    name: overrides?.name ?? `${source.name} (Custom)`,
    icon: overrides?.icon ?? source.icon,
    title: overrides?.title ?? source.title,
    intro: overrides?.intro ?? source.intro,
    systemPrompt: overrides?.systemPrompt ?? source.systemPrompt,
    mentalModels: overrides?.mentalModels ?? [...source.mentalModels],
    decisionFramework: overrides?.decisionFramework ?? source.decisionFramework,
    redFlags: overrides?.redFlags ?? [...source.redFlags],
    communicationStyle: overrides?.communicationStyle ?? source.communicationStyle,
    blindSpots: overrides?.blindSpots ?? [...source.blindSpots],
    bestFor: overrides?.bestFor ?? [...source.bestFor],
    strength: overrides?.strength ?? source.strength,
    avatarGradient: overrides?.avatarGradient ?? [...source.avatarGradient] as [string, string],
    avatarInitials: overrides?.avatarInitials ?? source.avatarInitials,
    combinableWith: overrides?.combinableWith ?? (source.combinableWith ? [...source.combinableWith] : undefined),
    clonedFrom: builtInId,
  });
}
