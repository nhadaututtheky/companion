/**
 * Unit tests for the Z-index scale — verifies ordering invariants and uniqueness.
 */

import { describe, it, expect } from "bun:test";
import { Z } from "../../lib/z-index.js";

// ── uniqueness ────────────────────────────────────────────────────────────────

describe("Z — value uniqueness", () => {
  it("all values in the base-through-expanded range are unique", () => {
    // These layers each need a distinct value so stacking is deterministic
    const layerSubset = [
      Z.base,
      Z.tabActive,
      Z.sidebar,
      Z.ringBackdrop,
      Z.ringConnector,
      Z.ringWindow,
      Z.statsBar,
      Z.popover,
      Z.expanded,
      Z.modal,
      Z.modalContent,
      Z.settings,
      Z.settingsContent,
      Z.overlay,
      Z.overlayContent,
      Z.topModal,
      Z.commandPalette,
    ];
    const uniqueValues = new Set(layerSubset);
    expect(uniqueValues.size).toBe(layerSubset.length);
  });
});

// ── ordering invariants ───────────────────────────────────────────────────────

describe("Z — ordering invariants", () => {
  it("commandPalette is higher than everything else", () => {
    const allValues = Object.values(Z) as number[];
    const max = Math.max(...allValues);
    expect(Z.commandPalette).toBe(max);
  });

  it("topModal < commandPalette", () => {
    expect(Z.topModal).toBeLessThan(Z.commandPalette);
  });

  it("overlay < topModal", () => {
    expect(Z.overlay).toBeLessThan(Z.topModal);
  });

  it("settings > modal (settings modal sits above standard modals)", () => {
    expect(Z.settings).toBeGreaterThan(Z.modal);
  });

  it("modal > popover (modals float above dropdowns)", () => {
    expect(Z.modal).toBeGreaterThan(Z.popover);
  });

  it("popover > sidebar (panels/dropdowns above nav)", () => {
    expect(Z.popover).toBeGreaterThan(Z.sidebar);
  });

  it("sidebar > base (sidebar floats above content)", () => {
    expect(Z.sidebar).toBeGreaterThan(Z.base);
  });

  it("expanded > popover (expanded card is above dropdowns)", () => {
    expect(Z.expanded).toBeGreaterThan(Z.popover);
  });

  it("statsBar is between ringWindow and popover", () => {
    expect(Z.statsBar).toBeGreaterThan(Z.ringWindow);
    expect(Z.statsBar).toBeLessThan(Z.popover);
  });

  it("ring layers are ordered: backdrop < connector < window", () => {
    expect(Z.ringBackdrop).toBeLessThan(Z.ringConnector);
    expect(Z.ringConnector).toBeLessThan(Z.ringWindow);
  });

  it("modalContent > modal (content sits above modal backdrop)", () => {
    expect(Z.modalContent).toBeGreaterThan(Z.modal);
  });

  it("settingsContent > settings", () => {
    expect(Z.settingsContent).toBeGreaterThan(Z.settings);
  });

  it("overlayContent > overlay", () => {
    expect(Z.overlayContent).toBeGreaterThan(Z.overlay);
  });
});

// ── value sanity checks ───────────────────────────────────────────────────────

describe("Z — value sanity", () => {
  it("base is 1", () => {
    expect(Z.base).toBe(1);
  });

  it("commandPalette is 9999", () => {
    expect(Z.commandPalette).toBe(9999);
  });

  it("all values are positive integers", () => {
    for (const value of Object.values(Z)) {
      expect(value).toBeGreaterThan(0);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
