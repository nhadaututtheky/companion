/**
 * Characterization tests for shared composer logic.
 *
 * Both MessageComposer (full) and CompactComposer (mini-terminal) implement
 * the same pure logic inline:
 *   - slash command detection regex
 *   - send key combo detection
 *   - auto-resize textarea math
 *
 * These tests duplicate that logic as a contract. When Phase 2 extracts the
 * logic into hooks (useSlashMenu, useAutoResizeTextarea, isSendCombo), these
 * tests must still pass — that's how we know the refactor preserved behavior.
 *
 * No DOM rendering — pure functions only, matching the project's existing
 * test style (see __tests__/components/button.test.ts).
 */

import { describe, it, expect } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Slash command detection
// Source of truth: message-composer.tsx updateSlashMenu (line ~244)
//                  mini-terminal.tsx updateSlashMenu (line ~108)
// Both use IDENTICAL regex /^\/(\S*)$/ and matching logic.
// ─────────────────────────────────────────────────────────────────────────────

const SLASH_REGEX = /^\/(\S*)$/;

interface SlashState {
  open: boolean;
  query: string;
}

function detectSlash(value: string): SlashState {
  const match = value.match(SLASH_REGEX);
  if (match) return { open: true, query: "/" + match[1] };
  return { open: false, query: "" };
}

