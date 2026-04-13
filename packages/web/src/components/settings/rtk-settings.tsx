"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { FloppyDisk, Check, Lock } from "@phosphor-icons/react";

const RTK_LEVELS = [
  { value: "aggressive", label: "Aggressive", desc: "~2K tokens max per output — maximum savings" },
  { value: "balanced", label: "Balanced", desc: "~4K tokens max — recommended" },
  { value: "minimal", label: "Minimal", desc: "~8K tokens max — light compression" },
  { value: "unlimited", label: "Unlimited", desc: "No budget limit — strategies still apply" },
];

const RTK_STRATEGIES = [
  {
    name: "ansi-strip",
    label: "ANSI Strip",
    desc: "Remove terminal color codes and control characters",
  },
  { name: "boilerplate", label: "Boilerplate", desc: "Collapse npm/cargo/pip install noise" },
  {
    name: "stack-trace",
    label: "Stack Trace",
    desc: "Compress long stack traces (keep top + bottom)",
  },
  { name: "error-aggregate", label: "Error Aggregate", desc: "Group repeated errors by code" },
  { name: "test-summary", label: "Test Summary", desc: "Collapse passed tests, keep failures" },
  { name: "diff-summary", label: "Diff Summary", desc: "Summarize large git diffs" },
  { name: "json-limiter", label: "JSON Limiter", desc: "Truncate deeply nested JSON" },
  { name: "blank-collapse", label: "Blank Collapse", desc: "Merge consecutive blank lines" },
  { name: "dedup", label: "Deduplication", desc: "Merge repeated similar lines" },
  { name: "truncate", label: "Truncate", desc: "Final length cap on very long outputs" },
];

/** Strategies included in Free tier (rtk_basic) */
const FREE_STRATEGIES = new Set(["ansi-strip", "blank-collapse", "dedup", "truncate"]);

export function RTKSettings() {
  const [enabled, setEnabled] = useState(true);
  const [level, setLevel] = useState("balanced");
  const [disabledStrategies, setDisabledStrategies] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, licenseRes] = await Promise.all([
          api.settings.list("rtk."),
          api.license(),
        ]);
        setEnabled(settingsRes.data["rtk.enabled"] !== "false");
        setLevel(settingsRes.data["rtk.level"] ?? "balanced");
        const disabled = settingsRes.data["rtk.disabled"] ?? "";
        setDisabledStrategies(new Set(disabled.split(",").filter(Boolean)));
        setIsPro(licenseRes.data.features.includes("rtk_pro"));
      } catch {
        // First time — defaults
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function toggleStrategy(name: string) {
    setDisabledStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.set("rtk.enabled", String(enabled));
      await api.settings.set("rtk.level", level);
      await api.settings.set("rtk.disabled", Array.from(disabledStrategies).join(","));
      toast.success("RTK settings saved");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-xs py-8 text-center">Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Enable/Disable */}
      <div
        className="p-5 rounded-xl border border-glass-border" style={{
          background: "var(--glass-bg-heavy)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              Runtime Token Keeper (RTK)
              {!isPro && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                  style={{ background: "#FBBC0420", color: "#FBBC04" }}
                >
                  Basic
                </span>
              )}
            </h2>
            <p className="text-xs mt-1">
              Compresses tool outputs to save LLM context tokens.
              {!isPro && " Upgrade to Pro for smart compressors, cache, and budget control."}
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer"
            style={{
              background: enabled ? "#34A853" : "var(--color-bg-elevated)",
            }}
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle RTK"
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
              style={{
                transform: enabled ? "translateX(24px)" : "translateX(4px)",
              }}
            />
          </button>
        </div>
      </div>

      {/* Compression Level — Pro only */}
      {enabled && isPro && (
        <div
          className="p-5 rounded-xl bg-bg-card border border-border"
        >
          <h2 className="text-sm font-semibold mb-1">Compression Level</h2>
          <p className="text-xs mb-4">Controls the maximum token budget per tool output.</p>
          <div className="flex flex-col gap-2">
            {RTK_LEVELS.map((l) => (
              <label
                key={l.value}
                className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: level === l.value ? "var(--color-bg-elevated)" : "transparent",
                  border:
                    level === l.value ? "1px solid var(--color-accent)" : "1px solid transparent",
                }}
              >
                <input
                  type="radio"
                  name="rtk-level"
                  value={l.value}
                  checked={level === l.value}
                  onChange={() => setLevel(l.value)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium">{l.label}</span>
                  <p className="text-xs mt-0.5">{l.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Strategy Toggle */}
      {enabled && (
        <div
          className="p-5 rounded-xl bg-bg-card border border-border"
        >
          <h2 className="text-sm font-semibold mb-1">Compression Strategies</h2>
          <p className="text-xs mb-4">
            Enable or disable individual compression strategies. All are enabled by default.
          </p>
          <div className="flex flex-col gap-1">
            {RTK_STRATEGIES.map((s) => {
              const isFreeStrategy = FREE_STRATEGIES.has(s.name);
              const isLocked = !isPro && !isFreeStrategy;
              const isEnabled = !disabledStrategies.has(s.name) && !isLocked;
              return (
                <label
                  key={s.name}
                  className="flex items-center gap-3 p-2.5 rounded-lg transition-colors"
                  style={{
                    opacity: isEnabled ? 1 : 0.4,
                    cursor: isLocked ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isLocked)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--color-bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => !isLocked && toggleStrategy(s.name)}
                    disabled={isLocked}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-mono flex items-center gap-1.5">
                      {s.label}
                      {isLocked && <Lock size={12} weight="bold" style={{ color: "#FBBC04" }} />}
                    </span>
                    <p className="text-xs">
                      {s.desc}
                      {isLocked && " (Pro)"}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors cursor-pointer"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? <Check size={16} weight="bold" /> : <FloppyDisk size={16} weight="bold" />}
          {saving ? "Saving..." : "Save RTK Settings"}
        </button>
      </div>
    </div>
  );
}
