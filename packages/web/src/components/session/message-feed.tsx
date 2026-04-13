"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  User,
  Robot,
  Wrench,
  Brain,
  CaretDown,
  CaretRight,
  CurrencyDollar,
  PaperPlaneTilt,
  Lightning,
  PushPin,
  TelegramLogo,
} from "@phosphor-icons/react";
import { MarkdownMessage } from "../chat/markdown-message";
import { useComposerStore } from "@/lib/stores/composer-store";
import { usePinnedMessagesStore } from "@/lib/stores/pinned-messages-store";
import { getToolMeta, ToolInputRenderer, ToolOutputRenderer } from "./tool-renderers";
import { DiffSummaryBlock } from "./diff-summary-block";

// ── Types ────────────────────────────────────────────────────────────────────

interface ToolBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

interface ThinkingBlock {
  text: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  thinkingBlocks?: ThinkingBlock[];
  toolUseBlocks?: ToolBlock[];
  toolResultBlocks?: ToolResultBlock[];
  costUsd?: number;
  source?: string;
}

interface MessageFeedProps {
  messages: Message[];
  isStreaming?: boolean;
  sessionId?: string;
  onScrollToRef?: (scrollFn: (index: number) => void) => void;
}

// ── Thinking Block (collapsible) ─────────────────────────────────────────────

function ThinkingSection({ blocks }: { blocks: ThinkingBlock[] }) {
  const [expanded, setExpanded] = useState(false);
  const text = blocks.map((b) => b.text).join("\n");
  if (!text.trim()) return null;

  const firstLine =
    text
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  const summary = firstLine.length > 100 ? firstLine.slice(0, 100) + "..." : firstLine;

  return (
    <div className="shadow-soft bg-bg-elevated my-2 overflow-hidden rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs"
        aria-expanded={expanded}
      >
        <Brain size={14} weight="bold" style={{ color: "#a855f7" }} />
        <span className="font-medium">Thinking</span>
        <span className="text-xs opacity-40">
          ({blocks.length} block{blocks.length > 1 ? "s" : ""})
        </span>
        {expanded ? (
          <CaretDown size={12} className="ml-auto" />
        ) : (
          <CaretRight size={12} className="ml-auto" />
        )}
        {!expanded && summary && (
          <span className="ml-1 truncate font-normal opacity-50" style={{ maxWidth: 350 }}>
            {summary}
          </span>
        )}
      </button>
      {expanded && (
        <div
          className="max-h-[500px] overflow-y-auto px-3 pb-3 text-sm leading-relaxed"
          style={{
            boxShadow: "0 -1px 0 var(--color-border)",
            paddingTop: 8,
          }}
        >
          <MarkdownMessage content={text} />
        </div>
      )}
    </div>
  );
}

// ── Tool Use Block ───────────────────────────────────────────────────────────

