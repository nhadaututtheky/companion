"use client";
import { useState, useMemo } from "react";
import { GitDiff, CaretDown, CaretRight, FilePlus, PencilSimple } from "@phosphor-icons/react";
import { InlineDiff } from "./inline-diff";
import { computeDiff } from "@/lib/diff-utils";

interface FileChangeEntry {
  toolId: string;
  filePath: string;
  fileName: string;
  dirPath: string;
  kind: "edit" | "create";
  oldContent: string;
  newContent: string;
  additions: number;
  deletions: number;
}

interface DiffSummaryBlockProps {
  tools: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
}

/**
 * Aggregated diff summary — groups Edit/Write tools into a single
 * file-list block with +/- counts. Click a file to expand its diff.
 */
export function DiffSummaryBlock({ tools }: DiffSummaryBlockProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const entries = useMemo(() => {
    const result: FileChangeEntry[] = [];

    for (const tool of tools) {
      const input = tool.input;

      if (
        tool.name === "Edit" &&
        input.file_path &&
        input.old_string !== undefined &&
        input.new_string !== undefined
      ) {
        const filePath = String(input.file_path);
        const oldContent = String(input.old_string);
        const newContent = String(input.new_string);
        const diff = computeDiff(oldContent, newContent);
        const additions = diff.filter((l) => l.type === "add").length;
        const deletions = diff.filter((l) => l.type === "remove").length;

        result.push({
          toolId: tool.id,
          filePath,
          fileName: filePath.split(/[\\/]/).pop() ?? filePath,
          dirPath: extractDir(filePath),
          kind: "edit",
          oldContent,
          newContent,
          additions,
          deletions,
        });
      }

      if (
        tool.name === "Write" &&
        (input.file_path || input.path) &&
        input.content !== undefined &&
        input.old_string === undefined
      ) {
        const filePath = String(input.file_path ?? input.path);
        const newContent = String(input.content);
        const additions = newContent.split("\n").length;

        result.push({
          toolId: tool.id,
          filePath,
          fileName: filePath.split(/[\\/]/).pop() ?? filePath,
          dirPath: extractDir(filePath),
          kind: "create",
          oldContent: "",
          newContent,
          additions,
          deletions: 0,
        });
      }
    }

    return result;
  }, [tools]);

  if (entries.length === 0) return null;

  const totalAdditions = entries.reduce((s, e) => s + e.additions, 0);
  const totalDeletions = entries.reduce((s, e) => s + e.deletions, 0);

  const toggleFile = (toolId: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  return (
    <div
      className="my-2 rounded-lg overflow-hidden bg-bg-elevated border border-border"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-3 py-2"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <GitDiff size={14} weight="bold" style={{ color: "#4285F4" }} />
        <span className="text-xs font-semibold text-text-primary">
          Modified{" "}
          <span className="font-mono">
            {entries.length} file{entries.length !== 1 ? "s" : ""}
          </span>
        </span>
        <span className="flex items-center gap-1.5 ml-auto font-mono text-xs">
          {totalAdditions > 0 && <span style={{ color: "#34A853" }}>+{totalAdditions}</span>}
          {totalDeletions > 0 && <span style={{ color: "#ef4444" }}>-{totalDeletions}</span>}
        </span>
        {/* Mini bar chart */}
        <DiffBar additions={totalAdditions} deletions={totalDeletions} />
      </div>

      {/* File list */}
      {entries.map((entry) => {
        const expanded = expandedFiles.has(entry.toolId);
        return (
          <div key={entry.toolId}>
            <button
              onClick={() => toggleFile(entry.toolId)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer transition-colors text-left"
              style={{
                borderBottom: expanded ? "1px solid var(--color-border)" : "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--color-bg-base)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
              aria-expanded={expanded}
            >
              {entry.kind === "create" ? (
                <FilePlus size={13} weight="bold" style={{ color: "#34A853" }} />
              ) : (
                <PencilSimple size={13} weight="bold" style={{ color: "#FBBC04" }} />
              )}
              <span className="flex-1 truncate font-mono" title={entry.filePath}>
                <span className="text-text-muted">{entry.dirPath}</span>
                <span className="text-text-primary font-semibold">
                  {entry.fileName}
                </span>
              </span>
              <span className="flex items-center gap-1.5 font-mono shrink-0">
                {entry.additions > 0 && (
                  <span style={{ color: "#34A853" }}>+{entry.additions}</span>
                )}
                {entry.deletions > 0 && (
                  <span style={{ color: "#ef4444" }}>-{entry.deletions}</span>
                )}
              </span>
              <DiffBar additions={entry.additions} deletions={entry.deletions} />
              {expanded ? (
                <CaretDown
                  size={10}
                  className="shrink-0 text-text-muted"
                />
              ) : (
                <CaretRight
                  size={10}
                  className="shrink-0 text-text-muted"
                />
              )}
            </button>

            {expanded && (
              <div className="px-2 py-2 bg-bg-base">
                <InlineDiff
                  filePath={entry.filePath}
                  oldContent={entry.oldContent}
                  newContent={entry.newContent}
                  defaultExpanded
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Mini colored bar showing add/delete ratio */
function DiffBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  if (total === 0) return null;

  const maxBlocks = 5;
  const addBlocks = Math.max(
    total > 0 ? Math.round((additions / total) * maxBlocks) : 0,
    additions > 0 ? 1 : 0,
  );
  const delBlocks = Math.max(maxBlocks - addBlocks, deletions > 0 ? 1 : 0);
  const neutralBlocks = maxBlocks - addBlocks - delBlocks;

  return (
    <span className="inline-flex gap-px shrink-0">
      {Array.from({ length: addBlocks }).map((_, i) => (
        <span
          key={`a${i}`}
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: "#34A853",
          }}
        />
      ))}
      {Array.from({ length: Math.max(0, neutralBlocks) }).map((_, i) => (
        <span
          key={`n${i}`}
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: "var(--color-border)",
          }}
        />
      ))}
      {Array.from({ length: delBlocks }).map((_, i) => (
        <span
          key={`d${i}`}
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: "#ef4444",
          }}
        />
      ))}
    </span>
  );
}

function extractDir(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  if (parts.length <= 1) return "";
  parts.pop();
  return parts.join("/") + "/";
}
