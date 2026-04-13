"use client";
import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { Z } from "@/lib/z-index";

interface SlashCommand {
  command: string;
  description: string;
  usage?: string;
  category: "session" | "research" | "agent" | "info";
}

const SLASH_COMMANDS: SlashCommand[] = [
  // Session
  {
    command: "/clear",
    description: "Reset context — keep session, clear conversation history",
    category: "session",
  },
  {
    command: "/compact",
    description: "Compress context window to free up space",
    category: "session",
  },
  // Research & Intelligence
  {
    command: "/docs",
    description: "Fetch documentation from a URL",
    usage: "/docs <URL> [--refresh]",
    category: "research",
  },
  {
    command: "/research",
    description: "Search the web for information",
    usage: "/research <query>",
    category: "research",
  },
  {
    command: "/crawl",
    description: "Crawl a website and extract content",
    usage: "/crawl <URL> [--depth N] [--max N]",
    category: "research",
  },
  // Agent
  {
    command: "/spawn",
    description: "Spawn a child agent",
    usage: '/spawn "<name>" [--role specialist|researcher|reviewer] [--model MODEL]',
    category: "agent",
  },
  // Info
  { command: "/status", description: "Show current session status", category: "info" },
];

const CATEGORY_LABELS: Record<string, string> = {
  research: "Research & Intelligence",
  agent: "Agent",
  info: "Info",
  session: "Session",
};

const CATEGORY_ORDER = ["research", "agent", "info", "session"];

interface SlashCommandMenuProps {
  query: string;
  visible: boolean;
  onSelect: (command: string) => void;
  onClose: () => void;
  /** Ref to the parent so we can position relative */
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function SlashCommandMenu({
  query,
  visible,
  onSelect,
  onClose,
  anchorRef,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = SLASH_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().includes(query.toLowerCase()),
  );

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Group by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    commands: filtered.filter((c) => c.category === cat),
  })).filter((g) => g.commands.length > 0);

  const flatList = grouped.flatMap((g) => g.commands);

  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (!visible || flatList.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % flatList.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + flatList.length) % flatList.length);
      } else if (e.key === "Tab" || e.key === "Enter") {
        if (flatList[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(flatList[selectedIndex].command);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [visible, flatList, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (visible) {
      // Use capture phase to intercept before textarea handlers
      document.addEventListener("keydown", handleKeyDown, true);
      return () => document.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [visible, handleKeyDown]);

  if (!visible || flatList.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        marginBottom: 4,
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-lg)",
        maxHeight: 280,
        overflowY: "auto",
        zIndex: Z.popover,
      }}
    >
      <div className="py-1.5">
        {grouped.map((group) => (
          <div key={group.category}>
            <div
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)", fontSize: 10 }}
            >
              {group.label}
            </div>
            {group.commands.map((cmd) => {
              const idx = flatList.indexOf(cmd);
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.command}
                  className="w-full text-left px-3 py-2 flex items-start gap-3 cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? "var(--color-bg-hover)" : "transparent",
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => onSelect(cmd.command)}
                >
                  <span
                    className="text-sm font-mono font-semibold flex-shrink-0"
                    style={{ color: "var(--color-accent)", minWidth: 80 }}
                  >
                    {cmd.command}
                  </span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                      {cmd.description}
                    </span>
                    {cmd.usage && (
                      <span
                        className="text-xs font-mono truncate"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {cmd.usage}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
