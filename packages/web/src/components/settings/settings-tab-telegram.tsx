"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Eye, EyeSlash, ArrowsClockwise } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { TelegramBotCard } from "@/components/settings/telegram-bot-card";
import { TelegramStreaming } from "@/components/settings/telegram-streaming";
import { TelegramStatus } from "@/components/settings/telegram-status";
import { TelegramPreview } from "@/components/settings/telegram-preview";
import { TelegramDebateGuide } from "@/components/settings/telegram-debate-guide";
import { SettingSection, type BotConfig, type RunningBot } from "./settings-tabs";

// ── Telegram Tab ────────────────────────────────────────────────────────────

export function TelegramTab() {
  const [configs, setConfigs] = useState<BotConfig[]>([]);
  const [running, setRunning] = useState<RunningBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBotId, setExpandedBotId] = useState<string | null>(null);

  // Add bot form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newRole, setNewRole] = useState<"claude" | "codex" | "gemini" | "opencode" | "general">(
    "claude",
  );
  const [newToken, setNewToken] = useState("");
  const [showNewToken, setShowNewToken] = useState(false);
  const [newChatIds, setNewChatIds] = useState("");
  const [newUserIds, setNewUserIds] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.telegram.bots();
      setConfigs(res.data.configs as BotConfig[]);
      setRunning(res.data.running);
    } catch (err) {
      toast.error(`Failed to load bots: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAddBot() {
    if (!newLabel.trim() || !newToken.trim()) {
      toast.error("Label and bot token are required");
      return;
    }

    setAdding(true);
    try {
      const parsedChatIds = newChatIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      const parsedUserIds = newUserIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      await api.telegram.createBot({
        label: newLabel,
        role: newRole,
        botToken: newToken,
        allowedChatIds: parsedChatIds,
        allowedUserIds: parsedUserIds,
        enabled: true,
      });

      toast.success("Bot added");
      setShowAddForm(false);
      setNewLabel("");
      setNewRole("claude");
      setNewToken("");
      setNewChatIds("");
      setNewUserIds("");
      await refresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAdding(false);
    }
  }

  const botOptions = configs.map((c) => ({ id: c.id, label: c.label }));

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: 2 columns — Preview + Status/Streaming */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left column */}
        <SettingSection title="Preview" description="How your bot looks in Telegram.">
          <TelegramPreview />
        </SettingSection>

        {/* Right column — Status + Streaming stacked */}
        <div className="flex flex-col gap-4">
          <SettingSection title="Bot Status" description="Real-time status.">
            <TelegramStatus />
          </SettingSection>

          {configs.length > 0 && (
            <SettingSection
              title="Session Streaming"
              description="Stream session output to Telegram."
            >
              <div className="flex flex-col gap-3">
                {configs.length > 1 && (
                  <select
                    value={expandedBotId ?? configs[0]?.id ?? ""}
                    onChange={(e) => setExpandedBotId(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer text-text-primary bg-bg-elevated"
                  >
                    {configs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
                {(() => {
                  const selectedId = expandedBotId ?? configs[0]?.id;
                  const selectedBot = configs.find((c) => c.id === selectedId);
                  if (!selectedBot) return null;
                  return (
                    <TelegramStreaming
                      botId={selectedBot.id}
                      botLabel={selectedBot.label}
                      bots={botOptions}
                    />
                  );
                })()}
              </div>
            </SettingSection>
          )}

          {/* Bot Management — same column */}
          <SettingSection
            title="Bot Management"
            description="Add, configure, and control your Telegram bots."
          >
            <div className="flex flex-col gap-3">
              {/* Add bot button */}
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer w-fit shadow-soft border border-glass-border" style={{
                  background: showAddForm ? "var(--color-bg-elevated)" : "var(--color-accent)",
                  color: showAddForm ? "var(--color-text-secondary)" : "#fff",
                }}
              >
                <Plus size={12} weight="bold" aria-hidden="true" />
                {showAddForm ? "Cancel" : "Add Bot"}
              </button>

              {/* Add bot form */}
              {showAddForm && (
                <div
                  className="flex flex-col gap-3 p-4 rounded-xl bg-bg-elevated shadow-soft border border-glass-border"
                >
                  <h3 className="text-xs font-semibold">New Bot</h3>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">Label</label>
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="My Claude Bot"
                      className="px-3 py-2 rounded-lg text-sm input-bordered text-text-primary bg-bg-card"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">Role</label>
                    <select
                      value={newRole}
                      onChange={(e) =>
                        setNewRole(
                          e.target.value as "claude" | "codex" | "gemini" | "opencode" | "general",
                        )
                      }
                      className="px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer text-text-primary bg-bg-card"
                    >
                      <option value="claude">Claude Code — Anthropic CLI</option>
                      <option value="codex">Codex CLI — OpenAI CLI</option>
                      <option value="gemini">Gemini CLI — Google CLI</option>
                      <option value="opencode">OpenCode — open-source CLI</option>
                      <option value="general">General — general purpose</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">Bot Token</label>
                    <div className="relative">
                      <input
                        type={showNewToken ? "text" : "password"}
                        value={newToken}
                        onChange={(e) => setNewToken(e.target.value)}
                        placeholder="1234567890:ABCdefGHI..."
                        className="w-full px-3 py-2 pr-10 rounded-lg text-sm input-bordered font-mono text-text-primary bg-bg-card"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewToken(!showNewToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 cursor-pointer"
                        aria-label={showNewToken ? "Hide token" : "Show token"}
                      >
                        {showNewToken ? <EyeSlash size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">
                      Allowed Chat IDs <span>(comma-separated, optional)</span>
                    </label>
                    <input
                      type="text"
                      value={newChatIds}
                      onChange={(e) => setNewChatIds(e.target.value)}
                      placeholder="-100123456789"
                      className="px-3 py-2 rounded-lg text-sm input-bordered font-mono text-text-primary bg-bg-card"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">
                      Admin User IDs <span>(comma-separated, only these users can use bot)</span>
                    </label>
                    <input
                      type="text"
                      value={newUserIds}
                      onChange={(e) => setNewUserIds(e.target.value)}
                      placeholder="123456789"
                      className="px-3 py-2 rounded-lg text-sm input-bordered font-mono text-text-primary bg-bg-card"
                    />
                    <span className="text-xs">
                      Get your ID: send /start to @userinfobot on Telegram
                    </span>
                  </div>

                  <button
                    onClick={handleAddBot}
                    disabled={adding}
                    className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{
                      background: "var(--color-accent)",
                      color: "#fff",
                      border: "none",
                      opacity: adding ? 0.7 : 1,
                    }}
                  >
                    {adding ? (
                      <>
                        <ArrowsClockwise size={12} className="animate-spin" aria-hidden="true" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus size={12} weight="bold" aria-hidden="true" />
                        Add Bot
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Bot list */}
              {loading ? (
                <div className="flex items-center gap-2 py-3">
                  <ArrowsClockwise size={14} className="animate-spin" aria-hidden="true" />
                  <span className="text-xs">Loading bots...</span>
                </div>
              ) : configs.length === 0 ? (
                <p className="text-xs py-2">No bots configured. Add one above.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {configs.map((config) => (
                    <TelegramBotCard
                      key={config.id}
                      config={config}
                      running={running.find((r) => r.botId === config.id)}
                      onRefresh={refresh}
                      onDelete={(id) => setConfigs((prev) => prev.filter((c) => c.id !== id))}
                    />
                  ))}
                </div>
              )}
            </div>
          </SettingSection>
        </div>
      </div>

      {/* Debate Setup Guide — full width below */}
      <TelegramDebateGuide />
    </div>
  );
}
