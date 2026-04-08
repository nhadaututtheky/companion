"use client";
import {
  X,
  File,
  FileTs,
  FileJs,
  FileCss,
  FileHtml,
  FilePy,
  FileCode,
} from "@phosphor-icons/react";
import type { FileTab } from "@/lib/stores/file-tabs-store";

// ── File icon by extension (mirrors file-explorer-panel logic) ───────────────

function fileTabIcon(ext: string) {
  const props = { size: 12, weight: "regular" as const };
  switch (ext) {
    case "ts":
    case "tsx":
      return <FileTs {...props} style={{ color: "#3178c6" }} />;
    case "js":
    case "jsx":
      return <FileJs {...props} style={{ color: "#f7df1e" }} />;
    case "css":
    case "scss":
      return <FileCss {...props} style={{ color: "#1572b6" }} />;
    case "html":
      return <FileHtml {...props} style={{ color: "#e34f26" }} />;
    case "py":
      return <FilePy {...props} style={{ color: "#3776ab" }} />;
    case "json":
    case "yaml":
    case "yml":
    case "toml":
      return <FileCode {...props} style={{ color: "#8bc34a" }} />;
    case "md":
      return <File {...props} style={{ color: "#4285F4" }} />;
    default:
      return <File {...props} />;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FileTabBarProps {
  tabs: FileTab[];
  activeTabId: string | null;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function FileTabBar({ tabs, activeTabId, onSwitch, onClose }: FileTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div
      className="flex overflow-x-auto shrink-0"
      role="tablist"
      aria-label="Open file tabs"
      style={{
        background: "var(--color-bg-elevated)",
        borderBottom: "1px solid var(--glass-border)",
        scrollbarWidth: "none",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.name}
            onClick={() => onSwitch(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.id);
              }
            }}
            className="group relative flex items-center gap-1.5 px-3 shrink-0 cursor-pointer select-none"
            style={{
              height: 32,
              fontSize: 11,
              maxWidth: 160,
              border: "none",
              borderRight: "1px solid var(--glass-border)",
              borderBottom: isActive ? "2px solid var(--color-accent)" : "2px solid transparent",
              background: isActive ? "var(--color-bg-card)" : "var(--color-bg-elevated)",
              color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
              outline: "none",
              transition: "color 150ms ease, background 150ms ease",
            }}
          >
            {/* Icon */}
            <span className="shrink-0" aria-hidden="true">
              {fileTabIcon(tab.ext)}
            </span>

            {/* Name */}
            <span className="truncate" style={{ maxWidth: 100, fontFamily: "var(--font-mono)" }}>
              {tab.name}
            </span>

            {/* Close button */}
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="shrink-0 flex items-center justify-center rounded cursor-pointer"
              style={{
                width: 14,
                height: 14,
                opacity: isActive ? 1 : 0,
                color: "var(--color-text-muted)",
                transition: "opacity 150ms ease",
              }}
              // Show close button for all tabs on hover via CSS class trick
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.opacity = "0";
                }
              }}
            >
              <X size={10} weight="bold" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
