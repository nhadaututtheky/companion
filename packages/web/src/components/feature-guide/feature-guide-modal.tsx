"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Z } from "@/lib/z-index";
import {
  X,
  MagnifyingGlass,
  Crown,
  ArrowRight,
  Gear,
  CaretUp,
  CaretDown,
} from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import {
  FEATURES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type FeatureDef,
  type FeatureCategory,
} from "./feature-data";

// ── Main Floating Guide ──────────────────────────────────────────────────

export function FeatureGuideModal() {
  const [activeCategory, setActiveCategory] = useState<FeatureCategory | null>(null);
  const [search, setSearch] = useState("");
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const setSettingsModalOpen = useUiStore((s) => s.setSettingsModalOpen);
  const setSettingsActiveTab = useUiStore((s) => s.setSettingsActiveTab);
  const setOpen = useUiStore((s) => s.setFeatureGuideOpen);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-guide-trigger]")) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [setOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeCategory) {
          setActiveCategory(null);
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeCategory, setOpen]);

  const filteredFeatures = useMemo(() => {
    if (!activeCategory) return [];
    let list = FEATURES.filter((f) => f.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeCategory, search]);

  const handleAction = useCallback(
    (feature: FeatureDef) => {
      if (feature.panel) {
        if (feature.panel === "stats") {
          useUiStore.getState().setStatsBarOpen(true);
        } else {
          setRightPanelMode(
            feature.panel as "wiki" | "terminal" | "files" | "browser" | "ai-context",
          );
        }
        setOpen(false);
      } else if (feature.settingsTab) {
        setSettingsActiveTab(feature.settingsTab as "general" | "ai" | "telegram" | "mcp" | "rtk");
        setSettingsModalOpen(true);
        setOpen(false);
      }
    },
    [setRightPanelMode, setSettingsModalOpen, setSettingsActiveTab, setOpen],
  );

  return (
    <div
      ref={containerRef}
      className="hidden sm:flex flex-col items-center"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: Z.popover,
        maxWidth: "90vw",
        animation: "slideUpFade 250ms ease forwards",
      }}
    >
      {/* Expanded content panel — slides up when category selected */}
      {activeCategory && (
        <div
          key={activeCategory}
          className="rounded-radius-xl shadow-soft border border-glass-border overflow-hidden flex" style={{
            background: "var(--glass-bg-heavy)",
            backdropFilter: "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
            boxShadow: "var(--shadow-float)",
            marginBottom: 8,
            width: 540,
            maxHeight: 360,
            flexDirection: "column",
            animation: "guideContentSlideUp 200ms ease forwards",
          }}
        >
          {/* Content header */}
          <div
            className="flex items-center gap-2 px-4 py-2.5 shrink-0"
            style={{ borderBottom: "1px solid var(--glass-border)" }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-wider text-accent"
            >
              {CATEGORY_LABELS[activeCategory]}
            </span>
            <span className="text-[10px] tabular-nums text-text-muted">
              {filteredFeatures.length}
            </span>
            <div className="flex-1" />
            {/* Search within category */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-radius-md border border-glass-border" style={{
                background: "color-mix(in srgb, var(--color-bg-elevated) 60%, transparent)",
                }}
            >
              <MagnifyingGlass size={10} className="text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter..."
                className="bg-transparent outline-none text-xs text-text-primary" style={{ width: 80 }}
                aria-label="Filter features"
              />
            </div>
            <button
              onClick={() => {
                setActiveCategory(null);
                setSearch("");
              }}
              className="p-1 cursor-pointer rounded text-text-muted"
              aria-label="Close category"
            >
              <CaretDown size={12} weight="bold" />
            </button>
          </div>

          {/* Feature list */}
          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
            {filteredFeatures.length === 0 && (
              <div
                className="text-xs py-4 text-center text-text-muted"
              >
                No features match
              </div>
            )}
            {filteredFeatures.map((feature) => (
              <FeatureRow
                key={feature.id}
                feature={feature}
                onAction={() => handleAction(feature)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Category pills bar — always visible */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 rounded-radius-xl shadow-soft border border-glass-border" style={{
          background: "var(--glass-bg-heavy)",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
          boxShadow: "var(--shadow-float)",
        }}
      >
        <span className="text-xs font-semibold px-2 text-text-primary">
          Guide
        </span>

        <span className="w-px h-4 mx-0.5" style={{ background: "var(--glass-border)" }} />

        {CATEGORY_ORDER.map((cat) => {
          const count = FEATURES.filter((f) => f.category === cat).length;
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(isActive ? null : cat);
                setSearch("");
              }}
              className="text-[11px] px-2.5 py-1 cursor-pointer transition-all font-medium rounded-radius-md" style={{
                background: isActive ? "var(--color-accent)" : "transparent",
                color: isActive ? "#fff" : "var(--color-text-secondary)",
                border: isActive ? "1px solid var(--color-accent)" : "1px solid transparent",
              }}
            >
              {CATEGORY_LABELS[cat]}
              <span style={{ opacity: 0.6, marginLeft: 3 }}>({count})</span>
            </button>
          );
        })}

        <span className="w-px h-4 mx-0.5" style={{ background: "var(--glass-border)" }} />

        {/* Close */}
        <button
          onClick={() => setOpen(false)}
          className="p-1 cursor-pointer rounded text-text-muted"
          aria-label="Close guide"
        >
          <X size={12} weight="bold" />
        </button>
      </div>
    </div>
  );
}

// ── Feature Row (compact) ────────────────────────────────────────────────

function FeatureRow({ feature, onAction }: { feature: FeatureDef; onAction: () => void }) {
  const hasAction = feature.panel || feature.settingsTab;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
      style={{
        background: "transparent",
        border: "1px solid transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-bg-hover)";
        e.currentTarget.style.borderColor = "var(--glass-border)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-primary">
            {feature.name}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 font-medium rounded-radius-pill" style={{
              background:
                feature.tier === "pro" ? "rgba(234, 179, 8, 0.12)" : "rgba(16, 185, 129, 0.12)",
              color: feature.tier === "pro" ? "#eab308" : "#10b981",
            }}
          >
            {feature.tier === "pro" ? (
              <span className="flex items-center gap-0.5">
                <Crown size={8} weight="fill" /> PRO
              </span>
            ) : (
              "FREE"
            )}
          </span>
        </div>
        <p className="text-[11px] mt-0.5 truncate text-text-muted">
          {feature.description}
        </p>
      </div>

      {hasAction && (
        <button
          onClick={onAction}
          className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded cursor-pointer transition-colors text-accent" style={{
            background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)",
          }}
        >
          {feature.panel ? (
            <>
              Open <ArrowRight size={9} />
            </>
          ) : (
            <>
              <Gear size={9} /> Settings
            </>
          )}
        </button>
      )}
    </div>
  );
}
