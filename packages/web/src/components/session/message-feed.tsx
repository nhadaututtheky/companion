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
  GitDiff,
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

  // Summary: first non-empty line, truncated
  const firstLine = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  const summary = firstLine.length > 100 ? firstLine.slice(0, 100) + "..." : firstLine;

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
        <span className="font-medium">Thinking</span>
        <span className="opacity-40 text-xs">({blocks.length} block{blocks.length > 1 ? "s" : ""})</span>
        {expanded ? <CaretDown size={12} className="ml-auto" /> : <CaretRight size={12} className="ml-auto" />}
        {!expanded && summary && (
          <span className="truncate opacity-50 ml-1 font-normal" style={{ maxWidth: 350 }}>
            {summary}
          </span>
        )}
      </button>
      {expanded && (
        <div
          className="px-3 pb-3 text-sm leading-relaxed max-h-[500px] overflow-y-auto"
          style={{
            borderTop: "1px solid var(--color-border)",
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

// ── Unified Diff Viewer ─────────────────────────────────────────────────────

/** Compute a simple unified diff between old and new strings */
function computeDiff(oldStr: string, newStr: string): Array<{ type: "ctx" | "del" | "add"; line: string; oldNum?: number; newNum?: number }> {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const result: Array<{ type: "ctx" | "del" | "add"; line: string; oldNum?: number; newNum?: number }> = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = oldLines[i - 1] === newLines[j - 1]
        ? (dp[i - 1]?.[j - 1] ?? 0) + 1
        : Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
    }
  }

  // Backtrack to build diff
  const diff: Array<{ type: "ctx" | "del" | "add"; line: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: "ctx", line: oldLines[i - 1]! });
      i--; j--;
    } else if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
      diff.unshift({ type: "add", line: newLines[j - 1]! });
      j--;
    } else {
      diff.unshift({ type: "del", line: oldLines[i - 1]! });
      i--;
    }
  }

  // Add line numbers
  let oldNum = 1, newNum = 1;
  for (const entry of diff) {
    if (entry.type === "ctx") {
      result.push({ ...entry, oldNum, newNum });
      oldNum++; newNum++;
    } else if (entry.type === "del") {
      result.push({ ...entry, oldNum });
      oldNum++;
    } else {
      result.push({ ...entry, newNum });
      newNum++;
    }
  }

  return result;
}

function UnifiedDiffView({ oldStr, newStr, filePath }: { oldStr: string; newStr: string; filePath: string }) {
  const diff = computeDiff(oldStr, newStr);
  const additions = diff.filter((d) => d.type === "add").length;
  const deletions = diff.filter((d) => d.type === "del").length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <GitDiff size={12} weight="bold" style={{ color: "#4285F4" }} />
        <code className="text-xs font-mono" style={{ color: "#4285F4" }}>{filePath}</code>
        {additions > 0 && <span className="text-xs font-mono font-semibold" style={{ color: "#34A853" }}>+{additions}</span>}
        {deletions > 0 && <span className="text-xs font-mono font-semibold" style={{ color: "#ef4444" }}>-{deletions}</span>}
      </div>
      <div
        className="rounded-md overflow-hidden max-h-[400px] overflow-y-auto"
        style={{ border: "1px solid var(--color-border)" }}
      >
        {diff.map((entry, idx) => {
          const bg = entry.type === "add" ? "#34A85312" : entry.type === "del" ? "#ef444412" : "transparent";
          const borderLeft = entry.type === "add" ? "3px solid #34A853" : entry.type === "del" ? "3px solid #ef4444" : "3px solid transparent";
          const prefix = entry.type === "add" ? "+" : entry.type === "del" ? "-" : " ";
          const lineColor = entry.type === "add" ? "#34A853" : entry.type === "del" ? "#ef4444" : "var(--color-text-muted)";

          return (
            <div
              key={idx}
              className="flex font-mono text-xs leading-5"
              style={{ background: bg, borderLeft }}
            >
              <span
                className="select-none text-right px-1.5 flex-shrink-0"
                style={{ width: 36, color: "var(--color-text-muted)", opacity: 0.5 }}
              >
                {entry.type !== "add" ? entry.oldNum : ""}
              </span>
              <span
                className="select-none text-right px-1.5 flex-shrink-0"
                style={{ width: 36, color: "var(--color-text-muted)", opacity: 0.5 }}
              >
                {entry.type !== "del" ? entry.newNum : ""}
              </span>
              <span className="select-none flex-shrink-0 px-1" style={{ color: lineColor, fontWeight: 600 }}>
                {prefix}
              </span>
              <span className="whitespace-pre-wrap break-all pr-2" style={{ color: "var(--color-text-secondary)" }}>
                {entry.line}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Render tool input — special cases for common tools */
function ToolInput({ input }: { input: Record<string, unknown> }) {
  // Edit tool — unified diff view
  if (input.file_path && input.old_string !== undefined && input.new_string !== undefined) {
    return (
      <UnifiedDiffView
        filePath={String(input.file_path)}
        oldStr={String(input.old_string)}
        newStr={String(input.new_string)}
      />
    );
  }

  // Write tool — show file path + content preview
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
