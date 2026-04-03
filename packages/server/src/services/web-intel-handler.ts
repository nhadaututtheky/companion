/**
 * WebIntel command handlers — extracted from ws-bridge.ts
 * Handles /docs, /research, /crawl commands and auto-docs injection.
 */

import { createLogger } from "../logger.js";
import {
  scrapeForContext,
  isAvailable as isWebIntelAvailable,
  research as webResearch,
  startCrawl,
} from "./web-intel.js";
import { detectLibraryMentions, resolveDocsUrl } from "./web-intel-detector.js";
import { registerJob, pollCrawlJob } from "./web-intel-jobs.js";
import { getActiveSession, type ActiveSession } from "./session-store.js";
import type { BrowserIncomingMessage } from "@companion/shared";

const log = createLogger("web-intel-handler");

/** Callbacks the handler needs from the bridge */
export interface WebIntelBridge {
  broadcastToAll(session: ActiveSession, msg: BrowserIncomingMessage): void;
  handleUserMessageInternal(session: ActiveSession, content: string, source?: string): void;
  emitContextInjection(
    session: ActiveSession,
    injectionType: "project_map" | "message_context" | "plan_review" | "break_check" | "web_docs",
    summary: string,
    charCount: number,
  ): void;
}

/**
 * Handle /docs <url> — fetch web content and inject into the user message.
 */
export function handleDocsCommand(
  bridge: WebIntelBridge,
  session: ActiveSession,
  originalContent: string,
  url: string,
  refresh: boolean,
  source?: string,
): void {
  scrapeForContext(url, 4000, { skipCache: refresh })
    .then((docsContent) => {
      if (!getActiveSession(session.id)) {
        log.warn("/docs fetch completed but session is gone", { sessionId: session.id });
        return;
      }

      let enrichedContent: string;

      if (docsContent) {
        const userText = originalContent
          .replace(/^\/docs\s+https?:\/\/\S+(\s+--refresh)?/i, "")
          .trim();

        enrichedContent = userText
          ? `${userText}\n\n<web-docs url="${url}" auto-injected="true">\n${docsContent}\n</web-docs>`
          : `Here are the docs I fetched:\n\n<web-docs url="${url}" auto-injected="true">\n${docsContent}\n</web-docs>`;

        log.info("Injected web docs into message", {
          sessionId: session.id,
          url,
          contentLength: docsContent.length,
        });
      } else {
        enrichedContent = originalContent.replace(
          /^\/docs\s+/i,
          "[Note: webclaw unavailable — could not fetch docs] ",
        );
        log.debug("webclaw unavailable for /docs", { sessionId: session.id, url });
      }

      bridge.handleUserMessageInternal(session, enrichedContent, source);
    })
    .catch((err) => {
      log.warn("Error fetching docs", { sessionId: session.id, url, error: String(err) });
      bridge.handleUserMessageInternal(session, originalContent, source);
    });
}

/**
 * Handle /research <query> — search + scrape + synthesize.
 */
export function handleResearchCommand(
  bridge: WebIntelBridge,
  session: ActiveSession,
  query: string,
  source?: string,
): void {
  webResearch(query, 3000)
    .then((result) => {
      if (!getActiveSession(session.id)) return;

      let enrichedContent: string;

      if (result) {
        const sourceList = result.sources
          .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
          .join("\n");

        enrichedContent = `Here is research on: ${query}\n\n<web-research query="${query}" sources="${result.sources.length}">\n${result.content}\n\nSources:\n${sourceList}\n</web-research>`;

        log.info("Research completed", {
          sessionId: session.id,
          query,
          sources: result.sources.length,
        });
      } else {
        enrichedContent = `[Research failed — WEBCLAW_API_KEY may be required for search] ${query}`;
      }

      bridge.handleUserMessageInternal(session, enrichedContent, source);
    })
    .catch((err) => {
      log.warn("Research error", { sessionId: session.id, query, error: String(err) });
      if (getActiveSession(session.id)) {
        bridge.handleUserMessageInternal(session, `[Research failed] ${query}`, source);
      }
    });
}

/**
 * Handle /crawl <url> — start async crawl job.
 */
