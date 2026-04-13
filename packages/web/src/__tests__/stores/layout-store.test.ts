/**
 * Unit tests for LayoutStore — pure Zustand logic, no DOM/React needed.
 * The store uses zustand/persist which calls localStorage; Bun's test
 * environment doesn't have localStorage, so we reset via setState to bypass
 * the persist middleware.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { useLayoutStore, BUILT_IN_PRESETS, getPaneCount } from "../../lib/stores/layout-store.js";

function reset() {
  useLayoutStore.setState({
    mode: "single",
    panes: [null, null, null, null],
    activePresetId: "default",
    customPresets: [],
  });
}

// ── getPaneCount helper ───────────────────────────────────────────────────────

describe("getPaneCount", () => {
  it("returns 1 for single", () => {
    expect(getPaneCount("single")).toBe(1);
  });

  it("returns 2 for side-by-side", () => {
    expect(getPaneCount("side-by-side")).toBe(2);
  });

  it("returns 2 for stacked", () => {
    expect(getPaneCount("stacked")).toBe(2);
  });

  it("returns 4 for grid", () => {
    expect(getPaneCount("grid")).toBe(4);
  });
});

// ── setMode ───────────────────────────────────────────────────────────────────

describe("LayoutStore — setMode", () => {
  beforeEach(reset);

  it("changes mode to side-by-side", () => {
    useLayoutStore.getState().setMode("side-by-side");
    expect(useLayoutStore.getState().mode).toBe("side-by-side");
  });

  it("changes mode to grid", () => {
    useLayoutStore.getState().setMode("grid");
    expect(useLayoutStore.getState().mode).toBe("grid");
  });

  it("sets activePresetId to null (custom) when mode changes", () => {
    useLayoutStore.getState().setMode("grid");
    expect(useLayoutStore.getState().activePresetId).toBeNull();
  });

  it("truncates panes array to the correct count for the new mode", () => {
    useLayoutStore.setState({ panes: ["s1", "s2", "s3", "s4"] });
    useLayoutStore.getState().setMode("single");
    expect(useLayoutStore.getState().panes).toHaveLength(1);
  });
});

// ── pane management ───────────────────────────────────────────────────────────

describe("LayoutStore — pane management", () => {
  beforeEach(reset);

  it("pinToPane stores a session id at the given index", () => {
    useLayoutStore.getState().setMode("side-by-side");
    useLayoutStore.getState().pinToPane(0, "session-a");
    expect(useLayoutStore.getState().panes[0]).toBe("session-a");
  });

  it("pinToPane does not affect other pane slots", () => {
    useLayoutStore.getState().setMode("side-by-side");
    useLayoutStore.getState().pinToPane(0, "session-a");
    useLayoutStore.getState().pinToPane(1, "session-b");
    expect(useLayoutStore.getState().panes[0]).toBe("session-a");
    expect(useLayoutStore.getState().panes[1]).toBe("session-b");
  });

  it("unpinFromPane clears the slot back to null", () => {
    useLayoutStore.getState().setMode("side-by-side");
    useLayoutStore.getState().pinToPane(0, "session-a");
    useLayoutStore.getState().unpinFromPane(0);
    expect(useLayoutStore.getState().panes[0]).toBeNull();
  });

  it("clearPanes resets all slots to null", () => {
    useLayoutStore.getState().setMode("grid");
    useLayoutStore.getState().pinToPane(0, "s1");
    useLayoutStore.getState().pinToPane(1, "s2");
    useLayoutStore.getState().clearPanes();
    expect(useLayoutStore.getState().panes.every((p) => p === null)).toBe(true);
  });
});

// ── BUILT_IN_PRESETS ──────────────────────────────────────────────────────────

describe("BUILT_IN_PRESETS", () => {
  it("includes the 'default' preset", () => {
    expect(BUILT_IN_PRESETS.some((p) => p.id === "default")).toBe(true);
  });

  it("every built-in preset has builtIn: true", () => {
    expect(BUILT_IN_PRESETS.every((p) => p.builtIn)).toBe(true);
  });

  it("'web-dev' preset uses the browser right panel", () => {
    const webDev = BUILT_IN_PRESETS.find((p) => p.id === "web-dev");
    expect(webDev?.rightPanel).toBe("browser");
  });

  it("'ai-collab' preset uses side-by-side mode", () => {
    const collab = BUILT_IN_PRESETS.find((p) => p.id === "ai-collab");
    expect(collab?.mode).toBe("side-by-side");
  });
});

// ── applyPreset ───────────────────────────────────────────────────────────────

describe("LayoutStore — applyPreset", () => {
  beforeEach(reset);

  it("applies the 'ai-collab' preset (side-by-side mode)", () => {
    useLayoutStore.getState().applyPreset("ai-collab");
    expect(useLayoutStore.getState().mode).toBe("side-by-side");
    expect(useLayoutStore.getState().activePresetId).toBe("ai-collab");
  });

  it("applies the 'default' preset (single mode)", () => {
    useLayoutStore.getState().setMode("grid");
    useLayoutStore.getState().applyPreset("default");
    expect(useLayoutStore.getState().mode).toBe("single");
    expect(useLayoutStore.getState().activePresetId).toBe("default");
  });

  it("adjusts panes array length to match preset mode", () => {
    useLayoutStore.getState().applyPreset("ai-collab");
    const panes = useLayoutStore.getState().panes;
    expect(panes).toHaveLength(getPaneCount("side-by-side"));
  });

  it("is a no-op for an unknown preset id", () => {
    useLayoutStore.getState().applyPreset("does-not-exist");
    // Mode and preset should remain unchanged
    expect(useLayoutStore.getState().mode).toBe("single");
    expect(useLayoutStore.getState().activePresetId).toBe("default");
  });
});

// ── custom presets ────────────────────────────────────────────────────────────

describe("LayoutStore — custom presets", () => {
  beforeEach(reset);

  it("saveCustomPreset adds a preset to customPresets", () => {
    useLayoutStore.getState().saveCustomPreset("My Preset", "files", false);
    expect(useLayoutStore.getState().customPresets).toHaveLength(1);
  });

  it("saveCustomPreset stores the current mode and right panel", () => {
    useLayoutStore.getState().setMode("side-by-side");
    useLayoutStore.getState().saveCustomPreset("Dev Setup", "terminal", true);
    const preset = useLayoutStore.getState().customPresets[0]!;
    expect(preset.name).toBe("Dev Setup");
    expect(preset.mode).toBe("side-by-side");
    expect(preset.rightPanel).toBe("terminal");
    expect(preset.activityTerminal).toBe(true);
  });

  it("saveCustomPreset marks preset as not built-in", () => {
    useLayoutStore.getState().saveCustomPreset("Custom", "none", false);
    expect(useLayoutStore.getState().customPresets[0]!.builtIn).toBe(false);
  });

  it("saveCustomPreset sets the new preset as active", () => {
    useLayoutStore.getState().saveCustomPreset("Custom", "none", false);
    const newId = useLayoutStore.getState().customPresets[0]!.id;
    expect(useLayoutStore.getState().activePresetId).toBe(newId);
  });

  it("deleteCustomPreset removes the preset", () => {
    useLayoutStore.getState().saveCustomPreset("Custom", "none", false);
    const id = useLayoutStore.getState().customPresets[0]!.id;
    useLayoutStore.getState().deleteCustomPreset(id);
    expect(useLayoutStore.getState().customPresets).toHaveLength(0);
  });

  it("deleteCustomPreset clears activePresetId when the active preset is deleted", () => {
    useLayoutStore.getState().saveCustomPreset("Custom", "none", false);
    const id = useLayoutStore.getState().customPresets[0]!.id;
    useLayoutStore.getState().deleteCustomPreset(id);
    expect(useLayoutStore.getState().activePresetId).toBeNull();
  });

  it("deleteCustomPreset clears activePresetId only when the active preset is deleted", () => {
    // Save a preset and ensure it becomes active
    useLayoutStore.getState().saveCustomPreset("Only", "none", false);
    const id = useLayoutStore.getState().customPresets[0]!.id;
    expect(useLayoutStore.getState().activePresetId).toBe(id);
    // Delete a non-existent id — active preset should not be cleared
    useLayoutStore.getState().deleteCustomPreset("does-not-exist");
    expect(useLayoutStore.getState().activePresetId).toBe(id);
  });

  it("applyPreset can use a custom preset after saving it", () => {
    useLayoutStore.getState().setMode("side-by-side");
    useLayoutStore.getState().saveCustomPreset("Custom Side", "files", false);
    const id = useLayoutStore.getState().customPresets[0]!.id;
    // Switch away then re-apply
    useLayoutStore.getState().setMode("single");
    useLayoutStore.getState().applyPreset(id);
    expect(useLayoutStore.getState().mode).toBe("side-by-side");
    expect(useLayoutStore.getState().activePresetId).toBe(id);
  });
});
