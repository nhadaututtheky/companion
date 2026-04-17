/**
 * WsBridge user message handling — extracted from ws-bridge.ts.
 * Handles browser message routing, user message command dispatch, prompt enrichment,
 * CodeGraph context injection, WebIntel enrichment, terminal lock, and engine send.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../logger.js";
import {
  getSessionRecord,
  persistSession,
  storeMessage,
  pushMessageHistory,
} from "./session-store.js";
import {
  buildMessageContext,
  buildActivityContext,
  getCodeGraphConfig,
} from "../codegraph/agent-context-provider.js";
import { isGraphReady } from "../codegraph/index.js";
import { scanPrompt, isScanEnabled } from "./prompt-scanner.js";
import { generateSessionName } from "./session-namer.js";
import { handleMentions } from "./mention-router.js";
import { classifyByRules } from "./task-classifier.js";
import { tryAutoDispatch, type DispatchContext } from "./dispatch-router.js";
import { terminalLock } from "./terminal-lock.js";
import {
  handleDocsCommand as handleDocsCmd,
  handleResearchCommand as handleResearchCmd,
  handleCrawlCommand as handleCrawlCmd,
  maybeEnrichWithDocs as enrichWithDocs,
  type WebIntelBridge,
} from "./web-intel-handler.js";
import {
  handlePermissionResponse as _handlePermissionResponse,
  handleInterrupt as _handleInterrupt,
  type PermissionBridge,
} from "./ws-permission-handler.js";
import {
  handleSpawnCommand as _handleSpawnCommand,
  handleStatusCommand as _handleStatusCommand,
  type MultiBrainBridge,
} from "./ws-multi-brain.js";
import type { ActiveSession } from "./session-store.js";
import type {
  BrowserOutgoingMessage,
  BrowserIncomingMessage,
  SessionStatus,
} from "@companion/shared";
import { modelSupportsDeepThinking, modelSupports1M, applyContextSuffix } from "@companion/shared";

const log = createLogger("ws-user-message");

// ─── Bridge Interface ─────────────────────────────────────────────────────────

export interface UserMessageBridge {
  broadcastToAll: (session: ActiveSession, msg: BrowserIncomingMessage) => void;
  broadcastToSubscribers: (session: ActiveSession, msg: unknown) => void;
  broadcastLockStatus: (session: ActiveSession) => void;
  updateStatus: (session: ActiveSession, status: SessionStatus) => void;
  emitContextInjection: (
    session: ActiveSession,
    type:
      | "project_map"
      | "message_context"
      | "plan_review"
      | "break_check"
      | "web_docs"
      | "activity_feed",
    label: string,
    size: number,
  ) => void;
  clearIdleTimer: (sessionId: string) => void;
  getSessionRecord: (sessionId: string) => ReturnType<typeof getSessionRecord>;
  getSdkHandle: (sessionId: string) => { isRunning(): boolean; abort(): void } | undefined;
  startSessionWithSdk: (
    sessionId: string,
    session: ActiveSession,
    opts: {
      cwd: string;
      model: string;
      permissionMode?: string;
      prompt?: string;
      resume?: boolean;
      cliSessionId?: string;
    },
  ) => string;
  getSessionSettings: (sessionId: string) => {
    idleTimeoutMs: number;
    keepAlive: boolean;
    autoReinjectOnCompact: boolean;
  };
  sendToCLI: (session: ActiveSession, ndjson: string) => void;
  sendUserMessage: (sessionId: string, content: string, source?: string) => void;
  /** Permission bridge for handlePermissionResponse / handleInterrupt */
  permBridge: PermissionBridge;
  /** Multi-brain bridge for /spawn and /status commands */
  multiBrainBridge: MultiBrainBridge;
}

// ─── UserMessageHandler ───────────────────────────────────────────────────────

/** Whether to use the new SDK engine (mirrors the flag in ws-bridge.ts) */
const USE_SDK_ENGINE = process.env.USE_SDK_ENGINE === "1";

export class UserMessageHandler {
  constructor(private readonly bridge: UserMessageBridge) {}

