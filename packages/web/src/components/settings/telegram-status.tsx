"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowsClockwise,
  TelegramLogo,
  CheckCircle,
  XCircle,
  Clock,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

interface BotStatus {
  botId: string;
  label: string;
  role: string;
  running: boolean;
}

interface StatusData {
  totalBots: number;
  runningBots: number;
  bots: BotStatus[];
}

export function TelegramStatus() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.telegram.status();
      setStatus(res.data);
      setLastUpdated(new Date());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {status.runningBots}/{status.totalBots} bots running
            </span>
          )}
          {lastUpdated && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              &middot; Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
          aria-label="Refresh status"
        >
          <ArrowsClockwise
            size={12}
            weight="bold"
            className={loading ? "animate-spin" : ""}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      {/* Bot list */}
      {loading && !status ? (
        <div className="flex items-center gap-2 py-2" style={{ color: "var(--color-text-muted)" }}>
          <ArrowsClockwise size={14} className="animate-spin" aria-hidden="true" />
          <span className="text-xs">Loading status...</span>
        </div>
      ) : status && status.bots.length > 0 ? (
        <div className="flex flex-col gap-2">
          {status.bots.map((bot) => (
            <div
              key={bot.botId}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <TelegramLogo
                size={16}
                weight="fill"
                style={{ color: "var(--color-accent)", flexShrink: 0 }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                  {bot.label}
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {bot.role} &middot; {bot.botId}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {bot.running ? (
                  <CheckCircle
                    size={16}
                    weight="fill"
                    style={{ color: "var(--color-success)" }}
                    aria-label="Running"
                  />
                ) : (
                  <XCircle
                    size={16}
                    weight="fill"
                    style={{ color: "var(--color-text-muted)" }}
                    aria-label="Stopped"
                  />
                )}
                <span
                  className="text-xs font-medium"
                  style={{ color: bot.running ? "var(--color-success)" : "var(--color-text-muted)" }}
                >
                  {bot.running ? "Running" : "Stopped"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="flex items-center gap-2 py-4 text-xs justify-center"
          style={{ color: "var(--color-text-muted)" }}
        >
          <Clock size={14} aria-hidden="true" />
          No bots running
        </div>
      )}
    </div>
  );
}
