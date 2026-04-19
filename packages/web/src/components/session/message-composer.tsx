"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { Z } from "@/lib/z-index";
import { Microphone, MicrophoneSlash, Paperclip } from "@phosphor-icons/react";
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
import { ComposerCore } from "@/components/composer/composer-core";
import { resizeTextarea } from "@/components/composer/use-auto-resize";
import { joinWithSpace, readImageAsBase64 } from "@/components/composer/utils";

const FULL_TEXTAREA_MAX_HEIGHT = 200;
const resizeFullTextarea = (el: HTMLTextAreaElement | null) =>
  resizeTextarea(el, FULL_TEXTAREA_MAX_HEIGHT);

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
  /**
   * Compact mode for split-pane layouts. Currently a no-op (was never wired
   * up in the legacy implementation either). The grid-pane uses the dedicated
   * `MiniTerminal` for its compact composer; `SessionPane` passes this flag
   * but it remains visually identical to the full variant. Phase 5 of the
   * composer-unify plan decides whether to honor this for `SessionPane`.
   */
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
  const [inlineSuggestions, setInlineSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerWrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Composer store — individual selectors avoid React 19 infinite loops.
  const attachments = useComposerStore((s) => s.attachments);
  const addAttachment = useComposerStore((s) => s.addAttachment);
  const removeAttachment = useComposerStore((s) => s.removeAttachment);
  const clearAttachments = useComposerStore((s) => s.clearAttachments);

  // Dispatch suggestion — only show when scoped to this session.
  const dispatchSuggestion = useDispatchStore((s) =>
    s.suggestion?.sessionId === sessionId ? s.suggestion : null,
  );
  const clearSuggestion = useDispatchStore((s) => s.clearSuggestion);

  // Inline suggestions — register skills provider once, pre-fetch registry.
  const fetchSkills = useRegistryStore(selectFetchSkills);
  useEffect(() => {
    suggestionEngine.registerProvider(skillsProvider);
    fetchSkills();
    return () => {
      suggestionEngine.unregisterProvider("skills");
    };
  }, [fetchSkills]);

  // Debounced suggestion compute on prompt change.
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

  // Reset dismissed state when user starts typing a new prompt.
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
        clearSuggestion();
        setText("");
        clearAttachments();
      } catch {
        // Dispatch failed — message stays in composer for manual send
      }
    },
    [dispatchSuggestion, sessionId, text, clearSuggestion, clearAttachments, projectSlug],
  );

  // Voice input — append transcribed speech, then auto-resize.
  const handleTranscript = useCallback((transcript: string) => {
    setText((prev) => joinWithSpace(prev, transcript));
    requestAnimationFrame(() => resizeFullTextarea(textareaRef.current));
  }, []);

  const {
    supported: voiceSupported,
    listening,
    interim,
    toggle: toggleVoice,
  } = useVoiceInput(handleTranscript);

  const hasAttachments = attachments.length > 0;

  const handleSend = useCallback(() => {
    const finalMessage = buildMessageWithContext(text.trim(), attachments);
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
  }, [text, attachments, onSend, clearAttachments]);

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
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const newPos = start + payload.length;
        el.setSelectionRange(newPos, newPos);
        el.focus();
        resizeFullTextarea(el);
      });
    } else {
      setText((prev) => prev + payload);
    }
    setInlineSuggestions([]);
    setSuggestionsDismissed(true);
  }, []);

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

  // ── Clipboard / file handling ──────────────────────────────────────────────
  const attachImageFile = useCallback(
    async (file: File, fallbackLabel = "Pasted image") => {
      const base64 = await readImageAsBase64(file);
      if (!base64) return;
      addAttachment({
        kind: "image",
        label: file.name || fallbackLabel,
        content: base64,
        meta: { mediaType: file.type },
      });
    },
    [addAttachment],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void attachImageFile(file);
      }
    },
    [attachImageFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/")) {
          void attachImageFile(file, file.name);
        } else {
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
      e.target.value = "";
    },
    [addAttachment, attachImageFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-companion-file")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
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
  };

  // ── Effective textarea value (mirrors voice interim into the field) ────────
  const effectiveValue = listening && interim ? joinWithSpace(text, interim) : text;

  const effectivePlaceholder = isRunning
    ? "Type to interrupt or queue..."
    : hasAttachments
      ? "Add instructions or use a quick action above..."
      : listening
        ? "Listening..."
        : placeholder;

  // ── Slot content ───────────────────────────────────────────────────────────
  const dragOverOverlay = (
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
  );

  const topSlot = (
    <SuggestionStrip
      suggestions={inlineSuggestions}
      onAccept={handleAcceptSuggestion}
      onDismiss={handleDismissSuggestions}
    />
  );

  const bannerSlot = dispatchSuggestion && !dispatchSuggestion.dismissed && (
    <div className="mb-2">
      <DispatchSuggestion onConfirm={handleDispatchConfirm} onDismiss={clearSuggestion} />
    </div>
  );

  const attachmentSlot = hasAttachments && (
    <div className="mb-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {attachments.map((att) => (
          <AttachmentChip key={att.id} attachment={att} onRemove={removeAttachment} />
        ))}
      </div>
      {!isRunning && <QuickActions onAction={handleQuickAction} />}
    </div>
  );

  const inlineActionsSlot = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.go,.yaml,.yml,.toml,.xml,.html,.css,.sql,.sh"
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />
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
    </>
  );

  const footerSlot = (
    <div className="mt-1.5 flex items-center gap-1.5">
      <SavedPromptsPicker
        projectSlug={projectSlug}
        onSelect={(content) => {
          setText(content);
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            resizeFullTextarea(el);
            el.focus();
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
  );

  return (
    <ComposerCore
      variant="full"
      value={effectiveValue}
      onChange={(v) => {
        if (!listening) setText(v);
      }}
      onSend={handleSend}
      onStop={onStop}
      isRunning={isRunning}
      disabled={disabled}
      placeholder={effectivePlaceholder}
      hasExtraContent={hasAttachments}
      showStopButton
      ariaLabel="Message Claude"
      topSlot={topSlot}
      bannerSlot={bannerSlot}
      attachmentSlot={attachmentSlot}
      inlineActionsSlot={inlineActionsSlot}
      footerSlot={footerSlot}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      isDragOver={isDragOver}
      dragOverOverlay={dragOverOverlay}
      textareaRef={textareaRef}
      wrapperRef={composerWrapperRef}
    />
  );
}
