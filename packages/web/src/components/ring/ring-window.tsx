"use client";
import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { PaperPlaneTilt, X, XCircle, Scales } from "@phosphor-icons/react";
import { useRingStore, MODEL_PRESETS } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];

function getSessionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return GOOGLE_COLORS[Math.abs(hash) % GOOGLE_COLORS.length]!;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface RingWindowProps {
  anchorX: number;
  anchorY: number;
}

export function RingWindow({ anchorX, anchorY }: RingWindowProps) {
  const linkedSessionIds = useRingStore((s) => s.linkedSessionIds);
  const sharedMessages = useRingStore((s) => s.sharedMessages);
  const addSharedMessage = useRingStore((s) => s.addSharedMessage);
  const unlinkSession = useRingStore((s) => s.unlinkSession);
  const setExpanded = useRingStore((s) => s.setExpanded);
  const mode = useRingStore((s) => s.mode);
  const sessionsMap = useSessionStore((s) => s.sessions);
  const sessions = Object.values(sessionsMap);

  const setMode = useRingStore((s) => s.setMode);
  const setDebateChannelId = useRingStore((s) => s.setDebateChannelId);
  const debateChannelId = useRingStore((s) => s.debateChannelId);
  const debateAgentModels = useRingStore((s) => s.debateAgentModels);
  const setDebateAgentModel = useRingStore((s) => s.setDebateAgentModel);
  const clearDebateAgentModels = useRingStore((s) => s.clearDebateAgentModels);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [hoveredBubble, setHoveredBubble] = useState<number>(-1);
  const [debateTopic, setDebateTopic] = useState("");
  const [startingDebate, setStartingDebate] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) { setOpen(true); return; }
    requestAnimationFrame(() => setOpen(true));
  }, [reducedMotion]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [sharedMessages]);

  // Auto-close if all sessions unlinked
  useEffect(() => {
    if (linkedSessionIds.length === 0) setExpanded(false);
  }, [linkedSessionIds.length, setExpanded]);

  // Dock layout: bubbles in a row to the LEFT of the ring
  const bubbleSize = 40;
  const bubbleGap = 6;
  const dockWidth = linkedSessionIds.length * (bubbleSize + bubbleGap) - bubbleGap;

  // Card: right edge near Ring, above bubbles
  const cardWidth = 300;
  const cardHeight = 300;
  const cardLeft = Math.max(8, anchorX - cardWidth + 26);
  const cardTop = Math.max(8, anchorY - bubbleSize / 2 - cardHeight - 8);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    addSharedMessage({
      id: `user-${Date.now()}`, sessionId: "user", sessionName: "You",
      sessionColor: "#4285F4", content, timestamp: Date.now(), role: "user",
    });

    try {
      await Promise.all(linkedSessionIds.map(async (sid) => {
        await api.sessions.message(sid, content);
        const session = sessions.find((s) => s.id === sid);
        addSharedMessage({
          id: `confirm-${sid}-${Date.now()}`, sessionId: sid,
          sessionName: session?.projectName ?? sid.slice(0, 8),
          sessionColor: getSessionColor(sid),
          content: "Sent — response in terminal.",
          timestamp: Date.now(), role: "assistant",
        });
      }));
      toast.success(`Broadcasting to ${linkedSessionIds.length} session(s)…`);
    } catch (err) { toast.error(String(err)); }
    finally { setSending(false); }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  }

  async function handleStartDebate() {
    if (!debateTopic.trim() || startingDebate) return;
    setStartingDebate(true);
    try {
      // Build agent model config (skip "default" entries)
      const agentModels = debateAgentModels.length > 0
        ? debateAgentModels.map((m) => ({
            agentId: m.agentId,
            model: m.model,
            label: m.label,
          }))
        : undefined;

      const res = await api.post<{ data: { channelId: string } }>("/api/channels/debate", {
        topic: debateTopic.trim(),
        format: "pro_con",
        agentModels,
      });
      setDebateChannelId(res.data.channelId);
      setMode("debate");
      setDebateTopic("");
      clearDebateAgentModels();
      const modelInfo = agentModels
        ? ` (${agentModels.map((m) => m.label).join(" vs ")})`
        : "";
      toast.success(`Debate started${modelInfo} — agents are thinking…`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setStartingDebate(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setExpanded(false)}
        style={{ position: "fixed", inset: 0, zIndex: 41 }}
      />

      {/* Chrome-style color bridge connecting bubbles to ring */}
      <svg
        style={{
          position: "fixed",
          left: anchorX - 26 - 12 - dockWidth - 4,
          top: anchorY - 2,
          width: dockWidth + 16,
          height: 4,
          zIndex: 42,
          opacity: open ? 0.6 : 0,
          transition: reducedMotion ? "none" : "opacity 0.3s ease 0.1s",
        }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="chrome-bridge" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EA4335" />
            <stop offset="33%" stopColor="#FBBC04" />
            <stop offset="66%" stopColor="#34A853" />
            <stop offset="100%" stopColor="#4285F4" />
          </linearGradient>
        </defs>
        <rect x="0" y="2" width="100%" height="4" rx="2" fill="url(#chrome-bridge)" />
      </svg>

      {/* Dock: session bubbles to the LEFT of ring — macOS magnification */}
      {linkedSessionIds.map((sid, i) => {
        const session = sessions.find((s) => s.id === sid);
        const color = getSessionColor(sid);
        const delay = i * 0.05;

        // macOS dock magnification
        const isHovered = hoveredBubble === i;
        const dist = hoveredBubble === -1 ? 99 : Math.abs(hoveredBubble - i);
        const scale = isHovered ? 1.35 : dist === 1 ? 1.15 : 1;
        const size = bubbleSize * scale;

        // Position: left of Ring with gap. anchorX = ring center, ring radius ~26px
        const ringEdgeLeft = anchorX - 26 - 12;
        const baseX = ringEdgeLeft - (linkedSessionIds.length - i) * (bubbleSize + bubbleGap);
        const baseY = anchorY - size / 2;

        return (
          <div
            key={sid}
            onMouseEnter={() => setHoveredBubble(i)}
            onMouseLeave={() => setHoveredBubble(-1)}
            style={{
              position: "fixed",
              left: baseX,
              top: baseY,
              width: size,
              height: size,
              zIndex: 43,
              transform: open ? "scale(1)" : "scale(0)",
              opacity: open ? 1 : 0,
              transition: reducedMotion ? "none" : `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
            }}
          >
            {/* Bubble */}
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                border: `2.5px solid ${color}`,
                background: "var(--color-bg-card, #fff)",
                boxShadow: isHovered ? `0 4px 16px ${color}40` : "0 2px 8px rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                cursor: "default",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{
                fontSize: isHovered ? 8 : 7, fontWeight: 600,
                color: "var(--color-text-secondary, #555)",
                maxWidth: size - 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {(session?.projectName ?? sid).slice(0, 5)}
              </span>
            </div>

            {/* Unlink button — shows on hover */}
            {isHovered && (
              <button
                onClick={() => unlinkSession(sid)}
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "none",
                  background: "#EA4335",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }}
                aria-label={`Unlink ${session?.projectName ?? sid}`}
                title="Unlink session"
              >
                <XCircle size={12} weight="fill" />
              </button>
            )}
          </div>
        );
      })}

      {/* Chat card — above dock area */}
      <div
        style={{
          position: "fixed",
          left: cardLeft,
          top: cardTop,
          width: cardWidth,
          height: cardHeight,
          zIndex: 42,
          borderRadius: 16,
          background: "var(--color-bg-card, #fff)",
          border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transform: open ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)",
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.08s",
        }}
      >
        {/* Header with mode toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderBottom: "1px solid var(--color-border, rgba(0,0,0,0.06))", flexShrink: 0 }}>
          {linkedSessionIds.map((sid) => (
            <div key={sid} style={{ width: 7, height: 7, borderRadius: "50%", background: getSessionColor(sid) }} />
          ))}
          {/* Mode tabs */}
          <div style={{ flex: 1, display: "flex", gap: 2, marginLeft: 4 }}>
            <button
              onClick={() => setMode("broadcast")}
              style={{
                fontSize: 10, fontWeight: mode === "broadcast" ? 700 : 500, padding: "2px 6px", borderRadius: 6, border: "none", cursor: "pointer",
                background: mode === "broadcast" ? "var(--color-accent, #4285F4)" : "transparent",
                color: mode === "broadcast" ? "#fff" : "var(--color-text-muted, #999)",
              }}
            >
              Broadcast
            </button>
            <button
              onClick={() => setMode("debate")}
              style={{
                fontSize: 10, fontWeight: mode === "debate" ? 700 : 500, padding: "2px 6px", borderRadius: 6, border: "none", cursor: "pointer",
                background: mode === "debate" ? "#EA4335" : "transparent",
                color: mode === "debate" ? "#fff" : "var(--color-text-muted, #999)",
                display: "flex", alignItems: "center", gap: 3,
              }}
            >
              <Scales size={10} weight="bold" /> Debate
            </button>
          </div>
          <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--color-text-muted, #999)", display: "flex" }} aria-label="Close">
            <X size={12} weight="bold" />
          </button>
        </div>

        {/* Content area — switches between broadcast chat and debate */}
        <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Debate mode: topic input + start */}
          {mode === "debate" && !debateChannelId && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center", height: "100%", gap: 6, padding: "0 2px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                <Scales size={20} weight="duotone" style={{ color: "#EA4335", opacity: 0.5 }} />
                <span style={{ fontSize: 11, color: "var(--color-text-muted, #999)" }}>
                  Multi-model debate
                </span>
              </div>
              <input
                type="text"
                value={debateTopic}
                onChange={(e) => setDebateTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleStartDebate(); }}
                placeholder="Debate topic…"
                style={{
                  width: "100%", padding: "5px 8px", fontSize: 11, borderRadius: 8,
                  border: "1px solid var(--color-border, rgba(0,0,0,0.08))", outline: "none",
                  background: "var(--color-bg-elevated, #f8f8f8)", color: "var(--color-text-primary, #333)",
                }}
              />
              {/* Agent model selectors */}
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { agentId: "advocate", label: "Advocate", color: "#4285F4" },
                  { agentId: "challenger", label: "Challenger", color: "#EA4335" },
                ].map(({ agentId, label, color }) => {
                  const selected = debateAgentModels.find((m) => m.agentId === agentId);
                  return (
                    <div key={agentId} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color, textTransform: "uppercase" }}>
                        {label}
                      </span>
                      <select
                        value={selected?.model ?? "default"}
                        onChange={(e) => {
                          const preset = MODEL_PRESETS.find((p) => p.id === e.target.value);
                          setDebateAgentModel(agentId, e.target.value, preset?.label ?? e.target.value);
                        }}
                        style={{
                          fontSize: 10, padding: "3px 4px", borderRadius: 6,
                          border: `1px solid ${selected ? color + "60" : "var(--color-border, rgba(0,0,0,0.08))"}`,
                          background: selected ? color + "08" : "var(--color-bg-elevated, #f8f8f8)",
                          color: "var(--color-text-primary, #333)",
                          outline: "none", cursor: "pointer", width: "100%",
                        }}
                      >
                        {MODEL_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => void handleStartDebate()}
                disabled={!debateTopic.trim() || startingDebate}
                style={{
                  padding: "5px 16px", fontSize: 11, fontWeight: 600, borderRadius: 8, border: "none",
                  background: debateTopic.trim() ? "#EA4335" : "#ccc", color: "#fff",
                  cursor: debateTopic.trim() ? "pointer" : "not-allowed",
                }}
              >
                {startingDebate ? "Starting…" : "⚖️ Start Debate"}
              </button>
            </div>
          )}

          {/* Debate running */}
          {mode === "debate" && debateChannelId && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6 }}>
              <Scales size={28} weight="duotone" style={{ color: "#EA4335" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary, #333)" }}>
                Debate in progress
              </span>
              <span style={{ fontSize: 10, color: "var(--color-text-muted, #999)", textAlign: "center" }}>
                Agents are debating. View results in Telegram or check /channels API.
              </span>
              <button
                onClick={() => { setDebateChannelId(null); setMode("broadcast"); }}
                style={{ padding: "4px 12px", fontSize: 10, borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary, #666)" }}
              >
                Back to Broadcast
              </button>
            </div>
          )}

          {/* Broadcast mode: chat */}
          {mode === "broadcast" && sharedMessages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6 }}>
              <span style={{ fontSize: 22, opacity: 0.2 }}>✦</span>
              <span style={{ fontSize: 11, color: "var(--color-text-muted, #999)", textAlign: "center" }}>
                Type to broadcast to all linked sessions
              </span>
            </div>
          )}
          {mode === "broadcast" && sharedMessages.map((msg) => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 1 }}>
              <span style={{ fontSize: 9, color: "var(--color-text-muted, #999)" }}>{msg.sessionName} · {formatTime(msg.timestamp)}</span>
              <div style={{
                fontSize: 12, lineHeight: 1.4, padding: "4px 8px", borderRadius: 8, maxWidth: "85%",
                background: msg.role === "user" ? "#4285F4" : "var(--color-bg-elevated, #f0f0f0)",
                color: msg.role === "user" ? "#fff" : "var(--color-text-primary, #333)",
                borderLeft: msg.role === "assistant" ? `3px solid ${msg.sessionColor}` : undefined,
              }}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Input — broadcast mode only */}
        {mode === "broadcast" && <div style={{ display: "flex", gap: 6, padding: "6px 8px", borderTop: "1px solid var(--color-border, rgba(0,0,0,0.06))", flexShrink: 0 }}>
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Broadcast message…" rows={1}
            style={{ flex: 1, resize: "none", border: "1px solid var(--color-border, rgba(0,0,0,0.08))", borderRadius: 8, padding: "5px 8px", fontSize: 12, outline: "none", background: "var(--color-bg-elevated, #f8f8f8)", color: "var(--color-text-primary, #333)", minHeight: 20, maxHeight: 60 }}
          />
          <button
            onClick={() => void handleSend()} disabled={sending || !input.trim()}
            style={{ background: "#4285F4", color: "#fff", border: "none", borderRadius: 8, padding: "0 10px", cursor: input.trim() ? "pointer" : "default", opacity: input.trim() ? 1 : 0.4, display: "flex", alignItems: "center" }}
            aria-label="Send"
          >
            <PaperPlaneTilt size={13} weight="fill" />
          </button>
        </div>}
      </div>
    </>
  );
}
