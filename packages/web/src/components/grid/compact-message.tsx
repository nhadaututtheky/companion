"use client";
import { useState } from "react";
import { Wrench, Brain, CaretRight, CaretDown } from "@phosphor-icons/react";
import { MarkdownMessage } from "../chat/markdown-message";

interface ThinkingBlock {
  text: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  thinkingBlocks?: ThinkingBlock[];
}

function CompactThinking({ blocks }: { blocks: ThinkingBlock[] }) {
  const [expanded, setExpanded] = useState(false);
  const text = blocks.map((b) => b.text).join("\n");
  if (!text.trim()) return null;

  const firstLine =
    text
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  const summary = firstLine.length > 80 ? firstLine.slice(0, 80) + "..." : firstLine;

  return (
    <div className="shadow-soft bg-bg-elevated mx-3 my-1 overflow-hidden rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5"
        style={{ fontSize: 12 }}
        aria-expanded={expanded}
      >
        <Brain size={12} weight="bold" style={{ color: "#a855f7" }} />
        <span className="text-text-secondary font-medium">Thinking</span>
        {expanded ? (
          <CaretDown size={10} className="text-text-muted" />
        ) : (
          <>
            <CaretRight size={10} className="text-text-muted" />
            {summary && (
              <span className="text-text-muted truncate" style={{ maxWidth: 200 }}>
                {summary}
              </span>
            )}
          </>
        )}
      </button>
      {expanded && (
        <div
          className="max-h-[300px] overflow-y-auto px-2.5 pb-2 leading-relaxed"
          style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: 6,
            fontSize: 13,
          }}
        >
          <MarkdownMessage content={text} compact />
        </div>
      )}
    </div>
  );
}

function CompactBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span
          className="text-text-muted bg-bg-elevated rounded-lg px-3 py-1 text-center"
          style={{
            fontSize: 12,
            maxWidth: "85%",
            lineHeight: 1.4,
          }}
        >
          {msg.content}
        </span>
      </div>
    );
  }

  if (isTool) {
    return (
      <div className="bg-bg-elevated border-border mx-3 my-1 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5">
        <Wrench size={12} weight="bold" className="shrink-0" style={{ color: "#4285F4" }} />
        <span className="text-text-secondary truncate" style={{ fontSize: 13 }}>
          {msg.content.slice(0, 80)}
          {msg.content.length > 80 ? "…" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {/* Thinking blocks (assistant only) */}
      {!isUser && msg.thinkingBlocks && msg.thinkingBlocks.length > 0 && (
        <CompactThinking blocks={msg.thinkingBlocks} />
      )}
      <div className={`flex px-3 py-1 ${isUser ? "justify-end" : "justify-start"} w-full`}>
        <div
          className="rounded-2xl px-3 py-2 leading-relaxed"
          style={{
            background: isUser ? "#4285F4" : "var(--color-bg-card)",
            color: isUser ? "#fff" : "var(--color-text-primary)",
            border: isUser ? "none" : "1px solid var(--color-border)",
            fontSize: 14,
            maxWidth: "85%",
            wordBreak: "break-word",
            borderBottomRightRadius: isUser ? 4 : 16,
            borderBottomLeftRadius: isUser ? 16 : 4,
          }}
        >
          {isUser ? msg.content : <MarkdownMessage content={msg.content} compact />}
          {msg.isStreaming && (
            <span
              className="inline-block"
              style={{
                width: 6,
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
      </div>
    </div>
  );
}

interface CompactMessageFeedProps {
  messages: Message[];
  feedRef: React.RefObject<HTMLDivElement | null>;
}

export function CompactMessageFeed({ messages, feedRef }: CompactMessageFeedProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-text-muted" style={{ fontSize: 13 }}>
          Send a message to start
        </p>
      </div>
    );
  }

  return (
    <div ref={feedRef} className="flex flex-1 flex-col gap-1 overflow-y-auto py-2">
      {messages.map((msg) => (
        <CompactBubble key={msg.id} msg={msg} />
      ))}
    </div>
  );
}
