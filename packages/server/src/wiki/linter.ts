/**
 * Wiki Linter — Freshness checks for wiki articles.
 *
 * Compares article compiledAt timestamps against raw material modification dates
 * to detect stale articles that need recompilation.
 */

import { statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import {
  listArticles,
  listRawFiles,
  readArticle,
  resolveWikiRoot,
} from "./store.js";
import type { ArticleRef } from "./types.js";

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
  const issues: LintIssue[] = [];
  const articles = listArticles(domain, cwd);
  const rawFiles = listRawFiles(domain, cwd);

  // Build a map of raw file modification times
  const rawModTimes = new Map<string, Date>();
  for (const rf of rawFiles) {
    rawModTimes.set(rf.name, new Date(rf.modifiedAt));
  }

  // Check each article for staleness
  for (const ref of articles) {
    const article = readArticle(domain, ref.slug, cwd);
    if (!article) continue;

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
    for (const sourceName of article.meta.compiledFrom) {
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
    const missingSourceFiles = article.meta.compiledFrom.filter(
      (name) => !rawModTimes.has(name),
    );

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
  const allCompiledFrom = new Set(
    articles.flatMap((a) => {
      const full = readArticle(domain, a.slug, cwd);
      return full?.meta.compiledFrom ?? [];
    }),
  );

  const uncompiledRaw = rawFiles.filter((rf) => !allCompiledFrom.has(rf.name));
  if (uncompiledRaw.length > 0) {
    issues.push({
      target: "domain",
      severity: "info",
      code: "uncompiled-raw",
      message: `${uncompiledRaw.length} raw file(s) not yet compiled: ${uncompiledRaw.map((f) => f.name).join(", ")}`,
    });
  }

  // 6. Check for articles with no tags
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
