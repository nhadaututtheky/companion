/**
 * Wiki Store — Filesystem CRUD for wiki domains, articles, and raw material.
 *
 * All wiki data lives on the filesystem (no DB). Structure:
 *   wiki/<domain>/_index.md    — TOC + metadata
 *   wiki/<domain>/_core.md     — L0 never-break rules
 *   wiki/<domain>/<slug>.md    — LLM-compiled articles
 *   wiki/<domain>/raw/         — source material
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  unlinkSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, basename, extname, resolve, sep } from "node:path";
import { createLogger } from "../logger.js";
import {
  type ArticleConfidence,
  type WikiDomain,
  type WikiArticle,
  type ArticleMeta,
  type ArticleRef,
  type WikiIndex,
  type RawFile,
  type WikiConfig,
  DEFAULT_WIKI_CONFIG,
  CHARS_PER_TOKEN,
  RESERVED_FILES,
  RAW_EXTENSIONS,
} from "./types.js";

const log = createLogger("wiki:store");

// ─── Config ─────────────────────────────────────────────────────────────────

let config: WikiConfig = { ...DEFAULT_WIKI_CONFIG };

export function getWikiConfig(): WikiConfig {
  return config;
}

export function setWikiConfig(updates: Partial<WikiConfig>): WikiConfig {
  config = { ...config, ...updates };
  return config;
}

/** Resolve absolute path to wiki root */
export function resolveWikiRoot(cwd?: string): string {
  if (config.rootPath.startsWith("/") || config.rootPath.match(/^[A-Z]:\\/i)) {
    return config.rootPath; // already absolute
  }
  return join(cwd ?? process.cwd(), config.rootPath);
}

// ─── Path Safety ───────────────────────────────────────────────────────────

/** Validates that a resolved path stays within the expected root. Prevents path traversal. */
function safePath(root: string, ...segments: string[]): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(root, ...segments);
  if (!resolvedPath.startsWith(resolvedRoot + sep) && resolvedPath !== resolvedRoot) {
    throw new Error("Path traversal detected");
  }
  return resolvedPath;
}

export const DOMAIN_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const ARTICLE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const RAW_FILENAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-z]{1,10}$/;

function validateDomainSlug(slug: string): void {
  if (slug.length < 2 || !DOMAIN_SLUG_RE.test(slug)) {
    throw new Error(`Invalid domain slug: "${slug}". Use 2+ lowercase alphanumeric with hyphens.`);
  }
}

function validateArticleSlug(slug: string): void {
  if (slug.length < 2 || !ARTICLE_SLUG_RE.test(slug)) {
    throw new Error(`Invalid article slug: "${slug}". Use 2+ lowercase alphanumeric with hyphens.`);
  }
}

function validateRawFilename(filename: string): void {
  if (!RAW_FILENAME_RE.test(filename) || filename.length > 200) {
    throw new Error(`Invalid raw filename: "${filename}".`);
  }
}

// ─── Domain Operations ──────────────────────────────────────────────────────

