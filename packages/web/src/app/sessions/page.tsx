"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, CurrencyDollar, FolderOpen } from "@phosphor-icons/react";
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
    running: {
      bg: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
      color: "var(--color-accent)",
      label: "Running",
    },
    waiting: {
      bg: "color-mix(in srgb, var(--color-warning) 12%, transparent)",
      color: "var(--color-warning)",
      label: "Waiting",
    },
    idle: {
      bg: "color-mix(in srgb, var(--color-success) 12%, transparent)",
      color: "var(--color-success)",
      label: "Idle",
    },
    ended: { bg: "var(--color-bg-elevated)", color: "var(--color-text-muted)", label: "Ended" },
    error: {
      bg: "color-mix(in srgb, var(--color-danger) 12%, transparent)",
      color: "var(--color-danger)",
      label: "Error",
    },
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
  const [search, setSearch] = useState("");

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

  useEffect(() => {
    load();
  }, []);

  const filtered = sessions.filter((s) => {
    if (
      filter === "active" &&
      !["running", "waiting", "idle", "busy", "starting"].includes(s.status)
    )
      return false;
    if (filter === "ended" && !["ended", "error"].includes(s.status)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.projectSlug?.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div
      className="flex flex-col bg-bg-base" style={{ minHeight: "100vh" }}
    >
      <Header />

      <div className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1
            className="text-2xl font-bold text-text-primary" style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Sessions
          </h1>
          <button
            onClick={load}
            className="p-2 rounded-lg transition-colors cursor-pointer"
            aria-label="Refresh"
          >
            <ArrowClockwise size={16} weight="bold" />
          </button>
        </div>

        {/* Search + Filter */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="shadow-soft w-full px-3 py-2 rounded-lg text-sm mb-3 text-text-primary bg-bg-card"
          />
        </div>
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
                className="h-16 rounded-2xl animate-pulse bg-bg-card"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FolderOpen size={40} />
            <p>No sessions found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                className="shadow-soft w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-colors cursor-pointer bg-bg-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <StatusBadge status={s.status} />
                    <span className="text-sm font-semibold truncate">{s.projectSlug}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span>{s.model}</span>
                    <span>{s.numTurns} turns</span>
                    <span>{new Date(s.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div
                  className="flex items-center gap-1 font-mono text-sm font-semibold text-success"
                >
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
