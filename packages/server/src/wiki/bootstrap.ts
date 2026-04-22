/**
 * Wiki config persistence + auto-provisioning.
 *
 * `WikiConfig` lives in the store module as an in-memory singleton. Without
 * this bootstrap, every server restart wipes `defaultDomain` back to null,
 * which silently disables Wiki L0 injection for all sessions. We persist the
 * config to the `settings` key-value table and rehydrate on startup.
 *
 * Auto-provisioning: on fresh installs where no domain has been configured,
 * fall back to the `PROJECT_SLUG` env var and create the domain directory
 * so Wiki L0 injection works without requiring the user to touch settings.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import {
  getSetting,
  getSettingBool,
  setSetting,
  deleteSetting,
} from "../services/settings-helpers.js";
import {
  getWikiConfig,
  setWikiConfig as setWikiConfigInMemory,
  resolveWikiRoot,
  createDomain,
} from "./store.js";
import type { WikiConfig } from "./types.js";

const log = createLogger("wiki:bootstrap");

// ─── Setting Keys ───────────────────────────────────────────────────────────

const KEYS = {
  rootPath: "wiki.rootPath",
  defaultDomain: "wiki.defaultDomain",
  secondaryDomains: "wiki.secondaryDomains",
  enabled: "wiki.enabled",
} as const;

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Load persisted wiki config from the `settings` table and apply it to the
 * in-memory store. Safe to call multiple times. No-ops for missing keys so
 * upgrades from pre-persistence installs don't lose defaults.
 */
export function loadWikiConfigFromDb(): void {
  const updates: Partial<WikiConfig> = {};

  const rootPath = getSetting(KEYS.rootPath);
  if (rootPath) updates.rootPath = rootPath;

  const defaultDomain = getSetting(KEYS.defaultDomain);
  if (defaultDomain !== undefined) {
    // Empty string → explicit null (user cleared the field)
    updates.defaultDomain = defaultDomain.length > 0 ? defaultDomain : null;
  }

  const secondaryRaw = getSetting(KEYS.secondaryDomains);
  if (secondaryRaw) {
    try {
      const parsed = JSON.parse(secondaryRaw);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        updates.secondaryDomains = parsed;
      }
    } catch {
      // corrupt JSON — ignore, keep default
    }
  }

  // `enabled` uses explicit default true so fresh installs aren't surprised
  // by a false-default hiding the feature.
  updates.enabled = getSettingBool(KEYS.enabled, true);

  if (Object.keys(updates).length > 0) {
    setWikiConfigInMemory(updates);
    log.info("Loaded wiki config from DB", {
      defaultDomain: updates.defaultDomain ?? null,
      secondaryDomains: updates.secondaryDomains?.length ?? 0,
      enabled: updates.enabled,
    });
  }
}

/**
 * Persist the current in-memory wiki config to the settings table.
 * Call this from the PUT /wiki/config route whenever the config changes.
 */
export function persistWikiConfigToDb(): void {
  const cfg = getWikiConfig();
  setSetting(KEYS.rootPath, cfg.rootPath);
  if (cfg.defaultDomain) {
    setSetting(KEYS.defaultDomain, cfg.defaultDomain);
  } else {
    deleteSetting(KEYS.defaultDomain);
  }
  setSetting(KEYS.secondaryDomains, JSON.stringify(cfg.secondaryDomains));
  setSetting(KEYS.enabled, String(cfg.enabled));
  log.debug("Persisted wiki config to DB");
}

// ─── Auto-Provisioning ──────────────────────────────────────────────────────

/**
 * If no default domain has been configured, derive one from the environment
 * so fresh installs get working Wiki L0 injection out of the box.
 *
 * Priority order for the fallback slug:
 *   1. PROJECT_SLUG env var
 *   2. COMPANION_PROJECT_SLUG env var (back-compat)
 *   3. basename of the working directory
 *
 * Creates the domain directory if it doesn't exist so subsequent note writes
 * don't fail on missing parent.
 */
export function autoProvisionDefaultDomain(): void {
  const cfg = getWikiConfig();
  if (cfg.defaultDomain) return; // already configured
  if (!cfg.enabled) return;

  const rawSlug =
    process.env.PROJECT_SLUG?.trim() ||
    process.env.COMPANION_PROJECT_SLUG?.trim() ||
    basenameSlug(process.cwd());

  if (!rawSlug) {
    log.debug("Skipping wiki auto-provision — no slug source available");
    return;
  }

  const slug = sanitizeDomainSlug(rawSlug);
  if (!slug) {
    log.debug("Skipping wiki auto-provision — slug failed sanitization", { rawSlug });
    return;
  }

  const root = resolveWikiRoot();
  const domainPath = join(root, slug);
  try {
    if (existsSync(domainPath)) {
      // Directory exists — ensure the parent dir is writable, then treat as
      // already-provisioned (user may have seeded content manually).
      // Still set defaultDomain so Wiki L0 retrieval works.
    } else {
      // Create the full domain (directory + raw/ + initial _index.md) so
      // retriever.getSessionContext() has a non-null index to return from
      // the very first session after bootstrap.
      createDomain(slug, slug);
    }
  } catch (err) {
    log.warn("Failed to create wiki domain directory", { domainPath, error: String(err) });
    return;
  }

  setWikiConfigInMemory({ defaultDomain: slug });
  persistWikiConfigToDb();
  log.info("Auto-provisioned wiki default domain", { slug, domainPath });
}

function basenameSlug(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Reduce a free-form string to a valid wiki domain slug (a-z, 0-9, hyphen). */
function sanitizeDomainSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// ─── Init Entry Point ───────────────────────────────────────────────────────

/**
 * Orchestrates wiki startup: load persisted config, then auto-provision a
 * default domain if one isn't set. Call once during server bootstrap, after
 * `runMigrations()`.
 */
export function initWikiConfig(): void {
  loadWikiConfigFromDb();
  autoProvisionDefaultDomain();
}