/** List all wiki domains */
export function listDomains(cwd?: string): WikiDomain[] {
  const root = resolveWikiRoot(cwd);
  if (!existsSync(root)) return [];

  const entries = readdirSync(root, { withFileTypes: true });
  const domains: WikiDomain[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const domainPath = join(root, entry.name);
    const domain = readDomain(entry.name, domainPath);
    if (domain) domains.push(domain);
  }

  return domains.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Read domain metadata */
function readDomain(slug: string, domainPath: string): WikiDomain | null {
  try {
    const articles = listArticleFiles(domainPath);
    const totalTokens = articles.reduce((sum, a) => sum + a.tokens, 0);
    const hasCore = existsSync(join(domainPath, "_core.md"));
    const index = readIndexMeta(domainPath);

    return {
      slug,
      name: index?.domain ?? slug,
      path: domainPath,
      articleCount: articles.length,
      totalTokens,
      lastCompiledAt: index?.lastCompiledAt ?? null,
      hasCore,
    };
  } catch {
    return null;
  }
}

/** Create a new domain directory with initial files */
export function createDomain(slug: string, name: string, cwd?: string): WikiDomain {
  validateDomainSlug(slug);
  const root = resolveWikiRoot(cwd);
  const domainPath = safePath(root, slug);

  if (existsSync(domainPath)) {
    throw new Error(`Domain "${slug}" already exists`);
  }

  mkdirSync(domainPath, { recursive: true });
  mkdirSync(join(domainPath, "raw"), { recursive: true });

  // Write initial _index.md
  const indexContent = buildIndexContent(slug, name, []);
  writeFileSync(join(domainPath, "_index.md"), indexContent, "utf-8");

  log.info("Created wiki domain", { slug, path: domainPath });

  return {
    slug,
    name,
    path: domainPath,
    articleCount: 0,
    totalTokens: 0,
    lastCompiledAt: null,
    hasCore: false,
  };
}

/** Delete a domain and all its contents */
export function deleteDomain(slug: string, cwd?: string): void {
  validateDomainSlug(slug);
  const root = resolveWikiRoot(cwd);
  const domainPath = safePath(root, slug);

  if (!existsSync(domainPath)) {
    throw new Error(`Domain "${slug}" not found`);
  }

  rmSync(domainPath, { recursive: true, force: true });
  log.info("Deleted wiki domain", { slug });
}

// ─── Article Operations ─────────────────────────────────────────────────────

/** List all article files in a domain (excludes _index.md, _core.md, raw/) */
function listArticleFiles(domainPath: string): ArticleRef[] {
  const files = readdirSync(domainPath, { withFileTypes: true });
  const articles: ArticleRef[] = [];

  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith(".md")) continue;
    if ((RESERVED_FILES as readonly string[]).includes(f.name)) continue;

    const slug = f.name.replace(/\.md$/, "");
    const filePath = join(domainPath, f.name);
    const meta = parseArticleMeta(filePath);

    articles.push({
      slug,
      title: meta?.title ?? slug,
      tokens: meta?.tokens ?? estimateFileTokens(filePath),
      tags: meta?.tags ?? [],
      compiledAt: meta?.compiledAt ?? "",
      confidence: meta?.confidence,
    });
  }

  return articles.sort((a, b) => a.title.localeCompare(b.title));
}

/** Read a full article (frontmatter + content) */
export function readArticle(domain: string, slug: string, cwd?: string): WikiArticle | null {
  const root = resolveWikiRoot(cwd);
  const filePath = safePath(root, domain, `${slug}.md`);

  if (!existsSync(filePath)) return null;

  const raw = readFileSync(filePath, "utf-8");
  const { meta, content } = parseFrontmatter(raw);

  const rawConfidence = meta.confidence as string | undefined;
  const confidence =
    rawConfidence === "extracted" || rawConfidence === "inferred" || rawConfidence === "ambiguous"
      ? rawConfidence
      : undefined;

  const articleMeta: ArticleMeta = {
    title: String(meta.title ?? slug),
    domain: String(meta.domain ?? domain),
    compiledFrom: (meta.compiled_from ?? meta.compiledFrom ?? []) as string[],
    compiledBy: String(meta.compiled_by ?? meta.compiledBy ?? "unknown"),
    compiledAt: String(meta.compiled_at ?? meta.compiledAt ?? ""),
    tokens: (meta.tokens as number) ?? Math.ceil(content.length / CHARS_PER_TOKEN),
    tags: (meta.tags ?? []) as string[],
    manuallyEdited: Boolean(meta.manually_edited ?? meta.manuallyEdited ?? false),
    confidence,
    sourceUrl: (meta.source_url as string | undefined) ?? (meta.sourceUrl as string | undefined),
  };

  return { slug, meta: articleMeta, content, path: filePath };
}

