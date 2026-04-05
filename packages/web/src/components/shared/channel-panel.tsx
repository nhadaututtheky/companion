"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  LinkSimple,
  Plus,
  PaperPlaneTilt,
  ChatTeardropDots,
  X,
  CaretDown,
  Robot,
  User,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { getPersonaById } from "@companion/shared";
import { PersonaAvatar } from "@/components/persona/persona-avatar";

// ── Types ──────────────────────────────────────────────────────────────────

interface ChannelMessage {
  id: string;
  channelId: string;
  agentId: string;
  role: string;
  content: string;
  round: number;
  personaId?: string | null;
  timestamp: string | null;
}

interface LinkedSession {
  id: string;
  model: string;
  status: string;
  cwd: string;
  projectSlug: string | null;
}

interface Channel {
  id: string;
  projectSlug: string | null;
  type: string;
  topic: string;
  status: string;
  maxRounds: number;
  currentRound: number;
  createdAt: string | null;
  concludedAt: string | null;
  messages: ChannelMessage[];
  linkedSessions: LinkedSession[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  advocate: "var(--color-accent)",
  challenger: "var(--color-danger)",
  judge: "var(--color-warning)",
  reviewer: "var(--color-success)",
  human: "var(--color-text-muted)",
};

const TYPE_LABELS: Record<string, string> = {
  debate: "Debate",
  review: "Review",
  red_team: "Red Team",
  brainstorm: "Brainstorm",
};

function formatRelativeTime(ts: string | null): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Channel message feed ────────────────────────────────────────────────────

function ChannelFeed({ messages }: { messages: ChannelMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 gap-2"
       
      >
        <ChatTeardropDots size={28} />
        <p className="text-xs text-center">No messages yet. Post the first one.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      {messages.map((msg) => {
        const roleColor = ROLE_COLORS[msg.role] ?? "#9AA0A6";
        const isHuman = msg.role === "human";
        const persona = msg.personaId ? getPersonaById(msg.personaId) : undefined;
        return (
          <div
            key={msg.id}
            className="flex flex-col gap-0.5 rounded-lg p-2"
            style={{
              background: "var(--color-bg-card)",
              border: `1px solid var(--color-border)`,
              borderLeft: `3px solid ${roleColor}`,
            }}
          >
            <div className="flex items-center gap-1.5">
              {isHuman ? (
                <User size={11} style={{ color: roleColor, flexShrink: 0 }} />
              ) : persona ? (
                <PersonaAvatar persona={persona} size={14} showBadge={false} />
              ) : (
                <Robot size={11} style={{ color: roleColor, flexShrink: 0 }} />
              )}
              <span className="text-xs font-semibold capitalize" style={{ color: roleColor }}>
                {msg.role}
              </span>
              <span
                className="text-xs font-mono truncate flex-1"
               
              >
                {msg.agentId}
              </span>
              <span className="text-xs flex-shrink-0">
                {formatRelativeTime(msg.timestamp)}
              </span>
            </div>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--color-text-primary)", whiteSpace: "pre-wrap" }}
            >
              {msg.content}
            </p>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Human message composer ──────────────────────────────────────────────────

function MessageComposer({ channelId, onPosted }: { channelId: string; onPosted: () => void }) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const handlePost = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || posting) return;

    setPosting(true);
    try {
      await api.channels.postMessage(channelId, {
        agentId: "human",
        role: "human",
        content: trimmed,
      });
      setText("");
      onPosted();
    } catch {
      toast.error("Failed to post message");
    } finally {
      setPosting(false);
    }
  }, [text, posting, channelId, onPosted]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handlePost();
    }
  };

  return (
    <div
      className="flex items-end gap-2 px-3 py-2 flex-shrink-0"
      style={{ borderTop: "1px solid var(--color-border)" }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={posting}
        placeholder="Post to channel… (Enter to send)"
        rows={2}
        className="flex-1 resize-none rounded-lg px-2 py-1.5 text-xs input-bordered"
        style={{
          background: "var(--color-bg-card)",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-body)",
        }}
        aria-label="Channel message input"
      />
      <button
        onClick={() => void handlePost()}
        disabled={!text.trim() || posting}
        className="flex-shrink-0 p-2 rounded-lg transition-all cursor-pointer disabled:opacity-40"
        style={{
          background: text.trim() && !posting ? "var(--color-accent)" : "var(--color-bg-elevated)",
          color: text.trim() && !posting ? "#fff" : "var(--color-text-muted)",
        }}
        aria-label="Post message to channel"
      >
        <PaperPlaneTilt size={14} weight="fill" />
      </button>
    </div>
  );
}

// ── Create channel form ─────────────────────────────────────────────────────

interface CreateChannelFormProps {
  sessionId: string;
  projectSlug?: string;
  onCreated: (channelId: string) => void;
  onCancel: () => void;
}

function CreateChannelForm({
  sessionId,
  projectSlug,
  onCreated,
  onCancel,
}: CreateChannelFormProps) {
  const [topic, setTopic] = useState("");
  const [type, setType] = useState<"debate" | "review" | "red_team" | "brainstorm">("brainstorm");
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    const trimmed = topic.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    try {
      const res = await api.channels.create({
        projectSlug,
        type,
        topic: trimmed,
      });

      const channel = (res as { data: { id: string } }).data;
      await api.channels.linkSession(channel.id, sessionId);
      toast.success("Shared context channel created");
      onCreated(channel.id);
    } catch {
      toast.error("Failed to create channel");
    } finally {
      setCreating(false);
    }
  }, [topic, type, creating, projectSlug, sessionId, onCreated]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs font-semibold">
        New Shared Context
      </p>

