"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Copy, Check, PaperPlaneTilt } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import { useComposerStore } from "@/lib/stores/composer-store";

interface FileViewerProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

export function FileViewer({ filePath, fileName, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);  
    setContent(null);  

    api.fs
      .read(filePath)
      .then((res) => setContent(res.data.content))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [filePath]);

  const handleCopy = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  const addAttachment = useComposerStore((s) => s.addAttachment);

  const handleSendToAI = useCallback(() => {
    if (!content) return;
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    addAttachment({
      kind: "file",
      label: fileName,
      content,
      meta: { filePath, language: ext },
    });
  }, [content, fileName, filePath, addAttachment]);

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isMarkdown = ext === "md";

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--color-bg-base)",
        borderLeft: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{
          background: "var(--color-bg-elevated)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-xs font-mono font-semibold truncate"
            style={{ color: "var(--color-text-primary)" }}
            title={filePath}
          >
            {fileName}
          </span>
          {isMarkdown && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                background: "#4285F420",
                color: "#4285F4",
                fontSize: 10,
              }}
            >
              MD
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleSendToAI}
            disabled={!content}
            className="p-1 rounded cursor-pointer transition-colors hover:brightness-125"
            style={{ color: "#34A853" }}
            aria-label="Send to AI"
            title="Send to AI"
          >
            <PaperPlaneTilt size={14} weight="bold" />
          </button>
          <button
            onClick={handleCopy}
            disabled={!content}
            className="p-1 rounded cursor-pointer transition-colors"
            style={{ color: copied ? "#34A853" : "var(--color-text-muted)" }}
            aria-label="Copy file contents"
          >
            {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close file viewer"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-3 py-3">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Loading...
            </span>
          </div>
        )}
        {error && (
          <div
            className="text-xs p-3 rounded-lg"
            style={{
              background: "#EA433510",
              border: "1px solid #EA433530",
              color: "#EA4335",
            }}
          >
            {error}
          </div>
        )}
        {content !== null && !loading && (
          isMarkdown ? (
            <MarkdownMessage content={content} compact />
          ) : (
            <pre
              className="overflow-auto m-0 whitespace-pre-wrap"
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-secondary)",
              }}
            >
              {content}
            </pre>
          )
        )}
      </div>

      {/* Footer — file path */}
      <div
        className="px-3 py-1.5 shrink-0"
        style={{
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-bg-elevated)",
        }}
      >
        <span
          className="text-xs font-mono truncate block"
          style={{ color: "var(--color-text-muted)", fontSize: 10 }}
          title={filePath}
        >
          {filePath}
        </span>
      </div>
    </div>
  );
}
