/**
 * Wiki Linter — Freshness checks for wiki articles.
 *
 * Compares article compiledAt timestamps against raw material modification dates
 * to detect stale articles that need recompilation.
 */

import { existsSync } from "node:fs";
import { createLogger } from "../logger.js";
import {
  listArticles,
  listRawFiles,
  readArticle,
  resolveWikiRoot,
  getFlaggedArticles,
} from "./store.js";

const log = createLogger("wiki:linter");

// ─── Types ──────────────────────────────────────────────────────────────────

export type LintSeverity = "warning" | "info";

export interface LintIssue {
  /** Article slug (or "domain" for domain-level issues) */
  target: string;
  severity: LintSeverity;
  /** Machine-readable issue code */
  code: string;
  /** Human-readable message */
  message: string;
}

export interface LintResult {
  domain: string;
  issues: LintIssue[];
  /** Total articles checked */
  articlesChecked: number;
  /** Total raw files checked */
  rawFilesChecked: number;
  /** ISO timestamp of lint run */
  lintedAt: string;
}

// ─── Linter ─────────────────────────────────────────────────────────────────

/** Run freshness + consistency lint on a wiki domain */
export function lintDomain(domain: string, cwd?: string): LintResult {
  // Verify domain exists before linting
  const root = resolveWikiRoot(cwd);
  const domainPath = `${root}/${domain}`;
  if (!existsSync(domainPath)) {
    throw new Error(`Domain "${domain}" not found`);
  }

  const issues: LintIssue[] = [];
  const articles = listArticles(domain, cwd);
  const rawFiles = listRawFiles(domain, cwd);

  // Build a map of raw file modification times
  const rawModTimes = new Map<string, Date>();
  for (const rf of rawFiles) {
    rawModTimes.set(rf.name, new Date(rf.modifiedAt));
  }

  // Single pass: check each article and collect compiledFrom in one go
  const allCompiledFrom = new Set<string>();

  for (const ref of articles) {
    const article = readArticle(domain, ref.slug, cwd);
    if (!article) continue;

    const compiledFrom = article.meta.compiledFrom ?? [];

    // Accumulate all compiledFrom for uncompiled-raw check later
    for (const src of compiledFrom) {
      allCompiledFrom.add(src);
    }

    const compiledAt = article.meta.compiledAt ? new Date(article.meta.compiledAt) : null;

    // 1. No compiledAt timestamp
    if (!compiledAt || isNaN(compiledAt.getTime())) {
      issues.push({
        target: ref.slug,
        severity: "warning",
        code: "missing-compiled-at",
        message: `Article "${ref.title}" has no valid compilation timestamp.`,
      });
      continue;
    }

    // 2. Check if any source raw files were modified after compilation
    const staleSourceFiles: string[] = [];
    for (const sourceName of compiledFrom) {
      const rawModTime = rawModTimes.get(sourceName);
      if (rawModTime && rawModTime > compiledAt) {
        staleSourceFiles.push(sourceName);
      }
    }

    if (staleSourceFiles.length > 0) {
      issues.push({
        target: ref.slug,
        severity: "warning",
        code: "stale-source",
        message: `Article "${ref.title}" is stale — source files updated after compilation: ${staleSourceFiles.join(", ")}`,
      });
    }

    // 3. Check for missing source files (raw deleted after compilation)
    const missingSourceFiles = compiledFrom.filter((name) => !rawModTimes.has(name));

    if (missingSourceFiles.length > 0) {
      issues.push({
        target: ref.slug,
        severity: "info",
        code: "missing-source",
        message: `Article "${ref.title}" references deleted source files: ${missingSourceFiles.join(", ")}`,
      });
    }

    // 4. Check for empty articles (compiled but no content)
    if (article.content.trim().length === 0) {
      issues.push({
        target: ref.slug,
        severity: "warning",
        code: "empty-article",
        message: `Article "${ref.title}" has no content.`,
      });
    }
  }

  // 5. Check for uncompiled raw files (not referenced by any article)
  const uncompiledRaw = rawFiles.filter((rf) => !allCompiledFrom.has(rf.name));
  if (uncompiledRaw.length > 0) {
    issues.push({
      target: "domain",
      severity: "info",
      code: "uncompiled-raw",
      message: `${uncompiledRaw.length} raw file(s) not yet compiled: ${uncompiledRaw.map((f) => f.name).join(", ")}`,
    });
  }

  // 6. Check for agent-flagged stale articles
  const flagged = getFlaggedArticles(domain, cwd);
  for (const flag of flagged) {
    issues.push({
      target: flag.slug,
      severity: "warning",
      code: "flagged-stale",
      message: `Article "${flag.slug}" flagged as stale by ${flag.flaggedBy}${flag.reason ? `: ${flag.reason}` : ""}`,
    });
  }

  // 7. Check for articles with no tags
  const untagged = articles.filter((a) => a.tags.length === 0);
  if (untagged.length > 0) {
    issues.push({
      target: "domain",
      severity: "info",
      code: "untagged-articles",
      message: `${untagged.length} article(s) have no tags: ${untagged.map((a) => a.slug).join(", ")}`,
    });
  }

  log.info("Wiki lint complete", { domain, issues: issues.length, articles: articles.length });

  return {
    domain,
    issues,
    articlesChecked: articles.length,
    rawFilesChecked: rawFiles.length,
    lintedAt: new Date().toISOString(),
  };
}
