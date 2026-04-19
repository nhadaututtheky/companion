"use client";
import {
  useRef,
  useCallback,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { PaperPlaneTilt, Stop } from "@phosphor-icons/react";
import { SlashCommandMenu } from "@/components/session/slash-commands";
import { useSlashMenu } from "./use-slash-menu";
import { useAutoResizeTextarea } from "./use-auto-resize";
import { isSendCombo, isSlashPassthrough } from "./key-combos";

export type ComposerVariant = "full" | "compact";

interface VariantTokens {
  textareaFontSize: number; // px
  textareaMaxHeight: number;
  textareaMinHeight: number;
  outerPaddingX: string;
  outerPaddingY: string;
  innerPaddingX: string;
  innerPaddingY: string;
  borderWidth: string;
  iconSize: number;
  buttonPadding: string;
  buttonRadius: string;
  /** Tailwind class for radius on the inner box */
  innerRadius: string;
  /** Whether Ctrl+Shift+Enter sends (full only) */
  allowCtrlBypass: boolean;
}

const TOKENS: Record<ComposerVariant, VariantTokens> = {
  full: {
    textareaFontSize: 14,
    textareaMaxHeight: 200,
    textareaMinHeight: 22,
    outerPaddingX: "px-4",
    outerPaddingY: "py-3",
    innerPaddingX: "px-4",
    innerPaddingY: "py-2.5",
    borderWidth: "1.5px",
    iconSize: 16,
    buttonPadding: "p-1.5",
    buttonRadius: "rounded-lg",
    innerRadius: "var(--radius-md)",
    allowCtrlBypass: true,
  },
  compact: {
    textareaFontSize: 12,
    textareaMaxHeight: 72,
    textareaMinHeight: 18,
    outerPaddingX: "px-3",
    outerPaddingY: "py-2.5",
    innerPaddingX: "px-2.5",
    innerPaddingY: "py-1.5",
    borderWidth: "1px",
    iconSize: 12,
    buttonPadding: "p-1",
    buttonRadius: "rounded-full",
    innerRadius: "var(--radius-md)",
    allowCtrlBypass: false,
  },
};

export interface ComposerCoreProps {
  /** Controlled text value. */
  value: string;
  onChange: (value: string) => void;
  /** Called when send is triggered. Composer does NOT clear `value` automatically — caller decides. */
  onSend: () => void;
  /** Called when stop button clicked. Required if showStopButton is true. */
  onStop?: () => void;

  variant?: ComposerVariant;
  isRunning?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Additional condition to consider when computing canSend (e.g., attachments present). Default: text.trim() non-empty. */
  hasExtraContent?: boolean;
  /** Show a separate Stop button alongside Send (full variant only — compact reuses send button color). */
  showStopButton?: boolean;
  /** Aria label override. */
  ariaLabel?: string;

  // ── Slot regions (rendered inside the inner box, above the textarea) ────────
  /** Suggestion strip (inline skill suggestions). */
  topSlot?: ReactNode;
  /** Dispatch suggestion / orchestration banner. */
  bannerSlot?: ReactNode;
  /** Attachment chips + quick actions. */
  attachmentSlot?: ReactNode;
  /** Extra buttons next to send (attach, voice, etc.) — full variant only. */
  inlineActionsSlot?: ReactNode;
  /** Footer row below the inner box (saved prompts, model bar, hint text) — full variant only. */
  footerSlot?: ReactNode;

  // ── Wrapper hooks (drag/drop, paste handling lives at consumer level) ───────
  onPaste?: (e: React.ClipboardEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Drag-over visual highlight (consumer toggles based on its own state). */
  isDragOver?: boolean;
  /** Render an overlay during drag-over (e.g., "Drop file to attach"). */
  dragOverOverlay?: ReactNode;

  /** Expose the textarea ref so consumers can focus / read selection. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  /** Expose wrapper ref for external positioning (e.g., menus that need an anchor). */
  wrapperRef?: RefObject<HTMLDivElement | null>;
}

/**
 * ComposerCore — single source of truth for the chat input UI.
 *
 * Variants:
 *   - "full"    → MessageComposer wrapper (used in expanded session, dedicated chat)
 *   - "compact" → CompactComposer wrapper (used in mini terminal grid)
 *
 * Behavior contract is locked by `session/__tests__/composer-logic.test.ts`.
 */
export function ComposerCore({
  value,
  onChange,
  onSend,
  onStop,
  variant = "full",
  isRunning = false,
  disabled = false,
  placeholder = "Message…",
  hasExtraContent = false,
  showStopButton = false,
  ariaLabel = "Message input",
  topSlot,
  bannerSlot,
  attachmentSlot,
  inlineActionsSlot,
  footerSlot,
  onPaste,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver = false,
  dragOverOverlay,
  textareaRef: externalTextareaRef,
  wrapperRef: externalWrapperRef,
}: ComposerCoreProps) {
  const tokens = TOKENS[variant];
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const internalWrapperRef = useRef<HTMLDivElement>(null);
  const textareaRef = externalTextareaRef ?? internalTextareaRef;
  const wrapperRef = externalWrapperRef ?? internalWrapperRef;

  const [isFocused, setIsFocused] = useState(false);

  const slash = useSlashMenu();
  const resizeTextarea = useAutoResizeTextarea(textareaRef, tokens.textareaMaxHeight);

  const hasContent = value.trim().length > 0 || hasExtraContent;

  const handleSend = useCallback(() => {
    if (!hasContent || disabled) return;
    onSend();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [hasContent, disabled, onSend, textareaRef]);

  const handleSlashSelect = useCallback(
    (command: string) => {
      onChange(command + " ");
      slash.close();
      textareaRef.current?.focus();
    },
    [onChange, slash, textareaRef],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSlashPassthrough(slash.open, e)) return;
    if (isSendCombo(e, tokens.allowCtrlBypass)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    slash.onChangeText(e.target.value);
  };

  // ── Border + focus styles ───────────────────────────────────────────────────
  // Default state has a subtle visible border so the input always reads as a
  // discrete surface (addresses "feels plain / unused whitespace" feedback).
  // Focus elevates with the accent ring; drag-over is the strongest state.
  const idleBorderColor =
    variant === "compact"
      ? "var(--glass-border)"
      : "color-mix(in srgb, var(--glass-border) 70%, transparent)";

  const borderStyle = isDragOver
    ? "1.5px solid var(--color-accent)"
    : isFocused
      ? `${tokens.borderWidth} solid color-mix(in srgb, var(--color-accent) 55%, transparent)`
      : `${tokens.borderWidth} solid ${idleBorderColor}`;

  const boxShadow = isFocused
    ? "0 0 0 3px color-mix(in srgb, var(--color-accent) 12%, transparent), var(--shadow-sm)"
    : variant === "full"
      ? "var(--shadow-sm), inset 0 1px 0 color-mix(in srgb, white 4%, transparent)"
      : "none";

  // Send button background — same expression both variants (locked by composer-logic.test.ts).
  const sendBg = !hasContent
    ? "var(--color-bg-elevated)"
    : isRunning
      ? "#D97706"
      : "#34A853";
  const sendColor = hasContent ? "#fff" : "var(--color-text-muted)";

  return (
    <div
      ref={wrapperRef}
      className={`composer-core relative ${tokens.outerPaddingX} ${tokens.outerPaddingY}`}
      onPaste={onPaste}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <SlashCommandMenu
        query={slash.query}
        visible={slash.open}
        onSelect={handleSlashSelect}
        onClose={slash.close}
        anchorRef={wrapperRef}
      />

      <div
        className={`bg-bg-elevated relative flex flex-col ${tokens.innerPaddingX} ${tokens.innerPaddingY}`}
        style={{
          borderRadius: tokens.innerRadius,
          border: borderStyle,
          boxShadow,
          transition: "border-color 150ms ease, box-shadow 150ms ease",
        }}
      >
        {isDragOver && dragOverOverlay}
        {topSlot}
        {bannerSlot}
        {attachmentSlot}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onInput={resizeTextarea}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            aria-label={ariaLabel}
            className="composer-textarea text-text-primary flex-1 resize-none bg-transparent leading-relaxed"
            style={{
              fontSize: tokens.textareaFontSize,
              maxHeight: tokens.textareaMaxHeight,
              minHeight: tokens.textareaMinHeight,
              fontFamily: "var(--font-body)",
              outline: "none",
            }}
          />

          {inlineActionsSlot}

          {showStopButton && isRunning && (
            <button
              onClick={onStop}
              className={`flex-shrink-0 cursor-pointer ${tokens.buttonRadius} ${tokens.buttonPadding} transition-colors`}
              style={{ background: "#EA433515", color: "#EA4335" }}
              aria-label="Stop"
              title="Stop agent"
            >
              <Stop size={tokens.iconSize} weight="fill" />
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={!hasContent || disabled}
            className={`flex-shrink-0 cursor-pointer ${tokens.buttonRadius} ${tokens.buttonPadding} transition-all disabled:opacity-40`}
            style={{ background: sendBg, color: sendColor }}
            aria-label={isRunning ? "Interrupt and send" : "Send message"}
            title={isRunning ? "Interrupt and send" : "Send message"}
          >
            <PaperPlaneTilt size={tokens.iconSize} weight="fill" />
          </button>
        </div>
      </div>

      {footerSlot}
    </div>
  );
}
