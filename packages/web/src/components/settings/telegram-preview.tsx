"use client";

import { Robot } from "@phosphor-icons/react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InlineButton {
  label: string;
}

interface ChatMessage {
  id: number;
  direction: "in" | "out";
  text: string;
  time: string;
  isAction?: boolean;
  inlineKeyboard?: InlineButton[][];
  isTyping?: boolean;
  showSenderLabel?: boolean;
}

// ── Static conversation data ──────────────────────────────────────────────────

const MESSAGES: ChatMessage[] = [
  {
    id: 1,
    direction: "out",
    text: "/start",
    time: "14:01",
  },
  {
    id: 2,
    direction: "in",
    text: "🚀 Welcome to Companion!\n\nSelect a project to start:",
    time: "14:01",
    showSenderLabel: true,
    inlineKeyboard: [
      [{ label: "📂 MyProject" }, { label: "📂 Companion" }],
      [{ label: "📂 Feature Factory" }],
    ],
  },
  {
    id: 3,
    direction: "out",
    text: "📂 Companion",
    time: "14:01",
    isAction: true,
  },
  {
    id: 4,
    direction: "in",
    text: "🚀 Session started\n\n📂 Project: Companion\n🤖 Model: claude-sonnet-4-6\n⚙️ Mode: default",
    time: "14:01",
  },
  {
    id: 5,
    direction: "out",
    text: "Fix the login bug in auth.ts",
    time: "14:02",
  },
  {
    id: 6,
    direction: "in",
    text: "I'll look at the auth.ts file to understand the login flow...\n\nReading src/auth.ts...",
    time: "14:02",
    isTyping: true,
  },
  {
    id: 7,
    direction: "in",
    text: "🔐 Permission Request\n\nTool: Edit\nFile: src/auth.ts\nDescription: Fix null check in login handler",
    time: "14:02",
    inlineKeyboard: [[{ label: "✅ Allow" }, { label: "❌ Deny" }]],
  },
  {
    id: 8,
    direction: "out",
    text: "✅ Allow",
    time: "14:02",
    isAction: true,
  },
  {
    id: 9,
    direction: "in",
    text: "✅ Fixed the login bug.\n\nChanges:\n• Added null check for user object\n• Fixed token expiry comparison\n\n💰 Cost: $0.0234 | Tokens: 1.2K in / 856 out",
    time: "14:02",
  },
];

// ── Command reference data ────────────────────────────────────────────────────

interface CommandEntry {
  cmd: string;
  desc: string;
}

interface CommandCategory {
  category: string;
  commands: CommandEntry[];
}

