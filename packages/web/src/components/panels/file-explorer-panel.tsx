"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FolderOpen,
  File,
  FileTs,
  FileJs,
  FileCss,
  FileHtml,
  FilePy,
  FileCode,
  MagnifyingGlass,
  X,
  Copy,
  Check,
  PaperPlaneTilt,
  CaretRight,
  CaretDown,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { useComposerStore } from "@/lib/stores/composer-store";
import { useFileTabsStore } from "@/lib/stores/file-tabs-store";
import { FileTabBar } from "./file-tab-bar";
import { MarkdownMessage } from "../chat/markdown-message";

// ── File icon by extension ──────────────────────────────────────────────────

function fileIcon(ext: string, size = 14) {
  const iconProps = { size, weight: "regular" as const };
  switch (ext) {
    case "ts":
    case "tsx":
      return <FileTs {...iconProps} style={{ color: "#3178c6" }} />;
    case "js":
    case "jsx":
      return <FileJs {...iconProps} style={{ color: "#f7df1e" }} />;
    case "css":
    case "scss":
      return <FileCss {...iconProps} style={{ color: "#1572b6" }} />;
    case "html":
      return <FileHtml {...iconProps} style={{ color: "#e34f26" }} />;
    case "py":
      return <FilePy {...iconProps} style={{ color: "#3776ab" }} />;
    case "json":
    case "yaml":
    case "yml":
    case "toml":
      return <FileCode {...iconProps} style={{ color: "#8bc34a" }} />;
    case "md":
      return <File {...iconProps} style={{ color: "#4285F4" }} />;
    default:
      return <File {...iconProps} />;
  }
}

// ── Syntax-highlighted code viewer with line numbers ────────────────────────

function CodeViewer({ content, ext }: { content: string; ext: string }) {
  const lines = content.split("\n");
  const gutterWidth = String(lines.length).length * 8 + 16;

  if (ext === "md") {
    return <MarkdownMessage content={content} compact />;
  }

  return (
    <div className="flex overflow-auto font-mono" style={{ fontSize: 12, lineHeight: 1.6 }}>
      {/* Line numbers gutter */}
      <div
        className="text-text-muted bg-bg-elevated shrink-0 select-none py-2 pr-3 text-right"
        style={{
          width: gutterWidth,
          borderRight: "1px solid var(--color-border)",
          opacity: 0.6,
        }}
      >
        {lines.map((_, i) => (
          <div key={i} style={{ fontSize: 11 }}>
            {i + 1}
          </div>
        ))}
      </div>

      {/* Code content */}
      <pre className="m-0 flex-1 overflow-x-auto whitespace-pre py-2 pl-3">
        {lines.map((line, i) => (
          <div key={i}>
            <SyntaxLine line={line} ext={ext} />
          </div>
        ))}
      </pre>
    </div>
  );
}

