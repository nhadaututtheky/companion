"use client";
import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { PaperPlaneTilt, Stop, Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import {
  useComposerStore,
  buildMessageWithContext,
  QUICK_ACTION_PROMPTS,
} from "@/lib/stores/composer-store";
import type { QuickAction } from "@/lib/stores/composer-store";
import { AttachmentChip } from "./attachment-chip";
import { QuickActions } from "./quick-actions";
import { SavedPromptsPicker } from "./saved-prompts-picker";
import { SlashCommandMenu } from "./slash-commands";
import { ModelBar, type ModelInfo } from "./model-bar";
import { api } from "@/lib/api-client";

interface MessageComposerProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Current project slug for scoping saved prompts */
  projectSlug?: string;
  /** Compact mode for split-pane layouts */
  compact?: boolean;
  /** Current session model for model bar */
  sessionModel?: string;
  /** Debate participants */
  debateParticipants?: ModelInfo[];
  /** Add model to debate */
  onAddDebateParticipant?: (model: ModelInfo) => void;
  /** Remove model from debate */
  onRemoveDebateParticipant?: (modelId: string) => void;
}

export function MessageComposer({
  onSend,
  onStop,
  isRunning = false,
  disabled = false,
  placeholder = "Message Claude...",
  projectSlug,
  sessionModel,
  debateParticipants = [],
  onAddDebateParticipant,
  onRemoveDebateParticipant,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerWrapperRef = useRef<HTMLDivElement>(null);

  // Composer store — use individual selectors to avoid infinite loops
  const attachments = useComposerStore((s) => s.attachments);
  const addAttachment = useComposerStore((s) => s.addAttachment);
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

  const {
    supported: voiceSupported,
    listening,
    interim,
    toggle: toggleVoice,
  } = useVoiceInput(handleTranscript);

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

  // Detect slash commands in text
  const updateSlashMenu = useCallback((value: string) => {
    // Only show menu if text starts with "/" and is a single line
    const match = value.match(/^\/(\S*)$/);
    if (match) {
      setSlashMenuOpen(true);
      setSlashQuery("/" + match[1]);
    } else {
      setSlashMenuOpen(false);
    }
  }, []);

  const handleSlashSelect = useCallback((command: string) => {
    setText(command + " ");
    setSlashMenuOpen(false);
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Let slash menu handle navigation keys
    if (slashMenuOpen && ["ArrowUp", "ArrowDown", "Tab", "Escape"].includes(e.key)) {
      return; // handled by SlashCommandMenu via document listener
    }
    if (slashMenuOpen && e.key === "Enter" && !e.shiftKey) {
      return; // let slash menu handle Enter for selection
    }
    // Enter (without shift) or Ctrl+Enter both send
    const isSendCombo = (e.key === "Enter" && !e.shiftKey) || (e.key === "Enter" && e.ctrlKey);
    if (isSendCombo) {
      e.preventDefault();
      handleSend(); // Allow sending even while running (interrupts the agent)
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
      ref={composerWrapperRef}
      className="message-composer-wrapper px-4 py-3 relative"
      style={{ borderTop: "1px solid var(--color-border)" }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-companion-file")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setIsDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const data = e.dataTransfer.getData("application/x-companion-file");
        if (!data) return;
        try {
          const file = JSON.parse(data) as { path: string; name: string; ext: string };
          const currentAttachments = useComposerStore.getState().attachments;
          const isDuplicate = currentAttachments.some((a) => a.meta?.filePath === file.path);
          if (isDuplicate) return;
          api.fs
            .read(file.path)
            .then((res) => {
              addAttachment({
                kind: "file",
                label: file.name,
                content: res.data.content,
                meta: { filePath: file.path, language: file.ext },
              });
            })
            .catch(() => {
              addAttachment({
                kind: "file",
                label: file.name,
                content: `[File: ${file.path}]`,
                meta: { filePath: file.path, language: file.ext },
              });
            });
        } catch {
          /* ignore malformed data */
        }
      }}
    >
      <div
        className="flex flex-col rounded-xl px-4 py-2.5"
        style={{
          position: "relative",
          background: "var(--color-bg-elevated)",
          border: isDragOver
            ? "1.5px solid var(--color-accent)"
            : isFocused
              ? "1.5px solid color-mix(in srgb, var(--color-accent) 50%, transparent)"
              : "1.5px solid transparent",
          boxShadow: isFocused
            ? "0 0 0 3px color-mix(in srgb, var(--color-accent) 10%, transparent)"
            : "var(--shadow-sm)",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
        }}
      >
        {isDragOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(66, 133, 244, 0.08)",
              border: "2px dashed var(--color-accent)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <span style={{ color: "var(--color-accent)", fontWeight: 600, fontSize: 13 }}>
              Drop file to attach
            </span>
          </div>
        )}
        {/* Attachment chips + quick actions */}
        {attachments.length > 0 && (
          <div className="mb-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((att) => (
                <AttachmentChip key={att.id} attachment={att} onRemove={removeAttachment} />
              ))}
            </div>
            {!isRunning && <QuickActions onAction={handleQuickAction} />}
          </div>
        )}

        {/* Slash command autocomplete */}
        <SlashCommandMenu
          query={slashQuery}
          visible={slashMenuOpen}
          onSelect={handleSlashSelect}
          onClose={() => setSlashMenuOpen(false)}
          anchorRef={composerWrapperRef}
        />

        {/* Input row */}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={
              listening && interim
                ? text + (text && !text.endsWith(" ") ? " " : "") + interim
                : text
            }
            onChange={(e) => {
              if (!listening) {
                setText(e.target.value);
                updateSlashMenu(e.target.value);
              }
            }}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            placeholder={
              isRunning
                ? "Type to interrupt or queue..."
                : attachments.length > 0
                  ? "Add instructions or use a quick action above..."
                  : listening
                    ? "Listening..."
                    : placeholder
            }
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed composer-textarea"
            style={{
              color: "var(--color-text-primary)",
              maxHeight: 200,
              minHeight: 22,
              fontFamily: "var(--font-body)",
              outline: "none",
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

          {isRunning && (
            <button
              onClick={onStop}
              className="flex-shrink-0 p-1.5 rounded-lg transition-colors cursor-pointer"
              style={{ background: "#EA433515", color: "#EA4335" }}
              aria-label="Stop"
              title="Stop agent"
            >
              <Stop size={16} weight="fill" />
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={!hasContent || disabled}
            className="flex-shrink-0 p-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40"
            style={{
              background: hasContent
                ? isRunning
                  ? "#D97706"
                  : "#34A853"
                : "var(--color-bg-elevated)",
              color: hasContent ? "#fff" : "var(--color-text-muted)",
            }}
            aria-label={isRunning ? "Interrupt and send" : "Send message"}
            title={isRunning ? "Interrupt and send" : "Send message"}
          >
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        <SavedPromptsPicker
          projectSlug={projectSlug}
          onSelect={(content) => {
            setText(content);
            requestAnimationFrame(() => {
              const el = textareaRef.current;
              if (el) {
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                el.focus();
              }
            });
          }}
        />
        {sessionModel && onAddDebateParticipant && onRemoveDebateParticipant && (
          <ModelBar
            mainModel={sessionModel}
            debateParticipants={debateParticipants}
            onAddParticipant={onAddDebateParticipant}
            onRemoveParticipant={onRemoveDebateParticipant}
            disabled={disabled}
          />
        )}
        <p className="flex-1 text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
          {listening ? (
            <span style={{ color: "#EA4335" }}>Recording... click mic to stop</span>
          ) : isRunning ? (
            <span>Enter to interrupt · Shift+Enter newline</span>
          ) : (
            <>Enter · Shift+Enter newline</>
          )}
        </p>
      </div>
    </div>
  );
}
