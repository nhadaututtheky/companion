/**
 * Pulse — Agent Operational Health Monitor
 *
 * Observe-only service that taps ws-bridge events to compute a composite
 * health score from 7 behavioral signals. Broadcasts `pulse:update` to
 * browsers/Telegram. NEVER injects into or interrupts the agent.
 *
 * Inspired by Anthropic's "Emotion Concepts" research (2026) —
 * uses behavioral proxies, not internal activation vectors.
 */

import { createLogger } from "../logger.js";

const log = createLogger("pulse");

// ─── Types ──────────────────────────────────────────────────────────────

export type OperationalState =
  | "flow"
  | "focused"
  | "cautious"
  | "struggling"
  | "spiraling"
  | "blocked";

export type PulseTrend = "improving" | "stable" | "degrading";

export interface PulseReading {
  score: number;
  state: OperationalState;
  trend: PulseTrend;
  signals: SignalValues;
  topSignal: string;
  turn: number;
  timestamp: number;
}

export interface SignalValues {
  failureRate: number;
  editChurn: number;
  costAccel: number;
  contextPressure: number;
  thinkingDepth: number;
  toolDiversity: number;
  completionTone: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

const WINDOW_SIZE = 5;

/** Exponential decay weights for turns in the window (most recent first) */
const DECAY_WEIGHTS = [1.0, 0.7, 0.5, 0.3, 0.15] as const;

const SIGNAL_WEIGHTS: Record<keyof SignalValues, number> = {
  failureRate: 0.25,
  editChurn: 0.2,
  costAccel: 0.15,
  contextPressure: 0.1,
  thinkingDepth: 0.1,
  toolDiversity: 0.1,
  completionTone: 0.1,
};

// ─── Per-Turn Snapshot ──────────────────────────────────────────────────

interface TurnSnapshot {
  turn: number;
  timestamp: number;
  toolUses: Array<{ toolName: string; filePath?: string }>;
  toolErrors: number;
  toolSuccesses: number;
  consecutiveErrors: number;
  tokensUsed: number;
  costUsd: number;
  thinkingChars: number;
  assistantText: string;
}

function emptySnapshot(turn: number): TurnSnapshot {
  return {
    turn,
    timestamp: Date.now(),
    toolUses: [],
    toolErrors: 0,
    toolSuccesses: 0,
    consecutiveErrors: 0,
    tokensUsed: 0,
    costUsd: 0,
    thinkingChars: 0,
    assistantText: "",
  };
}

// ─── Session Tracker ────────────────────────────────────────────────────

class SessionPulse {
  readonly sessionId: string;
  private snapshots: TurnSnapshot[] = [];
  private currentSnap: TurnSnapshot;
  private contextPercent = 0;
  private isBlocked = false;
  /** Running consecutive error count across turns (resets on success) */
  private runningConsecErrors = 0;
  /** Previous cumulative tokens for delta computation */
  private prevCumulativeTokens = 0;

  /** Previous readings for trend detection */
  private prevScores: number[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.currentSnap = emptySnapshot(1);
  }

  // ── Event Recorders ──────────────────────────────────────────────

  recordToolUse(toolName: string, input: Record<string, unknown>): void {
    const filePath = (input.file_path ?? input.path ?? "") as string;
    this.currentSnap.toolUses.push({ toolName, filePath: filePath || undefined });
  }

  recordToolResult(toolName: string, isError: boolean): void {
    if (isError) {
      this.currentSnap.toolErrors++;
      this.runningConsecErrors++;
    } else {
      this.currentSnap.toolSuccesses++;
      this.runningConsecErrors = 0;
    }
  }

  recordThinking(chars: number): void {
    this.currentSnap.thinkingChars += chars;
  }

  recordAssistantText(text: string): void {
    // Cap at 2000 chars to prevent unbounded growth within a turn
    if (this.currentSnap.assistantText.length < 2000) {
      this.currentSnap.assistantText += text.slice(0, 2000 - this.currentSnap.assistantText.length);
    }
  }

