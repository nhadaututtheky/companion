/**
 * Pure key-combo predicates shared by composer variants.
 *
 * Behavior is locked by `session/__tests__/composer-logic.test.ts` — any change
 * here must update that contract.
 */

interface KeyEventLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
}

/**
 * Send-on-Enter detection.
 *
 * @param allowCtrlBypass — if true (full variant), Ctrl+Enter sends regardless
 * of shift state. If false (compact variant), only plain Enter (no shift) sends.
 */
export function isSendCombo(e: KeyEventLike, allowCtrlBypass: boolean): boolean {
  if (e.key !== "Enter") return false;
  if (!e.shiftKey) return true;
  return allowCtrlBypass && !!e.ctrlKey;
}

const SLASH_MENU_NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Tab", "Escape"]);

/**
 * When the slash menu is open, swallow nav keys + plain Enter so the menu's
 * own document-level listener handles selection. Shift+Enter still inserts a
 * newline normally.
 */
export function isSlashPassthrough(slashOpen: boolean, e: KeyEventLike): boolean {
  if (!slashOpen) return false;
  if (SLASH_MENU_NAV_KEYS.has(e.key)) return true;
  return e.key === "Enter" && !e.shiftKey;
}
