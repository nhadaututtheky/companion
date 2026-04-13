/**
 * TelegramDeadSessions — Manages dead session info for resume detection.
 * Extracted from TelegramBridge for separation of concerns.
 */

/** Dead session info for resume detection */
export interface DeadSessionInfo {
  chatId: number;
  topicId: number;
  sessionId: string;
  cliSessionId: string;
  projectSlug: string;
  model: string;
  diedAt: number;
}

export class TelegramDeadSessions {
  private readonly deadSessions: Map<string, DeadSessionInfo>;

  constructor(deadSessions: Map<string, DeadSessionInfo>) {
    this.deadSessions = deadSessions;
  }

  private mapKey(chatId: number, topicId: number): string {
    return `${chatId}:${topicId}`;
  }

  /** Get dead session by exact chatId:topicId key */
  getDeadSession(chatId: number, topicId: number): DeadSessionInfo | undefined {
    const k = this.mapKey(chatId, topicId);
    const dead = this.deadSessions.get(k);
    if (!dead) return undefined;
    // Expire after 24h
    if (Date.now() - dead.diedAt > 24 * 60 * 60 * 1000) {
      this.deadSessions.delete(k);
      return undefined;
    }
    return dead;
  }

  /** Get dead session by project slug (searches all dead sessions for this chatId) */
  getDeadSessionByProject(chatId: number, projectSlug: string): DeadSessionInfo | undefined {
    for (const [k, dead] of this.deadSessions) {
      if (dead.chatId === chatId && dead.projectSlug === projectSlug) {
        if (Date.now() - dead.diedAt > 24 * 60 * 60 * 1000) {
          this.deadSessions.delete(k);
          continue;
        }
        return dead;
      }
    }
    return undefined;
  }

  /** Remove a dead session entry */
  clearDeadSession(chatId: number, topicId: number): void {
    this.deadSessions.delete(this.mapKey(chatId, topicId));
  }

  /** Clear dead session by project slug */
  clearDeadSessionByProject(chatId: number, projectSlug: string): void {
    for (const [k, dead] of this.deadSessions) {
      if (dead.chatId === chatId && dead.projectSlug === projectSlug) {
        this.deadSessions.delete(k);
      }
    }
  }
}
