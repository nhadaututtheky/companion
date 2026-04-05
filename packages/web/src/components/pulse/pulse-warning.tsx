"use client";

import { useState, useCallback, useRef } from "react";
import { WarningCircle, PaperPlaneRight, Pause, X, FirstAidKit } from "@phosphor-icons/react";
import {
  usePulseStore,
  getPulseColor,
  getStateLabel,
  getSignalLabel,
  type PulseReading,
} from "@/lib/stores/pulse-store";
import { useContextFeedStore } from "@/lib/stores/context-feed-store";

interface PulseWarningProps {
  sessionId: string;
  onSendMessage: (text: string) => void;
  onStop?: () => void;
}

/** Warning banner + action buttons shown above chat when pulse > 40 */
export function PulseWarning({ sessionId, onSendMessage, onStop }: PulseWarningProps) {
  const reading = usePulseStore((s) => s.readings.get(sessionId));
  const [dismissed, setDismissed] = useState(false);
  const [dismissedScore, setDismissedScore] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [showCalmConfirm, setShowCalmConfirm] = useState(false);
  const [guidanceText, setGuidanceText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Don't show if score <= 40 or dismissed (re-show if score jumps 10+ above dismissed level)
  if (!reading || reading.score <= 40) return null;
  if (dismissed && reading.score < dismissedScore + 10) return null;

  const color = getPulseColor(reading.score);
  const stateLabel = getStateLabel(reading.state);

  const warningText = getWarningText(reading);
  const suggestedGuidance = getSuggestedGuidance(reading);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDismissedScore(reading.score);
    setShowGuidance(false);
    setShowCalmConfirm(false);
    setShowDetails(false);
  }, [reading.score]);

  const logPulseAction = useCallback((action: string, content: string) => {
    useContextFeedStore.getState().pushEvent({
      sessionId,
      injectionType: "pulse_guidance",
      summary: `[pulse] ${action}: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`,
      charCount: content.length,
      tokenEstimate: Math.ceil(content.length / 4),
      timestamp: Date.now(),
    });
  }, [sessionId]);

  const handleSendGuidance = useCallback(() => {
    const text = guidanceText.trim();
    if (!text) return;
    onSendMessage(text);
    logPulseAction("User sent guidance", text);
    setShowGuidance(false);
    setGuidanceText("");
    setDismissed(true);
    setDismissedScore(reading.score);
  }, [guidanceText, onSendMessage, reading.score, logPulseAction]);

  const handleInjectCalm = useCallback(() => {
    const calmMessage = getCalmInjection(reading);
    onSendMessage(calmMessage);
    logPulseAction(`Calm injection sent (score ${reading.score})`, calmMessage);
    setShowCalmConfirm(false);
    setDismissed(true);
    setDismissedScore(reading.score);
  }, [reading, onSendMessage, logPulseAction]);

  const openGuidanceEditor = useCallback(() => {
    setGuidanceText(suggestedGuidance);
    setShowGuidance(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [suggestedGuidance]);

  return (
    <div
      className="mx-3 mb-2 rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${color}40`,
        background: `${color}08`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <WarningCircle size={16} weight="fill" style={{ color }} />
        <span className="text-xs font-semibold flex-1" style={{ color }}>
          {stateLabel} — Score {reading.score}/100
        </span>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
          style={{ color: "var(--color-text-muted)", background: "var(--color-bg-elevated)" }}
          aria-label="Toggle signal details"
        >
          {showDetails ? "Hide details" : "Details"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-0.5 rounded cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Dismiss warning"
        >
          <X size={12} />
        </button>
      </div>

      {/* Warning message */}
      <div className="px-3 pb-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
        {warningText}
      </div>

      {/* Signal breakdown (collapsed) */}
      {showDetails && (
        <div className="px-3 pb-2">
          <SignalBars signals={reading.signals} topSignal={reading.topSignal} />
        </div>
      )}

      {/* Action buttons */}
      {!showGuidance && !showCalmConfirm && (
        <div className="flex items-center gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={openGuidanceEditor}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors"
            style={{
              background: `${color}20`,
              color,
              border: `1px solid ${color}40`,
            }}
            aria-label="Send guidance message to agent"
          >
            <PaperPlaneRight size={12} />
            Send Guidance
          </button>
          {reading.score >= 55 && (
            <button
              type="button"
              onClick={() => setShowCalmConfirm(true)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-warning)",
                border: "1px solid var(--color-border)",
              }}
              aria-label="Inject calm guidance to agent"
            >
              <FirstAidKit size={12} />
              Inject Calm
            </button>
          )}
          <button
            type="button"
            onClick={onStop ?? (() => onSendMessage("STOP"))}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors"
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="Stop the session"
          >
            <Pause size={12} />
            Stop
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-2 py-1 rounded text-xs cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Dismiss and let agent continue"
          >
            Let it continue
          </button>
        </div>
      )}

      {/* Inject Calm confirmation */}
      {showCalmConfirm && (
        <div className="px-3 pb-2">
          <div
            className="rounded-md p-2 text-xs mb-1.5"
            style={{
              background: "var(--color-bg-base)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            <div className="font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              This will send to the agent:
            </div>
            {getCalmInjection(reading)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInjectCalm}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-pointer"
              style={{
                background: "color-mix(in srgb, var(--color-warning) 15%, transparent)",
                color: "var(--color-warning)",
                border: "1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)",
              }}
              aria-label="Confirm and send calm injection"
            >
              <FirstAidKit size={12} />
              Send to Agent
            </button>
            <button
              type="button"
              onClick={() => setShowCalmConfirm(false)}
              className="px-2 py-1 rounded text-xs cursor-pointer"
              style={{ color: "var(--color-text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Guidance editor */}
      {showGuidance && (
        <div className="px-3 pb-2">
          <textarea
            ref={textareaRef}
            className="w-full rounded-md p-2 text-xs resize-none"
            style={{
              background: "var(--color-bg-base)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
              minHeight: 60,
              maxHeight: 120,
            }}
            value={guidanceText}
            onChange={(e) => setGuidanceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSendGuidance();
              }
              if (e.key === "Escape") {
                setShowGuidance(false);
              }
            }}
            placeholder="Edit the suggested guidance before sending..."
            aria-label="Guidance message to send to agent"
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={handleSendGuidance}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-pointer"
              style={{
                background: `${color}20`,
                color,
                border: `1px solid ${color}40`,
              }}
              aria-label="Send guidance"
            >
              <PaperPlaneRight size={12} />
              Send (Ctrl+Enter)
            </button>
            <button
              type="button"
              onClick={() => setShowGuidance(false)}
              className="px-2 py-1 rounded text-xs cursor-pointer"
              style={{ color: "var(--color-text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Signal bar visualization */
function SignalBars({ signals, topSignal }: { signals: Record<string, number>; topSignal: string }) {
  const sorted = Object.entries(signals).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-1">
      {sorted.map(([key, value]) => {
        const percent = Math.round(value * 100);
        const isTop = key === topSignal;
        const barColor = percent >= 60 ? "#EF4444" : percent >= 30 ? "#F59E0B" : "#10B981";

        return (
          <div key={key} className="flex items-center gap-2">
            <span
              className="text-xs w-28 flex-shrink-0 truncate"
              style={{
                color: isTop ? "var(--color-text-primary)" : "var(--color-text-muted)",
                fontWeight: isTop ? 600 : 400,
                fontSize: 10,
              }}
            >
              {getSignalLabel(key)}
            </span>
            <div
              className="flex-1 rounded-full overflow-hidden"
              style={{ height: 4, background: "var(--color-bg-base)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percent}%`,
                  background: barColor,
                  minWidth: percent > 0 ? 2 : 0,
                }}
              />
            </div>
            <span
              className="text-xs font-mono w-7 text-right flex-shrink-0"
              style={{ color: "var(--color-text-muted)", fontSize: 9 }}
            >
              {percent}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Text Generators ────────────────────────────────────────────────────

function getWarningText(reading: PulseReading): string {
  const { state, topSignal, signals } = reading;

  if (state === "spiraling") {
    if (signals.failureRate >= 0.6) {
      return "Agent is in a failure loop — consecutive tool errors suggest it's stuck. Consider providing direction or stopping the session.";
    }
    return "Agent appears to be spiraling — high edit churn and rising error rate. The root cause may be elsewhere.";
  }

  // struggling
  switch (topSignal) {
    case "failureRate":
      return "Agent is encountering repeated errors. It may need a different approach or more context about the problem.";
    case "editChurn":
      return "Agent is editing the same files repeatedly — this pattern often means the fix isn't where it's looking.";
    case "costAccel":
      return "Token usage is increasing rapidly. The agent may be taking an increasingly complex approach.";
    case "contextPressure":
      return "Context window is getting full. Consider compacting to give the agent more room.";
    case "toolDiversity":
      return "Agent is using a narrow set of tools — it may be stuck in a loop.";
    default:
      return "Agent is showing signs of difficulty. You may want to provide guidance.";
  }
}

function getCalmInjection(reading: PulseReading): string {
  const topIssue = getSignalLabel(reading.topSignal).toLowerCase();
  return `Step back and reassess your current approach. You've been showing signs of ${topIssue}. Consider whether the root cause might be elsewhere. Take a different angle before making more changes. Focus on understanding the problem fully before attempting another fix.`;
}

function getSuggestedGuidance(reading: PulseReading): string {
  const { topSignal } = reading;

  switch (topSignal) {
    case "failureRate":
      return "Stop and reconsider your approach. Re-read the last error message carefully — what exactly failed? Is the root cause in this file, or could it be in a dependency? Consider a different approach if this one isn't working.";
    case "editChurn":
      return "You've been editing the same files repeatedly. This often means the fix isn't in this file. Check the imports — is a dependency providing the wrong type/value? Read the calling code — is the issue in how this file is used?";
    case "costAccel":
      return "Your approach is using a lot of tokens. To be more efficient: read only the specific lines you need, avoid re-reading files you've already seen, and focus on one approach at a time.";
    case "contextPressure":
      return "Context window is getting full. Focus on completing the current task, avoid reading large files, and consider if we should compact the conversation.";
    case "toolDiversity":
      return "Try using different tools — Grep/Glob to find related code, Read to understand before editing, Bash to run tests and verify changes.";
    case "thinkingDepth":
      return "Take a step back and simplify. If you're overthinking this, the solution might be simpler than expected. What's the minimum change needed?";
    default:
      return "Step back and reassess your current approach. Consider whether the root cause might be elsewhere. Try a different angle before making more changes.";
  }
}
