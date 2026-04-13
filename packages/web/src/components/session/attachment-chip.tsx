"use client";
import { X, FileText, Warning, Terminal, CodeBlock } from "@phosphor-icons/react";
import type { ContextAttachment, AttachmentKind } from "@/lib/stores/composer-store";

const ICONS: Record<AttachmentKind, typeof FileText> = {
  file: FileText,
  error: Warning,
  tool_output: Terminal,
  code_selection: CodeBlock,
};

const COLORS: Record<AttachmentKind, string> = {
  file: "#4285F4",
  error: "#ef4444",
  tool_output: "#34A853",
  code_selection: "#a855f7",
};

interface AttachmentChipProps {
  attachment: ContextAttachment;
  onRemove: (id: string) => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const Icon = ICONS[attachment.kind];
  const color = COLORS[attachment.kind];
  const preview = attachment.content.slice(0, 120).replace(/\n/g, " ");

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs max-w-[280px]"
      style={{
        background: `${color}12`,
        border: `1px solid ${color}30`,
        color: "var(--color-text-secondary)",
      }}
      title={preview}
    >
      <Icon size={12} weight="bold" className="shrink-0" style={{ color }} />
      <span className="truncate font-medium" style={{ color }}>
        {attachment.label}
      </span>
      <button
        onClick={() => onRemove(attachment.id)}
        className="p-0.5 rounded hover:bg-[rgba(0,0,0,0.1)] transition-colors cursor-pointer flex-shrink-0"
        aria-label={`Remove ${attachment.label}`}
      >
        <X size={10} weight="bold" />
      </button>
    </div>
  );
}
