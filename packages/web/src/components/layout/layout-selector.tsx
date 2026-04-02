"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Square,
  Columns,
  Rows,
  GridFour,
  CaretDown,
  Check,
  Plus,
  Trash,
  Desktop,
  Code,
  TerminalWindow,
  FolderOpen,
  Brain,
} from "@phosphor-icons/react";
import {
  useLayoutStore,
  BUILT_IN_PRESETS,
  type LayoutMode,
  type LayoutPreset,
} from "@/lib/stores/layout-store";
import { useUiStore } from "@/lib/stores/ui-store";

const MODE_ICONS: Record<LayoutMode, typeof Square> = {
  single: Square,
  "side-by-side": Columns,
  stacked: Rows,
  grid: GridFour,
};

const PRESET_ICONS: Record<string, typeof Desktop> = {
  default: Desktop,
  focus: Square,
  "web-dev": Code,
  terminal: TerminalWindow,
  explorer: FolderOpen,
  "ai-collab": Brain,
};

export function LayoutSelector() {
  const mode = useLayoutStore((s) => s.mode);
  const setMode = useLayoutStore((s) => s.setMode);
  const activePresetId = useLayoutStore((s) => s.activePresetId);
  const customPresets = useLayoutStore((s) => s.customPresets);
  const applyPreset = useLayoutStore((s) => s.applyPreset);
  const saveCustomPreset = useLayoutStore((s) => s.saveCustomPreset);
  const deleteCustomPreset = useLayoutStore((s) => s.deleteCustomPreset);

  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const activityTerminalOpen = useUiStore((s) => s.activityTerminalOpen);
  const setActivityTerminalOpen = useUiStore((s) => s.setActivityTerminalOpen);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input when saving
  useEffect(() => {
    if (saving) inputRef.current?.focus();
  }, [saving]);

  // Keyboard shortcuts Ctrl+1-4
  const handleKeyboard = useCallback(
    (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const map: Record<string, LayoutMode> = {
        "1": "single",
        "2": "side-by-side",
        "3": "stacked",
        "4": "grid",
      };
      const target = map[e.key];
      if (target) {
        e.preventDefault();
        setMode(target);
      }
    },
    [setMode],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [handleKeyboard]);

  const handleApplyPreset = (preset: LayoutPreset) => {
    applyPreset(preset.id);
    setRightPanelMode(preset.rightPanel);
    setActivityTerminalOpen(preset.activityTerminal);
    setOpen(false);
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveCustomPreset(saveName.trim(), rightPanelMode, activityTerminalOpen);
    setSaveName("");
    setSaving(false);
  };

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];
  const activePreset = allPresets.find((p) => p.id === activePresetId);
  const ModeIcon = MODE_ICONS[mode];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
        style={{
          background: open ? "var(--color-bg-elevated)" : "transparent",
          border: "1px solid",
          borderColor: open ? "var(--color-border)" : "transparent",
          color: "var(--color-text-secondary)",
        }}
        aria-label="Layout presets"
        title="Layout Presets"
      >
        <ModeIcon size={14} weight={activePresetId ? "fill" : "regular"} />
        <span
          className="text-xs font-medium hidden lg:inline"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {activePreset?.name ?? "Custom"}
        </span>
        <CaretDown size={10} weight="bold" />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            minWidth: 200,
            zIndex: 50,
          }}
        >
          {/* Built-in presets */}
          <div className="px-2 pt-2 pb-1">
            <span
              className="text-xs font-semibold px-2"
              style={{ color: "var(--color-text-muted)", fontSize: 10, letterSpacing: "0.05em" }}
            >
              BUILT-IN LAYOUTS
            </span>
          </div>
          {BUILT_IN_PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.id] ?? Desktop;
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className="flex items-center gap-2 w-full px-3 py-2 cursor-pointer transition-colors text-left"
                style={{
                  color: isActive ? "#4285F4" : "var(--color-text-secondary)",
                  background: isActive ? "#4285F410" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--color-bg-elevated)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon size={14} weight={isActive ? "fill" : "regular"} />
                <span className="text-xs font-medium flex-1">{preset.name}</span>
                {isActive && <Check size={12} weight="bold" />}
              </button>
            );
          })}

          {/* Custom presets */}
          {customPresets.length > 0 && (
            <>
              <div style={{ height: 1, background: "var(--color-border)", margin: "4px 12px" }} />
              <div className="px-2 pt-1 pb-1">
                <span
                  className="text-xs font-semibold px-2"
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: 10,
                    letterSpacing: "0.05em",
                  }}
                >
                  CUSTOM
                </span>
              </div>
              {customPresets.map((preset) => {
                const Icon = MODE_ICONS[preset.mode];
                const isActive = activePresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className="flex items-center gap-2 px-3 py-2 group"
                    style={{
                      color: isActive ? "#4285F4" : "var(--color-text-secondary)",
                      background: isActive ? "#4285F410" : "transparent",
                    }}
                  >
                    <button
                      onClick={() => handleApplyPreset(preset)}
                      className="flex items-center gap-2 flex-1 cursor-pointer text-left"
                    >
                      <Icon size={14} weight={isActive ? "fill" : "regular"} />
                      <span className="text-xs font-medium flex-1">{preset.name}</span>
                      {isActive && <Check size={12} weight="bold" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCustomPreset(preset.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded cursor-pointer transition-opacity"
                      style={{ color: "var(--color-text-muted)" }}
                      aria-label={`Delete ${preset.name}`}
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* Save current */}
          <div style={{ height: 1, background: "var(--color-border)", margin: "4px 12px" }} />
          {saving ? (
            <div className="px-3 py-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Preset name..."
                  className="flex-1 text-xs px-2 py-1 rounded-md outline-none"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#4285F4";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)";
                  }}
                />
                <button
                  type="submit"
                  disabled={!saveName.trim()}
                  className="text-xs px-2 py-1 rounded-md font-medium cursor-pointer"
                  style={{
                    background: saveName.trim() ? "#4285F4" : "var(--color-bg-elevated)",
                    color: saveName.trim() ? "#fff" : "var(--color-text-muted)",
                  }}
                >
                  Save
                </button>
              </form>
            </div>
          ) : (
            <button
              onClick={() => setSaving(true)}
              className="flex items-center gap-2 w-full px-3 py-2 cursor-pointer transition-colors text-left"
              style={{ color: "var(--color-text-muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-bg-elevated)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Plus size={14} weight="bold" />
              <span className="text-xs font-medium">Save current layout</span>
            </button>
          )}

          {/* Layout mode quick-switch */}
          <div style={{ height: 1, background: "var(--color-border)", margin: "4px 12px" }} />
          <div className="flex items-center justify-center gap-1 px-3 py-2">
            {(["single", "side-by-side", "stacked", "grid"] as LayoutMode[]).map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setOpen(false);
                  }}
                  className="p-1.5 rounded-md cursor-pointer transition-colors"
                  style={{
                    color: mode === m ? "#4285F4" : "var(--color-text-muted)",
                    background: mode === m ? "#4285F415" : "transparent",
                  }}
                  title={m}
                  aria-label={m}
                >
                  <Icon size={14} weight={mode === m ? "fill" : "regular"} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
