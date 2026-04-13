"use client";

import { useState } from "react";
import {
  CaretDown,
  CaretRight,
  NumberCircleOne,
  NumberCircleTwo,
  NumberCircleThree,
  NumberCircleFour,
  Robot,
  UsersThree,
  Lightning,
  Info,
} from "@phosphor-icons/react";

// ── Types ───────────────────────────────────────────────────────────

interface StepProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

// ── Step Component ──────────────────────────────────────────────────

function SetupStep({ icon, title, children }: StepProps) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <h4 className="text-text-primary mb-1.5 text-xs font-semibold">{title}</h4>
        <div className="text-text-secondary text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

// ── Platform Badge ──────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  claude: "#4285F4",
  codex: "#10b981",
  gemini: "#FBBC04",
  opencode: "#a855f7",
};

function PlatformBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        background: `${color}15`,
        color,
        border: `1px solid ${color}30`,
        fontSize: 10,
      }}
    >
      <Robot size={10} weight="fill" aria-hidden="true" />
      {name}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function TelegramDebateGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="shadow-soft bg-bg-card overflow-hidden rounded-xl">
      {/* Header — collapsible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 transition-colors"
        style={{ background: "transparent" }}
        aria-expanded={expanded}
      >
        {expanded ? (
          <CaretDown size={12} weight="bold" className="text-text-muted" />
        ) : (
          <CaretRight size={12} weight="bold" className="text-text-muted" />
        )}
        <UsersThree size={16} weight="duotone" className="text-accent" />
        <span className="text-text-primary text-xs font-semibold">
          Multi-Bot Debate Setup Guide
        </span>
        <span
          className="text-accent ml-auto rounded-full px-2 py-0.5 text-xs"
          style={{
            background: "var(--color-accent)15",
            fontSize: 10,
          }}
        >
          4 steps
        </span>
      </button>

      {/* Content */}
      {expanded && (
        <div
          className="flex flex-col gap-5 px-4 pb-4"
          style={{ boxShadow: "0 -1px 0 var(--color-border)" }}
        >
          {/* Intro */}
          <div className="shadow-soft bg-bg-elevated mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5">
            <Info
              size={14}
              weight="fill"
              className="text-accent shrink-0"
              style={{ marginTop: 1 }}
            />
            <p className="text-text-secondary text-xs leading-relaxed">
              Run multiple AI bots in a Telegram group — each using a different CLI platform or
              provider. They can debate topics, review code from different perspectives, or
              collaborate on tasks.
            </p>
          </div>

          {/* Supported platforms */}
          <div className="flex flex-wrap gap-1.5 px-1">
            <PlatformBadge name="Claude Code" color={PLATFORM_COLORS.claude} />
            <PlatformBadge name="Codex CLI" color={PLATFORM_COLORS.codex} />
            <PlatformBadge name="Gemini CLI" color={PLATFORM_COLORS.gemini} />
            <PlatformBadge name="OpenCode" color={PLATFORM_COLORS.opencode} />
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-4">
            <SetupStep
              icon={<NumberCircleOne size={20} weight="fill" className="text-accent" />}
              title="Create bots on Telegram"
            >
              <p className="mb-2">
                Open <strong>@BotFather</strong> on Telegram and create one bot per platform you
                want in the debate:
              </p>
              <div
                className="bg-bg-elevated flex flex-col gap-1 rounded-lg p-2.5 font-mono"
                style={{ fontSize: 11 }}
              >
                <span>
                  CompanionClaude →{" "}
                  <span style={{ color: PLATFORM_COLORS.claude }}>Claude Code</span>
                </span>
                <span>
                  CompanionCodex → <span style={{ color: PLATFORM_COLORS.codex }}>Codex CLI</span>
                </span>
                <span>
                  CompanionGemini →{" "}
                  <span style={{ color: PLATFORM_COLORS.gemini }}>Gemini CLI</span>
                </span>
              </div>
              <p className="text-text-muted mt-2">
                Save each bot token — you&apos;ll need them in the next step.
              </p>
            </SetupStep>

            <SetupStep
              icon={<NumberCircleTwo size={20} weight="fill" className="text-accent" />}
              title="Add bots in Companion"
            >
              <p className="mb-2">
                In <strong>Bot Management</strong> above, click &quot;Add Bot&quot; for each:
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                <li>
                  Set the <strong>Role</strong> to match the platform (Claude Code, Codex CLI, etc.)
                </li>
                <li>Paste the bot token from BotFather</li>
                <li>
                  Set the same <strong>Allowed Chat IDs</strong> — your debate group ID
                </li>
                <li>
                  Add your <strong>Admin User ID</strong> to all bots
                </li>
              </ul>
            </SetupStep>

            <SetupStep
              icon={<NumberCircleThree size={20} weight="fill" className="text-accent" />}
              title="Create a Telegram group"
            >
              <ul className="flex list-disc flex-col gap-1 pl-4">
                <li>Create a new group (or use an existing one)</li>
                <li>Add all your bots to the group</li>
                <li>
                  <strong>Enable Forum Topics</strong> (optional) — each debate gets its own thread
                </li>
                <li>
                  Get the group ID: add <strong>@userinfobot</strong> to the group, it will show the
                  chat ID (starts with <code className="bg-bg-elevated rounded px-1">-100...</code>)
                </li>
              </ul>
            </SetupStep>

            <SetupStep
              icon={<NumberCircleFour size={20} weight="fill" className="text-accent" />}
              title="Start a debate"
            >
              <p className="mb-2">In the group chat, you can:</p>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                <li>
                  <strong>Mention a bot</strong> —{" "}
                  <code className="bg-bg-elevated rounded px-1">
                    @CompanionClaude review auth.ts
                  </code>
                </li>
                <li>
                  <strong>Start debate</strong> — from Companion web UI using the CLI Debate button,
                  select platforms and topic
                </li>
                <li>
                  Each bot responds using its own CLI platform — different perspectives, same
                  codebase
                </li>
              </ul>
            </SetupStep>
          </div>

          {/* Tips */}
          <div className="shadow-soft bg-bg-elevated flex flex-col gap-2 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Lightning
                size={12}
                weight="fill"
                style={{ color: "var(--color-warning, #f59e0b)" }}
              />
              <span className="text-text-primary text-xs font-semibold">Tips</span>
            </div>
            <ul className="text-text-muted flex flex-col gap-1 text-xs leading-relaxed">
              <li>• Each bot needs its own unique token from BotFather</li>
              <li>
                • Use <strong>Session Streaming</strong> to broadcast live output to the group
              </li>
              <li>
                • Set <strong>Notification Group ID</strong> to get alerts when sessions complete
              </li>
              <li>• Bots share the same Companion server — no extra setup needed</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
