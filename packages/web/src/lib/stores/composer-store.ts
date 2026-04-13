import { create } from "zustand";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AttachmentKind = "file" | "image" | "error" | "tool_output" | "code_selection";

export type QuickAction = "fix" | "explain" | "review";

export const QUICK_ACTION_PROMPTS: Record<QuickAction, string> = {
  fix: "Fix this error",
  explain: "Explain this code",
  review: "Review this and suggest improvements",
};

export interface ContextAttachment {
  id: string;
  kind: AttachmentKind;
  label: string;
  content: string;
  meta?: {
    filePath?: string;
    language?: string;
    toolName?: string;
    lineRange?: string;
    /** MIME type for image attachments */
    mediaType?: string;
  };
}

/** Max chars per attachment to prevent oversized messages */
const MAX_ATTACHMENT_CHARS = 10_000;

// ─── Store ───────────────────────────────────────────────────────────────────

interface ComposerStore {
  attachments: ContextAttachment[];
  quickAction: QuickAction | null;
  addAttachment: (att: Omit<ContextAttachment, "id">) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  setQuickAction: (action: QuickAction | null) => void;
}

export const useComposerStore = create<ComposerStore>((set) => ({
  attachments: [],
  quickAction: null,

  addAttachment: (att) =>
    set((s) => ({
      attachments: [
        ...s.attachments,
        {
          ...att,
          id: crypto.randomUUID(),
          // Skip truncation for images (base64 data)
          content:
            att.kind === "image"
              ? att.content
              : att.content.length > MAX_ATTACHMENT_CHARS
                ? att.content.slice(0, MAX_ATTACHMENT_CHARS) + "\n... (truncated)"
                : att.content,
        },
      ],
    })),

  removeAttachment: (id) =>
    set((s) => ({
      attachments: s.attachments.filter((a) => a.id !== id),
    })),

  clearAttachments: () => set({ attachments: [], quickAction: null }),

  setQuickAction: (action) => set({ quickAction: action }),
}));

// ─── Formatter ───────────────────────────────────────────────────────────────

/**
 * Build the final message string with context blocks prepended.
 * Format: <context> blocks + user text.
 */
export function buildMessageWithContext(
  userText: string,
  attachments: ContextAttachment[],
): string {
  // Images are sent separately via WS — only include text-based attachments
  const textAttachments = attachments.filter((a) => a.kind !== "image");
  if (textAttachments.length === 0) return userText;

  const contextBlocks = textAttachments.map((att) => {
    const lang = att.meta?.language ?? "";
    const source = att.meta?.filePath
      ? `File: \`${att.meta.filePath}\`${att.meta.lineRange ? ` (${att.meta.lineRange})` : ""}`
      : att.meta?.toolName
        ? `Tool: \`${att.meta.toolName}\``
        : att.kind === "error"
          ? "Error output"
          : "Context";

    return `<context>\n${source}\n\`\`\`${lang}\n${att.content}\n\`\`\`\n</context>`;
  });

  const contextSection = contextBlocks.join("\n\n");
  return userText ? `${contextSection}\n\n${userText}` : contextSection;
}
