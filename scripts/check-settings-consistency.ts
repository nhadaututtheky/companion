#!/usr/bin/env bun
/**
 * INV-13/14 enforcement gate — blocks session-settings bypass.
 *
 * Background: the "idleTimeoutMs resets on resume" bug recurred for months
 * because each fix only patched one of five writers (2 DB tables + 2 Maps +
 * React). Phase 2/3 unified writes on SessionSettingsService; this script
 * makes sure no future PR silently adds a sixth writer that skips the event
 * bus. The rules it enforces (see .rune/INVARIANTS.md):
 *
 *   INV-13 — All reads go through SessionSettingsService.get()
 *   INV-14 — All writes go through SessionSettingsService.update()
 *
 * Exits 1 on any violation — wire into CI alongside tsc/tests.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SERVER_SRC = resolve(ROOT, "packages", "server", "src");

/** Files that are allowed to own the legacy Map / legacy mapping column. */
const ALLOW = {
  /** Writer lives here — this is THE single-writer. */
  sessionSettingsService: /session-settings-service\.ts$/,
  /** ws-bridge exposes the Map as a read cache populated by an event subscriber. */
  wsBridge: /ws-bridge\.ts$/,
  wsBridgeTest: /ws-bridge\.test\.ts$/,
  /** Telegram idle manager owns sessionConfigs Map and subscribes to the event. */
  telegramIdleManager: /telegram[\\/]telegram-idle-manager\.ts$/,
  /** Persistence bootstraps the Map from DB on startup — read-only at boot. */
  telegramPersistence: /telegram[\\/]telegram-persistence\.ts$/,
  /** Test suites exercise writers via mocks. */
  testFile: /\.test\.ts$/,
  /** Session-settings own __tests__. */
  settingsTest: /__tests__[\\/](session-settings|settings-resume)/,
};

interface Violation {
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
      walk(full, acc);
    } else if (extname(full) === ".ts") {
      acc.push(full);
    }
  }
  return acc;
}

function isAllowedFor(file: string, rule: "writer" | "mapping" | "reader"): boolean {
  const rel = relative(ROOT, file);
  if (rule === "writer") {
    return (
      ALLOW.sessionSettingsService.test(rel) ||
      ALLOW.wsBridge.test(rel) ||
      ALLOW.telegramIdleManager.test(rel) ||
      ALLOW.testFile.test(rel)
    );
  }
  if (rule === "mapping") {
    return ALLOW.sessionSettingsService.test(rel) || ALLOW.testFile.test(rel);
  }
  if (rule === "reader") {
    return (
      ALLOW.sessionSettingsService.test(rel) ||
      ALLOW.wsBridge.test(rel) ||
      ALLOW.telegramIdleManager.test(rel) ||
      ALLOW.telegramPersistence.test(rel) ||
      ALLOW.testFile.test(rel)
    );
  }
  return false;
}

interface Rule {
  name: string;
  allowed: "writer" | "mapping" | "reader";
  description: string;
  /** Line-scoped pattern — runs against each line independently. */
  linePattern?: RegExp;
  /**
   * Whole-file pattern — runs against the full source with `g` flag.
   * Use this when the signal spans multiple lines (e.g. drizzle query chain).
   * `match.index` is used to back-calculate the line number.
   */
  filePattern?: RegExp;
}

const RULES: Rule[] = [
  {
    name: "INV-14.sessionSettings.set",
    allowed: "writer",
    linePattern: /\.sessionSettings\.set\(/,
    description: "Direct mutation of sessionSettings Map (use SessionSettingsService.update)",
  },
  {
    name: "INV-14.sessionConfigs.set",
    allowed: "writer",
    linePattern: /\.sessionConfigs\.set\(/,
    description: "Direct mutation of sessionConfigs Map (use SessionSettingsService.update)",
  },
  {
    name: "INV-14.legacy-idle-timeout-update",
    allowed: "mapping",
    // Only fires when a drizzle UPDATE on telegram_session_mappings writes an
    // idle-timeout column. `cliSessionId`-only updates are NOT violations.
    filePattern: /\.update\(telegramSessionMappings\)[\s\S]{0,300}?\.set\(\{[^}]*idleTimeout/g,
    description: "UPDATE telegram_session_mappings SET idle_timeout_* (use service)",
  },
];

function lineNumberAt(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (src[i] === "\n") line++;
  return line;
}

function scan(): Violation[] {
  const files = walk(SERVER_SRC);
  const violations: Violation[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    const lines = src.split("\n");
    const relPath = relative(ROOT, file).split(sep).join("/");

    for (const rule of RULES) {
      if (isAllowedFor(file, rule.allowed)) continue;

      if (rule.linePattern) {
        for (let i = 0; i < lines.length; i++) {
          if (!rule.linePattern.test(lines[i]!)) continue;
          violations.push({
            file: relPath,
            line: i + 1,
            rule: rule.name,
            snippet: lines[i]!.trim().slice(0, 120),
          });
        }
      }

      if (rule.filePattern) {
        rule.filePattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = rule.filePattern.exec(src)) !== null) {
          const line = lineNumberAt(src, m.index);
          violations.push({
            file: relPath,
            line,
            rule: rule.name,
            snippet: (lines[line - 1] ?? "").trim().slice(0, 120),
          });
        }
      }
    }
  }

  return violations;
}

const violations = scan();

if (violations.length === 0) {
  console.log("ok — session settings consistency check passed.");
  process.exit(0);
}

console.error(`✗ ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.rule}`);
  console.error(`    ${v.snippet}\n`);
}
console.error(
  "See .rune/INVARIANTS.md INV-13/14/15 — route session-settings access through SessionSettingsService.",
);
process.exit(1);
