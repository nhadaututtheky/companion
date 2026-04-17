"use client";
import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Z } from "@/lib/z-index";
import {
  PaperPlaneTilt,
  Stop,
  Microphone,
  MicrophoneSlash,
  Paperclip,
} from "@phosphor-icons/react";
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
import { DispatchSuggestion } from "./dispatch-suggestion";
import { useDispatchStore } from "@/lib/stores/dispatch-store";
import type { OrchestrationPattern } from "@companion/shared/types";
import { api } from "@/lib/api-client";
import { SuggestionStrip } from "@/components/chat/suggestion-strip";
import { suggestionEngine } from "@/lib/suggest/engine";
import { skillsProvider } from "@/lib/suggest/providers/skills.provider";
import { useRegistryStore, selectFetchSkills } from "@/lib/suggest/registry-store";
import { areInlineSuggestionsEnabled } from "@/lib/suggest/settings";
import type { Suggestion } from "@/lib/suggest/types";

interface MessageComposerProps {
  onSend: (text: string, images?: Array<{ data: string; mediaType: string; name: string }>) => void;
  onStop?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Current project slug for scoping saved prompts */
  projectSlug?: string;
  /** Session ID for dispatch suggestions */
  sessionId?: string;
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
  sessionId,
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
  const [inlineSuggestions, setInlineSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerWrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Composer store — use individual selectors to avoid infinite loops
  const attachments = useComposerStore((s) => s.attachments);
  const addAttachment = useComposerStore((s) => s.addAttachment);
  const removeAttachment = useComposerStore((s) => s.removeAttachment);
  const clearAttachments = useComposerStore((s) => s.clearAttachments);

  // Dispatch suggestion store — only show if suggestion matches this session
  const dispatchSuggestion = useDispatchStore((s) =>
    s.suggestion?.sessionId === sessionId ? s.suggestion : null,
  );
  const clearSuggestion = useDispatchStore((s) => s.clearSuggestion);

  // Inline suggestions — register skills provider once, pre-fetch registry
  const fetchSkills = useRegistryStore(selectFetchSkills);
  useEffect(() => {
    suggestionEngine.registerProvider(skillsProvider);
    fetchSkills();
    return () => {
      suggestionEngine.unregisterProvider("skills");
    };
  }, [fetchSkills]);

  // Debounced suggestion compute on prompt change
  useEffect(() => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);

    if (!areInlineSuggestionsEnabled() || suggestionsDismissed || !text.trim()) {
      setInlineSuggestions([]);
      return;
    }

    suggestDebounceRef.current = setTimeout(async () => {
      const cursorPosition = textareaRef.current?.selectionStart ?? text.length;
      const results = await suggestionEngine.suggest({ prompt: text, cursorPosition });
      setInlineSuggestions(results);
    }, 200);

    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
  }, [text, suggestionsDismissed]);

  // Reset dismissed state when user starts typing a new prompt
  const prevTextRef = useRef(text);
  useEffect(() => {
    if (suggestionsDismissed && text !== prevTextRef.current) {
      setSuggestionsDismissed(false);
    }
    prevTextRef.current = text;
  }, [text, suggestionsDismissed]);

  const handleDispatchConfirm = useCallback(
    async (pattern: OrchestrationPattern) => {
      if (!dispatchSuggestion || !sessionId) return;
      try {
        await api.sessions.dispatch.confirm({
          sessionId,
          message: text.trim(),
          classification: { ...dispatchSuggestion.classification, pattern },
          action: pattern !== dispatchSuggestion.classification.pattern ? "override" : "accept",
          projectSlug,
        });
        // Success — clear suggestion and composer text
        clearSuggestion();
        setText("");
        clearAttachments();
      } catch {
        // Dispatch failed — message stays in composer for manual send
      }
    },
    [dispatchSuggestion, sessionId, text, clearSuggestion, clearAttachments, projectSlug],
  );

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
    // Extract image attachments to send via WS separately
    const imageAtts = attachments.filter((a) => a.kind === "image");
    const images =
      imageAtts.length > 0
        ? imageAtts.map((a) => ({
            data: a.content,
            mediaType: a.meta?.mediaType ?? "image/png",
            name: a.label,
          }))
        : undefined;
    onSend(finalMessage, images);
    setText("");
    clearAttachments();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleAcceptSuggestion = useCallback((suggestion: Suggestion) => {
    if (suggestion.action.type !== "insert-text") return;
    const payload = suggestion.action.payload as string;
    const ta = textareaRef.current;
    if (ta) {
      // Use live DOM value (ta.value) instead of stale `text` state to avoid
      // clobbering characters typed after the suggestion was generated.
      const current = ta.value;
      const start = ta.selectionStart ?? current.length;
      const end = ta.selectionEnd ?? current.length;
      const newText = current.slice(0, start) + payload + current.slice(end);
      setText(newText);
      // Restore cursor after insertion
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = start + payload.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
          textareaRef.current.focus();
        }
      });
    } else {
      setText((prev) => prev + payload);
    }
    setInlineSuggestions([]);
    setSuggestionsDismissed(true);
  }, []); // no `text` dep — reads live ta.value instead

  const handleDismissSuggestions = useCallback(() => {
    setInlineSuggestions([]);
    setSuggestionsDismissed(true);
  }, []);

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

  // Clipboard paste — capture images from clipboard
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // result = "data:image/png;base64,xxxxx" — extract base64 part
            const base64 = result.split(",")[1];
            if (!base64) return;
            addAttachment({
              kind: "image",
              label: file.name || `Pasted image`,
              content: base64,
              meta: { mediaType: file.type },
            });
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [addAttachment],
  );

  // File input change — handle selected files
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1];
            if (!base64) return;
            addAttachment({
              kind: "image",
              label: file.name,
              content: base64,
              meta: { mediaType: file.type },
            });
          };
          reader.readAsDataURL(file);
        } else {
          // Text-based file — read as text
          const reader = new FileReader();
          reader.onload = () => {
            addAttachment({
              kind: "file",
              label: file.name,
              content: reader.result as string,
              meta: { language: file.name.split(".").pop() ?? "" },
            });
          };
          reader.readAsText(file);
        }
      }
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [addAttachment],
  );

  return (
    <div
      ref={composerWrapperRef}
      className="message-composer-wrapper relative px-4 py-3"
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
        className="bg-bg-elevated relative flex flex-col px-4 py-2.5"
        style={{
          borderRadius: "var(--radius-md)",
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
            className="absolute flex"
            style={{
              inset: 0,
              background: "rgba(66, 133, 244, 0.08)",
              border: "2px dashed var(--color-accent)",
              borderRadius: "var(--radius-lg)",
              alignItems: "center",
              justifyContent: "center",
              zIndex: Z.dropdown,
              pointerEvents: "none",
            }}
          >
            <span className="text-accent font-semibold" style={{ fontSize: 13 }}>
              Drop file to attach
            </span>
          </div>
        )}
        {/* Inline skill suggestions */}
        <SuggestionStrip
          suggestions={inlineSuggestions}
          onAccept={handleAcceptSuggestion}
          onDismiss={handleDismissSuggestions}
        />

        {/* Dispatch suggestion */}
        {dispatchSuggestion && !dispatchSuggestion.dismissed && (
          <div className="mb-2">
            <DispatchSuggestion onConfirm={handleDispatchConfirm} onDismiss={clearSuggestion} />
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
            onPaste={handlePaste}
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
            className="composer-textarea text-text-primary flex-1 resize-none bg-transparent text-sm leading-relaxed"
            style={{
              maxHeight: 200,
              minHeight: 22,
              fontFamily: "var(--font-body)",
              outline: "none",
            }}
          />

          {/* Hidden file input for attach */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.go,.yaml,.yml,.toml,.xml,.html,.css,.sql,.sh"
            onChange={handleFileSelect}
            className="hidden"
            aria-hidden="true"
          />

          {/* Attach file/image button */}
          {!isRunning && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 cursor-pointer rounded-lg p-1.5 transition-all"
              style={{ color: "var(--color-text-muted)" }}
              aria-label="Attach file or image"
              title="Attach file or image (or paste image with Ctrl+V)"
            >
              <Paperclip size={16} weight="regular" />
            </button>
          )}

          {/* Voice input button */}
          {voiceSupported && !isRunning && (
            <button
              onClick={toggleVoice}
              className="flex-shrink-0 cursor-pointer rounded-lg p-1.5 transition-all"
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
              className="flex-shrink-0 cursor-pointer rounded-lg p-1.5 transition-colors"
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
            className="flex-shrink-0 cursor-pointer rounded-lg p-1.5 transition-all disabled:opacity-40"
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

      <div className="mt-1.5 flex items-center gap-1.5">
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
        <p className="text-text-muted flex-1 text-center text-xs">
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
