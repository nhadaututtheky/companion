"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Z } from "@/lib/z-index";
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
import { PluginsTab } from "./plugins-tab";
import { AccountsTab } from "./accounts-tab";
import { DesktopTab } from "./settings-tab-desktop";
import { isTauriEnv } from "@/lib/tauri";

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
    case "plugins":
      return <PluginsTab />;
    case "accounts":
      return <AccountsTab />;
    case "desktop":
      return <DesktopTab />;
    default:
      return null;
  }
}

// ─── Modal Inner ───────────────────────────────────────────────────────

function SettingsModalInner({ onClose }: { onClose: () => void }) {
  const activeTab = useUiStore((s) => s.settingsActiveTab);
  const setActiveTab = useUiStore((s) => s.setSettingsActiveTab);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isDesktop = isTauriEnv();
  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.desktopOnly || isDesktop),
    [isDesktop],
  );

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
      className="shadow-float flex flex-col overflow-hidden rounded-2xl"
      style={{
        width: "min(calc(100vw - 32px), 1100px)",
        height: "min(85vh, calc(100vh - 32px))",
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        boxShadow: "var(--shadow-float)",
      }}
    >
      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between px-6 py-4">
        <h2
          className="text-text-primary text-base font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Settings
        </h2>
        <button
          onClick={onClose}
          className="text-text-secondary cursor-pointer rounded-lg p-1.5 transition-colors"
          aria-label="Close settings"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar tabs */}
        <nav
          role="tablist"
          aria-label="Settings sections"
          className="hidden shrink-0 overflow-y-auto py-2 sm:block"
          style={{
            width: 200,
          }}
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-md px-4 py-2.5 text-sm transition-all"
              style={{
                color: activeTab === tab.id ? "var(--color-accent)" : "var(--color-text-secondary)",
                background:
                  activeTab === tab.id
                    ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                    : "transparent",
                fontWeight: activeTab === tab.id ? 600 : 400,
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
        <div className="flex shrink-0 gap-1 overflow-x-auto px-4 py-2 sm:hidden">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs transition-all"
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
        <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
          <div className="max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
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
    zIndex: Z.settings,
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
    zIndex: Z.settingsContent,
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
