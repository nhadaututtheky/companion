/**
 * Unit tests for UiStore — pure Zustand logic, no DOM/React needed.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { useUiStore } from "../../lib/stores/ui-store.js";

function reset() {
  useUiStore.setState({
    commandPaletteOpen: false,
    newSessionModalOpen: false,
    newSessionDefaultPersonaId: null,
    settingsModalOpen: false,
    settingsActiveTab: "general",
    activityTerminalOpen: false,
    featureGuideOpen: false,
    rightPanelMode: "none",
    rightPanelPath: null,
    browserPreviewUrl: null,
    sidebarExpanded: false,
    sidebarActiveProject: null,
    activeNavMenu: null,
    statsBarOpen: false,
    schedulesModalOpen: false,
    workspaceCreateModalOpen: false,
  });
}

// ── setCommandPaletteOpen ─────────────────────────────────────────────────────

describe("UiStore — setCommandPaletteOpen", () => {
  beforeEach(reset);

  it("sets commandPaletteOpen to true", () => {
    useUiStore.getState().setCommandPaletteOpen(true);
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
  });

  it("sets commandPaletteOpen to false", () => {
    useUiStore.getState().setCommandPaletteOpen(true);
    useUiStore.getState().setCommandPaletteOpen(false);
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it("starts closed by default", () => {
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });
});

// ── setSettingsModalOpen ──────────────────────────────────────────────────────

describe("UiStore — setSettingsModalOpen", () => {
  beforeEach(reset);

  it("sets settingsModalOpen to true", () => {
    useUiStore.getState().setSettingsModalOpen(true);
    expect(useUiStore.getState().settingsModalOpen).toBe(true);
  });

  it("sets settingsModalOpen to false", () => {
    useUiStore.getState().setSettingsModalOpen(true);
    useUiStore.getState().setSettingsModalOpen(false);
    expect(useUiStore.getState().settingsModalOpen).toBe(false);
  });

  it("starts closed by default", () => {
    expect(useUiStore.getState().settingsModalOpen).toBe(false);
  });
});

// ── setSettingsActiveTab ──────────────────────────────────────────────────────

describe("UiStore — setSettingsActiveTab", () => {
  beforeEach(reset);

  it("changes the active settings tab", () => {
    useUiStore.getState().setSettingsActiveTab("models");
    expect(useUiStore.getState().settingsActiveTab).toBe("models");
  });

  it("defaults to 'general'", () => {
    expect(useUiStore.getState().settingsActiveTab).toBe("general");
  });
});

// ── toggleNavMenu ─────────────────────────────────────────────────────────────

describe("UiStore — toggleNavMenu", () => {
  beforeEach(reset);

  it("opens a menu when activeNavMenu is null", () => {
    useUiStore.getState().toggleNavMenu("panels");
    expect(useUiStore.getState().activeNavMenu).toBe("panels");
  });

  it("closes a menu when toggled again (same menu)", () => {
    useUiStore.getState().toggleNavMenu("panels");
    useUiStore.getState().toggleNavMenu("panels");
    expect(useUiStore.getState().activeNavMenu).toBeNull();
  });

  it("switches to a different menu when another is already open", () => {
    useUiStore.getState().toggleNavMenu("panels");
    useUiStore.getState().toggleNavMenu("ai");
    expect(useUiStore.getState().activeNavMenu).toBe("ai");
  });

  it("setActiveNavMenu sets the menu directly", () => {
    useUiStore.getState().setActiveNavMenu("layout");
    expect(useUiStore.getState().activeNavMenu).toBe("layout");
  });

  it("setActiveNavMenu can set null", () => {
    useUiStore.getState().setActiveNavMenu("panels");
    useUiStore.getState().setActiveNavMenu(null);
    expect(useUiStore.getState().activeNavMenu).toBeNull();
  });
});

// ── setRightPanelMode ─────────────────────────────────────────────────────────

describe("UiStore — setRightPanelMode", () => {
  beforeEach(reset);

  it("starts at 'none'", () => {
    expect(useUiStore.getState().rightPanelMode).toBe("none");
  });

  it("switches to 'files'", () => {
    useUiStore.getState().setRightPanelMode("files");
    expect(useUiStore.getState().rightPanelMode).toBe("files");
  });

  it("switches to 'browser'", () => {
    useUiStore.getState().setRightPanelMode("browser");
    expect(useUiStore.getState().rightPanelMode).toBe("browser");
  });

  it("switches to 'terminal'", () => {
    useUiStore.getState().setRightPanelMode("terminal");
    expect(useUiStore.getState().rightPanelMode).toBe("terminal");
  });

  it("switches to 'wiki'", () => {
    useUiStore.getState().setRightPanelMode("wiki");
    expect(useUiStore.getState().rightPanelMode).toBe("wiki");
  });

  it("switches back to 'none'", () => {
    useUiStore.getState().setRightPanelMode("files");
    useUiStore.getState().setRightPanelMode("none");
    expect(useUiStore.getState().rightPanelMode).toBe("none");
  });
});

// ── sidebar helpers ───────────────────────────────────────────────────────────

describe("UiStore — sidebar", () => {
  beforeEach(reset);

  it("setSidebarExpanded sets the flag", () => {
    useUiStore.getState().setSidebarExpanded(true);
    expect(useUiStore.getState().sidebarExpanded).toBe(true);
  });

  it("setSidebarActiveProject expands sidebar when a slug is set", () => {
    useUiStore.getState().setSidebarActiveProject("my-project");
    expect(useUiStore.getState().sidebarActiveProject).toBe("my-project");
    expect(useUiStore.getState().sidebarExpanded).toBe(true);
  });

  it("setSidebarActiveProject collapses sidebar when null is passed", () => {
    useUiStore.getState().setSidebarActiveProject("my-project");
    useUiStore.getState().setSidebarActiveProject(null);
    expect(useUiStore.getState().sidebarActiveProject).toBeNull();
    expect(useUiStore.getState().sidebarExpanded).toBe(false);
  });

  it("toggleSidebarProject opens project when nothing is active", () => {
    useUiStore.getState().toggleSidebarProject("proj-a");
    expect(useUiStore.getState().sidebarActiveProject).toBe("proj-a");
    expect(useUiStore.getState().sidebarExpanded).toBe(true);
  });

  it("toggleSidebarProject closes project when same slug is toggled", () => {
    useUiStore.getState().toggleSidebarProject("proj-a");
    useUiStore.getState().toggleSidebarProject("proj-a");
    expect(useUiStore.getState().sidebarActiveProject).toBeNull();
    expect(useUiStore.getState().sidebarExpanded).toBe(false);
  });

  it("toggleSidebarProject switches to a different project", () => {
    useUiStore.getState().toggleSidebarProject("proj-a");
    useUiStore.getState().toggleSidebarProject("proj-b");
    expect(useUiStore.getState().sidebarActiveProject).toBe("proj-b");
    expect(useUiStore.getState().sidebarExpanded).toBe(true);
  });
});

// ── misc boolean flags ────────────────────────────────────────────────────────

describe("UiStore — misc boolean setters", () => {
  beforeEach(reset);

  it("setStatsBarOpen toggles statsBarOpen", () => {
    useUiStore.getState().setStatsBarOpen(true);
    expect(useUiStore.getState().statsBarOpen).toBe(true);
    useUiStore.getState().setStatsBarOpen(false);
    expect(useUiStore.getState().statsBarOpen).toBe(false);
  });

  it("setSchedulesModalOpen toggles schedulesModalOpen", () => {
    useUiStore.getState().setSchedulesModalOpen(true);
    expect(useUiStore.getState().schedulesModalOpen).toBe(true);
  });

  it("setWorkspaceCreateModalOpen toggles workspaceCreateModalOpen", () => {
    useUiStore.getState().setWorkspaceCreateModalOpen(true);
    expect(useUiStore.getState().workspaceCreateModalOpen).toBe(true);
  });

  it("setFeatureGuideOpen toggles featureGuideOpen", () => {
    useUiStore.getState().setFeatureGuideOpen(true);
    expect(useUiStore.getState().featureGuideOpen).toBe(true);
  });

  it("setActivityTerminalOpen toggles activityTerminalOpen", () => {
    useUiStore.getState().setActivityTerminalOpen(true);
    expect(useUiStore.getState().activityTerminalOpen).toBe(true);
  });
});
