"use client";

import { useMemo, useState } from "react";
import { GitDiff, CaretDown, CaretRight, File, FilePlus } from "@phosphor-icons/react";
import { InlineDiff } from "./inline-diff";

// ── Types ────────────────────────────────────────────────────────────────────

interface ToolBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface Message {
  id: string;
  toolUseBlocks?: ToolBlock[];
}

interface FileChange {
  filePath: string;
  fileName: string;
  kind: "edit" | "create";
  oldContent: string;
  newContent: string;
  messageIndex: number;
}

interface ChangesPanelProps {
  messages: Message[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractChanges(messages: Message[]): FileChange[] {
  const changes: FileChange[] = [];

  messages.forEach((msg, msgIdx) => {
    if (!msg.toolUseBlocks) return;

    for (const tool of msg.toolUseBlocks) {
      const input = tool.input;

      // Edit tool
      if (input.file_path && input.old_string !== undefined && input.new_string !== undefined) {
        const filePath = String(input.file_path);
        changes.push({
          filePath,
          fileName: filePath.split(/[\\/]/).pop() ?? filePath,
          kind: "edit",
          oldContent: String(input.old_string),
          newContent: String(input.new_string),
          messageIndex: msgIdx,
        });
      }

      // Write tool (new file or full overwrite)
      if (
        (input.file_path || input.path) &&
        input.content !== undefined &&
        input.old_string === undefined
      ) {
        const filePath = String(input.file_path ?? input.path);
        changes.push({
          filePath,
          fileName: filePath.split(/[\\/]/).pop() ?? filePath,
          kind: "create",
          oldContent: "",
          newContent: String(input.content),
          messageIndex: msgIdx,
        });
      }
    }
  });

  return changes;
}

function groupByFile(changes: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();
  for (const change of changes) {
    const existing = groups.get(change.filePath) ?? [];
    existing.push(change);
    groups.set(change.filePath, existing);
  }
  return groups;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ChangesPanel({ messages }: ChangesPanelProps) {
  const changes = useMemo(() => extractChanges(messages), [messages]);
  const grouped = useMemo(() => groupByFile(changes), [changes]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12">
        <GitDiff size={28} />
        <p className="text-center text-xs">No file changes yet</p>
      </div>
    );
  }

  const totalEdits = changes.filter((c) => c.kind === "edit").length;
  const totalCreates = changes.filter((c) => c.kind === "create").length;

  return (
    <div className="flex flex-col gap-0">
      {/* Summary header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <GitDiff size={14} weight="bold" style={{ color: "#4285F4" }} />
        <span className="text-xs font-semibold">
          {grouped.size} file{grouped.size !== 1 ? "s" : ""} changed
        </span>
        <span className="font-mono text-xs">
          {totalEdits > 0 && (
            <span style={{ color: "#FBBC04" }}>
              {totalEdits} edit{totalEdits !== 1 ? "s" : ""}
            </span>
          )}
          {totalEdits > 0 && totalCreates > 0 && " · "}
          {totalCreates > 0 && <span style={{ color: "#34A853" }}>{totalCreates} new</span>}
        </span>
      </div>

      {/* File list */}
      <div className="flex flex-col">
        {Array.from(grouped.entries()).map(([filePath, fileChanges]) => {
          const expanded = expandedFiles.has(filePath);
          const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
          const hasCreate = fileChanges.some((c) => c.kind === "create");
          const editCount = fileChanges.filter((c) => c.kind === "edit").length;

          return (
            <div key={filePath}>
              {/* File header */}
              <button
                onClick={() => toggleFile(filePath)}
                className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left transition-colors"
                style={{ boxShadow: "0 1px 0 var(--color-border)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
                aria-expanded={expanded}
              >
                {expanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
                {hasCreate ? (
                  <FilePlus size={13} weight="bold" style={{ color: "#34A853" }} />
                ) : (
                  <File size={13} weight="bold" style={{ color: "#FBBC04" }} />
                )}
                <span className="flex-1 truncate font-mono text-xs" title={filePath}>
                  {fileName}
                </span>
                <span className="shrink-0 font-mono text-xs">
                  {editCount > 0 ? `${editCount}×` : "new"}
                </span>
              </button>

              {/* Expanded diffs */}
              {expanded && (
                <div className="flex flex-col gap-2 px-2 py-2">
                  {fileChanges.map((change, i) => (
                    <InlineDiff
                      key={`${change.filePath}-${i}`}
                      filePath={change.filePath}
                      oldContent={change.oldContent}
                      newContent={change.newContent}
                      defaultExpanded
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
