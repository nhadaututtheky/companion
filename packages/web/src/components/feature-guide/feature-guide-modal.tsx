"use client";

import { useState, useMemo, useCallback } from "react";
import {
  X,
  MagnifyingGlass,
  Compass,
  Crown,
  ArrowRight,
  Gear,
} from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import {
  FEATURES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type FeatureDef,
  type FeatureCategory,
} from "./feature-data";

// ── Main Modal ─────────────────────────────────────────────────────────────

export function FeatureGuideModal() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<FeatureCategory | "all">("all");
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const setSettingsModalOpen = useUiStore((s) => s.setSettingsModalOpen);
  const setSettingsActiveTab = useUiStore((s) => s.setSettingsActiveTab);
  const setOpen = useUiStore((s) => s.setFeatureGuideOpen);

  const filtered = useMemo(() => {
    let list = FEATURES;

    if (activeCategory !== "all") {
      list = list.filter((f) => f.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.whenToUse.toLowerCase().includes(q),
      );
    }

    return list;
  }, [search, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<FeatureCategory, FeatureDef[]>();
    for (const f of filtered) {
      const existing = map.get(f.category) ?? [];
      existing.push(f);
      map.set(f.category, existing);
    }
    return map;
  }, [filtered]);

  const handleAction = (feature: FeatureDef) => {
    if (feature.panel) {
      setRightPanelMode(feature.panel as "wiki" | "terminal" | "files" | "browser" | "ai-context" | "stats");
      setOpen(false);
    } else if (feature.settingsTab) {
      setSettingsActiveTab(feature.settingsTab as "general" | "ai" | "telegram" | "mcp" | "rtk");
      setSettingsModalOpen(true);
      setOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        className="flex flex-col w-full max-w-2xl max-h-[80vh] rounded-xl overflow-hidden"
        style={{
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <Compass size={20} weight="duotone" style={{ color: "var(--color-purple, #7c3aed)" }} />
          <div className="flex-1">
            <h2
              className="text-base font-bold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Feature Guide
            </h2>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {FEATURES.length} features &middot; Discover what Companion can do
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg cursor-pointer hover:bg-[var(--color-bg-elevated)]"
            aria-label="Close feature guide"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search + Category Filter */}
        <div className="px-5 py-3 flex flex-col gap-2 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {/* Search */}
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
          >
            <MagnifyingGlass size={14} style={{ color: "var(--color-text-secondary)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search features..."
              aria-label="Search features"
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: "var(--color-text-primary)" }}
              autoFocus
            />
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 flex-wrap">
            <CategoryPill
              label="All"
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
              count={FEATURES.length}
            />
            {CATEGORY_ORDER.map((cat) => {
              const count = FEATURES.filter((f) => f.category === cat).length;
              return (
                <CategoryPill
                  key={cat}
                  label={CATEGORY_LABELS[cat]}
                  active={activeCategory === cat}
                  onClick={() => setActiveCategory(cat)}
                  count={count}
                />
              );
            })}
          </div>
        </div>

        {/* Feature List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 && (
            <div className="text-sm p-6 text-center" style={{ color: "var(--color-text-secondary)" }}>
              No features match &ldquo;{search}&rdquo;
            </div>
          )}

          {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
            <div key={cat} className="mb-4">
              <h3
                className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {CATEGORY_LABELS[cat]}
              </h3>
              <div className="flex flex-col gap-1.5">
                {(grouped.get(cat) ?? []).map((feature) => (
                  <FeatureCard
                    key={feature.id}
                    feature={feature}
                    onAction={() => handleAction(feature)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Category Pill ──────────────────────────────────────────────────────────

function CategoryPill({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded-full cursor-pointer transition-colors"
      style={{
        background: active ? "var(--color-purple, #7c3aed)" : "var(--color-bg-elevated)",
        color: active ? "#fff" : "var(--color-text-secondary)",
        border: active ? "none" : "1px solid var(--color-border)",
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>({count})</span>
    </button>
  );
}

// ── Feature Card ───────────────────────────────────────────────────────────

function FeatureCard({
  feature,
  onAction,
}: {
  feature: FeatureDef;
  onAction: () => void;
}) {
  const hasAction = feature.panel || feature.settingsTab;

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {feature.name}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              background: feature.tier === "pro"
                ? "rgba(234, 179, 8, 0.15)"
                : "rgba(16, 185, 129, 0.15)",
              color: feature.tier === "pro" ? "#eab308" : "#10b981",
            }}
          >
            {feature.tier === "pro" ? (
              <span className="flex items-center gap-0.5">
                <Crown size={9} weight="fill" /> PRO
              </span>
            ) : (
              "FREE"
            )}
          </span>
          {feature.toggleable && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                background: "var(--color-bg-base)",
                color: "var(--color-text-secondary)",
              }}
            >
              toggleable
            </span>
          )}
        </div>
        <p className="text-xs mb-1" style={{ color: "var(--color-text-secondary)" }}>
          {feature.description}
        </p>
        <p className="text-[11px] italic" style={{ color: "var(--color-text-secondary)", opacity: 0.8 }}>
          When to use: {feature.whenToUse}
        </p>
      </div>

      {hasAction && (
        <button
          onClick={onAction}
          className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded cursor-pointer mt-1"
          style={{
            background: "var(--color-bg-base)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          {feature.panel ? (
            <>Open <ArrowRight size={10} /></>
          ) : (
            <><Gear size={10} /> Settings</>
          )}
        </button>
      )}
    </div>
  );
}
