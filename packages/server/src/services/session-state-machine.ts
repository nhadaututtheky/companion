/**
 * Session State Machine — validates and enforces session status transitions.
 *
 * Wraps a SessionStatus and only allows transitions defined in VALID_TRANSITIONS.
 * Invalid transitions are logged as warnings and rejected (returns false).
 */

import { VALID_TRANSITIONS, type SessionStatus } from "@companion/shared";
import { createLogger } from "../logger.js";

const log = createLogger("state-machine");

export type PhaseChangeListener = (
  sessionId: string,
  from: SessionStatus,
  to: SessionStatus,
) => void;

export class SessionStateMachine {
  private _status: SessionStatus;
  private readonly sessionId: string;
  private readonly listeners: PhaseChangeListener[] = [];

  constructor(sessionId: string, initial: SessionStatus = "starting") {
    this.sessionId = sessionId;
    this._status = initial;
  }

  get status(): SessionStatus {
    return this._status;
  }

  /**
   * Attempt to transition to a new status.
   * Returns true if the transition was valid and applied, false if rejected.
   */
  transition(to: SessionStatus): boolean {
    if (this._status === to) return true; // no-op, already in target state

    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed.includes(to)) {
      log.warn("Invalid state transition rejected", {
        sessionId: this.sessionId,
        from: this._status,
        to,
        allowed,
      });
      return false;
    }

    const from = this._status;
    this._status = to;

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(this.sessionId, from, to);
      } catch (err) {
        log.error("Phase change listener error", { error: String(err) });
      }
    }

    return true;
  }

  /** Register a listener called on every valid transition */
  onTransition(listener: PhaseChangeListener): void {
    this.listeners.push(listener);
  }
}