  recordContextUpdate(percent: number): void {
    this.contextPercent = percent;
  }

  setBlocked(blocked: boolean): void {
    this.isBlocked = blocked;
  }

  /**
   * Finalize current turn, compute signals, and return a PulseReading.
   * Called when handleResult fires (turn boundary).
   */
  finalizeTurn(turnNumber: number, cumulativeTokens: number, costUsd: number): PulseReading {
    // Compute per-turn token delta from cumulative totals
    const turnTokens = Math.max(0, cumulativeTokens - this.prevCumulativeTokens);
    this.prevCumulativeTokens = cumulativeTokens;

    this.currentSnap.turn = turnNumber;
    this.currentSnap.tokensUsed = turnTokens;
    this.currentSnap.costUsd = costUsd;
    this.currentSnap.consecutiveErrors = this.runningConsecErrors;

    // Push to window
    this.snapshots.push(this.currentSnap);
    if (this.snapshots.length > WINDOW_SIZE) {
      this.snapshots.shift();
    }

    // Compute signals
    const signals = this.computeSignals();
    const score = this.computeScore(signals);
    const state = this.classifyState(score, signals);
    const trend = this.computeTrend(score);

    // Track score history for trend
    this.prevScores.push(score);
    if (this.prevScores.length > 5) this.prevScores.shift();

    // Reset for next turn
    this.currentSnap = emptySnapshot(turnNumber + 1);

    const topSignal = this.getTopSignal(signals);

    return {
      score,
      state,
      trend,
      signals,
      topSignal,
      turn: turnNumber,
      timestamp: Date.now(),
    };
  }

  // ── Signal Computation ───────────────────────────────────────────

  private computeSignals(): SignalValues {
    return {
      failureRate: this.computeFailureRate(),
      editChurn: this.computeEditChurn(),
      costAccel: this.computeCostAccel(),
      contextPressure: this.computeContextPressure(),
      thinkingDepth: this.computeThinkingDepth(),
      toolDiversity: this.computeToolDiversity(),
      completionTone: this.computeCompletionTone(),
    };
  }

  /** Signal 1: Failure rate — consecutive errors spike hard */
  private computeFailureRate(): number {
    if (this.snapshots.length === 0) return 0;

    const latest = this.snapshots[this.snapshots.length - 1]!;
    const consec = latest.consecutiveErrors;

    // Consecutive errors dominate
    if (consec >= 4) return 1.0;
    if (consec >= 3) return 0.9;
    if (consec >= 2) return 0.6;

    // Weighted error ratio across window
    let weightedErrors = 0;
    let weightedTotal = 0;
    for (let i = 0; i < this.snapshots.length; i++) {
      const snap = this.snapshots[this.snapshots.length - 1 - i]!;
      const w = DECAY_WEIGHTS[i] ?? 0.1;
      const total = snap.toolErrors + snap.toolSuccesses;
      if (total > 0) {
        weightedErrors += (snap.toolErrors / total) * w;
        weightedTotal += w;
      }
    }

    return weightedTotal > 0 ? Math.min(1, weightedErrors / weightedTotal) : 0;
  }

  /** Signal 2: Edit churn — same file edited repeatedly */
  private computeEditChurn(): number {
    const fileEditCounts = new Map<string, number>();

    for (const snap of this.snapshots) {
      for (const tu of snap.toolUses) {
        if (
          (tu.toolName === "Edit" || tu.toolName === "Write" || tu.toolName === "MultiEdit") &&
          tu.filePath
        ) {
          fileEditCounts.set(tu.filePath, (fileEditCounts.get(tu.filePath) ?? 0) + 1);
        }
      }
    }

    if (fileEditCounts.size === 0) return 0;

    const maxEdits = Math.max(...fileEditCounts.values());
    if (maxEdits >= 5) return 1.0;
    if (maxEdits >= 4) return 0.9;
    if (maxEdits >= 3) return 0.6;
    if (maxEdits >= 2) return 0.3;
    return 0;
  }

