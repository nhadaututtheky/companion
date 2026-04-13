"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Robot, Wrench, Stop, ChatTeardropDots, ArrowClockwise } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

interface DebateMessage {
  id: string;
  channelId: string;
  agentId: string;
  role: string;
  content: string;
  round: number;
  timestamp: string | null;
}

interface DebateChannel {
  id: string;
  topic: string;
  status: string;
  type: string;
  maxRounds: number;
  currentRound: number;
  messages: DebateMessage[];
}

interface DebateFeedProps {
  channelId: string;
  onClose?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PLATFORM_BADGES: Record<string, { icon: string; color: string; label: string }> = {
  claude: { icon: "◈", color: "#d97706", label: "Claude" },
  codex: { icon: "◇", color: "#22c55e", label: "Codex" },
  gemini: { icon: "◆", color: "#3b82f6", label: "Gemini" },
  opencode: { icon: "☁", color: "#a855f7", label: "OpenCode" },
};

const ROLE_COLORS: Record<string, string> = {
  advocate: "#2196f3",
  challenger: "#ef4444",
  reviewer: "#10b981",
  builder: "#f59e0b",
  judge: "#8b5cf6",
  human: "#9ca3af",
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract tool use annotations from debate message content */
function parseToolBlocks(
  content: string,
): Array<{ type: "text" | "tool"; text: string; toolName?: string }> {
  const blocks: Array<{ type: "text" | "tool"; text: string; toolName?: string }> = [];

  // Look for tool summary pattern: "---\n*Tools used: X, Y*"
  const toolSummaryMatch = content.match(/\n---\n\*Tools used: (.+)\*$/);
  const mainContent = toolSummaryMatch ? content.slice(0, toolSummaryMatch.index) : content;

  if (mainContent.trim()) {
    blocks.push({ type: "text", text: mainContent.trim() });
  }

  if (toolSummaryMatch) {
    const tools = toolSummaryMatch[1]!.split(", ");
    for (const tool of tools) {
      blocks.push({ type: "tool", text: tool, toolName: tool });
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "text", text: content }];
}

function guessPlatformFromAgentId(agentId: string): string {
  if (agentId.includes("claude")) return "claude";
  if (agentId.includes("codex")) return "codex";
  if (agentId.includes("gemini")) return "gemini";
  if (agentId.includes("opencode")) return "opencode";
  return "claude";
}

// ── Message Bubble ─────────────────────────────────────────────────────────

function DebateMessageBubble({ msg }: { msg: DebateMessage }) {
  const platform = guessPlatformFromAgentId(msg.agentId);
  const badge = PLATFORM_BADGES[platform] ?? PLATFORM_BADGES.claude;
  const roleColor = ROLE_COLORS[msg.role] ?? "#9ca3af";
  const blocks = parseToolBlocks(msg.content);

  return (
    <div
      className="shadow-soft bg-bg-card flex flex-col gap-1 rounded-xl p-3"
      style={{
        borderLeft: `3px solid ${badge!.color}`,
      }}
    >
      {/* Agent header */}
      <div className="flex items-center gap-2">
        <span style={{ color: badge!.color, fontSize: 14 }}>{badge!.icon}</span>
        <span className="text-xs font-bold" style={{ color: badge!.color }}>
          {msg.agentId}
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-xs capitalize"
          style={{ background: `${roleColor}20`, color: roleColor, fontSize: 10 }}
        >
          {msg.role}
        </span>
        <span className="text-text-muted ml-auto text-xs" style={{ fontSize: 10 }}>
          R{msg.round}
        </span>
      </div>

      {/* Content blocks */}
      {blocks.map((block, i) =>
        block.type === "text" ? (
          <p key={i} className="text-text-primary whitespace-pre-wrap text-xs leading-relaxed">
            {block.text}
          </p>
        ) : (
          <div
            key={i}
            className="shadow-soft bg-bg-elevated flex items-center gap-1.5 rounded-lg px-2 py-1"
          >
            <Wrench size={11} className="text-text-muted" aria-hidden="true" />
            <span className="text-text-secondary font-mono text-xs" style={{ fontSize: 10 }}>
              {block.toolName}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

// ── Round Divider ──────────────────────────────────────────────────────────

function RoundDivider({ round, maxRounds }: { round: number; maxRounds: number }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1" style={{ background: "var(--color-border)" }} />
      <span
        className="text-text-secondary bg-bg-elevated rounded-full px-2 py-0.5 text-xs font-bold"
        style={{
          fontSize: 10,
        }}
      >
        Round {round} / {maxRounds}
      </span>
      <div className="h-px flex-1" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

// ── Main Feed Component ────────────────────────────────────────────────────

export function DebateFeed({ channelId }: DebateFeedProps) {
  const [channel, setChannel] = useState<DebateChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChannel = useCallback(async () => {
    try {
      const res = await api.channels.get(channelId);
      setChannel(res.data as DebateChannel);
    } catch {
      setChannel(null);
    }
  }, [channelId]);

  useEffect(() => {
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- loading state tied to fetch lifecycle
    fetchChannel().finally(() => setLoading(false));

    // Poll every 3 seconds for live updates
    pollRef.current = setInterval(() => {
      void fetchChannel();
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchChannel]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channel?.messages.length]);

  const handleAbort = useCallback(async () => {
    try {
      await api.channels.abortCLIDebate(channelId);
      toast.success("Debate aborted");
      void fetchChannel();
    } catch {
      toast.error("Failed to abort debate");
    }
  }, [channelId, fetchChannel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowClockwise size={20} className="text-text-muted animate-spin" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <ChatTeardropDots size={28} className="text-text-muted" />
        <p className="text-text-muted text-xs">Debate not found.</p>
      </div>
    );
  }

  const isActive = channel.status === "active";
  const messages = channel.messages;

  // Group messages by round for dividers
  const rounds = new Set(messages.map((m) => m.round));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-2"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex flex-col">
          <span className="text-text-primary text-xs font-bold">{channel.topic}</span>
          <span className="text-text-muted text-xs" style={{ fontSize: 10 }}>
            {isActive ? "Live" : channel.status} · {messages.length} messages
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <button
              onClick={() => void handleAbort()}
              className="text-danger flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
              style={{ background: "var(--color-danger)20" }}
              aria-label="Abort debate"
            >
              <Stop size={12} weight="fill" />
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Message feed */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Robot size={28} className="text-text-muted" />
            <p className="text-text-muted text-xs">
              {isActive ? "Agents are preparing their arguments..." : "No messages in this debate."}
            </p>
          </div>
        ) : (
          <>
            {[...rounds]
              .sort((a, b) => a - b)
              .map((round) => {
                const roundMsgs = messages.filter((m) => m.round === round);
                return (
                  <div key={round} className="flex flex-col gap-2">
                    <RoundDivider round={round} maxRounds={channel.maxRounds} />
                    {roundMsgs.map((msg) => (
                      <DebateMessageBubble key={msg.id} msg={msg} />
                    ))}
                  </div>
                );
              })}
          </>
        )}

        {/* Live indicator */}
        {isActive && messages.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-2">
            <div
              className="h-2 w-2 animate-pulse rounded-full"
              style={{ background: "var(--color-accent)" }}
            />
            <span className="text-text-muted text-xs">Agents are debating...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
