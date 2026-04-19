"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, CurrencyDollar, FolderOpen } from "@phosphor-icons/react";
import { Header } from "@/components/layout/header";
import { api } from "@/lib/api-client";
import { fmtDateTimeFull } from "@/lib/formatters";

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
      className="rounded-full px-2 py-0.5 text-xs font-medium"
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
    <div className="bg-bg-base flex flex-col" style={{ minHeight: "100vh" }}>
      <Header />

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1
            className="text-text-primary text-2xl font-bold"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Sessions
          </h1>
          <button
            onClick={load}
            className="cursor-pointer rounded-lg p-2 transition-colors"
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
            className="shadow-soft text-text-primary bg-bg-card mb-3 w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="mb-4 flex gap-2">
          {(["all", "active", "ended"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors"
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
              <div key={i} className="bg-bg-card h-16 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <FolderOpen size={40} />
            <p>No sessions found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                className="shadow-soft bg-bg-card flex w-full cursor-pointer items-center gap-4 rounded-2xl px-5 py-4 text-left transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-3">
                    <StatusBadge status={s.status} />
                    <span className="truncate text-sm font-semibold">{s.projectSlug}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span>{s.model}</span>
                    <span>{s.numTurns} turns</span>
                    <span>{fmtDateTimeFull(s.createdAt)}</span>
                  </div>
                </div>
                <div className="text-success flex items-center gap-1 font-mono text-sm font-semibold">
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
