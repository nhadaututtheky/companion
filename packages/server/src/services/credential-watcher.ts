/**
 * Credential Watcher — Polls ~/.claude/.credentials.json for changes.
 * Auto-captures OAuth credentials after Claude Code `/login`.
 * Uses mtime polling (not fs.watch — unreliable on Windows).
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../logger.js";
import { saveAccount, listAccounts, setActiveAccount } from "./credential-manager.js";
import { isEncryptionEnabled } from "./crypto.js";
import { eventBus } from "./event-bus.js";
import type { OAuthCredentials } from "./credential-manager.js";

const log = createLogger("credential-watcher");

const POLL_INTERVAL_MS = 2_000;
const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");

/** Suppress re-capture for writes we initiated (switchAccount) */
let suppressUntil = 0;

let lastMtimeMs = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Credential File Schema ─────────────────────────────────────────────────

interface CredentialFile {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
  mcpOAuth?: unknown;
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

async function checkForChanges(): Promise<void> {
  try {
    const fileStat = await stat(CREDENTIALS_PATH);
    if (fileStat.mtimeMs === lastMtimeMs) return;
    lastMtimeMs = fileStat.mtimeMs;

    // Skip if this change was our own write (switchAccount)
    if (Date.now() < suppressUntil) {
      log.debug("Skipping credential change — suppressed (own write)");
      return;
    }

    await captureCredentials();
  } catch (err) {
    // File doesn't exist yet — normal before first login
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    log.debug("Credential file check failed", { error: String(err) });
  }
}

/** Read credential file and save/update the OAuth account. */
async function captureCredentials(): Promise<void> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf-8");
    const file = JSON.parse(raw) as CredentialFile;

    if (!file.claudeAiOauth?.accessToken) {
      log.debug("Credential file has no claudeAiOauth section");
      return;
    }

    const oauth = file.claudeAiOauth;
    const credentials: OAuthCredentials = {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: oauth.expiresAt,
      scopes: oauth.scopes ?? [],
      subscriptionType: oauth.subscriptionType,
      rateLimitTier: oauth.rateLimitTier,
    };

    // Check if this is a new account or update
    const existingAccounts = listAccounts();
    const subType = oauth.subscriptionType ?? "unknown";
    const countOfType = existingAccounts.filter(
      (a) => a.subscriptionType === subType,
    ).length;
    const label = `${capitalize(subType)} #${countOfType + 1}`;

    // saveAccount handles upsert by fingerprint — if same token, updates; if new, creates
    const accountId = saveAccount(label, credentials);

    // Check if this was a new account or update to existing
    const updatedAccounts = listAccounts();
    const isNew = updatedAccounts.length > existingAccounts.length;

    // Set as active
    setActiveAccount(accountId);

    log.info("Credentials captured", {
      accountId,
      subscriptionType: subType,
      isNew,
    });

    eventBus.emit("account:captured", {
      accountId,
      label: isNew ? label : updatedAccounts.find((a) => a.id === accountId)?.label ?? label,
      isNew,
    });
  } catch (err) {
    log.error("Failed to capture credentials", { error: String(err) });
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Switch Account (write credentials file) ───────────────────────────────

/**
 * Write decrypted credentials to ~/.claude/.credentials.json.
 * Only replaces the `claudeAiOauth` section — preserves `mcpOAuth` and other fields.
 * Suppresses the watcher briefly to avoid re-capturing our own write.
 */
export async function writeCredentialsFile(credentials: OAuthCredentials): Promise<void> {
  let file: CredentialFile = {};

  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf-8");
    file = JSON.parse(raw) as CredentialFile;
  } catch {
    // File doesn't exist — create fresh
  }

  file.claudeAiOauth = {
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    expiresAt: credentials.expiresAt,
    scopes: credentials.scopes,
    subscriptionType: credentials.subscriptionType,
    rateLimitTier: credentials.rateLimitTier,
  };

  // Suppress watcher BEFORE write to avoid re-capturing our own write
  suppressUntil = Date.now() + 5_000;

  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(CREDENTIALS_PATH), { recursive: true });
  await writeFile(CREDENTIALS_PATH, JSON.stringify(file, null, 2), { encoding: "utf-8", mode: 0o600 });

  log.info("Credentials file written for account switch");
}

/** Manually trigger credential capture (re-read the file). */
let captureInFlight = false;
export async function manualCapture(): Promise<void> {
  if (captureInFlight) return; // Prevent concurrent captures
  captureInFlight = true;
  try {
    lastMtimeMs = 0; // Force re-read
    await checkForChanges();
  } finally {
    captureInFlight = false;
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/** Start the credential file watcher. Call on server boot. */
export function startCredentialWatcher(): void {
  if (!isEncryptionEnabled()) {
    log.warn(
      "Credential watcher disabled — COMPANION_ENCRYPTION_KEY not set. " +
        "Set this env var to enable multi-account management.",
    );
    return;
  }

  if (pollTimer) return; // Already running

  // Do an initial check
  checkForChanges().catch(() => {});

  pollTimer = setInterval(() => {
    checkForChanges().catch(() => {});
  }, POLL_INTERVAL_MS);

  log.info("Credential watcher started", { path: CREDENTIALS_PATH });
}

/** Stop the credential file watcher. Call on server shutdown. */
export function stopCredentialWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log.info("Credential watcher stopped");
  }
}

/** Get the credentials file path (for testing/display). */
export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}
