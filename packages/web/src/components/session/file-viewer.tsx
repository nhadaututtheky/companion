"use client";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { X, Copy, Check, PaperPlaneTilt } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import { useComposerStore } from "@/lib/stores/composer-store";

const CodeViewer = dynamic(() => import("./code-viewer").then((m) => ({ default: m.CodeViewer })), {
  ssr: false,
  loading: () => <CodeViewerFallback />,
});

function CodeViewerFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <span className="text-xs">Loading editor...</span>
    </div>
  );
}

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
      className="bg-bg-base flex h-full flex-col"
      style={{
        borderLeft: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        className="bg-bg-elevated flex shrink-0 items-center justify-between px-3 py-2"
        style={{
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs font-semibold" title={filePath}>
            {fileName}
          </span>
          {isMarkdown && (
            <span
              className="rounded px-1.5 py-0.5 text-xs"
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={handleSendToAI}
            disabled={!content}
            className="cursor-pointer rounded p-1 transition-colors hover:brightness-125"
            style={{ color: "#34A853" }}
            aria-label="Send to AI"
            title="Send to AI"
          >
            <PaperPlaneTilt size={14} weight="bold" />
          </button>
          <button
            onClick={handleCopy}
            disabled={!content}
            className="cursor-pointer rounded p-1 transition-colors"
            style={{ color: copied ? "#34A853" : "var(--color-text-muted)" }}
            aria-label="Copy file contents"
          >
            {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer rounded p-1 transition-colors"
            aria-label="Close file viewer"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-3 py-3">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs">Loading...</span>
          </div>
        )}
        {error && (
          <div
            className="rounded-lg p-3 text-xs"
            style={{
              background: "#EA433510",
              border: "1px solid #EA433530",
              color: "#EA4335",
            }}
          >
            {error}
          </div>
        )}
        {content !== null &&
          !loading &&
          (isMarkdown ? (
            <MarkdownMessage content={content} compact />
          ) : (
            <CodeViewer content={content} fileName={fileName} />
          ))}
      </div>

      {/* Footer — file path */}
      <div
        className="bg-bg-elevated shrink-0 px-3 py-1.5"
        style={{
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <span
          className="text-text-muted block truncate font-mono text-xs"
          style={{ fontSize: 10 }}
          title={filePath}
        >
          {filePath}
        </span>
      </div>
    </div>
  );
}