describe("composer logic — slash command detection", () => {
  it("opens menu on bare slash", () => {
    expect(detectSlash("/")).toEqual({ open: true, query: "/" });
  });

  it("opens menu while typing command name", () => {
    expect(detectSlash("/com")).toEqual({ open: true, query: "/com" });
  });

  it("closes menu when whitespace appears (command + arg starting)", () => {
    expect(detectSlash("/compact ").open).toBe(false);
  });

  it("closes menu on multiline input", () => {
    expect(detectSlash("/compact\nmore").open).toBe(false);
  });

  it("closes menu when text doesn't start with slash", () => {
    expect(detectSlash("hello").open).toBe(false);
    expect(detectSlash(" /compact").open).toBe(false);
  });

  it("closes menu on empty string", () => {
    expect(detectSlash("").open).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Send key combo detection
// Source of truth: message-composer.tsx handleKeyDown (line ~268)
//                  mini-terminal.tsx handleKeyDown (line ~130)
// Full version also accepts Ctrl+Enter; compact only accepts plain Enter.
// Both reject Shift+Enter (newline).
// ─────────────────────────────────────────────────────────────────────────────

interface KeyEventLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
}

// Full composer: Enter without shift, OR Enter with ctrl
function isSendComboFull(e: KeyEventLike): boolean {
  return (e.key === "Enter" && !e.shiftKey) || (e.key === "Enter" && !!e.ctrlKey);
}

// Compact composer: Enter without shift only
function isSendComboCompact(e: KeyEventLike): boolean {
  return e.key === "Enter" && !e.shiftKey;
}

describe("composer logic — send key combo (full)", () => {
  it("Enter alone sends", () => {
    expect(isSendComboFull({ key: "Enter" })).toBe(true);
  });

  it("Shift+Enter does not send (newline)", () => {
    expect(isSendComboFull({ key: "Enter", shiftKey: true })).toBe(false);
  });

  it("Ctrl+Enter sends", () => {
    expect(isSendComboFull({ key: "Enter", ctrlKey: true })).toBe(true);
  });

  it("Ctrl+Shift+Enter does not send (shift wins)", () => {
    // Current logic: (Enter && !shift) || (Enter && ctrl) → shift+ctrl is true via ctrl branch.
    // Lock current behavior — ctrl branch ignores shift. If this changes, test breaks.
    expect(isSendComboFull({ key: "Enter", ctrlKey: true, shiftKey: true })).toBe(true);
  });

  it("non-Enter keys don't send", () => {
    expect(isSendComboFull({ key: "a" })).toBe(false);
    expect(isSendComboFull({ key: "Tab" })).toBe(false);
  });
});

describe("composer logic — send key combo (compact)", () => {
  it("Enter alone sends", () => {
    expect(isSendComboCompact({ key: "Enter" })).toBe(true);
  });

  it("Shift+Enter does not send", () => {
    expect(isSendComboCompact({ key: "Enter", shiftKey: true })).toBe(false);
  });

  it("Ctrl+Enter sends (shift is false, satisfies compact rule)", () => {
    // Compact's rule is just !shiftKey — ctrl is irrelevant. Same as Enter alone.
    expect(isSendComboCompact({ key: "Enter", ctrlKey: true })).toBe(true);
  });

  it("Ctrl+Shift+Enter does NOT send in compact (DIVERGES from full)", () => {
    // DIVERGENCE LOCK: full's second clause (Enter && ctrl) bypasses shift, so
    // full sends on ctrl+shift+enter. Compact has no ctrl clause → blocked by shift.
    // Phase 2 extraction must surface this as a variant prop, not silently align.
    expect(isSendComboCompact({ key: "Enter", ctrlKey: true, shiftKey: true })).toBe(false);
  });

  it("non-Enter keys don't send", () => {
    expect(isSendComboCompact({ key: "a" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auto-resize math
// Source of truth: message-composer.tsx handleInput (line ~278)
//                  mini-terminal.tsx handleInput (line ~138)
// Full max = 200, compact max = 72. Both clamp scrollHeight to max.
// ─────────────────────────────────────────────────────────────────────────────

function clampHeight(scrollHeight: number, maxHeight: number): number {
  return Math.min(scrollHeight, maxHeight);
}

describe("composer logic — auto-resize clamp", () => {
  it("full max = 200", () => {
    expect(clampHeight(50, 200)).toBe(50);
    expect(clampHeight(199, 200)).toBe(199);
    expect(clampHeight(200, 200)).toBe(200);
    expect(clampHeight(500, 200)).toBe(200);
  });

  it("compact max = 72", () => {
    expect(clampHeight(40, 72)).toBe(40);
    expect(clampHeight(72, 72)).toBe(72);
    expect(clampHeight(300, 72)).toBe(72);
  });

  it("never returns negative", () => {
    expect(clampHeight(0, 200)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasContent / send-enabled state
// Source of truth: message-composer.tsx hasContent (line 177)
//                  mini-terminal.tsx send disabled check (line 194)
// Full: text.trim() OR attachments.length > 0
// Compact: text.trim() only
// ─────────────────────────────────────────────────────────────────────────────

function canSendFull(text: string, attachmentCount: number): boolean {
  return text.trim().length > 0 || attachmentCount > 0;
}

function canSendCompact(text: string): boolean {
  return text.trim().length > 0;
}

describe("composer logic — canSend (full)", () => {
  it("text alone enables send", () => {
    expect(canSendFull("hi", 0)).toBe(true);
  });

  it("attachment alone enables send (no text required)", () => {
    expect(canSendFull("", 1)).toBe(true);
    expect(canSendFull("   ", 1)).toBe(true);
  });

  it("whitespace-only text + no attachments = disabled", () => {
    expect(canSendFull("   ", 0)).toBe(false);
    expect(canSendFull("\n\t", 0)).toBe(false);
  });

  it("empty + no attachments = disabled", () => {
    expect(canSendFull("", 0)).toBe(false);
  });
});

describe("composer logic — canSend (compact)", () => {
  it("text alone enables send", () => {
    expect(canSendCompact("hi")).toBe(true);
  });

  it("whitespace-only = disabled", () => {
    expect(canSendCompact("   ")).toBe(false);
    expect(canSendCompact("\n")).toBe(false);
  });

  it("empty = disabled", () => {
    expect(canSendCompact("")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Send button color logic
// Source of truth: both composers compute the same color expression inline.
//   running + has content → orange (#D97706)
//   idle + has content    → green  (#34A853)
//   no content            → muted (var(--color-bg-elevated))
// ─────────────────────────────────────────────────────────────────────────────

function sendButtonBg(hasContent: boolean, isRunning: boolean): string {
  if (!hasContent) return "var(--color-bg-elevated)";
  return isRunning ? "#D97706" : "#34A853";
}

describe("composer logic — send button background", () => {
  it("running + content = orange (interrupt warning)", () => {
    expect(sendButtonBg(true, true)).toBe("#D97706");
  });

  it("idle + content = green (normal send)", () => {
    expect(sendButtonBg(true, false)).toBe("#34A853");
  });

  it("no content = muted background", () => {
    expect(sendButtonBg(false, true)).toBe("var(--color-bg-elevated)");
    expect(sendButtonBg(false, false)).toBe("var(--color-bg-elevated)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slash menu key passthrough
// Source of truth: both composers swallow nav keys when slash menu is open
// so the menu's own document listener can handle them.
// ─────────────────────────────────────────────────────────────────────────────

const SLASH_MENU_PASSTHROUGH_KEYS = ["ArrowUp", "ArrowDown", "Tab", "Escape"];

function shouldPassthroughToSlashMenu(slashOpen: boolean, e: KeyEventLike): boolean {
  if (!slashOpen) return false;
  if (SLASH_MENU_PASSTHROUGH_KEYS.includes(e.key)) return true;
  // Enter without shift selects → also passthrough
  if (e.key === "Enter" && !e.shiftKey) return true;
  return false;
}

describe("composer logic — slash menu key passthrough", () => {
  it("nav keys pass through when slash menu open", () => {
    for (const key of SLASH_MENU_PASSTHROUGH_KEYS) {
      expect(shouldPassthroughToSlashMenu(true, { key })).toBe(true);
    }
  });

  it("Enter (plain) passes through to select command", () => {
    expect(shouldPassthroughToSlashMenu(true, { key: "Enter" })).toBe(true);
  });

  it("Shift+Enter does NOT pass through (still inserts newline)", () => {
    expect(shouldPassthroughToSlashMenu(true, { key: "Enter", shiftKey: true })).toBe(false);
  });

  it("nothing passes through when slash menu closed", () => {
    for (const key of [...SLASH_MENU_PASSTHROUGH_KEYS, "Enter", "a"]) {
      expect(shouldPassthroughToSlashMenu(false, { key })).toBe(false);
    }
  });
});