const COMMAND_REFERENCE: CommandCategory[] = [
  {
    category: "Session",
    commands: [
      { cmd: "/start", desc: "Pick a project and begin a new session" },
      { cmd: "/new", desc: "Start fresh session in current project" },
      { cmd: "/stop", desc: "End the current session" },
      { cmd: "/resume", desc: "Resume the last paused session" },
      { cmd: "/projects", desc: "List all available projects" },
      { cmd: "/templates", desc: "Browse and use session templates" },
    ],
  },
  {
    category: "Control",
    commands: [
      { cmd: "/allow", desc: "Approve the pending tool permission" },
      { cmd: "/deny", desc: "Reject the pending tool permission" },
      { cmd: "/exitplan", desc: "Exit plan mode and resume execution" },
      { cmd: "/cancel", desc: "Cancel the current operation" },
      { cmd: "/compact", desc: "Compact conversation context" },
      { cmd: "/autoapprove", desc: "Toggle auto-approval for tool permissions" },
    ],
  },
  {
    category: "Info",
    commands: [
      { cmd: "/status", desc: "Show current session status" },
      { cmd: "/cost", desc: "Show token usage and cost so far" },
      { cmd: "/files", desc: "List files modified in this session" },
      { cmd: "/model", desc: "Show or switch the active model" },
      { cmd: "/mood", desc: "Agent pulse — health check and energy level" },
      { cmd: "/help", desc: "Show all available commands" },
    ],
  },
  {
    category: "Multi-Bot Debate",
    commands: [
      { cmd: "@bot message", desc: "Mention a bot in group to trigger debate turn" },
      { cmd: "/debate topic", desc: "Start a cross-platform debate on a topic" },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <span
      className="inline-flex"
      style={{
        alignItems: "center",
        gap: 3,
        marginLeft: 4,
        verticalAlign: "middle",
      }}
      aria-label="Bot is typing"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block rounded-full"
          style={{
            width: 5,
            height: 5,
            background: "#8d9eaa",
            animation: "tg-bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

function InlineKeyboard({ rows }: { rows: InlineButton[][] }) {
  return (
    <div className="flex" style={{ flexDirection: "column", gap: 4, marginTop: 8 }}>
      {rows.map((row, ri) => (
        <div key={ri} className="flex" style={{ gap: 4 }}>
          {row.map((btn, bi) => (
            <button
              key={bi}
              aria-label={btn.label}
              className="overflow-hidden whitespace-nowrap"
              style={{
                flex: 1,
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid #2AABEE55",
                background: "transparent",
                color: "#2AABEE",
                fontSize: 12,
                fontFamily: "inherit",
                cursor: "default",
                textOverflow: "ellipsis",
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isIn = msg.direction === "in";

  const bubbleStyle: React.CSSProperties = {
    maxWidth: "80%",
    padding: "7px 10px",
    borderRadius: isIn ? "12px 12px 12px 2px" : "12px 12px 2px 12px",
    background: isIn ? "#182533" : "#2b5278",
    color: "#e3ecf3",
    fontSize: 13.5,
    lineHeight: "1.5",
    wordBreak: "break-word",
    position: "relative",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  };

  // Action bubbles (button taps shown as outgoing) get a slightly muted look
  if (msg.isAction) {
    bubbleStyle.background = "#1e3a52";
    bubbleStyle.color = "#8db8d4";
    bubbleStyle.fontStyle = "italic";
  }

  const text = msg.isTyping ? msg.text : msg.text;

  return (
    <div
      className="flex"
      style={{
        flexDirection: "column",
        alignItems: isIn ? "flex-start" : "flex-end",
        gap: 2,
        width: "100%",
      }}
    >
      {/* Sender label on first incoming message */}
      {isIn && msg.showSenderLabel && (
        <span
          className="font-semibold"
          style={{
            fontSize: 11,
            color: "#2AABEE",
            paddingLeft: 2,
            fontFamily: "inherit",
          }}
        >
          CompanionBot
        </span>
      )}

      <div style={bubbleStyle}>
        {/* Message text — preserve newlines */}
        <span style={{ whiteSpace: "pre-line" }}>{text}</span>

        {/* Typing indicator appended inline after last line */}
        {msg.isTyping && <TypingIndicator />}

        {/* Timestamp + read ticks */}
        <div
          className="flex"
          style={{
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 3,
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 10, color: "#8d9eaa" }}>{msg.time}</span>
          {!isIn && (
            <span style={{ fontSize: 10, color: "#2AABEE" }} aria-hidden="true">
              ✓✓
            </span>
          )}
        </div>

        {/* Inline keyboard below message content */}
        {msg.inlineKeyboard && <InlineKeyboard rows={msg.inlineKeyboard} />}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TelegramPreview() {
  return (
    <div className="flex" style={{ flexDirection: "column", gap: 20 }}>
      {/* Keyframe injection */}
      <style>{`
        @keyframes tg-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {/* ── Phone mockup ── */}
      <div
        className="overflow-hidden"
        style={{
          background: "#17212b",
          borderRadius: 14,
          border: "1px solid #2a3f52",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
        role="img"
        aria-label="Telegram chat preview showing bot conversation"
      >
        {/* Header bar */}
        <div
          className="flex"
          style={{
            background: "#17212b",
            borderBottom: "1px solid #1e2e3d",
            padding: "10px 14px",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* Avatar */}
          <div
            className="flex shrink-0 rounded-full"
            style={{
              width: 36,
              height: 36,
              background: "#2b5278",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden="true"
          >
            <Robot size={20} weight="fill" color="#2AABEE" />
          </div>

          {/* Name + status */}
          <div className="flex" style={{ flexDirection: "column", gap: 1 }}>
            <span
              className="font-semibold"
              style={{
                fontSize: 14,
                color: "#e3ecf3",
                lineHeight: 1,
              }}
            >
              CompanionBot
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#2AABEE",
                lineHeight: 1,
              }}
            >
              online
            </span>
          </div>
        </div>

        {/* Chat area */}
        <div
          className="flex"
          style={{
            maxHeight: 400,
            overflowY: "auto",
            padding: "12px 10px",
            flexDirection: "column",
            gap: 6,
            background: "#0e1621",
          }}
        >
          {MESSAGES.map((msg) => (
            <Bubble key={msg.id} msg={msg} />
          ))}
        </div>

        {/* Input bar (decorative) */}
        <div
          className="flex"
          style={{
            background: "#17212b",
            borderTop: "1px solid #1e2e3d",
            padding: "8px 12px",
            alignItems: "center",
            gap: 8,
          }}
          aria-hidden="true"
        >
          <div
            style={{
              flex: 1,
              background: "#1c2c3a",
              borderRadius: 20,
              padding: "6px 12px",
              fontSize: 13,
              color: "#4a6278",
              border: "1px solid #243444",
            }}
          >
            Message
          </div>
          <div
            className="flex shrink-0 rounded-full"
            style={{
              width: 32,
              height: 32,
              background: "#2AABEE",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Command Reference ── */}
      <div
        className="bg-bg-elevated border-border overflow-hidden border"
        style={{
          borderRadius: 10,
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <span
            className="text-text-primary font-semibold"
            style={{
              fontSize: 12,
            }}
          >
            Command Reference
          </span>
        </div>

        <div style={{ padding: "4px 0" }}>
          {COMMAND_REFERENCE.map((group) => (
            <div key={group.category}>
              {/* Category header */}
              <div
                className="text-text-muted font-bold"
                style={{
                  padding: "6px 14px 3px",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {group.category}
              </div>

              {/* Commands */}
              {group.commands.map((entry) => (
                <div
                  key={entry.cmd}
                  className="flex"
                  style={{
                    alignItems: "baseline",
                    gap: 10,
                    padding: "4px 14px",
                  }}
                >
                  <code
                    className="shrink-0"
                    style={{
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, Fira Code, monospace",
                      color: "#2AABEE",
                      minWidth: 110,
                    }}
                  >
                    {entry.cmd}
                  </code>
                  <span
                    className="text-text-secondary"
                    style={{
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    {entry.desc}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