      {/* Topic */}
      <div className="flex flex-col gap-1">
        <label
          className="text-xs"
         
          htmlFor="channel-topic"
        >
          Topic
        </label>
        <input
          id="channel-topic"
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Review auth implementation"
          className="rounded-lg px-2 py-1.5 text-xs input-bordered"
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-body)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          autoFocus
        />
      </div>

      {/* Type */}
      <div className="flex flex-col gap-1">
        <label
          className="text-xs"
         
          htmlFor="channel-type"
        >
          Type
        </label>
        <div className="relative">
          <select
            id="channel-type"
            value={type}
            onChange={(e) =>
              setType(e.target.value as "debate" | "review" | "red_team" | "brainstorm")
            }
            className="w-full appearance-none rounded-lg px-2 py-1.5 text-xs input-bordered cursor-pointer"
            style={{
              background: "var(--color-bg-card)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-body)",
            }}
          >
            <option value="brainstorm">Brainstorm</option>
            <option value="review">Review</option>
            <option value="debate">Debate</option>
            <option value="red_team">Red Team</option>
          </select>
          <CaretDown
            size={12}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
           
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => void handleCreate()}
          disabled={!topic.trim() || creating}
          className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-40"
          style={{ background: "var(--color-accent)", color: "#fff" }}
        >
          {creating ? "Creating…" : "Create"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-secondary)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Link session form ───────────────────────────────────────────────────────

interface LinkSessionFormProps {
  channelId: string;
  alreadyLinked: string[];
  onLinked: () => void;
}

function LinkSessionSelector({ channelId, alreadyLinked, onLinked }: LinkSessionFormProps) {
  const [sessions, setSessions] = useState<
    Array<{ id: string; model: string; status: string; projectSlug: string | null }>
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    api.sessions
      .list()
      .then((res) => {
        const all = (
          res.data.sessions as Array<{
            id: string;
            model: string;
            status: string;
            projectSlug?: string;
          }>
        ).filter((s) => !alreadyLinked.includes(s.id));
        setSessions(
          all.map((s) => ({
            id: s.id,
            model: s.model,
            status: s.status,
            projectSlug: s.projectSlug ?? null,
          })),
        );
      })
      .catch(() => {});
  }, [alreadyLinked]);

  const handleLink = useCallback(async () => {
    if (!selectedId || linking) return;
    setLinking(true);
    try {
      await api.channels.linkSession(channelId, selectedId);
      toast.success("Session linked to channel");
      setSelectedId("");
      onLinked();
    } catch {
      toast.error("Failed to link session");
    } finally {
      setLinking(false);
    }
  }, [selectedId, linking, channelId, onLinked]);

  if (sessions.length === 0) return null;

  return (
    <div className="flex gap-2 px-3 pb-2 flex-shrink-0">
      <div className="relative flex-1">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full appearance-none rounded-lg px-2 py-1.5 text-xs input-bordered cursor-pointer"
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-body)",
          }}
          aria-label="Select session to link"
        >
          <option value="">Link another session…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id.slice(0, 8)} — {s.model.split("-").slice(-2).join("-")}
            </option>
          ))}
        </select>
        <CaretDown
          size={12}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
         
        />
      </div>
      <button
        onClick={() => void handleLink()}
        disabled={!selectedId || linking}
        className="px-3 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40 transition-all"
        style={{ background: "var(--color-success)", color: "#fff" }}
        aria-label="Link selected session"
      >
        <LinkSimple size={14} weight="bold" />
      </button>
    </div>
  );
}

