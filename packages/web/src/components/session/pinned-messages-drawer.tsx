"use client";
import { useEffect } from "react";
import { X, PushPin, ArrowRight, Robot, User } from "@phosphor-icons/react";
import { usePinnedMessagesStore } from "@/lib/stores/pinned-messages-store";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PinnedMessage {
  role: string;
  content: string;
  timestamp?: string | number;
}

interface PinnedMessagesDrawerProps {
  sessionId: string;
  messages: PinnedMessage[];
  onJumpTo: (index: number) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(text: string, max = 100): string {
  const cleaned = text.replace(/\n+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

// ── Drawer ────────────────────────────────────────────────────────────────────

export function PinnedMessagesDrawer({
  sessionId,
  messages,
  onJumpTo,
  onClose,
}: PinnedMessagesDrawerProps) {
  const pins = usePinnedMessagesStore((s) => s.getPins(sessionId));
  const togglePin = usePinnedMessagesStore((s) => s.togglePin);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const pinnedMessages = pins
    .map((idx) => ({ idx, msg: messages[idx] }))
    .filter((entry): entry is { idx: number; msg: PinnedMessage } => entry.msg !== undefined);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0, 0, 0, 0.3)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="bg-bg-card fixed bottom-0 right-0 top-0 z-50 flex flex-col"
        style={{
          width: 320,
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
        }}
        role="dialog"
        aria-label="Pinned messages"
        aria-modal="true"
      >
        {/* Header */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <PushPin size={15} weight="fill" style={{ color: "#FBBC04" }} />
            <span className="text-sm font-semibold">Pinned Messages</span>
            {pinnedMessages.length > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 font-mono text-xs font-semibold"
                style={{
                  background: "#FBBC0420",
                  color: "#FBBC04",
                }}
              >
                {pinnedMessages.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 transition-colors"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            aria-label="Close pinned messages"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {pinnedMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
              <PushPin size={32} className="text-text-muted" style={{ opacity: 0.4 }} />
              <p className="text-center text-sm">No pinned messages</p>
              <p className="text-text-muted text-center text-xs opacity-70">
                Hover a message and click the pin icon to save it here
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-3">
              {pinnedMessages.map(({ idx, msg }) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={idx}
                    className="bg-bg-elevated flex flex-col gap-2 rounded-xl p-3 shadow-sm"
                  >
                    {/* Role badge + index */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="flex items-center justify-center rounded-full"
                          style={{
                            width: 20,
                            height: 20,
                            background: isUser ? "#4285F420" : "#34A85320",
                            color: isUser ? "#4285F4" : "#34A853",
                          }}
                        >
                          {isUser ? (
                            <User size={11} weight="bold" />
                          ) : (
                            <Robot size={11} weight="bold" />
                          )}
                        </span>
                        <span
                          className="text-xs font-medium capitalize"
                          style={{
                            color: isUser ? "#4285F4" : "#34A853",
                          }}
                        >
                          {msg.role}
                        </span>
                      </div>
                      <span className="text-text-muted font-mono text-xs opacity-50">#{idx}</span>
                    </div>

                    {/* Preview */}
                    <p className="text-xs leading-relaxed">{truncate(msg.content)}</p>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1">
                      {/* Unpin */}
                      <button
                        onClick={() => togglePin(sessionId, idx)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                        style={{
                          background: "#FBBC0415",
                          color: "#FBBC04",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "#FBBC0430";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "#FBBC0415";
                        }}
                        aria-label="Unpin message"
                      >
                        <PushPin size={11} weight="fill" />
                        Unpin
                      </button>

                      {/* Jump to */}
                      <button
                        onClick={() => {
                          onJumpTo(idx);
                          onClose();
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
                        style={{
                          background: "#4285F415",
                          color: "#4285F4",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "#4285F430";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "#4285F415";
                        }}
                        aria-label="Jump to message"
                      >
                        <ArrowRight size={11} weight="bold" />
                        Jump to
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
