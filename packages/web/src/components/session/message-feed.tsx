"use client";
import { useEffect, useRef } from "react";
import {
  User,
  Robot,
  Gear,
  Wrench,
} from "@phosphor-icons/react";
import { MarkdownMessage } from "../chat/markdown-message";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface MessageFeedProps {
  messages: Message[];
  isStreaming?: boolean;
}

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

        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

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
