"use client";
import { X, FileText, Warning, Terminal, CodeBlock, ImageSquare } from "@phosphor-icons/react";
import type { ContextAttachment, AttachmentKind } from "@/lib/stores/composer-store";

const ICONS: Record<AttachmentKind, typeof FileText> = {
  file: FileText,
  image: ImageSquare,
  error: Warning,
  tool_output: Terminal,
  code_selection: CodeBlock,
};

const COLORS: Record<AttachmentKind, string> = {
  file: "#4285F4",
  image: "#F59E0B",
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
  const isImage = attachment.kind === "image";
  const preview = isImage ? attachment.label : attachment.content.slice(0, 120).replace(/\n/g, " ");

  return (
    <div
      className="inline-flex max-w-[280px] items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
      style={{
        background: `${color}12`,
        border: `1px solid ${color}30`,
        color: "var(--color-text-secondary)",
      }}
      title={preview}
    >
      {isImage && attachment.content ? (
        <img
          src={`data:${attachment.meta?.mediaType ?? "image/png"};base64,${attachment.content}`}
          alt={attachment.label}
          className="shrink-0 rounded object-cover"
          style={{ width: 24, height: 24 }}
        />
      ) : (
        <Icon size={12} weight="bold" className="shrink-0" style={{ color }} />
      )}
      <span className="truncate font-medium" style={{ color }}>
        {attachment.label}
      </span>
      <button
        onClick={() => onRemove(attachment.id)}
        className="flex-shrink-0 cursor-pointer rounded p-0.5 transition-colors hover:bg-[rgba(0,0,0,0.1)]"
        aria-label={`Remove ${attachment.label}`}
      >
        <X size={10} weight="bold" />
      </button>
    </div>
  );
}