/** Write an article with frontmatter */
export function writeArticle(
  domain: string,
  slug: string,
  meta: ArticleMeta,
  content: string,
  cwd?: string,
): void {
  validateArticleSlug(slug);
  const root = resolveWikiRoot(cwd);
  const domainPath = safePath(root, domain);
  const filePath = safePath(root, domain, `${slug}.md`);

  if (!existsSync(domainPath)) {
    throw new Error(`Domain "${domain}" not found`);
  }

  const frontmatter = [
    "---",
    `title: "${meta.title.replace(/"/g, '\\"')}"`,
    `domain: ${meta.domain}`,
    `compiled_from:`,
    ...meta.compiledFrom.map((f) => `  - ${f}`),
    `compiled_by: ${meta.compiledBy}`,
    `compiled_at: ${meta.compiledAt}`,
    `tokens: ${meta.tokens}`,
    `tags: [${meta.tags.join(", ")}]`,
    ...(meta.manuallyEdited ? ["manually_edited: true"] : []),
    ...(meta.confidence ? [`confidence: ${meta.confidence}`] : []),
    ...(meta.sourceUrl ? [`source_url: "${meta.sourceUrl}"`] : []),
    "---",
    "",
  ].join("\n");

  writeFileSync(filePath, frontmatter + content, "utf-8");
  log.info("Wrote wiki article", { domain, slug, tokens: meta.tokens });
}

/** Delete an article */
export function deleteArticle(domain: string, slug: string, cwd?: string): void {
  const root = resolveWikiRoot(cwd);
  const filePath = safePath(root, domain, `${slug}.md`);

  if (!existsSync(filePath)) {
    throw new Error(`Article "${slug}" not found in domain "${domain}"`);
  }

  unlinkSync(filePath);
  log.info("Deleted wiki article", { domain, slug });
}

/** Quick note — agent writes directly without compile cycle */
export function writeNote(
  domain: string,
  content: string,
  options?: { title?: string; tags?: string[]; confidence?: ArticleConfidence; sourceUrl?: string },
  cwd?: string,
): ArticleRef {
  const root = resolveWikiRoot(cwd);
  const domainPath = safePath(root, domain);

  if (!existsSync(domainPath)) {
    mkdirSync(domainPath, { recursive: true });
  }

  const title =
    options?.title ??
    content
      .slice(0, 60)
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim();
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const now = new Date().toISOString();
  const tokens = Math.ceil(content.length / CHARS_PER_TOKEN);

  const meta: ArticleMeta = {
    title,
    domain,
    compiledFrom: [],
    compiledBy: "agent-note",
    compiledAt: now,
    tokens,
    tags: options?.tags ?? [],
    confidence: options?.confidence ?? "inferred",
    sourceUrl: options?.sourceUrl,
  };

  writeArticle(domain, slug, meta, content, cwd);
  rebuildIndex(domain, cwd);

  return { slug, title, tokens, tags: meta.tags, compiledAt: now, confidence: meta.confidence };
}

/** List all articles in a domain */
export function listArticles(domain: string, cwd?: string): ArticleRef[] {
  const root = resolveWikiRoot(cwd);
  const domainPath = safePath(root, domain);

  if (!existsSync(domainPath)) return [];
  return listArticleFiles(domainPath);
}

// ─── Core Rules ─────────────────────────────────────────────────────────────

