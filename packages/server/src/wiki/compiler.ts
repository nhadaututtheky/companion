/**
 * Wiki Compiler — LLM compiles raw material into wiki articles.
 *
 * Flow: read raw files → group by topic → send to LLM → write articles.
 * Uses Companion's AI provider (callAI). Karpathy pattern: LLM is the author.
 */

import { createLogger } from "../logger.js";
import { callAI, isAIConfigured } from "../services/ai-client.js";
import {
  listRawFiles,
  readRawFile,
  readCore,
  writeArticle,
  listArticles,
  rebuildIndex,
  clearFlags,
} from "./store.js";
import {
  type CompileRequest,
  type CompileResult,
  type ArticleConfidence,
  type ArticleMeta,
  type ArticleRef,
  type WriteContext,
  CHARS_PER_TOKEN,
  MAX_ARTICLE_TOKENS,
} from "./types.js";

const log = createLogger("wiki:compiler");

/** Maximum raw content to send in a single LLM call (~30K tokens) */
const MAX_RAW_CHARS = 120_000;

/** Maximum raw files per compilation batch */
const MAX_FILES_PER_BATCH = 20;

// ─── Main Compiler ──────────────────────────────────────────────────────────

/**
 * Compile raw material into wiki articles.
 *
 * Reads all raw files, sends them to LLM with a compile prompt,
 * and writes the resulting articles with proper frontmatter.
 */