function ToolUseSection({ tools, results }: { tools: ToolBlock[]; results?: ToolResultBlock[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const addAttachment = useComposerStore((s) => s.addAttachment);
  const setQuickAction = useComposerStore((s) => s.setQuickAction);

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Separate file-change tools (Edit/Write) from other tools
  const fileChangeTools = tools.filter(
    (t) =>
      (t.name === "Edit" &&
        t.input.file_path &&
        t.input.old_string !== undefined &&
        t.input.new_string !== undefined) ||
      (t.name === "Write" &&
        (t.input.file_path || t.input.path) &&
        t.input.content !== undefined &&
        t.input.old_string === undefined),
  );
  const otherTools = tools.filter((t) => !fileChangeTools.includes(t));

  return (
    <div className="my-2 space-y-1.5">
      {/* Aggregated diff summary for Edit/Write tools */}
      {fileChangeTools.length > 0 && <DiffSummaryBlock tools={fileChangeTools} />}

      {otherTools.map((tool) => {
        const result = results?.find((r) => r.toolUseId === tool.id);
        const expanded = expandedIds.has(tool.id);
        const meta = getToolMeta(tool.name);
        const summary = meta.summary(tool.input);

        return (
          <div
            key={tool.id}
            className="bg-bg-elevated overflow-hidden rounded-lg"
            style={{
              border: `1px solid ${result?.isError ? "var(--color-danger, #ef4444)" : "var(--color-border)"}`,
            }}
          >
            <button
              onClick={() => toggle(tool.id)}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs"
              aria-expanded={expanded}
            >
              <span style={{ color: meta.color }} aria-hidden="true">
                {meta.icon}
              </span>
              <code className="font-mono font-semibold" style={{ color: meta.color }}>
                {tool.name}
              </code>
              {!expanded && summary && (
                <span
                  className="text-text-secondary ml-1 truncate font-mono opacity-60"
                  style={{ maxWidth: 400 }}
                >
                  {summary}
                </span>
              )}
              {result?.isError && (
                <span
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{ background: "#ef444420", color: "#ef4444" }}
                >
                  error
                </span>
              )}
              {expanded ? (
                <CaretDown size={12} className="ml-auto flex-shrink-0" />
              ) : (
                <CaretRight size={12} className="ml-auto flex-shrink-0" />
              )}
            </button>

            {expanded && (
              <div style={{ boxShadow: "0 -1px 0 var(--color-border)" }}>
                {/* Input */}
                <div className="px-3 py-2">
                  <ToolInputRenderer toolName={tool.name} input={tool.input} />
                </div>

                {/* Result */}
                {result && (
                  <div className="px-3 py-2" style={{ boxShadow: "0 -1px 0 var(--color-border)" }}>
                    <div className="mb-1 flex items-center justify-between">
                      <div
                        className="text-xs font-semibold"
                        style={{ color: result.isError ? "#ef4444" : "var(--color-text-muted)" }}
                      >
                        {result.isError ? "Error" : "Output"}
                      </div>
                      <div className="flex items-center gap-1">
                        {result.isError ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addAttachment({
                                kind: "error",
                                label: `${tool.name} error`,
                                content: result.content,
                                meta: { toolName: tool.name },
                              });
                              setQuickAction("fix");
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:brightness-125"
                            style={{ background: "#ef444415", color: "#ef4444" }}
                            title="Send error to AI to fix"
                          >
                            <Lightning size={10} weight="bold" />
                            Fix this
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addAttachment({
                                kind: "tool_output",
                                label: `${tool.name} output`,
                                content: result.content,
                                meta: { toolName: tool.name },
                              });
                            }}
                            className="cursor-pointer rounded p-0.5 transition-colors hover:brightness-125"
                            title="Send to AI"
                            aria-label="Send output to AI"
                          >
                            <PaperPlaneTilt size={11} weight="bold" />
                          </button>
                        )}
                      </div>
                    </div>
                    <ToolOutputRenderer
                      toolName={tool.name}
                      content={result.content}
                      isError={result.isError}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tool Input/Output — see tool-renderers.tsx ──────────────────────────────

// ── Cost Badge ───────────────────────────────────────────────────────────────

function CostBadge({ costUsd }: { costUsd: number }) {
  if (costUsd <= 0) return null;
  return (
    <span className="text-text-muted bg-bg-elevated ml-2 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-xs">
      <CurrencyDollar size={10} />
      {costUsd.toFixed(4)}
    </span>
  );
}

// ── Pin Button ────────────────────────────────────────────────────────────────

function PinButton({
  sessionId,
  messageIndex,
  visible,
}: {
  sessionId: string;
  messageIndex: number;
  visible: boolean;
}) {
  const isPinned = usePinnedMessagesStore((s) => s.isPinned(sessionId, messageIndex));
  const togglePin = usePinnedMessagesStore((s) => s.togglePin);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        togglePin(sessionId, messageIndex);
      }}
      className="cursor-pointer rounded p-1 transition-all"
      style={{
        color: isPinned ? "#FBBC04" : "var(--color-text-muted)",
        background: isPinned ? "#FBBC0420" : "transparent",
        opacity: isPinned || visible ? 1 : 0,
        pointerEvents: isPinned || visible ? "auto" : "none",
      }}
      aria-label={isPinned ? "Unpin message" : "Pin message"}
      title={isPinned ? "Unpin message" : "Pin message"}
    >
      <PushPin size={13} weight={isPinned ? "fill" : "bold"} />
    </button>
  );
}

// ── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  if (source === "telegram") {
    return (
      <span
        className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
        style={{ background: "#29B6F615", color: "#29B6F6" }}
      >
        <TelegramLogo size={10} weight="fill" aria-hidden="true" />
        via Telegram
      </span>
    );
  }
  if (source === "api") {
    return (
      <span
        className="text-text-muted ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
        style={{ background: "var(--color-bg-elevated)" }}
      >
        via API
      </span>
    );
  }
  if (source === "mention") {
    return (
      <span
        className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
        style={{ background: "#a855f715", color: "#a855f7" }}
      >
        @mention
      </span>
    );
  }
  // Fallback for unknown sources (debate, agent, etc.)
  return (
    <span
      className="text-text-muted ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
      style={{ background: "var(--color-bg-elevated)" }}
    >
      via {source}
    </span>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-function
const NOOP_REF = () => {};

const MessageBubble = React.memo(
  function MessageBubble({
    msg,
    index,
    sessionId,
    msgRef,
  }: {
    msg: Message;
    index: number;
    sessionId: string;
    msgRef: (el: HTMLDivElement | null) => void;
  }) {
    const [hovered, setHovered] = useState(false);
    const isUser = msg.role === "user";
    const isTool = msg.role === "tool";
    const isSystem = msg.role === "system";
    const isPinned = usePinnedMessagesStore((s) => s.isPinned(sessionId, index));

    if (isSystem) {
      return (
        <div className="flex justify-center py-2" ref={msgRef}>
          <span
            className="text-text-muted bg-bg-elevated rounded-lg px-3 py-1.5 text-center text-xs"
            style={{
              maxWidth: "80%",
              lineHeight: 1.5,
            }}
          >
            {msg.content}
          </span>
        </div>
      );
    }

    if (isTool) {
      return (
        <div
          ref={msgRef}
          className="bg-bg-elevated mx-4 my-1.5 flex gap-2 rounded-xl p-3 shadow-sm"
        >
          <Wrench
            size={14}
            weight="bold"
            className="shrink-0"
            style={{ color: "#4285F4", marginTop: 2 }}
          />
          <pre className="m-0 whitespace-pre-wrap font-mono text-xs">{msg.content}</pre>
        </div>
      );
    }

    return (
      <div
        ref={msgRef}
        className={`flex gap-3 px-4 py-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
        style={
          isPinned
            ? { background: "rgba(251, 188, 4, 0.06)", borderRadius: "var(--radius-2xl)" }
            : undefined
        }
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Avatar */}
        <div
          className="flex flex-shrink-0 items-center justify-center rounded-full"
          style={{
            width: 28,
            height: 28,
            background: isUser ? "#4285F420" : "#34A85320",
            color: isUser ? "#4285F4" : "#34A853",
            marginTop: 2,
          }}
        >
          {isUser ? <User size={14} weight="bold" /> : <Robot size={14} weight="bold" />}
        </div>

        {/* Bubble */}
        <div
          className={`flex-1 ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}
          style={{ maxWidth: "78%" }}
        >
          {/* Thinking blocks (before text) */}
          {!isUser && msg.thinkingBlocks && msg.thinkingBlocks.length > 0 && (
            <ThinkingSection blocks={msg.thinkingBlocks} />
          )}

          {/* Main content bubble */}
          {msg.content && (
            <div
              className="rounded-2xl px-3 py-2.5 text-sm leading-relaxed"
              style={{
                background: isUser ? "#4285F4" : "var(--color-bg-card)",
                color: isUser ? "#fff" : "var(--color-text-primary)",
                border: isUser ? "none" : "1px solid var(--color-border)",
                borderBottomRightRadius: isUser ? 6 : 16,
                borderBottomLeftRadius: isUser ? 16 : 6,
                wordBreak: "break-word",
              }}
            >
              {isUser ? msg.content : <MarkdownMessage content={msg.content} />}
              {msg.isStreaming && (
                <span
                  className="inline-block"
                  style={{
                    width: 8,
                    height: 14,
                    background: "currentColor",
                    opacity: 0.7,
                    marginLeft: 2,
                    verticalAlign: "text-bottom",
                    animation: "blink 1s step-end infinite",
                  }}
                />
              )}
            </div>
          )}

          {/* Tool use blocks (after text) */}
          {!isUser && msg.toolUseBlocks && msg.toolUseBlocks.length > 0 && (
            <ToolUseSection tools={msg.toolUseBlocks} results={msg.toolResultBlocks} />
          )}

          {/* Timestamp + source badge + cost + pin */}
          <div className="flex items-center gap-1">
            <span className="text-xs">
              {new Date(msg.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {msg.source && msg.source !== "web" && <SourceBadge source={msg.source} />}
            {msg.costUsd !== undefined && msg.costUsd > 0 && <CostBadge costUsd={msg.costUsd} />}
            {/* Pin button — shows on hover or when already pinned */}
            <PinButton sessionId={sessionId} messageIndex={index} visible={hovered} />
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.msg.id === next.msg.id &&
      prev.msg.content === next.msg.content &&
      prev.msg.isStreaming === next.msg.isStreaming &&
      prev.msg.thinkingBlocks?.length === next.msg.thinkingBlocks?.length &&
      prev.msg.toolUseBlocks?.length === next.msg.toolUseBlocks?.length &&
      prev.msg.toolResultBlocks?.length === next.msg.toolResultBlocks?.length &&
      prev.msg.costUsd === next.msg.costUsd &&
      prev.index === next.index &&
      prev.sessionId === next.sessionId
    );
  },
);

// ── Virtualization threshold ─────────────────────────────────────────────────

const VIRTUALIZE_THRESHOLD = 20;

// ── Message Feed ─────────────────────────────────────────────────────────────

export function MessageFeed({ messages, sessionId = "", onScrollToRef }: MessageFeedProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  const shouldVirtualize = messages.length >= VIRTUALIZE_THRESHOLD;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevCountRef.current && messages.length > 0) {
      if (shouldVirtualize) {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "smooth" });
      } else {
        // For small lists, simple scroll
        requestAnimationFrame(() => {
          const el = parentRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    }
    prevCountRef.current = messages.length;
  }, [messages.length, shouldVirtualize, virtualizer]);

  // scrollToMessage for pinned message navigation
  const scrollToMessage = useCallback(
    (index: number) => {
      if (shouldVirtualize) {
        virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
      } else {
        const el = parentRef.current?.querySelector(`[data-msg-index="${index}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [shouldVirtualize, virtualizer],
  );

  useEffect(() => {
    onScrollToRef?.(scrollToMessage);
  }, [onScrollToRef, scrollToMessage]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Robot size={36} />
        <p className="text-sm">Send a message to start the session</p>
      </div>
    );
  }

  // Small list — render directly (no virtualization overhead)
  if (!shouldVirtualize) {
    return (
      <div ref={parentRef} className="flex flex-1 flex-col overflow-y-auto py-4">
        {messages.map((msg, index) => (
          <div key={msg.id} data-msg-index={index}>
            <MessageBubble msg={msg} index={index} sessionId={sessionId} msgRef={NOOP_REF} />
          </div>
        ))}
      </div>
    );
  }

  // Large list — virtualized rendering
  const items = virtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div
        className="relative"
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
        }}
      >
        <div
          className="absolute"
          style={{
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${items[0]?.start ?? 0}px)`,
          }}
        >
          {items.map((virtualRow) => {
            const msg = messages[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                data-msg-index={virtualRow.index}
                ref={virtualizer.measureElement}
              >
                <MessageBubble
                  msg={msg}
                  index={virtualRow.index}
                  sessionId={sessionId}
                  msgRef={NOOP_REF}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