  /** Signal 3: Cost acceleration — token usage spike vs average */
  private computeCostAccel(): number {
    if (this.snapshots.length < 2) return 0;

    const latest = this.snapshots[this.snapshots.length - 1]!;
    const previous = this.snapshots.slice(0, -1);

    if (previous.length === 0) return 0;

    const avgTokens = previous.reduce((s, snap) => s + snap.tokensUsed, 0) / previous.length;
    if (avgTokens === 0) return 0;

    const ratio = latest.tokensUsed / avgTokens;
    if (ratio >= 3.0) return 1.0;
    if (ratio >= 2.0) return 0.8;
    if (ratio >= 1.5) return 0.4;
    return 0;
  }

  /** Signal 4: Context pressure — direct mapping from context percent */
  private computeContextPressure(): number {
    if (this.contextPercent <= 50) return 0;
    return Math.min(1, (this.contextPercent - 50) / 50);
  }

  /** Signal 5: Thinking depth — wrestling with decisions */
  private computeThinkingDepth(): number {
    if (this.snapshots.length < 2) return 0;

    const latest = this.snapshots[this.snapshots.length - 1]!;
    const previous = this.snapshots.slice(0, -1);

    const avgThinking = previous.reduce((s, snap) => s + snap.thinkingChars, 0) / previous.length;
    if (avgThinking === 0) {
      // No baseline — only flag if absolute thinking is very high
      return latest.thinkingChars > 5000 ? 0.5 : 0;
    }

    const ratio = latest.thinkingChars / avgThinking;
    if (ratio >= 4.0) return 0.9;
    if (ratio >= 3.0) return 0.7;
    if (ratio >= 2.0) return 0.4;
    return 0;
  }

