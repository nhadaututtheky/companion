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
      className="hidden flex-col items-center sm:flex"
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
          className="rounded-xl shadow-soft flex overflow-hidden"
          style={{
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
            className="flex shrink-0 items-center gap-2 px-4 py-2.5"
            style={{ boxShadow: "0 1px 0 var(--glass-border)" }}
          >
            <span className="text-accent text-xs font-semibold uppercase tracking-wider">
              {CATEGORY_LABELS[activeCategory]}
            </span>
            <span className="text-text-muted text-[10px] tabular-nums">
              {filteredFeatures.length}
            </span>
            <div className="flex-1" />
            {/* Search within category */}
            <div
              className="rounded-md flex items-center gap-1.5 px-2 py-1 text-xs"
              style={{
                background: "color-mix(in srgb, var(--color-bg-elevated) 60%, transparent)",
              }}
            >
              <MagnifyingGlass size={10} className="text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter..."
                className="text-text-primary bg-transparent text-xs outline-none"
                style={{ width: 80 }}
                aria-label="Filter features"
              />
            </div>
            <button
              onClick={() => {
                setActiveCategory(null);
                setSearch("");
              }}
              className="text-text-muted cursor-pointer rounded p-1"
              aria-label="Close category"
            >
              <CaretDown size={12} weight="bold" />
            </button>
          </div>

          {/* Feature list */}
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
            {filteredFeatures.length === 0 && (
              <div className="text-text-muted py-4 text-center text-xs">No features match</div>
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
        className="rounded-xl shadow-soft flex items-center gap-1.5 px-3 py-2"
        style={{
          background: "var(--glass-bg-heavy)",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
          boxShadow: "var(--shadow-float)",
        }}
      >
        <span className="text-text-primary px-2 text-xs font-semibold">Guide</span>

        <span className="mx-0.5 h-4 w-px" style={{ background: "var(--glass-border)" }} />

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
              className="rounded-md cursor-pointer px-2.5 py-1 text-[11px] font-medium transition-all"
              style={{
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

        <span className="mx-0.5 h-4 w-px" style={{ background: "var(--glass-border)" }} />

        {/* Close */}
        <button
          onClick={() => setOpen(false)}
          className="text-text-muted cursor-pointer rounded p-1"
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
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
      style={{
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-text-primary text-xs font-semibold">{feature.name}</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            style={{
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
        <p className="text-text-muted mt-0.5 truncate text-[11px]">{feature.description}</p>
      </div>

      {hasAction && (
        <button
          onClick={onAction}
          className="text-accent flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
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
