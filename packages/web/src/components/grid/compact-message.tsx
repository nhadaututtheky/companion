"use client";
import { Wrench } from "@phosphor-icons/react";
import { MarkdownMessage } from "../chat/markdown-message";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

function CompactBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span
          className="px-2.5 py-0.5 rounded-full"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-muted)",
            fontSize: 12,
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
        className="flex items-center gap-1.5 mx-3 my-1 px-2.5 py-1.5 rounded-lg"
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
        }}
      >
        <Wrench size={12} weight="bold" style={{ color: "#4285F4", flexShrink: 0 }} />
        <span className="truncate" style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          {msg.content.slice(0, 80)}
          {msg.content.length > 80 ? "…" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex px-3 py-1 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="px-3 py-2 rounded-2xl leading-relaxed"
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
            style={{
              display: "inline-block",
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
  );
}

interface CompactMessageFeedProps {
  messages: Message[];
  feedRef: React.RefObject<HTMLDivElement | null>;
}

export function CompactMessageFeed({ messages, feedRef }: CompactMessageFeedProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1">
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Send a message to start</p>
      </div>
    );
  }

  return (
    <div ref={feedRef} className="flex flex-col flex-1 overflow-y-auto py-2 gap-1">
      {messages.map((msg) => (
        <CompactBubble key={msg.id} msg={msg} />
      ))}
    </div>
  );
}