/** Read _core.md (L0 never-break rules) */
export function readCore(domain: string, cwd?: string): string | null {
  const root = resolveWikiRoot(cwd);
  const filePath = safePath(root, domain, "_core.md");

  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

/** Write _core.md */
export function writeCore(domain: string, content: string, cwd?: string): void {
  const root = resolveWikiRoot(cwd);
  const domainPath = safePath(root, domain);
  const filePath = safePath(root, domain, "_core.md");

  if (!existsSync(domainPath)) {
    throw new Error(`Domain "${domain}" not found`);
  }

  writeFileSync(filePath, content, "utf-8");
  log.info("Wrote wiki core rules", {
    domain,
    tokens: Math.ceil(content.length / CHARS_PER_TOKEN),
  });
}

// ─── Index Management ───────────────────────────────────────────────────────

/** Read parsed index */
export function readIndex(domain: string, cwd?: string): WikiIndex | null {
  const root = resolveWikiRoot(cwd);
  const domainPath = safePath(root, domain);

  if (!existsSync(domainPath)) return null;

  const articles = listArticleFiles(domainPath);
  const core = readCore(domain, cwd);
  const indexMeta = readIndexMeta(domainPath);

  return {
    domain: indexMeta?.domain ?? domain,
    articleCount: articles.length,
    totalTokens: articles.reduce((sum, a) => sum + a.tokens, 0),
    lastCompiledAt: indexMeta?.lastCompiledAt ?? null,
    articles,
    coreSummary: core ? core.slice(0, 200) : null,
  };
}

/** Rebuild _index.md from current articles */
export function rebuildIndex(domain: string, cwd?: string): void {
  const root = resolveWikiRoot(cwd);
  const domainPath = safePath(root, domain);
  const articles = listArticleFiles(domainPath);
  const domainInfo = readDomain(domain, domainPath);
  const name = domainInfo?.name ?? domain;

  const content = buildIndexContent(domain, name, articles);
  writeFileSync(join(domainPath, "_index.md"), content, "utf-8");
  log.info("Rebuilt wiki index", { domain, articleCount: articles.length });
}

function buildIndexContent(domain: string, name: string, articles: ArticleRef[]): string {
  const totalTokens = articles.reduce((sum, a) => sum + a.tokens, 0);
  const now = new Date().toISOString();

  const lines = [
    "---",
    `domain: ${domain}`,
    `article_count: ${articles.length}`,
    `total_tokens: ${totalTokens}`,
    `last_compiled: ${now}`,
    "---",
    "",
    `# ${name} Knowledge Base`,
    "",
  ];

  if (articles.length === 0) {
    lines.push("*No articles yet. Drop raw material and run compile.*");
  } else {
    lines.push("## Articles");
    for (const a of articles) {
      const tags = a.tags.length > 0 ? ` [${a.tags.join(", ")}]` : "";
      lines.push(`- [${a.title}](${a.slug}.md) — ${a.tokens} tokens${tags}`);
    }
  }

  return lines.join("\n") + "\n";
}

function readIndexMeta(
  domainPath: string,
): { domain: string; lastCompiledAt: string | null } | null {
  const indexPath = join(domainPath, "_index.md");
  if (!existsSync(indexPath)) return null;

  try {
    const raw = readFileSync(indexPath, "utf-8");
    const { meta } = parseFrontmatter(raw);
    return {
      domain: String(meta.domain ?? basename(domainPath)),
      lastCompiledAt: (meta.last_compiled ?? meta.lastCompiled ?? null) as string | null,
    };
  } catch {
    return null;
  }
}

// ─── Raw Material ───────────────────────────────────────────────────────────

/**
 * Check if a raw file has been compiled into any article.
 * A raw file is "compiled" if an article lists it in compiledFrom
 * and the article's compiledAt is newer than the raw file's modification time.
 */
function isRawFileCompiled(
  domain: string,
  filename: string,
  rawModified: Date,
  cwd?: string,
): boolean {
  try {
    const root = resolveWikiRoot(cwd);
    const domainPath = safePath(root, domain);
    const articles = listArticleFiles(domainPath);

    for (const article of articles) {
      const filePath = safePath(root, domain, `${article.slug}.md`);
      if (!existsSync(filePath)) continue;

      const raw = readFileSync(filePath, "utf-8");
      const { meta } = parseFrontmatter(raw);
      const compiledFrom = (meta.compiled_from ?? meta.compiledFrom ?? []) as string[];

      // Check if this raw file is listed in compiledFrom
      if (
        compiledFrom.some(
          (src) => src === filename || src === `raw/${filename}` || src.endsWith(`/${filename}`),
        )
      ) {
        // Compare timestamps — compiled if article was compiled after raw file was modified
        const compiledAt = String(meta.compiled_at ?? meta.compiledAt ?? "");
        if (compiledAt) {
          const compiledDate = new Date(compiledAt);
          if (compiledDate >= rawModified) return true;
        }
      }
    }
  } catch {
    // Non-fatal — default to uncompiled
  }
  return false;
}

/** List raw files in a domain */
export function listRawFiles(domain: string, cwd?: string): RawFile[] {
  const root = resolveWikiRoot(cwd);
  const rawPath = safePath(root, domain, "raw");

  if (!existsSync(rawPath)) return [];

  const entries = readdirSync(rawPath, { withFileTypes: true });
  const files: RawFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (!RAW_EXTENSIONS.has(ext)) continue;

    const fullPath = join(rawPath, entry.name);
    const stat = statSync(fullPath);

    files.push({
      name: entry.name,
      ext,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      compiled: isRawFileCompiled(domain, entry.name, stat.mtime, cwd),
    });
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

/** Read a raw file's content */
export function readRawFile(domain: string, filename: string, cwd?: string): string | null {
  validateRawFilename(filename);
  const root = resolveWikiRoot(cwd);
  const filePath = safePath(root, domain, "raw", filename);

  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

/** Write a raw file */
export function writeRawFile(
  domain: string,
  filename: string,
  content: string,
  cwd?: string,
): void {
  validateRawFilename(filename);
  const root = resolveWikiRoot(cwd);
  const rawPath = safePath(root, domain, "raw");

  mkdirSync(rawPath, { recursive: true });
  writeFileSync(safePath(rawPath, filename), content, "utf-8");
  log.info("Wrote raw file", { domain, filename, bytes: content.length });
}

/** Delete a raw file */
export function deleteRawFile(domain: string, filename: string, cwd?: string): void {
  validateRawFilename(filename);
  const root = resolveWikiRoot(cwd);
  const filePath = safePath(root, domain, "raw", filename);

  if (!existsSync(filePath)) {
    throw new Error(`Raw file "${filename}" not found in domain "${domain}"`);
  }

  unlinkSync(filePath);
  log.info("Deleted raw file", { domain, filename });
}

// ─── Cross-Reference: CodeGraph ↔ Wiki ──────────────────────────────────────

/**
 * Find wiki articles related to a set of code file paths.
 * Matches by extracting module names from paths and comparing against
 * article slugs and tags.
 */
export function findArticlesByRelatedFiles(
  filePaths: string[],
  cwd?: string,
): Array<{ domain: string; article: ArticleRef; relevance: number }> {
  if (filePaths.length === 0) return [];

  // Extract module keywords from file paths (e.g. "src/services/auth.ts" → "auth")
  const keywords = new Set<string>();
  for (const fp of filePaths) {
    const segments = fp.replace(/\\/g, "/").split("/");
    const filename = segments[segments.length - 1] ?? "";
    const stem = filename.replace(/\.[^.]+$/, "").toLowerCase();
    if (stem && stem.length >= 2) keywords.add(stem);

    // Also add parent directory name for broader matching
    const parent = segments[segments.length - 2]?.toLowerCase();
    if (parent && parent.length >= 2 && !["src", "lib", "utils", "components"].includes(parent)) {
      keywords.add(parent);
    }
  }

  if (keywords.size === 0) return [];

  const results: Array<{ domain: string; article: ArticleRef; relevance: number }> = [];
  const domains = listDomains(cwd);

  for (const domain of domains) {
    const articles = listArticleFiles(domain.path);
    for (const article of articles) {
      let relevance = 0;

      // Check slug match
      for (const kw of keywords) {
        if (article.slug.includes(kw) || kw.includes(article.slug)) {
          relevance += 2;
        }
      }

      // Check tag match
      for (const tag of article.tags) {
        const normalizedTag = tag.toLowerCase();
        for (const kw of keywords) {
          if (normalizedTag.includes(kw) || kw.includes(normalizedTag)) {
            relevance += 1;
          }
        }
      }

      if (relevance > 0) {
        results.push({ domain: domain.slug, article, relevance });
      }
    }
  }

  // Sort by relevance descending
  return results.sort((a, b) => b.relevance - a.relevance);
}

// ─── Needs-Update Flags ────────────────────────────────────────────────────

export interface NeedsUpdateEntry {
  slug: string;
  reason?: string;
  flaggedAt: string;
  flaggedBy: string;
}

export function flagStale(
  domain: string,
  slug: string,
  reason?: string,
  flaggedBy = "agent",
  cwd?: string,
): void {
  const root = resolveWikiRoot(cwd);
  const flagPath = join(root, domain, "needs_update.json");
  const entries = getFlaggedArticles(domain, cwd);

  const existing = entries.findIndex((e) => e.slug === slug);
  const entry: NeedsUpdateEntry = {
    slug,
    reason,
    flaggedAt: new Date().toISOString(),
    flaggedBy,
  };

  if (existing >= 0) {
    entries[existing] = entry;
  } else {
    entries.push(entry);
  }

  writeFileSync(flagPath, JSON.stringify(entries, null, 2), "utf-8");
  log.info("Flagged article as stale", { domain, slug, reason });
}

export function getFlaggedArticles(domain: string, cwd?: string): NeedsUpdateEntry[] {
  const root = resolveWikiRoot(cwd);
  const flagPath = join(root, domain, "needs_update.json");

  if (!existsSync(flagPath)) return [];

  try {
    const raw = readFileSync(flagPath, "utf-8");
    return JSON.parse(raw) as NeedsUpdateEntry[];
  } catch {
    return [];
  }
}

export function clearFlags(domain: string, slugs: string[], cwd?: string): void {
  if (slugs.length === 0) return;

  const root = resolveWikiRoot(cwd);
  const flagPath = join(root, domain, "needs_update.json");
  const entries = getFlaggedArticles(domain, cwd);

  const slugSet = new Set(slugs);
  const remaining = entries.filter((e) => !slugSet.has(e.slug));

  if (remaining.length === 0 && existsSync(flagPath)) {
    unlinkSync(flagPath);
  } else if (remaining.length < entries.length) {
    writeFileSync(flagPath, JSON.stringify(remaining, null, 2), "utf-8");
  }

  log.info("Cleared stale flags", { domain, cleared: slugs.length });
}

// ─── Frontmatter Parser ─────────────────────────────────────────────────────

/** Parse YAML-like frontmatter from markdown (simple parser, no dependency) */
function parseFrontmatter(rawInput: string): { meta: Record<string, unknown>; content: string } {
  // Normalize line endings for cross-platform support
  const raw = rawInput.replace(/\r\n/g, "\n");

  if (!raw.startsWith("---")) {
    return { meta: {}, content: raw };
  }

  const endIdx = raw.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { meta: {}, content: raw };
  }

  const frontmatterStr = raw.slice(4, endIdx).trim();
  const content = raw.slice(endIdx + 4).trim();
  const meta: Record<string, unknown> = {};

  let currentKey = "";
  let currentArray: string[] | null = null;

  for (const line of frontmatterStr.split("\n")) {
    const trimmed = line.trim();

    // Array item
    if (trimmed.startsWith("- ") && currentArray !== null) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Close previous array
    if (currentArray !== null) {
      meta[currentKey] = currentArray;
      currentArray = null;
    }

    // Key-value pair
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (value === "") {
      // Start of array
      currentKey = key;
      currentArray = [];
    } else if (value.startsWith("[") && value.endsWith("]")) {
      // Inline array
      meta[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (value === "true") {
      meta[key] = true;
    } else if (value === "false") {
      meta[key] = false;
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      meta[key] = parseFloat(value);
    } else {
      // Strip quotes
      meta[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  // Close trailing array
  if (currentArray !== null) {
    meta[currentKey] = currentArray;
  }

  return { meta, content };
}

/** Parse article frontmatter from file path */
function parseArticleMeta(filePath: string): ArticleMeta | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    if (!meta.title) return null;

    const rawConf = meta.confidence as string | undefined;
    const confidence =
      rawConf === "extracted" || rawConf === "inferred" || rawConf === "ambiguous"
        ? rawConf
        : undefined;

    return {
      title: String(meta.title),
      domain: String(meta.domain ?? ""),
      compiledFrom: (meta.compiled_from ?? meta.compiledFrom ?? []) as string[],
      compiledBy: String(meta.compiled_by ?? meta.compiledBy ?? "unknown"),
      compiledAt: String(meta.compiled_at ?? meta.compiledAt ?? ""),
      tokens: (meta.tokens as number) ?? Math.ceil(content.length / CHARS_PER_TOKEN),
      tags: (meta.tags ?? []) as string[],
      manuallyEdited: (meta.manually_edited ?? meta.manuallyEdited ?? false) as boolean,
      confidence,
      sourceUrl: (meta.source_url as string | undefined) ?? (meta.sourceUrl as string | undefined),
    };
  } catch {
    return null;
  }
}

/** Estimate tokens from file content */
function estimateFileTokens(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    return Math.ceil(content.length / CHARS_PER_TOKEN);
  } catch {
    return 0;
  }
}
