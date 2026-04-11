/**
 * Query Archive — self-archiving queries for living wiki.
 *
 * When an agent queries the wiki, the Q&A is saved as raw material.
 * Next compile cycle ingests it — the wiki grows from its own usage.
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import { resolveWikiRoot, writeRawFile } from "./store.js";
import type { RetrievalResult } from "./types.js";

const log = createLogger("wiki-query-archive");

const MAX_ARCHIVES_PER_DOMAIN = 50;
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function archiveQuery(
  domain: string,
  query: string,
  results: RetrievalResult,
  cwd?: string,
): void {
  try {
    if (!query.trim()) return;

    const root = resolveWikiRoot(cwd);
    const rawDir = join(root, domain, "raw");

    if (!existsSync(rawDir)) {
      mkdirSync(rawDir, { recursive: true });
    }

    if (isDuplicate(rawDir, query)) return;

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `query-${timestamp}.md`;

    const matchedSlugs = results.articles.map((a) => a.slug);
    const truncatedSlugs = results.truncated.map((a) => a.slug);

    const content = [
      "---",
      "source: agent-query",
      `query: "${query.replace(/"/g, '\\"')}"`,
      `archived_at: ${now.toISOString()}`,
      `articles_matched: [${matchedSlugs.join(", ")}]`,
      "---",
      "",
      `## Query: ${query}`,
      "",
      matchedSlugs.length > 0
        ? `**Matched articles:** ${matchedSlugs.join(", ")}`
        : "*No matching articles found — potential knowledge gap.*",
      "",
      ...(truncatedSlugs.length > 0
        ? [`**Also relevant (excluded by budget):** ${truncatedSlugs.join(", ")}`, ""]
        : []),
      `**Total tokens returned:** ${results.totalTokens}`,
    ].join("\n");

    writeRawFile(domain, filename, content, cwd);
    rotateArchives(rawDir);

    log.info("Archived wiki query", { domain, query: query.slice(0, 80) });
  } catch (err) {
    log.warn("Failed to archive query", { domain, error: String(err) });
  }
}

function isDuplicate(rawDir: string, query: string): boolean {
  try {
    const files = readdirSync(rawDir).filter((f) => f.startsWith("query-"));
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    const queryLower = query.toLowerCase().trim();

    for (const file of files.slice(-10)) {
      const match = file.match(/^query-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
      if (!match) continue;

      const fileDate = new Date(
        `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`,
      );
      if (fileDate.getTime() < cutoff) continue;

      try {
        const content = readFileSync(join(rawDir, file), "utf-8");
        const queryMatch = content.match(/^query:\s*"(.+)"$/m);
        if (queryMatch && queryMatch[1]!.toLowerCase().trim() === queryLower) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function rotateArchives(rawDir: string): void {
  try {
    const archives = readdirSync(rawDir)
      .filter((f) => f.startsWith("query-"))
      .sort();

    if (archives.length <= MAX_ARCHIVES_PER_DOMAIN) return;

    const toDelete = archives.slice(0, archives.length - MAX_ARCHIVES_PER_DOMAIN);
    for (const file of toDelete) {
      unlinkSync(join(rawDir, file));
    }

    log.info("Rotated query archives", { deleted: toDelete.length });
  } catch (err) {
    log.warn("Failed to rotate archives", { error: String(err) });
  }
}
