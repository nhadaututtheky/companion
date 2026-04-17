/**
 * Encryption utilities for sensitive data at rest.
 * Uses AES-256-GCM with a key derived from COMPANION_ENCRYPTION_KEY env var.
 *
 * If no env var set, auto-generates and persists a key to data/.encryption-key
 * (0o600 perms) so self-hosted users don't need any manual setup.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createLogger } from "../logger.js";

const log = createLogger("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const TAG_LENGTH = 16;
const SALT = "companion-v1"; // Static salt — acceptable since key should be high-entropy

const KEY_FILE = resolve(process.cwd(), "data", ".encryption-key");

let derivedKey: Buffer | null = null;

/** Load or auto-generate persistent encryption passphrase */
function loadOrCreatePassphrase(): string {
  // 1. env var takes precedence (Docker / manual override)
  const envKey = process.env.COMPANION_ENCRYPTION_KEY;
  if (envKey) return envKey;

  // 2. persisted key file
  if (existsSync(KEY_FILE)) {
    try {
      const content = readFileSync(KEY_FILE, "utf-8").trim();
      if (content) return content;
    } catch (err) {
      log.warn("Failed to read encryption key file", { err: String(err) });
    }
  }

  // 3. auto-generate + persist (self-hosted first-run)
  const generated = randomBytes(32).toString("base64");
  try {
    mkdirSync(dirname(KEY_FILE), { recursive: true });
    writeFileSync(KEY_FILE, generated, "utf-8");
    try {
      chmodSync(KEY_FILE, 0o600);
    } catch {
      /* Windows ignores */
    }
    log.info("Generated new encryption key", { path: KEY_FILE });
  } catch (err) {
    log.error("Failed to persist encryption key — encryption disabled", { err: String(err) });
    return "";
  }
  return generated;
}

function getKey(): Buffer | null {
  if (derivedKey) return derivedKey;

  const passphrase = loadOrCreatePassphrase();
  if (!passphrase) return null;

  // Derive a 256-bit key from the passphrase
  derivedKey = scryptSync(passphrase, SALT, 32) as Buffer;
  return derivedKey;
}

/** Check if encryption is available */
export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

/**
 * Encrypt a string value. Returns a base64-encoded string containing IV + ciphertext + auth tag.
 * If encryption is not configured, returns the plaintext as-is.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: base64(iv + encrypted + tag)
  const combined = Buffer.concat([iv, encrypted, tag]);
  return `enc:${combined.toString("base64")}`;
}

/**
 * Decrypt a value. If the value doesn't have the `enc:` prefix, returns it as-is (plaintext fallback).
 */
export function decrypt(value: string): string {
  if (!value.startsWith("enc:")) {
    // Plaintext — backward compatibility
    return value;
  }

  const key = getKey();
  if (!key) {
    log.warn("Encrypted value found but COMPANION_ENCRYPTION_KEY not set — cannot decrypt");
    return value;
  }

  const combined = Buffer.from(value.slice(4), "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf-8");
}

/** Log encryption status at startup */
export function warnIfNoEncryption(): void {
  if (!isEncryptionEnabled()) {
    log.error(
      "Encryption disabled — failed to generate/load key. " +
        "Accounts feature will not work. Check data/ directory permissions.",
    );
  }
}
