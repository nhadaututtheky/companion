"use client";
import { useEffect, useRef, useState } from "react";
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
} from "@phosphor-icons/react";
import { MarkdownMessage } from "../chat/markdown-message";
import { useComposerStore } from "@/lib/stores/composer-store";

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
}

interface MessageFeedProps {
  messages: Message[];
  isStreaming?: boolean;
}

// ── Thinking Block (collapsible) ─────────────────────────────────────────────

function ThinkingSection({ blocks }: { blocks: ThinkingBlock[] }) {
  const [expanded, setExpanded] = useState(false);
  const text = blocks.map((b) => b.text).join("\n");
  if (!text.trim()) return null;

  return (
    <div
      className="my-2 rounded-lg overflow-hidden"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs cursor-pointer"
        style={{ color: "var(--color-text-secondary)" }}
        aria-expanded={expanded}
      >
        <Brain size={14} weight="bold" style={{ color: "#a855f7" }} />
        <span className="font-medium">Thinking...</span>
        {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
        {!expanded && (
          <span className="truncate opacity-60 ml-1" style={{ maxWidth: 300 }}>
            {text.slice(0, 80)}...
          </span>
        )}
      </button>
      {expanded && (
        <div
          className="px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto"
          style={{
            color: "var(--color-text-secondary)",
            borderTop: "1px solid var(--color-border)",
            paddingTop: 8,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

// ── Tool Use Block ───────────────────────────────────────────────────────────

function ToolUseSection({
  tools,
  results,
}: {
  tools: ToolBlock[];
  results?: ToolResultBlock[];
}) {
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

  return (
    <div className="my-2 space-y-1.5">
      {tools.map((tool) => {
        const result = results?.find((r) => r.toolUseId === tool.id);
        const expanded = expandedIds.has(tool.id);
        const inputStr = JSON.stringify(tool.input, null, 2);
        const isShort = inputStr.length < 120;

        return (
          <div
            key={tool.id}
            className="rounded-lg overflow-hidden"
            style={{
              background: "var(--color-bg-elevated)",
              border: `1px solid ${result?.isError ? "var(--color-danger, #ef4444)" : "var(--color-border)"}`,
            }}
          >
            <button
              onClick={() => toggle(tool.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
              aria-expanded={expanded}
            >
              <Wrench size={14} weight="bold" style={{ color: "#4285F4" }} />
              <code className="font-mono font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {tool.name}
              </code>
              {isShort && !expanded && (
                <span className="truncate opacity-60 ml-1 font-mono" style={{ maxWidth: 300 }}>
                  {Object.entries(tool.input)
                    .slice(0, 2)
                    .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 40)}`)
                    .join(", ")}
                </span>
              )}
              {result?.isError && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#ef444420", color: "#ef4444" }}>
                  error
                </span>
              )}
              {expanded ? <CaretDown size={12} className="ml-auto" /> : <CaretRight size={12} className="ml-auto" />}
            </button>

            {expanded && (
              <div style={{ borderTop: "1px solid var(--color-border)" }}>
                {/* Input */}
                <div className="px-3 py-2">
                  <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>
                    Input
                  </div>
                  <ToolInput input={tool.input} />
                </div>

                {/* Result */}
                {result && (
                  <div className="px-3 py-2" style={{ borderTop: "1px solid var(--color-border)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold" style={{ color: result.isError ? "#ef4444" : "var(--color-text-muted)" }}>
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
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors hover:brightness-125"
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
                            className="p-0.5 rounded cursor-pointer transition-colors hover:brightness-125"
                            style={{ color: "var(--color-text-muted)" }}
                            title="Send to AI"
                            aria-label="Send output to AI"
                          >
                            <PaperPlaneTilt size={11} weight="bold" />
                          </button>
                        )}
                      </div>
                    </div>
                    <pre
                      className="text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto m-0"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {result.content.slice(0, 5000)}
                      {result.content.length > 5000 && "\n... (truncated)"}
                    </pre>
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

/** Render tool input — special cases for common tools */
function ToolInput({ input }: { input: Record<string, unknown> }) {
  // File write/edit — show file path prominently
  if (input.file_path || input.path) {
    const path = (input.file_path ?? input.path) as string;
    return (
      <div className="space-y-1">
        <code className="text-xs font-mono block" style={{ color: "#4285F4" }}>
          {path}
        </code>
        {input.command != null && (
          <pre className="text-xs font-mono whitespace-pre-wrap m-0" style={{ color: "var(--color-text-secondary)" }}>
            {String(input.command).slice(0, 2000)}
          </pre>
        )}
        {input.content != null && (
          <pre className="text-xs font-mono whitespace-pre-wrap m-0 max-h-[200px] overflow-y-auto" style={{ color: "var(--color-text-secondary)" }}>
            {String(input.content).slice(0, 2000)}
          </pre>
        )}
        {input.old_string !== undefined && (
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-xs mb-0.5" style={{ color: "#ef4444" }}>old</div>
              <pre className="text-xs font-mono whitespace-pre-wrap m-0 p-1 rounded" style={{ background: "#ef444410", color: "var(--color-text-secondary)" }}>
                {String(input.old_string).slice(0, 500)}
              </pre>
            </div>
            <div className="flex-1">
              <div className="text-xs mb-0.5" style={{ color: "#34A853" }}>new</div>
              <pre className="text-xs font-mono whitespace-pre-wrap m-0 p-1 rounded" style={{ background: "#34A85310", color: "var(--color-text-secondary)" }}>
                {String(input.new_string).slice(0, 500)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Bash command
  if (input.command) {
    return (
      <pre className="text-xs font-mono whitespace-pre-wrap m-0" style={{ color: "var(--color-text-secondary)" }}>
        $ {String(input.command).slice(0, 2000)}
      </pre>
    );
  }

  // Generic JSON
  const str = JSON.stringify(input, null, 2);
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap m-0 max-h-[200px] overflow-y-auto" style={{ color: "var(--color-text-secondary)" }}>
      {str.slice(0, 3000)}
    </pre>
  );
}

// ── Cost Badge ───────────────────────────────────────────────────────────────

function CostBadge({ costUsd }: { costUsd: number }) {
  if (costUsd <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-mono px-1.5 py-0.5 rounded ml-2"
      style={{
        background: "var(--color-bg-elevated)",
        color: "var(--color-text-muted)",
      }}
    >
      <CurrencyDollar size={10} />
      {costUsd.toFixed(4)}
    </span>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span
          className="text-xs px-3 py-1 rounded-full"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-muted)",
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
        className="flex gap-2 mx-4 my-1.5 p-3 rounded-xl"
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
        }}
      >
        <Wrench size={14} weight="bold" style={{ color: "#4285F4", flexShrink: 0, marginTop: 2 }} />
        <pre
          className="text-xs font-mono m-0 whitespace-pre-wrap"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {msg.content}
        </pre>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 px-4 py-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-full"
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
            className="px-3 py-2.5 rounded-2xl text-sm leading-relaxed"
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
                style={{
                  display: "inline-block",
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

        {/* Timestamp + cost */}
        <div className="flex items-center">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {new Date(msg.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {msg.costUsd !== undefined && msg.costUsd > 0 && <CostBadge costUsd={msg.costUsd} />}
        </div>
      </div>
    </div>
  );
}

// ── Message Feed ─────────────────────────────────────────────────────────────

export function MessageFeed({ messages }: MessageFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3">
        <Robot size={36} style={{ color: "var(--color-text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Send a message to start the session
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto py-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