// ── Main ChannelPanel ───────────────────────────────────────────────────────

interface ChannelPanelProps {
  sessionId?: string;
  channelId: string | null | undefined;
  projectSlug?: string;
  onChannelChange?: (channelId: string | null) => void;
  /** Compact mode for embedding in Ring — hides link/unlink controls, tighter padding */
  compact?: boolean;
  /** Called when channel is not found (deleted/concluded) — allows parent to reset state */
  onChannelLost?: () => void;
}

export function ChannelPanel({
  sessionId,
  channelId,
  projectSlug,
  onChannelChange,
  compact = false,
  onChannelLost,
}: ChannelPanelProps) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChannel = useCallback(async (id: string) => {
    try {
      const res = await api.channels.get(id);
      setChannel(res.data);
    } catch {
      // channel may have been deleted
      setChannel(null);
      onChannelLost?.();
    }
  }, [onChannelLost]);

  // Initial load + poll every 5 seconds
  useEffect(() => {
    if (!channelId) {
      setChannel(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on channel change
      return;
    }

    setLoading(true);
    fetchChannel(channelId).finally(() => setLoading(false));

    pollRef.current = setInterval(() => {
      void fetchChannel(channelId);
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [channelId, fetchChannel]);

  const handleCreated = useCallback(
    async (newChannelId: string) => {
      setShowCreate(false);
      onChannelChange?.(newChannelId);
      await fetchChannel(newChannelId);
    },
    [onChannelChange, fetchChannel],
  );

  const handleUnlinkSelf = useCallback(async () => {
    if (!channelId || !sessionId) return;
    try {
      await api.channels.unlinkSession(channelId, sessionId);
      toast.success("Session unlinked from channel");
      setChannel(null);
      onChannelChange?.(null);
    } catch {
      toast.error("Failed to unlink session");
    }
  }, [channelId, sessionId, onChannelChange]);

  // No channel linked
  if (!channelId) {
    if (showCreate && sessionId) {
      return (
        <CreateChannelForm
          sessionId={sessionId}
          projectSlug={projectSlug}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 p-4">
        <ChatTeardropDots
          size={28}
         
          aria-hidden="true"
        />
        <p className="text-xs text-center">
          No shared context channel linked to this session.
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
          style={{ background: "var(--color-accent)", color: "#fff" }}
        >
          <Plus size={13} weight="bold" aria-hidden="true" />
          Create Shared Context
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-8"
       
      >
        <p className="text-xs">Loading channel…</p>
      </div>
    );
  }

  if (!channel) {
    return (
      <div
        className="flex items-center justify-center py-8"
       
      >
        <p className="text-xs">Channel not found.</p>
      </div>
    );
  }

  const isActive = channel.status === "active";
  const statusColor = isActive ? "var(--color-accent)" : "var(--color-text-muted)";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Channel header */}
      <div
        className="flex flex-col gap-1 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <LinkSimple size={13} style={{ color: statusColor, flexShrink: 0 }} aria-hidden="true" />
          <span
            className="text-xs font-semibold flex-1 truncate"
           
            title={channel.topic}
          >
            {channel.topic}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded-full capitalize flex-shrink-0"
            style={{
              background: `${statusColor}20`,
              color: statusColor,
              fontSize: 10,
            }}
          >
            {channel.status}
          </span>
          {!compact && (
            <button
              onClick={() => void handleUnlinkSelf()}
              className="flex-shrink-0 p-1 rounded transition-all cursor-pointer"
              aria-label="Unlink session from channel"
              title="Unlink this session"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="text-xs px-1.5 py-0.5 rounded-full capitalize"
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-muted)",
              fontSize: 10,
            }}
          >
            {TYPE_LABELS[channel.type] ?? channel.type}
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)", fontSize: 10 }}>
            {channel.linkedSessions.length} session
            {channel.linkedSessions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Message feed */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ChannelFeed messages={channel.messages} />
      </div>

      {/* Link session selector — hidden in compact mode */}
      {!compact && (
        <LinkSessionSelector
          channelId={channel.id}
          alreadyLinked={channel.linkedSessions.map((s) => s.id)}
          onLinked={() => void fetchChannel(channel.id)}
        />
      )}

      {/* Message composer (human messages) */}
      {isActive && (
        <MessageComposer channelId={channel.id} onPosted={() => void fetchChannel(channel.id)} />
      )}
    </div>
  );
}
