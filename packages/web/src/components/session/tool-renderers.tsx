"use client";
import { type ReactNode } from "react";
import {
  Terminal,
  FileCode,
  MagnifyingGlass,
  FolderOpen,
  Pencil,
  FloppyDisk,
  Globe,
  Wrench,
  FileText,
  TreeStructure,
} from "@phosphor-icons/react";
import { InlineDiff } from "./inline-diff";

// ── Types ────────────────────────────────────────────────────────────────────

interface ToolMeta {
  icon: ReactNode;
  color: string;
  summary: (input: Record<string, unknown>) => string;
}

// ── Tool Registry ────────────────────────────────────────────────────────────

const TOOL_META: Record<string, ToolMeta> = {
  Bash: {
    icon: <Terminal size={14} weight="bold" />,
    color: "#34A853",
    summary: (input) => {
      const cmd = String(input.command ?? "");
      return cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
    },
  },
  Read: {
    icon: <FileCode size={14} weight="bold" />,
    color: "#4285F4",
    summary: (input) => {
      const p = String(input.file_path ?? "");
      const name = p.split(/[\\/]/).pop() ?? p;
      const parts: string[] = [name];
      if (input.offset) parts.push(`L${input.offset}`);
      if (input.limit) parts.push(`${input.limit} lines`);
      return parts.join(" · ");
    },
  },
  Edit: {
    icon: <Pencil size={14} weight="bold" />,
    color: "#FBBC04",
    summary: (input) => {
      const p = String(input.file_path ?? "");
      return p.split(/[\\/]/).pop() ?? p;
    },
  },
  Write: {
    icon: <FloppyDisk size={14} weight="bold" />,
    color: "#A855F7",
    summary: (input) => {
      const p = String(input.file_path ?? input.path ?? "");
      return p.split(/[\\/]/).pop() ?? p;
    },
  },
  Grep: {
    icon: <MagnifyingGlass size={14} weight="bold" />,
    color: "#22D3EE",
    summary: (input) => {
      const parts: string[] = [];
      if (input.pattern) parts.push(`/${input.pattern}/`);
      if (input.glob) parts.push(`in ${input.glob}`);
      else if (input.path) parts.push(`in ${String(input.path).split(/[\\/]/).pop()}`);
      return parts.join(" ") || "search";
    },
  },
  Glob: {
    icon: <FolderOpen size={14} weight="bold" />,
    color: "#F97316",
    summary: (input) => {
      return String(input.pattern ?? "");
    },
  },
  WebFetch: {
    icon: <Globe size={14} weight="bold" />,
    color: "#60A5FA",
    summary: (input) => {
      try {
        return new URL(String(input.url ?? "")).hostname;
      } catch {
        return String(input.url ?? "").slice(0, 60);
      }
    },
  },
  WebSearch: {
    icon: <Globe size={14} weight="bold" />,
    color: "#60A5FA",
    summary: (input) => String(input.query ?? ""),
  },
  TodoWrite: {
    icon: <TreeStructure size={14} weight="bold" />,
    color: "#10B981",
    summary: () => "update tasks",
  },
};

