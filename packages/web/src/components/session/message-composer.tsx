"use client";
import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { PaperPlaneTilt, Stop, Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useComposerStore, buildMessageWithContext, QUICK_ACTION_PROMPTS } from "@/lib/stores/composer-store";
import type { QuickAction } from "@/lib/stores/composer-store";
import { AttachmentChip } from "./attachment-chip";
import { QuickActions } from "./quick-actions";

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

  // Composer store — use individual selectors to avoid infinite loops
  const attachments = useComposerStore((s) => s.attachments);
  const removeAttachment = useComposerStore((s) => s.removeAttachment);
  const clearAttachments = useComposerStore((s) => s.clearAttachments);

  // Voice input: append transcribed speech to the textarea
  const handleTranscript = useCallback((transcript: string) => {
    setText((prev) => {
      const separator = prev && !prev.endsWith(" ") ? " " : "";
      return prev + separator + transcript;
    });
    // Auto-resize textarea after voice input
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
      }
    });
  }, []);

  const { supported: voiceSupported, listening, interim, toggle: toggleVoice } =
    useVoiceInput(handleTranscript);

  const hasContent = text.trim() || attachments.length > 0;

  const handleSend = () => {
    if (!hasContent || disabled) return;
    const finalMessage = buildMessageWithContext(text.trim(), attachments);
    onSend(finalMessage);
    setText("");
    clearAttachments();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    if (disabled) return;
    const prompt = QUICK_ACTION_PROMPTS[action];
    const finalMessage = buildMessageWithContext(prompt, attachments);
    onSend(finalMessage);
    setText("");
    clearAttachments();
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
        className="flex flex-col rounded-2xl px-4 py-2.5"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* Attachment chips + quick actions */}
        {attachments.length > 0 && (
          <div className="mb-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((att) => (
                <AttachmentChip
                  key={att.id}
                  attachment={att}
                  onRemove={removeAttachment}
                />
              ))}
            </div>
            {!isRunning && (
              <QuickActions onAction={handleQuickAction} />
            )}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={listening && interim ? text + (text && !text.endsWith(" ") ? " " : "") + interim : text}
            onChange={(e) => { if (!listening) setText(e.target.value); }}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={attachments.length > 0
              ? "Add instructions or use a quick action above..."
              : (listening ? "Listening..." : placeholder)
            }
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed"
            style={{
              color: "var(--color-text-primary)",
              maxHeight: 200,
              minHeight: 22,
              fontFamily: "var(--font-body)",
            }}
          />

          {/* Voice input button */}
          {voiceSupported && !isRunning && (
            <button
              onClick={toggleVoice}
              className="flex-shrink-0 p-1.5 rounded-lg transition-all cursor-pointer"
              style={{
                background: listening ? "#EA433515" : "transparent",
                color: listening ? "#EA4335" : "var(--color-text-muted)",
              }}
              aria-label={listening ? "Stop recording" : "Voice input"}
              title={listening ? "Stop recording" : "Voice input"}
            >
              {listening ? (
                <MicrophoneSlash size={16} weight="fill" />
              ) : (
                <Microphone size={16} weight="regular" />
              )}
            </button>
          )}

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
              disabled={!hasContent || disabled}
              className="flex-shrink-0 p-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40"
              style={{
                background: hasContent ? "#34A853" : "var(--color-bg-elevated)",
                color: hasContent ? "#fff" : "var(--color-text-muted)",
              }}
              aria-label="Send message"
            >
              <PaperPlaneTilt size={16} weight="fill" />
            </button>
          )}
        </div>
      </div>

      <p className="text-center mt-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
        {listening ? (
          <span style={{ color: "#EA4335" }}>
            Recording... click mic to stop
          </span>
        ) : (
          <>Enter or Ctrl+Enter to send · Shift+Enter for newline</>
        )}
      </p>
    </div>
  );
}
