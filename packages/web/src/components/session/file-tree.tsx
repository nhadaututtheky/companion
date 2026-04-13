"use client";
import { useState, useCallback } from "react";
import {
  FolderSimple,
  FolderOpen,
  File,
  FileText,
  FileTs,
  FileJs,
  FileCss,
  FileHtml,
  CaretRight,
  CaretDown,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (path: string, name: string) => void;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "txt":
    case "log":
      return <FileText size={14} weight="regular" />;
    case "ts":
    case "tsx":
      return <FileTs size={14} weight="regular" />;
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return <FileJs size={14} weight="regular" />;
    case "css":
    case "scss":
      return <FileCss size={14} weight="regular" />;
    case "html":
    case "svg":
      return <FileHtml size={14} weight="regular" />;
    default:
      return <File size={14} weight="regular" />;
  }
}

function TreeItem({
  node,
  depth,
  onFileSelect,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  onFileSelect: (path: string, name: string) => void;
  onToggle: (node: TreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = useCallback(() => {
    if (node.isDir) {
      const next = !expanded;
      setExpanded(next);
      if (next && !node.loaded) {
        onToggle(node);
      }
    } else {
      onFileSelect(node.path, node.name);
    }
  }, [node, expanded, onFileSelect, onToggle]);

  return (
    <>
      <button
        onClick={handleClick}
        className="text-text-secondary flex w-full cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left transition-colors"
        style={{
          paddingLeft: depth * 16 + 4,
          fontSize: 12,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {node.isDir ? (
          <>
            <span className="text-text-muted" style={{ width: 12 }}>
              {expanded ? (
                <CaretDown size={10} weight="bold" />
              ) : (
                <CaretRight size={10} weight="bold" />
              )}
            </span>
            <span style={{ color: "#FBBC04" }}>
              {expanded ? (
                <FolderOpen size={14} weight="fill" />
              ) : (
                <FolderSimple size={14} weight="fill" />
              )}
            </span>
          </>
        ) : (
          <>
            <span style={{ width: 12 }} />
            <span>{getFileIcon(node.name)}</span>
          </>
        )}
        <span className="truncate font-mono" style={{ fontSize: 11 }}>
          {node.name}
        </span>
      </button>
      {node.isDir && expanded && node.children && (
        <>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              onToggle={onToggle}
            />
          ))}
          {node.children.length === 0 && node.loaded && (
            <div
              className="text-text-muted py-0.5 text-xs italic"
              style={{ paddingLeft: (depth + 1) * 16 + 4 }}
            >
              (empty)
            </div>
          )}
        </>
      )}
    </>
  );
}

export function FileTree({ rootPath, onFileSelect }: FileTreeProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadDir = useCallback(async (path: string): Promise<TreeNode[]> => {
    try {
      const res = await api.fs.browse(path, true);
      const dirs: TreeNode[] = res.data.dirs.map((d) => ({
        name: d,
        path: `${res.data.path}/${d}`,
        isDir: true,
        children: [],
        loaded: false,
      }));
      const files: TreeNode[] = res.data.files.map((f) => ({
        name: f,
        path: `${res.data.path}/${f}`,
        isDir: false,
      }));
      return [...dirs, ...files];
    } catch {
      return [];
    }
  }, []);

  const handleExpand = useCallback(() => {
    if (loaded || loading) return;
    setLoading(true);
    loadDir(rootPath).then((children) => {
      setRoots(children);
      setLoaded(true);
      setLoading(false);
    });
  }, [rootPath, loaded, loading, loadDir]);

  const handleToggle = useCallback(
    (node: TreeNode) => {
      if (node.loaded) return;
      loadDir(node.path).then((children) => {
        node.children = children;
        node.loaded = true;
        // Force re-render by creating a new array reference
        setRoots((prev) => [...prev]);
      });
    },
    [loadDir],
  );

  if (!loaded) {
    return (
      <button
        onClick={handleExpand}
        className="shadow-soft text-text-secondary bg-bg-elevated flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
      >
        <FolderSimple size={14} weight="bold" />
        {loading ? "Loading..." : "Browse project files"}
      </button>
    );
  }

  return (
    <div
      className="shadow-soft bg-bg-card flex flex-col overflow-hidden rounded-lg"
      style={{
        maxHeight: 300,
        overflowY: "auto",
      }}
    >
      <div
        className="text-text-muted bg-bg-elevated sticky top-0 z-10 px-3 py-1.5 text-xs font-semibold"
        style={{
          boxShadow: "0 1px 0 var(--color-border)",
        }}
      >
        {rootPath.split(/[\\/]/).pop()}
      </div>
      <div className="py-1">
        {roots.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            onFileSelect={onFileSelect}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}