const DEFAULT_META: ToolMeta = {
  icon: <Wrench size={14} weight="bold" />,
  color: "#4285F4",
  summary: (input) => {
    return Object.entries(input)
      .slice(0, 2)
      .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 30)}`)
      .join(", ");
  },
};

/** Get tool icon, color, and summary generator */
export function getToolMeta(toolName: string): ToolMeta {
  return TOOL_META[toolName] ?? DEFAULT_META;
}

// ── Tool Input Renderers ─────────────────────────────────────────────────────

export function ToolInputRenderer({
  toolName,
  input,
}: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  switch (toolName) {
    case "Edit":
      if (input.file_path && input.old_string !== undefined && input.new_string !== undefined) {
        return (
          <InlineDiff
            filePath={String(input.file_path)}
            oldContent={String(input.old_string)}
            newContent={String(input.new_string)}
          />
        );
      }
      break;

    case "Write":
      if ((input.file_path || input.path) && input.content !== undefined) {
        const path = String(input.file_path ?? input.path);
        return <InlineDiff filePath={path} oldContent="" newContent={String(input.content)} />;
      }
      break;

    case "Bash":
      return (
        <div
          className="rounded-md px-3 py-2 font-mono text-xs"
          style={{ background: "rgba(0,0,0,0.3)" }}
        >
          <span className="select-none" style={{ color: "#34A853" }}>
            ${" "}
          </span>
          <span className="text-text-primary">{String(input.command ?? "").slice(0, 2000)}</span>
        </div>
      );

    case "Read":
      return (
        <div className="flex items-center gap-2">
          <FileText size={12} weight="bold" style={{ color: "#4285F4" }} />
          <code className="font-mono text-xs" style={{ color: "#4285F4" }}>
            {String(input.file_path ?? "")}
          </code>
          {input.offset != null && (
            <span className="text-text-muted text-xs">
              L{String(input.offset)}
              {input.limit ? `–${Number(input.offset) + Number(input.limit)}` : ""}
            </span>
          )}
        </div>
      );

    case "Grep":
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="rounded px-1.5 py-0.5 font-mono text-xs"
              style={{ background: "rgba(34,211,238,0.1)", color: "#22D3EE" }}
            >
              /{String(input.pattern ?? "")}/
            </code>
            {input.glob != null && (
              <span className="text-text-muted text-xs">in {String(input.glob)}</span>
            )}
            {input.path != null && (
              <span className="text-text-muted text-xs">in {String(input.path)}</span>
            )}
          </div>
        </div>
      );

    case "Glob":
      return (
        <div className="flex items-center gap-2">
          <code
            className="rounded px-1.5 py-0.5 font-mono text-xs"
            style={{ background: "rgba(249,115,22,0.1)", color: "#F97316" }}
          >
            {String(input.pattern ?? "")}
          </code>
          {input.path != null && (
            <span className="text-text-muted text-xs">in {String(input.path)}</span>
          )}
        </div>
      );
  }

  // Fallback: generic JSON
  const str = JSON.stringify(input, null, 2);
  return (
    <pre className="text-text-secondary m-0 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono text-xs">
      {str.slice(0, 3000)}
    </pre>
  );
}

// ── Tool Output Renderers ────────────────────────────────────────────────────

export function ToolOutputRenderer({
  toolName,
  content,
  isError,
}: {
  toolName: string;
  content: string;
  isError?: boolean;
}) {
  const truncated = content.length > 5000;
  const text = truncated ? content.slice(0, 5000) : content;

  if (isError) {
    return (
      <pre
        className="m-0 max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono text-xs"
        style={{ color: "#ef4444" }}
      >
        {text}
        {truncated && "\n... (truncated)"}
      </pre>
    );
  }

  switch (toolName) {
    case "Bash":
      return <BashOutput content={text} truncated={truncated} />;
    case "Read":
      return <ReadOutput content={text} truncated={truncated} />;
    case "Grep":
      return <GrepOutput content={text} truncated={truncated} />;
    case "Glob":
      return <GlobOutput content={text} truncated={truncated} />;
    default:
      return (
        <pre className="text-text-secondary m-0 max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono text-xs">
          {text}
          {truncated && "\n... (truncated)"}
        </pre>
      );
  }
}

// ── Bash Output ──────────────────────────────────────────────────────────────

function BashOutput({ content, truncated }: { content: string; truncated: boolean }) {
  return (
    <div
      className="max-h-[300px] overflow-y-auto rounded-md font-mono text-xs"
      style={{ background: "rgba(0,0,0,0.25)" }}
    >
      <pre className="m-0 whitespace-pre-wrap px-3 py-2" style={{ color: "#e0e0e0" }}>
        {content}
        {truncated && <span className="text-text-muted">{"\n... (truncated)"}</span>}
      </pre>
    </div>
  );
}

// ── Read Output (code block with line numbers) ───────────────────────────────

function ReadOutput({ content, truncated }: { content: string; truncated: boolean }) {
  const lines = content.split("\n");
  // Detect cat -n format: lines start with optional spaces + number + tab
  const isCatN = lines.length > 1 && /^\s*\d+\t/.test(lines[0] ?? "");

  if (!isCatN) {
    return (
      <div
        className="max-h-[300px] overflow-x-auto overflow-y-auto rounded-md"
        style={{ background: "rgba(0,0,0,0.2)" }}
      >
        <pre className="text-text-primary m-0 whitespace-pre px-3 py-2 font-mono text-xs">
          {content}
          {truncated && <span className="text-text-muted">{"\n... (truncated)"}</span>}
        </pre>
      </div>
    );
  }

  return (
    <div
      className="max-h-[300px] overflow-x-auto overflow-y-auto rounded-md"
      style={{ background: "rgba(0,0,0,0.2)" }}
    >
      {lines
        .filter((l) => l.length > 0)
        .map((line, idx) => {
          const match = line.match(/^(\s*\d+)\t(.*)/);
          const lineNum = match?.[1]?.trim() ?? String(idx + 1);
          const code = match?.[2] ?? line;

          return (
            <div key={idx} className="flex font-mono leading-5" style={{ fontSize: 12 }}>
              <span
                className="text-text-muted flex-shrink-0 select-none px-2 text-right"
                style={{
                  width: 40,
                  opacity: 0.4,
                }}
              >
                {lineNum}
              </span>
              <span className="text-text-primary whitespace-pre pr-3">{code}</span>
            </div>
          );
        })}
      {truncated && <div className="text-text-muted px-3 py-1 text-xs">... (truncated)</div>}
    </div>
  );
}

// ── Grep Output (grouped by file) ────────────────────────────────────────────

function GrepOutput({ content, truncated }: { content: string; truncated: boolean }) {
  const lines = content.split("\n").filter(Boolean);

  // Try to detect ripgrep file_path:line_num:content format
  const hasFileMatches = lines.some((l) => /^.+:\d+:/.test(l));

  if (!hasFileMatches) {
    // Fallback: might be files_with_matches mode (just file paths)
    const isFileList = lines.every(
      (l) => !l.includes("\t") && (l.includes("/") || l.includes("\\")),
    );
    if (isFileList && lines.length > 0) {
      return <GlobOutput content={content} truncated={truncated} />;
    }

    return (
      <pre className="text-text-secondary m-0 max-h-[300px] overflow-y-auto whitespace-pre-wrap font-mono text-xs">
        {content}
        {truncated && "\n... (truncated)"}
      </pre>
    );
  }

  // Group by file
  const groups: Map<string, Array<{ line: string; num: string; text: string }>> = new Map();
  for (const l of lines) {
    const match = l.match(/^(.+?):(\d+):(.*)/);
    if (match) {
      const [, file, num, text] = match;
      if (!groups.has(file!)) groups.set(file!, []);
      groups.get(file!)!.push({ line: l, num: num!, text: text! });
    }
  }

  return (
    <div className="max-h-[300px] space-y-1 overflow-y-auto">
      {Array.from(groups.entries()).map(([file, matches]) => (
        <div key={file}>
          <div
            className="bg-bg-elevated sticky top-0 px-2 py-1 font-mono text-xs"
            style={{ color: "#4285F4" }}
          >
            {file}
          </div>
          {matches.map((m, idx) => (
            <div key={idx} className="flex font-mono leading-5" style={{ fontSize: 12 }}>
              <span
                className="flex-shrink-0 select-none px-2 text-right"
                style={{ width: 40, color: "#22D3EE", opacity: 0.7 }}
              >
                {m.num}
              </span>
              <span className="text-text-primary whitespace-pre-wrap pr-2">{m.text}</span>
            </div>
          ))}
        </div>
      ))}
      {truncated && <div className="text-text-muted px-3 py-1 text-xs">... (truncated)</div>}
    </div>
  );
}

// ── Glob Output (file list) ──────────────────────────────────────────────────

function GlobOutput({ content, truncated }: { content: string; truncated: boolean }) {
  const files = content.split("\n").filter(Boolean);

  return (
    <div className="max-h-[300px] overflow-y-auto">
      {files.map((file, idx) => {
        const name = file.split(/[\\/]/).pop() ?? file;
        const dir = file.slice(0, file.length - name.length);
        return (
          <div
            key={idx}
            className="flex items-center gap-1.5 px-2 py-0.5 font-mono text-xs hover:bg-white/5"
          >
            <FileText size={11} weight="regular" className="text-text-muted shrink-0" />
            <span className="text-text-muted">{dir}</span>
            <span className="text-text-primary">{name}</span>
          </div>
        );
      })}
      {truncated && <div className="text-text-muted px-3 py-1 text-xs">... (truncated)</div>}
    </div>
  );
}
