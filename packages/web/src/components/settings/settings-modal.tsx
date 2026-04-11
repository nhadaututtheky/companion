"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { useAnimatePresence } from "@/lib/animation";
import { useUiStore } from "@/lib/stores/ui-store";
import type { SettingsTab } from "@/types/settings";
import {
  TABS,
  GeneralTab,
  DomainTab,
  AIProviderTab,
  TelegramTab,
  AppearanceTab,
} from "./settings-tabs";
import { McpSettings } from "./mcp-settings";
import { RTKSettings } from "./rtk-settings";
import { SkillsTab } from "./skills-tab";

// ─── Tab Content Renderer ──────────────────────────────────────────────

function TabContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case "general":
      return <GeneralTab />;
    case "domain":
      return <DomainTab />;
    case "ai":
      return <AIProviderTab />;
    case "telegram":
      return <TelegramTab />;
    case "mcp":
      return <McpSettings />;
    case "rtk":
      return <RTKSettings />;
    case "appearance":
      return <AppearanceTab />;
    case "skills":
      return <SkillsTab />;
    default:
      return null;
  }
}

// ─── Modal Inner ───────────────────────────────────────────────────────

function SettingsModalInner({ onClose }: { onClose: () => void }) {
  const activeTab = useUiStore((s) => s.settingsActiveTab);
  const setActiveTab = useUiStore((s) => s.setSettingsActiveTab);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape key — use stopImmediatePropagation so lower-z modals don't also close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Only close if no higher-z modal is open (e.g., command palette)
        const store = useUiStore.getState();
        if (store.commandPaletteOpen) return; // let command palette handle it
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey, true); // capture phase
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    dialog.addEventListener("keydown", handleTab);
    // Auto-focus first focusable element
    const firstFocusable = dialog.querySelector<HTMLElement>("button, input");
    firstFocusable?.focus();

    return () => dialog.removeEventListener("keydown", handleTab);
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="flex flex-col overflow-hidden rounded-2xl"
      style={{
        width: "min(calc(100vw - 32px), 1100px)",
        height: "min(85vh, calc(100vh - 32px))",
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border: "1px solid var(--glass-border)",
        boxShadow: "var(--shadow-float)",
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}
        >
          Settings
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label="Close settings"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar tabs */}
        <nav
          role="tablist"
          aria-label="Settings sections"
          className="shrink-0 overflow-y-auto py-2 hidden sm:block"
          style={{
            width: 200,
            borderRight: "1px solid var(--glass-border)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-all cursor-pointer"
              style={{
                color: activeTab === tab.id ? "var(--color-accent)" : "var(--color-text-secondary)",
                background:
                  activeTab === tab.id
                    ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                    : "transparent",
                fontWeight: activeTab === tab.id ? 600 : 400,
                borderRadius: "var(--radius-md)",
                margin: "0 8px",
              }}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Mobile tab selector (visible below sm breakpoint) */}
        <div
          className="sm:hidden shrink-0 px-4 py-2 overflow-x-auto flex gap-1"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap rounded-full transition-all cursor-pointer"
              style={{
                color: activeTab === tab.id ? "var(--color-accent)" : "var(--color-text-secondary)",
                background:
                  activeTab === tab.id
                    ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                    : "transparent",
                fontWeight: activeTab === tab.id ? 600 : 400,
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right content area */}
        <div className="flex-1 overflow-y-auto min-h-0" role="tabpanel">
          <div className="max-w-4xl py-6 px-4 sm:py-8 sm:px-6">
            <TabContent tab={activeTab} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Portal Modal ──────────────────────────────────────────────────────

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsModalOpen);
  const setOpen = useUiStore((s) => s.setSettingsModalOpen);
  const [mounted, setMounted] = useState(false);
  const { shouldRender, animationState } = useAnimatePresence(open, 200, 150);

  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: SettingsTab }>).detail;
      if (detail?.tab) useUiStore.getState().setSettingsActiveTab(detail.tab);
      setOpen(true);
    };
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, [setOpen]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional SSR hydration guard
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !shouldRender) return null;

  const isEntered = animationState === "entered";
  const backdropStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.55)",
    backdropFilter: "blur(6px)",
    opacity: isEntered ? 1 : 0,
    transition: "opacity 200ms ease",
  };

  const panelStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 71,
    opacity: isEntered ? 1 : 0,
    transform: isEntered ? "scale(1) translateY(0)" : "scale(0.96) translateY(4px)",
    transition: "opacity 200ms ease, transform 200ms ease",
  };

  return createPortal(
    <div style={backdropStyle} onClick={handleClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <SettingsModalInner onClose={handleClose} />
      </div>
    </div>,
    document.body,
  );
}