export async function compileWiki(request: CompileRequest, cwd?: string, ctx?: WriteContext): Promise<CompileResult> {
  const start = Date.now();
  const { domain, overwrite = false } = request;

  if (!isAIConfigured()) {
    throw new Error("AI provider not configured. Set up in Settings → AI Provider.");
  }

  // Gather raw files
  const allRaw = listRawFiles(domain, cwd);
  const targetFiles = request.rawFiles
    ? allRaw.filter((f) => request.rawFiles!.includes(f.name))
    : allRaw;

  if (targetFiles.length === 0) {
    return {
      domain,
      articlesWritten: [],
      rawFilesProcessed: [],
      errors: [],
      totalTokens: 0,
      durationMs: Date.now() - start,
    };
  }

  // Read raw content (respect batch limits)
  const batch = targetFiles.slice(0, MAX_FILES_PER_BATCH);
  const rawContents: Array<{ name: string; content: string }> = [];
  let totalChars = 0;

  for (const file of batch) {
    const content = readRawFile(domain, file.name, cwd);
    if (!content || content.trim().length === 0) continue;

    // Truncate if adding this file would exceed limit
    if (totalChars + content.length > MAX_RAW_CHARS) {
      const remaining = MAX_RAW_CHARS - totalChars;
      if (remaining > 500) {
        rawContents.push({
          name: file.name,
          content: content.slice(0, remaining) + "\n\n[...truncated]",
        });
      }
      break;
    }

    rawContents.push({ name: file.name, content });
    totalChars += content.length;
  }

  if (rawContents.length === 0) {
    return {
      domain,
      articlesWritten: [],
      rawFilesProcessed: [],
      errors: [{ file: "all", error: "No readable raw content found" }],
      totalTokens: 0,
      durationMs: Date.now() - start,
    };
  }

  // Get existing articles for context
  const existingArticles = listArticles(domain, cwd);
  const existingSlugs = new Set(existingArticles.map((a) => a.slug));

  // Get core rules for context
  const core = readCore(domain, cwd);

  // Call LLM to compile
  log.info("Compiling wiki", {
    domain,
    rawFiles: rawContents.length,
    totalChars,
    existingArticles: existingArticles.length,
  });

  const articlesWritten: ArticleRef[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  try {
    const response = await callCompiler(domain, rawContents, existingArticles, core, overwrite);
    const parsed = parseCompilerOutput(response);

    for (const article of parsed) {
      // Skip if article exists and overwrite is false
      if (!overwrite && existingSlugs.has(article.slug)) {
        log.debug("Skipping existing article", { slug: article.slug });
        continue;
      }

      const tokens = Math.ceil(article.content.length / CHARS_PER_TOKEN);
      const meta: ArticleMeta = {
        title: article.title,
        domain,
        compiledFrom: rawContents.map((r) => `raw/${r.name}`),
        compiledBy: "ai-compiler",
        compiledAt: new Date().toISOString(),
        tokens,
        tags: article.tags,
        confidence: article.confidence ?? "inferred",
      };

      const compileCtx: WriteContext = {
        ...ctx,
        reason: ctx?.reason ?? `Compiled from ${rawContents.length} raw files`,
      };
      writeArticle(domain, article.slug, meta, article.content, cwd, compileCtx);

      articlesWritten.push({
        slug: article.slug,
        title: article.title,
        tokens,
        tags: article.tags,
        compiledAt: meta.compiledAt,
      });
    }

    // Rebuild index after writing
    rebuildIndex(domain, cwd);

    // Clear stale flags for recompiled articles
    if (articlesWritten.length > 0) {
      clearFlags(
        domain,
        articlesWritten.map((a) => a.slug),
        cwd,
      );
    }
  } catch (err) {
    log.error("Compilation failed", { domain, error: String(err) });
    errors.push({ file: "compiler", error: String(err) });
  }

  const result: CompileResult = {
    domain,
    articlesWritten,
    rawFilesProcessed: rawContents.map((r) => r.name),
    errors,
    totalTokens: articlesWritten.reduce((sum, a) => sum + a.tokens, 0),
    durationMs: Date.now() - start,
  };

  log.info("Compilation complete", {
    domain,
    articles: articlesWritten.length,
    tokens: result.totalTokens,
    errors: errors.length,
    durationMs: result.durationMs,
  });

  return result;
}

// ─── LLM Call ───────────────────────────────────────────────────────────────

async function callCompiler(
  domain: string,
  rawContents: Array<{ name: string; content: string }>,
  existingArticles: ArticleRef[],
  core: string | null,
  overwrite: boolean,
): Promise<string> {
  const rawSection = rawContents
    .map((r) => `### Source: ${r.name}\n\n${r.content}`)
    .join("\n\n---\n\n");

  const existingSection =
    existingArticles.length > 0
      ? `\n\nExisting articles (${overwrite ? "may be updated" : "do NOT recreate"}):\n${existingArticles.map((a) => `- ${a.slug}: ${a.title} [${a.tags.join(", ")}]`).join("\n")}`
      : "";

  const coreSection = core
    ? `\n\nCore rules (_core.md) for reference:\n${core.slice(0, 2000)}`
    : "";

  const systemPrompt = `You are a knowledge base compiler. Your job is to read raw source material and produce well-structured wiki articles.

## Rules
1. Each article should cover ONE focused topic (not a dump of everything)
2. Article length: 500-2000 words (${MAX_ARTICLE_TOKENS} token max)
3. Use clear headings, bullet points, and examples
4. Extract actionable knowledge — rules, patterns, best practices
5. Remove noise — dates, personal notes, irrelevant context from raw material
6. If raw material contains code, include key snippets but summarize the rest
7. Cross-reference other articles when relevant
8. Tags should be specific and useful for search
9. Assign confidence: "extracted" (directly from source material), "inferred" (your deduction/synthesis), "ambiguous" (uncertain, needs verification)
10. Files prefixed with "query-" are archived agent queries. Extract recurring themes or knowledge gaps. If queries have no results, consider creating articles to fill those gaps.

## Domain: ${domain}
${coreSection}
${existingSection}

## Output Format

For EACH article, output exactly this format (including the markers):

===ARTICLE_START===
slug: <url-safe-slug>
title: <Clear Descriptive Title>
tags: <tag1, tag2, tag3>
confidence: <extracted|inferred|ambiguous>

<article body in markdown>
===ARTICLE_END===

Output as many articles as the content warrants. Typical: 2-5 articles from a batch of raw material. Group related information, don't create one article per raw file.`;

  const response = await callAI({
    systemPrompt,
    messages: [
      {
        role: "user",
        content: `Compile the following raw material into wiki articles:\n\n${rawSection}`,
      },
    ],
    tier: "default",
    maxTokens: 8000,
  });

  if (!response.text) {
    throw new Error("AI returned empty response");
  }

  return response.text;
}

// ─── Output Parser ──────────────────────────────────────────────────────────

interface ParsedArticle {
  slug: string;
  title: string;
  tags: string[];
  confidence?: ArticleConfidence;
  content: string;
}

function parseCompilerOutput(output: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  const blocks = output.split("===ARTICLE_START===").slice(1);

  for (const block of blocks) {
    const endIdx = block.indexOf("===ARTICLE_END===");
    const content = endIdx >= 0 ? block.slice(0, endIdx) : block;
    const trimmed = content.trim();

    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    let slug = "";
    let title = "";
    let tags: string[] = [];
    let confidence: ArticleConfidence | undefined;
    let bodyStartIdx = 0;

    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i]?.trim() ?? "";

      if (line.startsWith("slug:")) {
        slug = line
          .slice(5)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-");
        bodyStartIdx = i + 1;
      } else if (line.startsWith("title:")) {
        title = line.slice(6).trim();
        bodyStartIdx = i + 1;
      } else if (line.startsWith("tags:")) {
        tags = line
          .slice(5)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        bodyStartIdx = i + 1;
      } else if (line.startsWith("confidence:")) {
        const val = line.slice(11).trim();
        if (val === "extracted" || val === "inferred" || val === "ambiguous") {
          confidence = val;
        }
        bodyStartIdx = i + 1;
      } else if (line === "") {
        bodyStartIdx = i + 1;
        break;
      }
    }

    const body = lines.slice(bodyStartIdx).join("\n").trim();

    // Generate slug from title if missing
    if (!slug && title) {
      slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }

    if (!slug || !body) continue;

    articles.push({
      slug,
      title: title || slug,
      tags,
      confidence,
      content: body,
    });
  }

  return articles;
}