  /** Signal 6: Tool diversity — low entropy = tunnel vision */
  private computeToolDiversity(): number {
    // Collect all tool names in window
    const toolCounts = new Map<string, number>();
    let totalTools = 0;

    for (const snap of this.snapshots) {
      for (const tu of snap.toolUses) {
        toolCounts.set(tu.toolName, (toolCounts.get(tu.toolName) ?? 0) + 1);
        totalTools++;
      }
    }

    // Need minimum tool uses to evaluate
    if (totalTools < 3 || toolCounts.size === 0) return 0;

    // Single tool used repeatedly = definite tunnel vision
    if (toolCounts.size === 1) return totalTools >= 5 ? 1.0 : 0.7;

    // Shannon entropy
    let entropy = 0;
    for (const count of toolCounts.values()) {
      const p = count / totalTools;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    const maxEntropy = Math.log2(toolCounts.size);
    if (maxEntropy === 0) return 0;

    // Inverted: low diversity (low entropy) = high signal
    const normalizedEntropy = entropy / maxEntropy;
    return Math.max(0, 1 - normalizedEntropy);
  }

  /** Signal 7: Completion tone — keyword detection in assistant text */
  private computeCompletionTone(): number {
    if (this.snapshots.length === 0) return 0;

    const latest = this.snapshots[this.snapshots.length - 1]!;
    const text = latest.assistantText.toLowerCase();
    if (!text) return 0;

    let score = 0;

    // Hedging signals
    const hedging = [
      "i apologize",
      "let me try again",
      "i'm not sure",
      "i made a mistake",
      "that was incorrect",
      "my apologies",
    ];
    for (const phrase of hedging) {
      if (text.includes(phrase)) {
        score += 0.3;
        break;
      }
    }

    // Failure signals
    const failure = [
      "i cannot",
      "error occurred",
      "failed to",
      "unable to",
      "doesn't work",
      "still failing",
      "same error",
    ];
    for (const phrase of failure) {
      if (text.includes(phrase)) {
        score += 0.5;
        break;
      }
    }

    // Recovery signals (reduce score)
    const recovery = [
      "fixed",
      "resolved",
      "working now",
      "passes",
      "successfully",
      "compiles clean",
      "all tests pass",
    ];
    for (const phrase of recovery) {
      if (text.includes(phrase)) {
        score -= 0.3;
        break;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  // ── Composite Scoring ────────────────────────────────────────────

  private computeScore(signals: SignalValues): number {
    let score = 0;
    for (const [key, weight] of Object.entries(SIGNAL_WEIGHTS)) {
      score += (signals[key as keyof SignalValues] ?? 0) * weight;
    }
    return Math.round(Math.max(0, Math.min(100, score * 100)));
  }

  private classifyState(score: number, signals: SignalValues): OperationalState {
    if (this.isBlocked) return "blocked";

    if (score >= 60 && signals.failureRate >= 0.5) return "spiraling";
    if (score >= 40) return "struggling";
    if (score >= 20 && signals.editChurn >= 0.3) return "cautious";
    if (score < 20 && signals.thinkingDepth >= 0.4) return "focused";
    return "flow";
  }

  private computeTrend(currentScore: number): PulseTrend {
    if (this.prevScores.length < 2) return "stable";

    const recent = this.prevScores.slice(-3);
    const avgPrev = recent.reduce((a, b) => a + b, 0) / recent.length;
    const diff = currentScore - avgPrev;

    if (diff > 8) return "degrading";
    if (diff < -8) return "improving";
    return "stable";
  }

  private getTopSignal(signals: SignalValues): string {
    let top = "failureRate";
    let max = 0;
    for (const [key, value] of Object.entries(signals)) {
      const weighted = value * (SIGNAL_WEIGHTS[key as keyof SignalValues] ?? 0);
      if (weighted > max) {
        max = weighted;
        top = key;
      }
    }
    return top;
  }
}

// ─── Global Registry ────────────────────────────────────────────────────

const sessions = new Map<string, SessionPulse>();

export function getOrCreatePulse(sessionId: string): SessionPulse {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const pulse = new SessionPulse(sessionId);
  sessions.set(sessionId, pulse);
  return pulse;
}

export function getPulse(sessionId: string): SessionPulse | undefined {
  return sessions.get(sessionId);
}

export function cleanupPulse(sessionId: string): void {
  sessions.delete(sessionId);
  lastReadings.delete(sessionId);
  log.debug("Pulse cleaned up", { sessionId: sessionId.slice(0, 8) });
}

/** Get the latest reading for a session (for REST/Telegram queries) */
export function getLatestReading(sessionId: string): PulseReading | null {
  const pulse = sessions.get(sessionId);
  if (!pulse) return null;
  // Return cached last reading — finalizeTurn stores it
  return lastReadings.get(sessionId) ?? null;
}

/** Get all active session readings (for /mood all) */
export function getAllReadings(): Map<string, PulseReading> {
  return new Map(lastReadings);
}

// Cache of last reading per session (updated on finalizeTurn)
const lastReadings = new Map<string, PulseReading>();

/**
 * Finalize a turn and return the pulse reading.
 * Called from ws-bridge handleResult.
 */
export function finalizePulseTurn(
  sessionId: string,
  turnNumber: number,
  tokensUsed: number,
  costUsd: number,
): PulseReading | null {
  const pulse = sessions.get(sessionId);
  if (!pulse) return null;

  try {
    const reading = pulse.finalizeTurn(turnNumber, tokensUsed, costUsd);
    lastReadings.set(sessionId, reading);

    if (reading.score > 40) {
      log.info("Pulse elevated", {
        sessionId: sessionId.slice(0, 8),
        score: reading.score,
        state: reading.state,
        topSignal: reading.topSignal,
      });
    }

    return reading;
  } catch (err) {
    log.warn("Pulse computation failed", { error: String(err) });
    return null;
  }
}