// Simple keyword highlighting (no external dependency)
function SyntaxLine({ line, ext }: { line: string; ext: string }) {
  if (!line.trim()) return <span>{"\n"}</span>;

  // Comment detection
  const commentPatterns: Record<string, RegExp> = {
    ts: /^(\s*)(\/\/.*|\/\*.*\*\/)$/,
    tsx: /^(\s*)(\/\/.*|\/\*.*\*\/)$/,
    js: /^(\s*)(\/\/.*|\/\*.*\*\/)$/,
    jsx: /^(\s*)(\/\/.*|\/\*.*\*\/)$/,
    py: /^(\s*)(#.*)$/,
    css: /^(\s*)(\/\*.*\*\/)$/,
    yaml: /^(\s*)(#.*)$/,
    yml: /^(\s*)(#.*)$/,
    toml: /^(\s*)(#.*)$/,
    sh: /^(\s*)(#.*)$/,
    bash: /^(\s*)(#.*)$/,
  };

  const commentRegex = commentPatterns[ext];
  if (commentRegex) {
    const match = line.match(commentRegex);
    if (match) {
      return (
        <span>
          <span>{match[1]}</span>
          <span style={{ color: "#6a9955" }}>{match[2]}</span>
        </span>
      );
    }
  }

  // Keywords for JS/TS family
  const jsKeywords =
    /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|interface|type|extends|implements|async|await|new|try|catch|throw|switch|case|break|default|true|false|null|undefined|this|typeof|instanceof)\b/g;
  // Keywords for Python
  const pyKeywords =
    /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|raise|with|yield|async|await|True|False|None|self|lambda|in|not|and|or|is|pass|break|continue)\b/g;

  const keywordRegex = ["ts", "tsx", "js", "jsx"].includes(ext)
    ? jsKeywords
    : ext === "py"
      ? pyKeywords
      : null;

  // String detection
  const stringRegex = /(["'`])(?:(?!\1|\\).|\\.)*\1/g;

  if (!keywordRegex) {
    return <span>{line}</span>;
  }

  // Build highlighted spans
  type Span = { start: number; end: number; color: string };
  const spans: Span[] = [];

  // Find strings first (higher priority)
  let m: RegExpExecArray | null;
  while ((m = stringRegex.exec(line)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, color: "#ce9178" });
  }

  // Find keywords (skip if inside string)
  keywordRegex.lastIndex = 0;
  while ((m = keywordRegex.exec(line)) !== null) {
    const inString = spans.some((s) => m!.index >= s.start && m!.index < s.end);
    if (!inString) {
      spans.push({ start: m.index, end: m.index + m[0].length, color: "#569cd6" });
    }
  }

  if (spans.length === 0) return <span>{line}</span>;

  // Sort by position and render
  spans.sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let pos = 0;

  for (const span of spans) {
    if (span.start > pos) {
      parts.push(<span key={`t${pos}`}>{line.slice(pos, span.start)}</span>);
    }
    parts.push(
      <span key={`h${span.start}`} style={{ color: span.color }}>
        {line.slice(span.start, span.end)}
      </span>,
    );
    pos = span.end;
  }
  if (pos < line.length) {
    parts.push(<span key={`t${pos}`}>{line.slice(pos)}</span>);
  }

  return <span>{parts}</span>;
}

// ── Tree node ───────────────────────────────────────────────────────────────

interface TreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  ext?: string;
}

function TreeNode({
  entry,
  depth,
  selectedPath,
  onSelect,
}: {
  entry: TreeEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string, isDir: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<TreeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const isSelected = selectedPath === entry.path;

  const handleClick = useCallback(() => {
    if (entry.isDir) {
      if (!expanded && !children && !loading) {
        setLoading(true);
        api.fs
          .browse(entry.path, true)
          .then((res) => {
            const basePath = res.data.path;
            const dirs: TreeEntry[] = (res.data.dirs ?? []).map((name: string) => ({
              name,
              path: `${basePath}/${name}`,
              isDir: true,
            }));
            const files: TreeEntry[] = (res.data.files ?? []).map((name: string) => ({
              name,
              path: `${basePath}/${name}`,
              isDir: false,
              ext: name.split(".").pop()?.toLowerCase(),
            }));
            setChildren([...dirs, ...files]);
          })
          .catch(() => setChildren([]))
          .finally(() => setLoading(false));
      }
      setExpanded((prev) => !prev);
    } else {
      onSelect(entry.path, false);
    }
  }, [entry, expanded, children, loading, onSelect]);

  return (
    <div>
      <button
        onClick={handleClick}
        aria-expanded={entry.isDir ? expanded : undefined}
        aria-label={entry.isDir ? `${entry.name} folder` : entry.name}
        className="flex w-full cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left text-xs transition-colors"
        style={{
          paddingLeft: depth * 14 + 4,
          background: isSelected ? "var(--color-accent)" + "15" : "transparent",
          color: isSelected ? "var(--color-accent)" : "var(--color-text-secondary)",
          border: "none",
        }}
        draggable={!entry.isDir}
        onDragStart={(e) => {
          e.dataTransfer.setData(
            "application/x-companion-file",
            JSON.stringify({
              path: entry.path,
              name: entry.name,
              ext: entry.ext ?? "",
            }),
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
      >
        {entry.isDir ? (
          expanded ? (
            <CaretDown size={10} weight="bold" />
          ) : (
            <CaretRight size={10} weight="bold" />
          )
        ) : (
          <span style={{ width: 10 }} />
        )}
        {entry.isDir ? (
          <FolderOpen
            size={13}
            weight="regular"
            className="shrink-0"
            style={{ color: "#FBBC04" }}
          />
        ) : (
          fileIcon(entry.ext ?? "", 13)
        )}
        <span className="truncate">{entry.name}</span>
        {loading && (
          <span className="text-text-muted" style={{ fontSize: 10 }}>
            ...
          </span>
        )}
      </button>

      {expanded && children && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
          {children.length === 0 && <div className="py-0.5 pl-8 text-xs">(empty)</div>}
        </div>
      )}
    </div>
  );
}

// ── Main File Explorer Panel ────────────────────────────────────────────────

interface FileExplorerPanelProps {
  initialPath?: string;
  onClose: () => void;
}

export function FileExplorerPanel({ initialPath, onClose }: FileExplorerPanelProps) {
  const [roots, setRoots] = useState<Array<{ label: string; path: string }>>([]);
  const [currentRoot, setCurrentRoot] = useState(initialPath ?? "");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);

  const addAttachment = useComposerStore((s) => s.addAttachment);

  // File tabs store selectors (never destructure from store)
  const tabs = useFileTabsStore((s) => s.tabs);
  const activeTabId = useFileTabsStore((s) => s.activeTabId);
  const openFile = useFileTabsStore((s) => s.openFile);
  const closeTab = useFileTabsStore((s) => s.closeTab);
  const switchTab = useFileTabsStore((s) => s.switchTab);
  const setTabContent = useFileTabsStore((s) => s.setTabContent);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Load roots on mount
  useEffect(() => {
    api.fs
      .roots()
      .then((res) => {
        const r = res.data.roots ?? [];
        setRoots(r);
        if (!currentRoot && r.length > 0) {
          setCurrentRoot(r[0]!.path);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load root-level entries when currentRoot changes
  useEffect(() => {
    if (!currentRoot) return;
    api.fs
      .browse(currentRoot, true)
      .then((res) => {
        const basePath = res.data.path;
        const dirs: TreeEntry[] = (res.data.dirs ?? []).map((name: string) => ({
          name,
          path: `${basePath}/${name}`,
          isDir: true,
        }));
        const files: TreeEntry[] = (res.data.files ?? []).map((name: string) => ({
          name,
          path: `${basePath}/${name}`,
          isDir: false,
          ext: name.split(".").pop()?.toLowerCase(),
        }));
        setEntries([...dirs, ...files]);
      })
      .catch(() => setEntries([]));
  }, [currentRoot]);

  // Load file content when active tab changes or has no cached content
  useEffect(() => {
    if (!activeTab || activeTab.content !== null) return;
    setFileLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setFileError(null);
    api.fs
      .read(activeTab.path)
      .then((res) => {
        if (res.data.size && res.data.size > 500_000) {
          setFileError(`File too large (${Math.round(res.data.size / 1024)} KB)`);
          return;
        }
        setTabContent(activeTab.id, res.data.content);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to read file";
        setFileError(msg.slice(0, 200));
      })
      .finally(() => setFileLoading(false));
  }, [activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset error when active tab changes
  useEffect(() => {
    setFileError(null); // eslint-disable-line react-hooks/set-state-in-effect
  }, [activeTabId]);

  const handleSelect = useCallback(
    (path: string, isDir: boolean) => {
      if (!isDir) openFile(path);
    },
    [openFile],
  );

  const handleCopy = useCallback(() => {
    if (!activeTab?.content) return;
    navigator.clipboard.writeText(activeTab.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [activeTab]);

  const handleSendToAI = useCallback(() => {
    if (!activeTab?.content || !activeTab.path) return;
    addAttachment({
      kind: "file",
      label: activeTab.name,
      content: activeTab.content,
      meta: { filePath: activeTab.path, language: activeTab.ext },
    });
  }, [activeTab, addAttachment]);

  const filteredEntries = useMemo(() => {
    if (!filter) return entries;
    const lower = filter.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(lower));
  }, [entries, filter]);

  // Breadcrumb segments from currentRoot
  const breadcrumbs = useMemo(() => {
    if (!currentRoot) return [];
    const parts = currentRoot.replace(/\\/g, "/").split("/").filter(Boolean);
    const crumbs: Array<{ label: string; path: string }> = [];
    let acc = "";
    for (const part of parts) {
      acc += (acc ? "/" : "") + part;
      // Windows drive fix: "C:" → "C:/"
      const resolvedPath = acc.length === 2 && acc[1] === ":" ? acc + "/" : acc;
      crumbs.push({ label: part, path: resolvedPath });
    }
    return crumbs;
  }, [currentRoot]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div
        className="bg-bg-card flex shrink-0 items-center gap-2 px-3 py-2"
        style={{
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        {/* Root selector */}
        <select
          value={currentRoot}
          onChange={(e) => {
            setCurrentRoot(e.target.value);
          }}
          className="text-text-primary bg-bg-elevated border-border cursor-pointer rounded border px-2 py-1 text-xs"
          style={{
            maxWidth: 120,
          }}
          aria-label="Root directory"
        >
          {roots.map((r) => (
            <option key={r.path} value={r.path}>
              {r.label}
            </option>
          ))}
        </select>

        {/* Breadcrumbs */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-xs">
          {breadcrumbs.slice(-3).map((bc, i) => (
            <span key={bc.path} className="flex items-center gap-0.5">
              {i > 0 && <span>/</span>}
              <button
                onClick={() => {
                  setCurrentRoot(bc.path);
                }}
                className="text-text-secondary cursor-pointer truncate hover:underline"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                }}
              >
                {bc.label}
              </button>
            </span>
          ))}
        </div>

        {/* Search / filter */}
        <div className="relative">
          <MagnifyingGlass
            size={12}
            className="text-text-muted absolute"
            style={{
              left: 6,
              top: "50%",
              transform: "translateY(-50%)",
            }}
            aria-hidden="true"
          />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            className="input-bordered text-text-primary bg-bg-elevated rounded py-1 pl-6 pr-2 text-xs"
            style={{
              width: 120,
            }}
            aria-label="Filter files"
          />
        </div>

        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1"
          aria-label="Close file explorer"
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {/* Main area: tree + viewer */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tree sidebar */}
        <div
          className="shrink-0 overflow-y-auto py-1"
          style={{
            width: 250,
            borderRight: "1px solid var(--glass-border)",
            background: "var(--color-bg-sidebar, var(--color-bg-card))",
          }}
        >
          {filteredEntries.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              selectedPath={activeTabId}
              onSelect={handleSelect}
            />
          ))}
          {filteredEntries.length === 0 && (
            <div className="py-8 text-center text-xs">
              {filter ? "No matches" : "Empty directory"}
            </div>
          )}
        </div>

        {/* File viewer column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <FileTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSwitch={switchTab}
            onClose={closeTab}
          />

          {activeTab ? (
            <>
              {/* File header */}
              <div
                className="bg-bg-elevated flex shrink-0 items-center justify-between px-3 py-1.5"
                style={{
                  borderBottom: "1px solid var(--glass-border)",
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {fileIcon(activeTab.ext)}
                  <span className="truncate font-mono text-xs font-semibold">{activeTab.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={handleSendToAI}
                    disabled={!activeTab.content}
                    className="cursor-pointer rounded p-1 disabled:opacity-40"
                    style={{ color: "#34A853" }}
                    aria-label="Send file to AI composer"
                    title="Send to AI"
                  >
                    <PaperPlaneTilt size={13} weight="bold" />
                  </button>
                  <button
                    onClick={handleCopy}
                    disabled={!activeTab.content}
                    className="cursor-pointer rounded p-1 disabled:opacity-40"
                    style={{ color: copied ? "#34A853" : "var(--color-text-muted)" }}
                    aria-label="Copy file content"
                  >
                    {copied ? <Check size={13} weight="bold" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto">
                {fileLoading && (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-xs">Loading...</span>
                  </div>
                )}
                {fileError && (
                  <div
                    className="m-3 rounded-lg p-3 text-xs"
                    style={{ background: "#EA433510", color: "#EA4335" }}
                  >
                    {fileError}
                  </div>
                )}
                {activeTab.content !== null && !fileLoading && (
                  <CodeViewer content={activeTab.content} ext={activeTab.ext} />
                )}
              </div>

              {/* Footer: full path */}
              <div
                className="bg-bg-elevated shrink-0 px-3 py-1"
                style={{
                  borderTop: "1px solid var(--glass-border)",
                }}
              >
                <span className="text-text-muted font-mono" style={{ fontSize: 10 }}>
                  {activeTab.path}
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-xs">Select a file to view</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