  // ── routeBrowserMessage ────────────────────────────────────────────────────

  routeBrowserMessage(session: ActiveSession, msg: BrowserOutgoingMessage): void {
    switch (msg.type) {
      case "user_message":
        if (msg.images && msg.images.length > 0) {
          // Images attached — build content blocks and send multimodal
          const contentBlocks: Array<
            | { type: "text"; text: string }
            | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
          > = [];
          if (msg.content) contentBlocks.push({ type: "text", text: msg.content });
          for (const img of msg.images) {
            contentBlocks.push({
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.data },
            });
          }
          this.sendMultimodalMessage(session, contentBlocks, "web");
        } else {
          this.handleUserMessage(session, msg.content, "web");
        }
        break;
      case "permission_response":
        this.handlePermissionResponse(session, msg);
        break;
      case "interrupt":
        this.handleInterrupt(session);
        break;
      case "set_model":
        this.handleSetModel(session, msg.model);
        break;
      case "set_auto_approve":
        session.autoApproveConfig = msg.config;
        log.info("Auto-approve config updated", {
          enabled: msg.config.enabled,
          timeoutSeconds: msg.config.timeoutSeconds,
        });
        break;
      case "set_thinking_mode":
        session.state = { ...session.state, thinking_mode: msg.mode };
        log.info("Thinking mode updated", { sessionId: session.state.session_id, mode: msg.mode });
        this.bridge.broadcastToSubscribers(session, {
          type: "session_update",
          session: { thinking_mode: msg.mode },
        });
        break;
      case "set_context_mode":
        this.handleSetContextMode(session, msg.mode);
        break;
    }
  }

  // ── handleSetContextMode ───────────────────────────────────────────────────

  handleSetContextMode(session: ActiveSession, mode: "200k" | "1m"): void {
    if (mode === "1m" && !modelSupports1M(session.state.model)) {
      log.warn("1M context not supported for model", {
        sessionId: session.id,
        model: session.state.model,
      });
      return;
    }

    session.state = { ...session.state, context_mode: mode };
    log.info("Context mode updated", { sessionId: session.state.session_id, mode });

    // Re-apply model via control_request so CLI picks up [1m] suffix
    const cliModel = applyContextSuffix(session.state.model, mode);
    const sdkHandle = this.bridge.getSdkHandle(session.id);
    if (sdkHandle) {
      const extendedHandle = sdkHandle as unknown as {
        query?: { setModel?: (m: string) => Promise<void> };
      };
      extendedHandle.query?.setModel?.(cliModel).catch((err: unknown) => {
        log.warn("SDK setModel failed (context mode change)", {
          sessionId: session.id,
          error: String(err),
        });
      });
    } else {
      const ndjson = JSON.stringify({
        type: "control_request",
        request: { subtype: "set_model", model: cliModel },
      });
      this.bridge.sendToCLI(session, ndjson);
    }

    this.bridge.broadcastToAll(session, {
      type: "session_update",
      session: { context_mode: mode },
    });
  }

  // ── handleUserMessage ──────────────────────────────────────────────────────

  handleUserMessage(session: ActiveSession, content: string, source?: string): void {
    // ── Budget gate: block message if budget is exceeded ─────────────────
    const { cost_budget_usd, total_cost_usd } = session.state;
    if (cost_budget_usd && cost_budget_usd > 0 && total_cost_usd >= cost_budget_usd) {
      this.bridge.broadcastToAll(session, {
        type: "budget_exceeded",
        budget: cost_budget_usd,
        spent: total_cost_usd,
      } as BrowserIncomingMessage);
      log.warn("Message blocked — budget exceeded", {
        sessionId: session.id,
        budget: cost_budget_usd,
        spent: total_cost_usd,
      });
      return;
    }

    // ── WebIntel: /docs command — fetch web docs and inject into message ──
    const docsMatch = content.match(/^\/docs\s+(https?:\/\/\S+)(\s+--refresh)?/i);
    if (docsMatch) {
      const url = docsMatch[1]!;
      const refresh = !!docsMatch[2];
      this.handleDocsCommand(session, content, url, refresh, source);
      return;
    }

    // ── WebIntel: /research command — multi-page web research ──
    const researchMatch = content.match(/^\/research\s+(.+)/i);
    if (researchMatch) {
      const query = researchMatch[1]!.trim();
      this.handleResearchCommand(session, query, source);
      return;
    }

    // ── WebIntel: /crawl command — site crawl ──
    const crawlMatch = content.match(
      /^\/crawl\s+(https?:\/\/\S+)(?:\s+--depth\s+(\d+))?(?:\s+--max\s+(\d+))?/i,
    );
    if (crawlMatch) {
      const url = crawlMatch[1]!;
      const depth = Math.min(crawlMatch[2] ? parseInt(crawlMatch[2], 10) : 2, 5);
      const maxPages = Math.min(crawlMatch[3] ? parseInt(crawlMatch[3], 10) : 50, 200);
      this.handleCrawlCommand(session, url, depth, maxPages, source);
      return;
    }

    // ── Multi-Brain: /spawn command — spawn a child agent ──
    const spawnMatch = content.match(
      /^\/spawn\s+"([^"]+)"(?:\s+--role\s+(specialist|researcher|reviewer))?(?:\s+--model\s+(\S+))?(?:\s+--prompt\s+"([^"]*)")?/i,
    );
    if (spawnMatch) {
      this.handleSpawnCommand(session, spawnMatch);
      return;
    }

    // ── Multi-Brain: /status command — show agent statuses ──
    if (content.trim() === "/status") {
      this.handleStatusCommand(session);
      return;
    }

    // Delegate to shared internal handler
    this.handleUserMessageInternal(session, content, source);
  }

  // ── handleUserMessageInternal ──────────────────────────────────────────────

  handleUserMessageInternal(session: ActiveSession, content: string, source?: string): void {
    // Reset idle timer whenever user sends a message
    this.bridge.clearIdleTimer(session.id);

    // ── PromptScanner: scan for risky patterns before recording/forwarding ──
    if (isScanEnabled()) {
      const scanResult = scanPrompt(content);
      if (scanResult.risks.length > 0) {
        this.bridge.broadcastToAll(session, {
          type: "prompt_scan" as const,
          risks: scanResult.risks.map((r) => ({
            category: r.category,
            severity: r.severity,
            description: r.description,
            matched: r.matched,
          })),
          blocked: !scanResult.safe,
        });
        if (!scanResult.safe) {
          log.warn("Prompt blocked by scanner", {
            sessionId: session.id,
            categories: [...new Set(scanResult.risks.map((r) => r.category))],
            maxSeverity: scanResult.maxSeverity,
          });
          return;
        }
      }
    }

    // Record in history
    const historyMsg: BrowserIncomingMessage = {
      type: "user_message",
      content,
      timestamp: Date.now(),
      source: source ?? "web",
    };
    pushMessageHistory(session, historyMsg);

    // Broadcast to browsers
    this.bridge.broadcastToAll(session, historyMsg);

    // Store in DB
    storeMessage({
      id: randomUUID(),
      sessionId: session.id,
      role: "user",
      content,
      source: (source ?? "web") as "telegram" | "web" | "api" | "agent" | "system",
    });

    // Auto-generate session name from first user message
    if (!session.state.name && !session.nameGenerated) {
      session.nameGenerated = true;
      void generateSessionName(content).then((name) => {
        session.state = { ...session.state, name };
        persistSession(session);
        this.bridge.broadcastToSubscribers(session, {
          type: "session_update",
          session: { name },
        });
      });
    }

    // Route @mentions to target sessions
    if (session.state.short_id && source !== "mention" && source !== "debate") {
      handleMentions(content, session.id, session.state.short_id, (targetId, msg) =>
        this.bridge.sendUserMessage(targetId, msg, "mention"),
      );
    }

    // ── Smart Orchestration: classify and emit dispatch suggestion (async, non-blocking) ──
    if (source !== "mention" && source !== "debate" && source !== "dispatch") {
      const sessionRecord = this.bridge.getSessionRecord(session.id);
      const dispatchCtx: DispatchContext = {
        originSessionId: session.id,
        originShortId: session.state.short_id ?? "",
        projectSlug: sessionRecord?.projectSlug ?? undefined,
        cwd: session.state.cwd,
        sendToSession: (sid, msg) => this.bridge.sendUserMessage(sid, msg, "dispatch"),
      };
      void tryAutoDispatch(content, dispatchCtx).catch((err) => {
        log.debug("Auto-dispatch classify failed (non-fatal)", { error: String(err) });
      });
    }

    // ── CodeGraph: prepend pending hint from plan-review or break-check ──
    let cgContent = content;
    if (session.pendingCodeGraphHint) {
      cgContent = `${session.pendingCodeGraphHint}\n\n${cgContent}`;
      session.pendingCodeGraphHint = undefined;
    }

    // ── CodeGraph: inject relevant code context (sync, <200ms, respects config) ──
    const record = getSessionRecord(session.id);
    const cgSlug = record?.projectSlug;
    const cgMsgConfig = cgSlug ? getCodeGraphConfig(cgSlug) : null;
    if (
      cgSlug &&
      isGraphReady(cgSlug) &&
      cgMsgConfig?.injectionEnabled &&
      cgMsgConfig.messageContextEnabled
    ) {
      try {
        const classification = classifyByRules(content);
        const ctx = buildMessageContext(cgSlug, content, classification);
        if (ctx) {
          cgContent = `${cgContent}${ctx}`;
          this.bridge.emitContextInjection(
            session,
            "message_context",
            `Code context for message`,
            ctx.length,
          );
        }
      } catch {
        /* skip */
      }
    }

    // ── CodeGraph: activity feed injection (agent self-awareness) ──
    if (cgSlug && cgMsgConfig?.injectionEnabled && cgMsgConfig.activityFeedEnabled) {
      try {
        const contextPercent =
          session.state.total_input_tokens && session.state.total_output_tokens
            ? 0 // We don't have exact context %, use 0 to let buildActivityContext decide
            : 0;
        const activityCtx = buildActivityContext(
          session.id,
          cgSlug,
          session.state.num_turns,
          contextPercent,
        );
        if (activityCtx) {
          cgContent = `${cgContent}${activityCtx}`;
          this.bridge.emitContextInjection(
            session,
            "activity_feed",
            `Activity feed: agent footprint`,
            activityCtx.length,
          );
        }
      } catch {
        /* skip */
      }
    }

    // ── WebIntel: auto-inject library docs (async, best-effort, respects config) ────────
    // Try to enrich with docs before sending to CLI/SDK (timeout 3s)
    const webDocsDisabled =
      cgMsgConfig && (!cgMsgConfig.injectionEnabled || !cgMsgConfig.webDocsEnabled);
    const lockOwner = `${source ?? "web"}-${Date.now()}`;

    const sendWithLock = async (finalContent: string) => {
      if (
        !getSessionRecord(session.id) &&
        !session.cliSend &&
        !this.bridge.getSdkHandle(session.id)
      ) {
        // Session gone — skip silently
        return;
      }
      try {
        await terminalLock.acquire(session.id, lockOwner);
      } catch (err) {
        log.warn("Lock acquire timeout — sending without lock", {
          sessionId: session.id,
          err: String(err),
        });
      }
      try {
        this.sendToEngine(session, finalContent);
      } finally {
        terminalLock.release(session.id, lockOwner);
        this.bridge.broadcastLockStatus(session);
      }
    };

    if (webDocsDisabled) {
      void sendWithLock(cgContent);
    } else {
      void this.maybeEnrichWithDocs(session, cgContent)
        .then((enrichedContent) => sendWithLock(enrichedContent))
        .catch(() => sendWithLock(cgContent));
    }

    this.bridge.updateStatus(session, "busy");
  }

  // ── handleDocsCommand ──────────────────────────────────────────────────────

  private handleDocsCommand(
    session: ActiveSession,
    originalContent: string,
    url: string,
    refresh: boolean,
    source?: string,
  ): void {
    handleDocsCmd(this.webIntelBridge, session, originalContent, url, refresh, source);
  }

  // ── handleResearchCommand ──────────────────────────────────────────────────

  private handleResearchCommand(session: ActiveSession, query: string, source?: string): void {
    handleResearchCmd(this.webIntelBridge, session, query, source);
  }

  // ── handleCrawlCommand ─────────────────────────────────────────────────────

  private handleCrawlCommand(
    session: ActiveSession,
    url: string,
    depth: number,
    maxPages: number,
    source?: string,
  ): void {
    handleCrawlCmd(this.webIntelBridge, session, url, depth, maxPages, source);
  }

  // ── maybeEnrichWithDocs ────────────────────────────────────────────────────

  async maybeEnrichWithDocs(session: ActiveSession, content: string): Promise<string> {
    return enrichWithDocs(this.webIntelBridge, session, content);
  }

  // ── sendToEngine ───────────────────────────────────────────────────────────

  sendToEngine(session: ActiveSession, content: string): void {
    // SDK engine path
    const existingSdkHandle = this.bridge.getSdkHandle(session.id);
    if (existingSdkHandle || USE_SDK_ENGINE) {
      if (existingSdkHandle?.isRunning()) {
        existingSdkHandle.abort();
      }

      if (session.cliSessionId) {
        this.bridge.startSessionWithSdk(session.id, session, {
          cwd: session.state.cwd || ".",
          model: session.state.model || "claude-sonnet-4-6",
          permissionMode: session.state.permissionMode,
          prompt: content,
          resume: true,
          cliSessionId: session.cliSessionId,
        });
      } else {
        this.bridge.startSessionWithSdk(session.id, session, {
          cwd: session.state.cwd || ".",
          model: session.state.model || "claude-sonnet-4-6",
          permissionMode: session.state.permissionMode,
          prompt: content,
        });
      }
      return;
    }

    // CLI engine path
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content },
    });
    this.bridge.sendToCLI(session, ndjson);
  }

  // ── sendMultimodalMessage ───────────────────────────────────────────────────

  /**
   * Send a multimodal message (text + images) directly to CLI.
   * Bypasses enrichment pipeline — images don't need CodeGraph/WebIntel.
   */
  sendMultimodalMessage(
    session: ActiveSession,
    contentBlocks: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    >,
    source?: string,
  ): void {
    // Record text parts in history
    const textParts = contentBlocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text);
    const historyMsg: BrowserIncomingMessage = {
      type: "user_message",
      content: textParts.join("\n") || "[image]",
      timestamp: Date.now(),
      source: source ?? "web",
    };
    pushMessageHistory(session, historyMsg);
    this.bridge.broadcastToAll(session, historyMsg);

    // Store text representation in DB
    storeMessage({
      id: randomUUID(),
      sessionId: session.id,
      role: "user",
      content: textParts.join("\n") || "[image]",
      source: (source ?? "web") as "telegram" | "web" | "api" | "agent" | "system",
    });

    // SDK engine: doesn't support content blocks — save image to temp file + send path
    const existingSdkHandle = this.bridge.getSdkHandle(session.id);
    if (existingSdkHandle || USE_SDK_ENGINE) {
      void this.sendMultimodalViaTempFile(session, contentBlocks, textParts);
      return;
    }

    // CLI engine: send multimodal content blocks directly (Claude API format)
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content: contentBlocks },
    });
    this.bridge.sendToCLI(session, ndjson);
    this.bridge.updateStatus(session, "busy");
  }

  // ── sendMultimodalViaTempFile ──────────────────────────────────────────────

  private async sendMultimodalViaTempFile(
    session: ActiveSession,
    contentBlocks: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    >,
    textParts: string[],
  ): Promise<void> {
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const { writeFile, mkdir } = await import("fs/promises");

    const tempDir = join(tmpdir(), "companion-uploads");
    await mkdir(tempDir, { recursive: true });

    const filePaths: string[] = [];
    for (const block of contentBlocks) {
      if (block.type === "image") {
        const ext = block.source.media_type.split("/")[1] ?? "jpg";
        const filename = `${Date.now()}-photo.${ext}`;
        const savePath = join(tempDir, filename);
        await writeFile(savePath, Buffer.from(block.source.data, "base64"));
        filePaths.push(savePath);
      }
    }

    const caption = textParts.join("\n") || "What do you see in this image?";
    const fileList = filePaths.map((p) => `Image saved at: ${p}`).join("\n");
    const prompt = `${caption}\n\n${fileList}\n\nPlease read the image file(s) to see their contents.`;

    this.sendToEngine(session, prompt);
  }

  // ── handlePermissionResponse ───────────────────────────────────────────────

  handlePermissionResponse(
    session: ActiveSession,
    msg: {
      request_id: string;
      behavior: "allow" | "deny";
      updated_permissions?: unknown[];
    },
  ): void {
    _handlePermissionResponse(this.bridge.permBridge, session, msg);
  }

  // ── handleInterrupt ────────────────────────────────────────────────────────

  handleInterrupt(session: ActiveSession): void {
    _handleInterrupt(this.bridge.permBridge, session);
  }

  // ── handleSetModel ─────────────────────────────────────────────────────────

  private static readonly MODEL_MAP: Record<string, string> = {
    sonnet: "claude-sonnet-4-6",
    opus: "claude-opus-4-7",
    haiku: "claude-haiku-4-5",
  };

  handleSetModel(session: ActiveSession, model: string): void {
    const cliModel = UserMessageHandler.MODEL_MAP[model] ?? model;

    // SDK path: use typed setModel() API
    const sdkHandle = this.bridge.getSdkHandle(session.id);
    if (sdkHandle) {
      // SDK handle has a query.setModel() — access via cast since bridge only exposes limited API
      const extendedHandle = sdkHandle as unknown as {
        query?: { setModel?: (m: string) => Promise<void> };
      };
      extendedHandle.query?.setModel?.(cliModel).catch((err: unknown) => {
        log.warn("SDK setModel failed", { sessionId: session.id, error: String(err) });
      });
    } else {
      // CLI path: send NDJSON to stdin
      const ndjson = JSON.stringify({
        type: "control_request",
        request: { subtype: "set_model", model: cliModel },
      });
      this.bridge.sendToCLI(session, ndjson);
    }

    // Auto-downgrade thinking mode if new model doesn't support deep thinking
    const thinkingMode = session.state.thinking_mode;
    const needsDowngrade = thinkingMode === "deep" && !modelSupportsDeepThinking(cliModel);

    session.state = {
      ...session.state,
      model: cliModel,
      ...(needsDowngrade ? { thinking_mode: "adaptive" as const } : {}),
    };

    this.bridge.broadcastToAll(session, {
      type: "session_update",
      session: {
        model: cliModel,
        ...(needsDowngrade ? { thinking_mode: "adaptive" } : {}),
      },
    });

    if (needsDowngrade) {
      log.info("Auto-downgraded thinking mode from deep to adaptive", {
        sessionId: session.id,
        model: cliModel,
      });
    }
  }

  // ── handleSpawnCommand ─────────────────────────────────────────────────────

  private async handleSpawnCommand(session: ActiveSession, match: RegExpMatchArray): Promise<void> {
    return _handleSpawnCommand(this.bridge.multiBrainBridge, session, match);
  }

  // ── handleStatusCommand ────────────────────────────────────────────────────

  private handleStatusCommand(session: ActiveSession): void {
    _handleStatusCommand(this.bridge.multiBrainBridge, session);
  }

  // ── webIntelBridge getter ──────────────────────────────────────────────────

  private get webIntelBridge(): WebIntelBridge {
    return {
      broadcastToAll: this.bridge.broadcastToAll.bind(this.bridge),
      handleUserMessageInternal: this.handleUserMessageInternal.bind(this),
      emitContextInjection: this.bridge.emitContextInjection.bind(this.bridge),
    };
  }
}
