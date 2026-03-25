"use client";
import { useState } from "react";
import { GitDiff, CaretRight, CaretDown, File } from "@phosphor-icons/react";
import { computeDiff, extractHunks } from "../../lib/diff-utils";
import type { DiffLine } from "../../lib/diff-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InlineDiffProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  defaultExpanded?: boolean;
}

// ── Inline Diff Component ─────────────────────────────────────────────────────

export function InlineDiff({
  filePath,
  oldContent,
  newContent,
  defaultExpanded,
}: InlineDiffProps) {
  const allLines = computeDiff(oldContent, newContent);
  const displayLines = extractHunks(allLines);

  const additions = allLines.filter((l) => l.type === "add").length;
  const removals = allLines.filter((l) => l.type === "remove").length;
  const totalChanged = additions + removals;

  const autoCollapse = defaultExpanded === undefined ? totalChanged > 20 : !defaultExpanded;
  const [expanded, setExpanded] = useState(!autoCollapse);

  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  return (
    <div
      className="my-1.5 rounded-lg overflow-hidden"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs cursor-pointer"
        style={{ color: "var(--color-text-secondary)" }}
        aria-expanded={expanded}
        aria-label={`Toggle diff for ${fileName}`}
      >
        <GitDiff size={14} weight="bold" style={{ color: "#4285F4" }} />
        <File size={12} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
        <code
          className="font-mono truncate flex-1 text-left"
          style={{ color: "#4285F4" }}
          title={filePath}
        >
          {filePath}
        </code>
        {additions > 0 && (
          <span className="font-mono font-semibold" style={{ color: "#34A853" }}>
            +{additions}
          </span>
        )}
        {removals > 0 && (
          <span className="font-mono font-semibold" style={{ color: "#ef4444" }}>
            -{removals}
          </span>
        )}
        {!expanded && totalChanged > 0 && (
          <span className="opacity-50 text-xs" style={{ whiteSpace: "nowrap" }}>
            {totalChanged} line{totalChanged !== 1 ? "s" : ""} changed
          </span>
        )}
        {expanded ? (
          <CaretDown size={12} className="flex-shrink-0" />
        ) : (
          <CaretRight size={12} className="flex-shrink-0" />
        )}
      </button>

      {/* Diff body */}
      {expanded && (
        <div
          className="overflow-x-auto max-h-[400px] overflow-y-auto"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {displayLines.length === 0 ? (
            <div
              className="px-3 py-2 text-xs font-mono"
              style={{ color: "var(--color-text-muted)" }}
            >
              No changes
            </div>
          ) : (
            displayLines.map((line, idx) => {
              const bg =
                line.type === "add"
                  ? "rgba(52, 168, 83, 0.12)"
                  : line.type === "remove"
                  ? "rgba(234, 67, 53, 0.12)"
                  : "transparent";
              const borderLeft =
                line.type === "add"
                  ? "3px solid #34A853"
                  : line.type === "remove"
                  ? "3px solid #EA4335"
                  : "3px solid transparent";
              const prefix =
                line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
              const prefixColor =
                line.type === "add"
                  ? "#34A853"
                  : line.type === "remove"
                  ? "#EA4335"
                  : "var(--color-text-muted)";

              return (
                <div
                  key={idx}
                  className="flex font-mono leading-5"
                  style={{ background: bg, borderLeft, fontSize: 12 }}
                >
                  <span
                    className="select-none text-right px-1.5 flex-shrink-0"
                    style={{
                      width: 36,
                      color: "var(--color-text-muted)",
                      opacity: 0.5,
                    }}
                  >
                    {line.type !== "add" ? line.oldNum : ""}
                  </span>
                  <span
                    className="select-none text-right px-1.5 flex-shrink-0"
                    style={{
                      width: 36,
                      color: "var(--color-text-muted)",
                      opacity: 0.5,
                    }}
                  >
                    {line.type !== "remove" ? line.newNum : ""}
                  </span>
                  <span
                    className="select-none flex-shrink-0 px-1 font-semibold"
                    style={{ color: prefixColor }}
                  >
                    {prefix}
                  </span>
                  <span
                    className="whitespace-pre-wrap break-all pr-2"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {line.content}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
