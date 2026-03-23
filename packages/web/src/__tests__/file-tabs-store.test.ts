/**
 * Unit tests for the FileTabsStore Zustand store.
 * Pure logic — no DOM or React needed. Zustand stores expose getState/setState
 * so we can drive them directly in bun:test.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { useFileTabsStore } from "../lib/stores/file-tabs-store.js";

// Helper: reset the store to a blank state before each test
function reset() {
  useFileTabsStore.setState({ tabs: [], activeTabId: null });
}

describe("FileTabsStore — openFile", () => {
  beforeEach(reset);

  it("creates a new tab when the file is not yet open", () => {
    useFileTabsStore.getState().openFile("/path/to/file.ts");
    const { tabs } = useFileTabsStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.path).toBe("/path/to/file.ts");
  });

  it("sets id equal to the path", () => {
    useFileTabsStore.getState().openFile("/path/to/file.ts");
    expect(useFileTabsStore.getState().tabs[0]!.id).toBe("/path/to/file.ts");
  });

  it("parses the file name correctly", () => {
    useFileTabsStore.getState().openFile("/path/to/file.ts");
    expect(useFileTabsStore.getState().tabs[0]!.name).toBe("file.ts");
  });

  it("parses the extension correctly", () => {
    useFileTabsStore.getState().openFile("/path/to/file.ts");
    expect(useFileTabsStore.getState().tabs[0]!.ext).toBe("ts");
  });

  it("sets activeTabId to the new tab path", () => {
    useFileTabsStore.getState().openFile("/path/to/file.ts");
    expect(useFileTabsStore.getState().activeTabId).toBe("/path/to/file.ts");
  });

  it("does not create a duplicate when the file is already open", () => {
    useFileTabsStore.getState().openFile("/path/to/file.ts");
    useFileTabsStore.getState().openFile("/path/to/file.ts");
    expect(useFileTabsStore.getState().tabs).toHaveLength(1);
  });

  it("switches to an existing tab when re-opening it", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    expect(useFileTabsStore.getState().activeTabId).toBe("/b.ts");
    useFileTabsStore.getState().openFile("/a.ts");
    expect(useFileTabsStore.getState().activeTabId).toBe("/a.ts");
    // Still only two tabs
    expect(useFileTabsStore.getState().tabs).toHaveLength(2);
  });

  it("handles files with no extension", () => {
    useFileTabsStore.getState().openFile("/path/to/Makefile");
    const tab = useFileTabsStore.getState().tabs[0]!;
    expect(tab.name).toBe("Makefile");
    expect(tab.ext).toBe("");
  });

  it("initialises tab with content null and dirty false", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    const tab = useFileTabsStore.getState().tabs[0]!;
    expect(tab.content).toBeNull();
    expect(tab.dirty).toBe(false);
  });
});

describe("FileTabsStore — closeTab", () => {
  beforeEach(reset);

  it("removes the specified tab", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().closeTab("/a.ts");
    expect(useFileTabsStore.getState().tabs).toHaveLength(0);
  });

  it("sets activeTabId to null when the last tab is closed", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().closeTab("/a.ts");
    expect(useFileTabsStore.getState().activeTabId).toBeNull();
  });

  it("switches to the next tab (right neighbour) when active tab is closed", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().openFile("/c.ts");
    // Active is /c.ts; switch to /b.ts first so we close the middle tab
    useFileTabsStore.getState().switchTab("/b.ts");
    useFileTabsStore.getState().closeTab("/b.ts");
    // Right neighbour of index 1 is index 1 in the new array (/c.ts)
    expect(useFileTabsStore.getState().activeTabId).toBe("/c.ts");
  });

  it("falls back to left neighbour when closing the rightmost active tab", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().openFile("/c.ts");
    // /c.ts is active — no right neighbour, should fall back to /b.ts
    useFileTabsStore.getState().closeTab("/c.ts");
    expect(useFileTabsStore.getState().activeTabId).toBe("/b.ts");
  });

  it("does not change activeTabId when closing a non-active tab", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().openFile("/c.ts");
    // Active is /c.ts; close /a.ts
    useFileTabsStore.getState().closeTab("/a.ts");
    expect(useFileTabsStore.getState().activeTabId).toBe("/c.ts");
    expect(useFileTabsStore.getState().tabs).toHaveLength(2);
  });

  it("is a no-op when the id does not exist", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().closeTab("/nonexistent.ts");
    expect(useFileTabsStore.getState().tabs).toHaveLength(1);
  });
});

describe("FileTabsStore — closeOtherTabs", () => {
  beforeEach(reset);

  it("keeps only the specified tab", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().openFile("/c.ts");
    useFileTabsStore.getState().closeOtherTabs("/b.ts");
    expect(useFileTabsStore.getState().tabs).toHaveLength(1);
    expect(useFileTabsStore.getState().tabs[0]!.path).toBe("/b.ts");
  });

  it("sets activeTabId to the kept tab", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().closeOtherTabs("/b.ts");
    expect(useFileTabsStore.getState().activeTabId).toBe("/b.ts");
  });

  it("is a no-op when the id does not exist", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().closeOtherTabs("/nonexistent.ts");
    expect(useFileTabsStore.getState().tabs).toHaveLength(2);
  });
});

describe("FileTabsStore — closeAllTabs", () => {
  beforeEach(reset);

  it("clears all tabs", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().closeAllTabs();
    expect(useFileTabsStore.getState().tabs).toHaveLength(0);
  });

  it("sets activeTabId to null", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().closeAllTabs();
    expect(useFileTabsStore.getState().activeTabId).toBeNull();
  });
});

describe("FileTabsStore — switchTab", () => {
  beforeEach(reset);

  it("changes activeTabId", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().switchTab("/a.ts");
    expect(useFileTabsStore.getState().activeTabId).toBe("/a.ts");
  });
});

describe("FileTabsStore — setTabContent", () => {
  beforeEach(reset);

  it("stores content on the matching tab", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().setTabContent("/a.ts", "const x = 1;");
    const tab = useFileTabsStore.getState().tabs.find((t) => t.id === "/a.ts");
    expect(tab?.content).toBe("const x = 1;");
  });

  it("does not affect other tabs", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().openFile("/b.ts");
    useFileTabsStore.getState().setTabContent("/a.ts", "hello");
    const b = useFileTabsStore.getState().tabs.find((t) => t.id === "/b.ts");
    expect(b?.content).toBeNull();
  });

  it("is a no-op when the id does not match any tab", () => {
    useFileTabsStore.getState().openFile("/a.ts");
    useFileTabsStore.getState().setTabContent("/nonexistent.ts", "content");
    // /a.ts content unchanged
    const tab = useFileTabsStore.getState().tabs[0]!;
    expect(tab.content).toBeNull();
  });
});
