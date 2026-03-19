"use client";
import { useState, useRef, type KeyboardEvent } from "react";
import { PaperPlaneTilt, Stop } from "@phosphor-icons/react";

interface MessageComposerProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageComposer({
  onSend,
  onStop,
  isRunning = false,
  disabled = false,
  placeholder = "Message Claude...",
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter (without shift) or Ctrl+Enter both send
    const isSendCombo =
      (e.key === "Enter" && !e.shiftKey) ||
      (e.key === "Enter" && e.ctrlKey);
    if (isSendCombo) {
      e.preventDefault();
      if (isRunning) return; // Don't send while Claude is responding
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div
      className="px-4 py-3"
      style={{ borderTop: "1px solid var(--color-border)" }}
    >
      <div
        className="flex items-end gap-2 rounded-2xl px-4 py-2.5"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed"
          style={{
            color: "var(--color-text-primary)",
            maxHeight: 200,
            minHeight: 22,
            fontFamily: "var(--font-body)",
          }}
        />

        {isRunning ? (
          <button
            onClick={onStop}
            className="flex-shrink-0 p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ background: "#EA433515", color: "#EA4335" }}
            aria-label="Stop"
          >
            <Stop size={16} weight="fill" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="flex-shrink-0 p-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40"
            style={{
              background: text.trim() ? "#34A853" : "var(--color-bg-elevated)",
              color: text.trim() ? "#fff" : "var(--color-text-muted)",
            }}
            aria-label="Send message"
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        )}
      </div>

      <p className="text-center mt-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
        Enter or Ctrl+Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