export function handleCrawlCommand(
  bridge: WebIntelBridge,
  session: ActiveSession,
  url: string,
  depth: number,
  maxPages: number,
  source?: string,
): void {
  startCrawl(url, { maxDepth: depth, maxPages })
    .then((jobId) => {
      if (!getActiveSession(session.id)) return;

      if (!jobId) {
        bridge.handleUserMessageInternal(
          session,
          `[Crawl failed to start — webclaw may be unavailable] ${url}`,
          source,
        );
        return;
      }

      const registered = registerJob({
        id: jobId,
        type: "crawl",
        sessionId: session.id,
        url,
      });

      if (!registered) {
        bridge.handleUserMessageInternal(
          session,
          `[Crawl job limit reached — wait for current crawl to finish] ${url}`,
          source,
        );
        return;
      }

      bridge.broadcastToAll(session, {
        type: "system_message",
        content: `🌐 Crawl started: ${url} (depth: ${depth}, max: ${maxPages} pages). Job ID: ${jobId}`,
        timestamp: Date.now(),
      } as unknown as BrowserIncomingMessage);

      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        if (!getActiveSession(session.id) || pollCount > 100) {
          clearInterval(pollInterval);
          return;
        }
        const job = await pollCrawlJob(jobId);
        if (!job || job.status !== "running") {
          clearInterval(pollInterval);

          if (!getActiveSession(session.id)) return;

          if (job?.status === "completed" && job.result) {
            const pages = job.result as Array<{ url: string; llm?: string; markdown?: string }>;
            const summary = pages
              .slice(0, 10)
              .map((p) => {
                const content = (p.llm ?? p.markdown ?? "").slice(0, 2000);
                return `## ${p.url}\n${content}`;
              })
              .join("\n\n---\n\n");

            bridge.handleUserMessageInternal(
              session,
              `Crawl completed for ${url}\n\n<web-crawl url="${url}" pages="${pages.length}" depth="${depth}">\n${summary}\n</web-crawl>`,
              source,
            );
          } else {
            bridge.handleUserMessageInternal(
              session,
              `[Crawl failed: ${job?.error ?? "unknown error"}] ${url}`,
              source,
            );
          }
        }
      }, 3000);
    })
    .catch((err) => {
      log.warn("Crawl start error", { sessionId: session.id, url, error: String(err) });
      if (getActiveSession(session.id)) {
        bridge.handleUserMessageInternal(session, `[Crawl failed] ${url}`, source);
      }
    });
}

/**
 * Auto-detect library mentions and inject documentation.
 * Returns enriched content or original if no docs found.
 * Times out after 3 seconds to avoid blocking.
 */
export async function maybeEnrichWithDocs(
  bridge: WebIntelBridge,
  session: ActiveSession,
  content: string,
): Promise<string> {
  if (!(await isWebIntelAvailable())) return content;

  if (!session.webIntelInjected) {
    session.webIntelInjected = new Set<string>();
  }

  const mentions = detectLibraryMentions(content);
  const newMentions = mentions.filter((m) => !session.webIntelInjected!.has(m));

  if (newMentions.length === 0) return content;

  const docsBlocks: string[] = [];
  let totalChars = 0;
  const MAX_TOTAL_CHARS = 16_000;

  for (const lib of newMentions.slice(0, 2)) {
    try {
      const docsUrl = await Promise.race([
        resolveDocsUrl(lib),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);

      if (!docsUrl) continue;

      const maxTokens = Math.floor((MAX_TOTAL_CHARS - totalChars) / 4);
      if (maxTokens < 500) break;

      const docsContent = await Promise.race([
        scrapeForContext(docsUrl, maxTokens),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      if (docsContent) {
        docsBlocks.push(
          `<web-docs library="${lib}" url="${docsUrl}" auto-injected="true">\n${docsContent}\n</web-docs>`,
        );
        totalChars += docsContent.length;
        session.webIntelInjected!.add(lib);

        log.info("Auto-injected library docs", {
          sessionId: session.id,
          library: lib,
          url: docsUrl,
          chars: docsContent.length,
        });
      }
    } catch {
      // Skip this library silently
    }
  }

  if (docsBlocks.length === 0) return content;

  const joined = docsBlocks.join("\n\n");
  bridge.emitContextInjection(
    session,
    "web_docs",
    `Library docs: ${newMentions.filter((m) => session.webIntelInjected!.has(m)).join(", ")}`,
    joined.length,
  );
  return `${content}\n\n${joined}`;
}
