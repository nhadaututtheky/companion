"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Circle, ClockCountdown, CheckCircle, ArrowClockwise, CurrencyDollar, FolderOpen,
} from "@phosphor-icons/react";
import { Header } from "@/components/layout/header";
import { api } from "@/lib/api-client";

interface Session {
  id: string;
  projectSlug: string;
  status: string;
  model: string;
  totalCostUsd: number;
  numTurns: number;
  createdAt: string;
  endedAt?: string;
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; color: string; label: string }> = {
    running: { bg: "#4285F420", color: "#4285F4", label: "Running" },
    waiting: { bg: "#FBBC0420", color: "#FBBC04", label: "Waiting" },
    idle: { bg: "#34A85320", color: "#34A853", label: "Idle" },
    ended: { bg: "var(--color-bg-elevated)", color: "var(--color-text-muted)", label: "Ended" },
    error: { bg: "#EA433520", color: "#EA4335", label: "Error" },
  };

  const c = configs[status] ?? configs.ended!;

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.sessions.list();
      setSessions((res.data as { sessions: Session[] }).sessions ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = sessions.filter((s) => {
    if (filter === "active") return ["running", "waiting", "idle"].includes(s.status);
    if (filter === "ended") return ["ended", "error"].includes(s.status);
    return true;
  });

  return (
    <div className="flex flex-col" style={{ minHeight: "100vh", background: "var(--color-bg-base)" }}>
      <Header />

      <div className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Outfit, sans-serif", color: "var(--color-text-primary)" }}>
            Sessions
          </h1>
          <button
            onClick={load}
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Refresh"
          >
            <ArrowClockwise size={16} weight="bold" />
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(["all", "active", "ended"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer capitalize"
              style={{
                background: filter === f ? "var(--color-bg-card)" : "transparent",
                color: filter === f ? "var(--color-text-primary)" : "var(--color-text-muted)",
                border: filter === f ? "1px solid var(--color-border)" : "1px solid transparent",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Sessions table */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-2xl animate-pulse"
                style={{ background: "var(--color-bg-card)" }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FolderOpen size={40} style={{ color: "var(--color-text-muted)" }} />
            <p style={{ color: "var(--color-text-muted)" }}>No sessions found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-colors cursor-pointer"
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <StatusBadge status={s.status} />
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                      {s.projectSlug}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    <span>{s.model}</span>
                    <span>{s.numTurns} turns</span>
                    <span>{new Date(s.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 font-mono text-sm font-semibold" style={{ color: "#34A853" }}>
                  <CurrencyDollar size={14} weight="bold" />
                  {s.totalCostUsd.toFixed(4)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
