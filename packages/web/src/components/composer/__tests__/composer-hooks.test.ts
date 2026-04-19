/**
 * Hook & utility unit tests for ComposerCore.
 *
 * The Phase 1 file (`session/__tests__/composer-logic.test.ts`) tests the
 * inline-duplicated logic. This file tests the same logic as exposed by the
 * extracted modules — they should agree by construction.
 */

import { describe, it, expect } from "bun:test";
import { isSendCombo, isSlashPassthrough } from "../key-combos";

describe("key-combos — isSendCombo (allowCtrlBypass=true, full variant)", () => {
  it("Enter alone sends", () => {
    expect(isSendCombo({ key: "Enter" }, true)).toBe(true);
  });

  it("Shift+Enter does not send", () => {
    expect(isSendCombo({ key: "Enter", shiftKey: true }, true)).toBe(false);
  });

  it("Ctrl+Enter sends", () => {
    expect(isSendCombo({ key: "Enter", ctrlKey: true }, true)).toBe(true);
  });

  it("Ctrl+Shift+Enter sends (ctrl bypasses shift in full)", () => {
    expect(isSendCombo({ key: "Enter", ctrlKey: true, shiftKey: true }, true)).toBe(true);
  });

  it("non-Enter keys never send", () => {
    expect(isSendCombo({ key: "a" }, true)).toBe(false);
    expect(isSendCombo({ key: "Tab" }, true)).toBe(false);
  });
});

describe("key-combos — isSendCombo (allowCtrlBypass=false, compact variant)", () => {
  it("Enter alone sends", () => {
    expect(isSendCombo({ key: "Enter" }, false)).toBe(true);
  });

  it("Shift+Enter does not send", () => {
    expect(isSendCombo({ key: "Enter", shiftKey: true }, false)).toBe(false);
  });

  it("Ctrl+Enter sends (ctrl flag is ignored, shift is what matters)", () => {
    expect(isSendCombo({ key: "Enter", ctrlKey: true }, false)).toBe(true);
  });

  it("Ctrl+Shift+Enter does NOT send (compact respects shift)", () => {
    expect(isSendCombo({ key: "Enter", ctrlKey: true, shiftKey: true }, false)).toBe(false);
  });
});

describe("key-combos — isSlashPassthrough", () => {
  it("returns false when slash menu is closed (regardless of key)", () => {
    expect(isSlashPassthrough(false, { key: "ArrowUp" })).toBe(false);
    expect(isSlashPassthrough(false, { key: "Enter" })).toBe(false);
  });

  it("nav keys passthrough when open", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Tab", "Escape"]) {
      expect(isSlashPassthrough(true, { key })).toBe(true);
    }
  });

  it("plain Enter passes through (menu selects)", () => {
    expect(isSlashPassthrough(true, { key: "Enter" })).toBe(true);
  });

  it("Shift+Enter does NOT pass through (still inserts newline)", () => {
    expect(isSlashPassthrough(true, { key: "Enter", shiftKey: true })).toBe(false);
  });

  it("regular characters don't passthrough (still typed into textarea)", () => {
    expect(isSlashPassthrough(true, { key: "a" })).toBe(false);
  });
});
