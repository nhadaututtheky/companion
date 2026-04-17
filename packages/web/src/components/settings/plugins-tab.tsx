"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PuzzlePiece,
  ArrowClockwise,
  Robot,
  Terminal,
  BookOpen,
  Plugs,
  Lightning,
  CaretDown,
  CaretRight,
  CircleNotch,
} from "@phosphor-icons/react";
import { SettingSection } from "./settings-tabs";
import { api } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────

interface PluginProvides {
  agents: string[];
  commands: string[];
  skills: string[];
  mcpServers: string[];
  hooks: boolean;
}

interface PluginMeta {
  name: string;
  description?: string;
  version?: string;
  author?: { name?: string };
  repository?: string;
  homepage?: string;
  license?: string;
  keywords?: string[];
}

interface PluginInfo {
  key: string;
  name: string;
  registry: string;
  enabled: boolean;
  meta: PluginMeta | null;
  provides: PluginProvides;
  cachePath: string | null;
}

// ── Component ───────────────────────────────────────────────────────

export function PluginsTab() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: PluginInfo[] }>("/api/plugins");
      setPlugins(res.data ?? []);
    } catch {
      // failed to load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const handleToggle = async (key: string, enabled: boolean) => {
    setToggling(key);
    try {
      await api.post("/api/plugins/toggle", { key, enabled });
      setPlugins((prev) =>
        prev.map((p) => (p.key === key ? { ...p, enabled } : p)),
      );
    } catch {
      // revert on error
    } finally {
      setToggling(null);
    }
  };

  const totalProvides = (p: PluginInfo) => {
    const { agents, commands, skills, mcpServers, hooks } = p.provides;
    return agents.length + commands.length + skills.length + mcpServers.length + (hooks ? 1 : 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <CircleNotch size={24} className="animate-spin" style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingSection
        title="Claude Code Plugins"
        description="Manage installed plugins. Toggle requires restarting Claude Code sessions."
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-text-muted text-xs">
            {plugins.length} plugin{plugins.length !== 1 ? "s" : ""} installed
          </span>
          <button
            onClick={fetchPlugins}
            className="text-text-muted hover:text-text-primary flex cursor-pointer items-center gap-1 text-xs transition-colors"
            aria-label="Refresh plugin list"
          >
            <ArrowClockwise size={12} weight="bold" />
            Refresh
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {plugins.map((plugin) => {
            const isExpanded = expanded === plugin.key;
            const isToggling = toggling === plugin.key;
            const desc = plugin.meta?.description ?? "No description";
            const author = plugin.meta?.author?.name;
            const version = plugin.meta?.version;
            const provideCount = totalProvides(plugin);

            return (
              <div
                key={plugin.key}
                className="rounded-lg transition-colors"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--glass-border)",
                }}
              >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Icon */}
                  <div
                    className="flex shrink-0 items-center justify-center rounded-lg"
                    style={{
                      width: 36,
                      height: 36,
                      background: plugin.enabled
                        ? "color-mix(in srgb, var(--color-accent) 15%, transparent)"
                        : "var(--glass-bg)",
                    }}
                  >
                    <PuzzlePiece
                      size={18}
                      weight="duotone"
                      style={{
                        color: plugin.enabled ? "var(--color-accent)" : "var(--color-text-muted)",
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{plugin.name}</span>
                      {version && (
                        <span
                          className="rounded px-1.5 py-0.5 text-xs"
                          style={{ background: "var(--glass-bg)", color: "var(--color-text-muted)" }}
                        >
                          v{version}
                        </span>
                      )}
                      {author && (
                        <span className="text-text-muted text-xs">by {author}</span>
                      )}
                    </div>
                    <p
                      className="mt-0.5 text-xs leading-snug"
                      style={{
                        color: "var(--color-text-muted)",
                        display: "-webkit-box",
                        WebkitLineClamp: isExpanded ? 99 : 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {desc}
                    </p>
                  </div>

                  {/* Expand + Toggle */}
                  <div className="flex shrink-0 items-center gap-2">
                    {provideCount > 0 && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : plugin.key)}
                        className="text-text-muted hover:text-text-primary flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors"
                        aria-label={isExpanded ? "Collapse details" : "Expand details"}
                      >
                        {provideCount}
                        {isExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
                      </button>
                    )}

                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggle(plugin.key, !plugin.enabled)}
                      disabled={isToggling}
                      className="relative h-6 w-11 cursor-pointer rounded-full transition-colors"
                      style={{
                        background: plugin.enabled ? "var(--color-accent)" : "var(--glass-bg-heavy)",
                        opacity: isToggling ? 0.6 : 1,
                      }}
                      role="switch"
                      aria-checked={plugin.enabled}
                      aria-label={`${plugin.enabled ? "Disable" : "Enable"} ${plugin.name}`}
                    >
                      <span
                        className="absolute top-0.5 block h-5 w-5 rounded-full shadow transition-transform"
                        style={{
                          background: "#fff",
                          transform: plugin.enabled ? "translateX(22px)" : "translateX(2px)",
                        }}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && provideCount > 0 && (
                  <div
                    className="border-t px-4 py-3"
                    style={{ borderColor: "var(--glass-border)" }}
                  >
                    <div className="flex flex-wrap gap-3">
                      <ProvidesList icon={Robot} label="Agents" items={plugin.provides.agents} />
                      <ProvidesList icon={Terminal} label="Commands" items={plugin.provides.commands} />
                      <ProvidesList icon={BookOpen} label="Skills" items={plugin.provides.skills} />
                      <ProvidesList icon={Plugs} label="MCP Servers" items={plugin.provides.mcpServers} />
                      {plugin.provides.hooks && (
                        <div className="flex items-center gap-1.5">
                          <Lightning size={12} weight="bold" style={{ color: "var(--color-text-muted)" }} />
                          <span className="text-text-muted text-xs">Hooks</span>
                        </div>
                      )}
                    </div>

                    {/* Links */}
                    <div className="mt-2 flex gap-3">
                      {plugin.meta?.homepage && (
                        <a
                          href={plugin.meta.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs transition-colors"
                          style={{ color: "var(--color-accent)" }}
                        >
                          Homepage
                        </a>
                      )}
                      {plugin.meta?.repository && (
                        <a
                          href={plugin.meta.repository}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs transition-colors"
                          style={{ color: "var(--color-accent)" }}
                        >
                          Repository
                        </a>
                      )}
                      <span className="text-text-muted text-xs">
                        {plugin.registry}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {plugins.length === 0 && (
            <div className="py-8 text-center">
              <PuzzlePiece size={32} weight="thin" style={{ color: "var(--color-text-muted)", margin: "0 auto" }} />
              <p className="text-text-muted mt-2 text-sm">No plugins installed</p>
              <p className="text-text-muted mt-1 text-xs">
                Install plugins via Claude Code CLI or settings
              </p>
            </div>
          )}
        </div>
      </SettingSection>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function ProvidesList({
  icon: Icon,
  label,
  items,
}: {
  icon: React.ComponentType<{ size?: number; weight?: "bold" | "duotone" | "fill" | "light" | "regular" | "thin"; style?: React.CSSProperties }>;
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex items-start gap-1.5">
      <Icon size={12} weight="bold" style={{ color: "var(--color-text-muted)", marginTop: 2 }} />
      <div>
        <span className="text-text-muted text-xs font-medium">{label}</span>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {items.slice(0, 10).map((item) => (
            <span
              key={item}
              className="rounded px-1.5 py-0.5 text-xs"
              style={{
                background: "var(--glass-bg)",
                color: "var(--color-text-secondary)",
                fontSize: 10,
              }}
            >
              {item}
            </span>
          ))}
          {items.length > 10 && (
            <span className="text-text-muted text-xs">+{items.length - 10} more</span>
          )}
        </div>
      </div>
    </div>
  );
}
