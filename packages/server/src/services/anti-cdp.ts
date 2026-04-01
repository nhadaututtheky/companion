/**
 * Direct CDP (Chrome DevTools Protocol) client for Antigravity IDE.
 * Connects to Anti's DevTools on port 9000 to inject JS into the renderer.
 * Bypasses the extension WS relay for more reliable command delivery.
 *
 * v2: Parallel port scan, shared DOM helpers, unified page discovery.
 * v3: Settings from DB (anti.cdpHost, anti.cdpBasePort, anti.cdpPortRange).
 */

import { getSettingInt, getSetting } from "./settings-helpers.js";

// Defaults — overridden by DB settings (anti.cdpHost, anti.cdpBasePort, anti.cdpPortRange)
const DEFAULT_CDP_HOST = "127.0.0.1";
const DEFAULT_CDP_BASE_PORT = 9000;
const DEFAULT_CDP_PORT_RANGE = 3;
const CDP_TIMEOUT = 5000;

function getCdpHost(): string {
  return getSetting("anti.cdpHost") ?? DEFAULT_CDP_HOST;
}
function getCdpBasePort(): number {
  return getSettingInt("anti.cdpBasePort", DEFAULT_CDP_BASE_PORT);
}
function getCdpPortRange(): number {
  return getSettingInt("anti.cdpPortRange", DEFAULT_CDP_PORT_RANGE);
}

interface CDPPage {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

interface CDPResult {
  success: boolean;
  detail: string;
}

// ── Shared CDP DOM traversal (injected into all browser-side scripts) ───

export const CDP_DOM_HELPERS = `
function getAllRoots(root, results) {
  if (!root) return results || [];
  results = results || [];
  results.push(root);
  try {
    var nodes = root.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].shadowRoot) getAllRoots(nodes[i].shadowRoot, results);
    }
  } catch(e) {}
  return results;
}
function getDocuments(root) {
  var docs = [root || document];
  try {
    var iframes = (root || document).querySelectorAll('iframe, frame');
    for (var i = 0; i < iframes.length; i++) {
      try {
        var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
        if (doc) docs = docs.concat(getDocuments(doc));
      } catch(e) {}
    }
  } catch(e) {}
  return docs;
}
function collectAllRoots() {
  var allRoots = [];
  getDocuments(document).forEach(function(doc) {
    allRoots = allRoots.concat(getAllRoots(doc));
  });
  return allRoots;
}`;

// ── Core CDP transport ──────────────────────────────────────────────────

/** Fetch available CDP pages from a given port. */
async function getPages(port: number): Promise<CDPPage[]> {
  try {
    const res = await fetch(`http://${getCdpHost()}:${port}/json/list`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    const pages = (await res.json()) as CDPPage[];
    return pages.filter(
      (p) =>
        p.webSocketDebuggerUrl &&
        (p.type === "page" || p.type === "webview") &&
        !p.url?.startsWith("devtools://") &&
        !p.url?.startsWith("chrome-devtools://"),
    );
  } catch {
    return [];
  }
}

/** Fetch ALL CDP targets (unfiltered) from a given port — for webview scanning. */
async function getRawTargets(port: number): Promise<CDPPage[]> {
  try {
    const res = await fetch(`http://${getCdpHost()}:${port}/json/list`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    const targets = (await res.json()) as CDPPage[];
    return targets.filter((t) => t.webSocketDebuggerUrl);
  } catch {
    return [];
  }
}

// ── Page cache (avoids HTTP fetch every 1.5s poll) ──────────────────────────

let _pageCache: { port: number; page: CDPPage }[] = [];
let _pageCacheAt = 0;
const PAGE_CACHE_TTL = 10_000; // 10s

/** Scan ports in parallel and return filtered pages (cached 10s). */
async function findAllPages(): Promise<{ port: number; page: CDPPage }[]> {
  const now = Date.now();
  if (_pageCache.length > 0 && now - _pageCacheAt < PAGE_CACHE_TTL) {
    return _pageCache;
  }
  const basePort = getCdpBasePort();
  const portRange = getCdpPortRange();
  const ports = Array.from({ length: portRange * 2 + 1 }, (_, i) => basePort - portRange + i);
  const results = await Promise.all(
    ports.map(async (port) => {
      const pages = await getPages(port);
      return pages.map((page) => ({ port, page }));
    }),
  );
  _pageCache = results.flat();
  _pageCacheAt = now;
  return _pageCache;
}

/** Invalidate the page cache (e.g. after Anti restart). */
export function invalidatePageCache(): void {
  _pageCache = [];
  _pageCacheAt = 0;
}

/** Scan ports in parallel and return ALL targets (unfiltered). */
async function findAllTargetsRaw(): Promise<{ port: number; targets: CDPPage[] }[]> {
  const basePort = getCdpBasePort();
  const portRange = getCdpPortRange();
  const ports = Array.from({ length: portRange * 2 + 1 }, (_, i) => basePort - portRange + i);
  const results = await Promise.all(
    ports.map(async (port) => {
      const targets = await getRawTargets(port);
      return targets.length > 0 ? { port, targets } : null;
    }),
  );
  return results.filter((r): r is { port: number; targets: CDPPage[] } => r !== null);
}

/** Evaluate JS in a CDP target via WebSocket. */
async function evaluate(
  wsUrl: string,
  expression: string,
  timeout = CDP_TIMEOUT,
): Promise<{ result?: { value?: unknown } }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("CDP timeout"));
    }, timeout);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, userGesture: true, awaitPromise: true, returnByValue: true },
        }),
      );
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : "");
        if (msg.id === 1) {
          clearTimeout(timer);
          ws.close();
          resolve(msg.result ?? {});
        }
      } catch {
        /* ignore */
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CDP WebSocket error"));
    });
  });
}

/**
 * Send multiple CDP protocol commands sequentially on a single connection.
 * Each command is { method, params }. Returns results in order.
 */
async function cdpSendCommands(
  wsUrl: string,
  commands: { method: string; params?: Record<string, unknown> }[],
  timeout = CDP_TIMEOUT,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const results: unknown[] = [];
    let currentId = 0;

    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("CDP timeout"));
    }, timeout);

    function sendNext(): void {
      if (currentId >= commands.length) {
        clearTimeout(timer);
        ws.close();
        resolve(results);
        return;
      }
      const cmd = commands[currentId]!;
      ws.send(JSON.stringify({ id: currentId + 1, method: cmd.method, params: cmd.params ?? {} }));
    }

    ws.addEventListener("open", () => sendNext());

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : "");
        if (msg.id === currentId + 1) {
          results.push(msg.result ?? msg.error ?? null);
          currentId++;
          setTimeout(() => sendNext(), 50);
        }
      } catch {
        /* ignore */
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CDP WebSocket error"));
    });
  });
}

// ── Helper: parse CDP evaluate result ───────────────────────────────────

function parseResult(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : (value as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/** Check if Anti's CDP is available. */
export async function isAntiAvailable(): Promise<boolean> {
  const pages = await findAllPages();
  return pages.some((p) => p.page.title !== "Launchpad");
}

/** Quick status read: current model + mode from bottom bar (no clicks, read-only). */
export async function getAntiStatus(): Promise<{ model: string; mode: string }> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) return { model: "", mode: "" };

  const script = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var model = '', mode = '';

  for (var r = 0; r < allRoots.length; r++) {
    try {
      // Model: span with opacity-70 containing model name
      if (!model) {
        var spans = allRoots[r].querySelectorAll('span[class*="opacity-70"]');
        for (var i = 0; i < spans.length; i++) {
          var el = spans[i];
          if (el.offsetHeight === 0) continue;
          var t = (el.textContent || '').trim();
          if (/gemini|claude|gpt|flash|opus|sonnet|haiku/i.test(t) && t.length < 80) {
            model = t; break;
          }
        }
      }
      // Mode: span.select-none with "Planning" or "Fast"
      if (!mode) {
        var spans2 = allRoots[r].querySelectorAll('span[class*="select-none"]');
        for (var i = 0; i < spans2.length; i++) {
          var el2 = spans2[i];
          if (el2.offsetHeight === 0) continue;
          var t2 = (el2.textContent || '').trim();
          if (t2 === 'Planning' || t2 === 'Fast') { mode = t2; break; }
        }
      }
      if (model && mode) break;
    } catch(e) {}
  }
  return JSON.stringify({ model: model, mode: mode });
})()`;

  try {
    const wsUrl = target.page.webSocketDebuggerUrl;
    const result = await evaluate(wsUrl, script, 3000);
    const info = parseResult(result.result?.value);
    return { model: String(info?.model || ""), mode: String(info?.mode || "") };
  } catch {
    return { model: "", mode: "" };
  }
}

/** Ensure Anti's chat panel is open by clicking chat icon or dispatching shortcut. */
async function ensureChatOpen(pages: { port: number; page: CDPPage }[]): Promise<void> {
  const script = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  // Check if chat input already visible
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var ces = allRoots[r].querySelectorAll('[contenteditable="true"]');
      for (var i = 0; i < ces.length; i++) {
        var cls = (ces[i].className || '');
        if (ces[i].offsetHeight > 0 && (cls.indexOf('cursor-text') !== -1 || cls.indexOf('rounded') !== -1)) {
          return JSON.stringify({ chatOpen: true });
        }
      }
    } catch(e) {}
  }

  // Try to find and click the chat/agent button
  var openers = ['open agent', 'agent manager', 'chat', 'cascade', 'open chat', 'toggle chat', 'new conversation', 'casual conversation'];
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('button, [role="button"], [role="tab"], .action-item a');
      for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        if (btn.offsetHeight === 0) continue;
        var btnText = ((btn.textContent || '') + ' ' + (btn.title || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase().trim();
        for (var o = 0; o < openers.length; o++) {
          if (btnText.indexOf(openers[o]) !== -1) {
            btn.click();
            return JSON.stringify({ chatOpen: false, clicked: btnText.substring(0, 60) });
          }
        }
      }
    } catch(e) {}
  }

  // Fallback: keyboard shortcut Ctrl+Shift+I
  document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'i', code: 'KeyI', keyCode: 73,
    ctrlKey: true, shiftKey: true,
    bubbles: true, cancelable: true
  }));

  return JSON.stringify({ chatOpen: false, fallback: 'keyboard' });
})()`;

  for (const { page } of pages) {
    if (page.title === "Launchpad") continue;
    try {
      const result = await evaluate(page.webSocketDebuggerUrl, script, 3000);
      const parsed = parseResult(result.result?.value);
      if (parsed?.chatOpen) return;
      await new Promise((r) => setTimeout(r, 800));
      return;
    } catch {
      /* ignore */
    }
  }
}

// ── Session List + Selection ────────────────────────────────────────────

export interface AntiSession {
  title: string;
  age: string; // e.g. "22h", "2d", "6d"
  index: number;
}

export interface SessionListResult {
  success: boolean;
  sessions: AntiSession[];
  hasActiveSession: boolean;
  detail: string;
}

/** List visible sessions in Anti's chat sidebar. */
export async function listAntiSessions(): Promise<SessionListResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) {
    return {
      success: false,
      sessions: [],
      hasActiveSession: false,
      detail: "No CDP targets. Is Anti running?",
    };
  }

  await ensureChatOpen(pages);

  // Step 1: Click the history toggle (clock icon) to open conversation list
  const openHistoryScript = `(function() {
    ${CDP_DOM_HELPERS}
    var allRoots = collectAllRoots();

    // Find and click the history toggle: a[data-past-conversations-toggle="true"]
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var toggle = allRoots[r].querySelector('a[data-past-conversations-toggle="true"]');
        if (toggle && toggle.offsetHeight > 0) {
          toggle.click();
          return JSON.stringify({ opened: true });
        }
      } catch(e) {}
    }
    // Fallback: look for clock-like icon button near header
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var links = allRoots[r].querySelectorAll('a, button');
        for (var i = 0; i < links.length; i++) {
          var el = links[i];
          if (el.offsetHeight === 0) continue;
          var aria = (el.getAttribute('aria-label') || '').toLowerCase();
          var title = (el.getAttribute('title') || '').toLowerCase();
          if (aria.indexOf('history') !== -1 || aria.indexOf('past') !== -1 || title.indexOf('history') !== -1 || title.indexOf('past') !== -1) {
            el.click();
            return JSON.stringify({ opened: true });
          }
        }
      } catch(e) {}
    }
    return JSON.stringify({ opened: false });
  })()`;

  try {
    const openResult = await evaluate(target.page.webSocketDebuggerUrl, openHistoryScript, 5000);
    const openInfo = parseResult(openResult.result?.value);
    // Wait for panel to animate in
    if (openInfo?.opened) {
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    /* continue anyway, panel might already be open */
  }

  // Step 2: Read conversation items from the history panel
  const script = `(function() {
    ${CDP_DOM_HELPERS}
    var allRoots = collectAllRoots();
    var sessions = [];
    var hasActive = false;

    // Detect active conversation (contenteditable input visible)
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var ces = allRoots[r].querySelectorAll('[contenteditable="true"]');
        for (var i = 0; i < ces.length; i++) {
          var cls = (ces[i].className || '');
          if (ces[i].offsetHeight > 0 && (cls.indexOf('cursor-text') !== -1 || cls.indexOf('rounded') !== -1)) {
            hasActive = true; break;
          }
        }
        if (hasActive) break;
      } catch(e) {}
    }

    // Strategy 1: Find conversation list items by their specific class pattern
    // Items: div with class containing "px-2.5 cursor-pointer flex items-center justify-between rounded-md"
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var items = allRoots[r].querySelectorAll('div[class*="cursor-pointer"][class*="flex"][class*="items-center"][class*="justify-between"][class*="rounded"]');
        for (var i = 0; i < items.length; i++) {
          var el = items[i];
          if (el.offsetHeight === 0 || el.offsetHeight > 80) continue;
          // Title: span.text-sm > span (first span child)
          var titleEl = el.querySelector('span.text-sm span') || el.querySelector('span.text-sm');
          var title = titleEl ? (titleEl.textContent || '').trim() : '';
          if (!title || title.length < 2) continue;
          // Age: span.text-xs.opacity-50.ml-4
          var ageEl = el.querySelector('span.text-xs.opacity-50.ml-4') || el.querySelector('span.ml-4');
          var age = ageEl ? (ageEl.textContent || '').trim() : '';
          // Project path: span.text-xs.opacity-50 (without ml-4)
          var pathEl = el.querySelector('span.text-xs.opacity-50:not(.ml-4)');
          var path = pathEl ? (pathEl.textContent || '').trim() : '';
          // Active session has bg-quickinput-list-focusBackground
          var isActive = (el.className || '').indexOf('focusBackground') !== -1;
          if (isActive) hasActive = true;
          sessions.push({ title: title.substring(0, 200), age: age, path: path, index: sessions.length, isActive: isActive });
        }
        if (sessions.length > 0) break;
      } catch(e) {}
    }

    // Strategy 2: Fallback — narrow sidebar panels
    if (sessions.length === 0) {
      for (var r = 0; r < allRoots.length; r++) {
        try {
          var panels = allRoots[r].querySelectorAll(
            '[class*="sidebar"], [class*="history"], [class*="panel"], [class*="nav"], [class*="drawer"]'
          );
          for (var p = 0; p < panels.length; p++) {
            var panel = panels[p];
            if (panel.offsetWidth > 400 || panel.offsetHeight < 100) continue;
            var items = panel.querySelectorAll('div, a, button, li');
            var found = [];
            for (var i = 0; i < items.length; i++) {
              var el = items[i];
              if (el.offsetHeight === 0 || el.offsetHeight > 60) continue;
              if (el.offsetWidth > 350) continue;
              var text = (el.innerText || el.textContent || '').trim();
              if (!text || text.length < 3 || text.length > 200) continue;
              if (text.indexOf('Thought for') !== -1) continue;
              if (text.indexOf('Accept') !== -1 || text.indexOf('Reject') !== -1) continue;
              var isDupe = false;
              for (var f = 0; f < found.length; f++) {
                if (found[f].contains(el) || el.contains(found[f])) { isDupe = true; break; }
              }
              if (isDupe) continue;
              var lines = text.split(/\\n/).map(function(s) { return s.trim(); }).filter(Boolean);
              var title = lines[0];
              var age = '';
              if (lines.length > 1) {
                var last = lines[lines.length - 1];
                if (/^\\d+[smhdw]$/.test(last) || /^\\d+ (sec|min|hour|day|week)/.test(last)) { age = last; }
              }
              found.push(el);
              sessions.push({ title: title.substring(0, 200), age: age, index: sessions.length, isActive: false });
            }
            if (sessions.length > 0) break;
          }
          if (sessions.length > 0) break;
        } catch(e) {}
      }
    }

    return JSON.stringify({ sessions: sessions, hasActive: hasActive });
  })()`;

  try {
    const evalResult = await evaluate(target.page.webSocketDebuggerUrl, script, 8_000);
    const raw = evalResult.result?.value;
    if (!raw || typeof raw !== "string") {
      return {
        success: false,
        sessions: [],
        hasActiveSession: false,
        detail: "CDP returned no data",
      };
    }

    const parsed = JSON.parse(raw) as { sessions: AntiSession[]; hasActive: boolean };

    // Close history panel with Escape
    await cdpSendCommands(
      target.page.webSocketDebuggerUrl,
      [
        {
          method: "Input.dispatchKeyEvent",
          params: { type: "keyDown", key: "Escape", code: "Escape" },
        },
        {
          method: "Input.dispatchKeyEvent",
          params: { type: "keyUp", key: "Escape", code: "Escape" },
        },
      ],
      2000,
    ).catch(() => {});

    return {
      success: true,
      sessions: parsed.sessions,
      hasActiveSession: parsed.hasActive,
      detail:
        parsed.sessions.length > 0
          ? `${parsed.sessions.length} session(s) found`
          : "No sessions found in sidebar",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      sessions: [],
      hasActiveSession: false,
      detail: `Session list failed: ${msg}`,
    };
  }
}

/** Click on a session by index in Anti's sidebar to open it. */
export async function selectAntiSession(sessionIndex: number): Promise<CDPResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) {
    return { success: false, detail: "No CDP targets." };
  }

  const wsUrl = target.page.webSocketDebuggerUrl;

  // Step 1: Open history panel first (it may have closed since listing)
  const openHistoryScript = `(function() {
    ${CDP_DOM_HELPERS}
    var allRoots = collectAllRoots();
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var toggle = allRoots[r].querySelector('a[data-past-conversations-toggle="true"]');
        if (toggle && toggle.offsetHeight > 0) {
          toggle.click();
          return JSON.stringify({ opened: true });
        }
      } catch(e) {}
    }
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var links = allRoots[r].querySelectorAll('a, button');
        for (var i = 0; i < links.length; i++) {
          var el = links[i];
          if (el.offsetHeight === 0) continue;
          var aria = (el.getAttribute('aria-label') || '').toLowerCase();
          var title = (el.getAttribute('title') || '').toLowerCase();
          if (aria.indexOf('history') !== -1 || aria.indexOf('past') !== -1 || title.indexOf('history') !== -1 || title.indexOf('past') !== -1) {
            el.click();
            return JSON.stringify({ opened: true });
          }
        }
      } catch(e) {}
    }
    return JSON.stringify({ opened: false });
  })()`;

  try {
    const openResult = await evaluate(wsUrl, openHistoryScript, 5000);
    const openInfo = parseResult(openResult.result?.value);
    if (openInfo?.opened) {
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    /* continue — panel might already be open */
  }

  // Step 2: Click the session item using the SAME selector as listAntiSessions
  const script = `(function() {
    ${CDP_DOM_HELPERS}
    var allRoots = collectAllRoots();
    var idx = ${sessionIndex};
    var clicked = false;

    // Use the exact same selector as listAntiSessions to match history items
    for (var r = 0; r < allRoots.length && !clicked; r++) {
      try {
        var items = allRoots[r].querySelectorAll('div[class*="cursor-pointer"][class*="flex"][class*="items-center"][class*="justify-between"][class*="rounded"]');
        var visible = [];
        for (var i = 0; i < items.length; i++) {
          var el = items[i];
          if (el.offsetHeight === 0 || el.offsetHeight > 80) continue;
          // Verify it has a title span (not a random matched div)
          var titleEl = el.querySelector('span.text-sm span') || el.querySelector('span.text-sm');
          if (!titleEl) continue;
          visible.push(el);
        }
        if (idx < visible.length) {
          visible[idx].click();
          clicked = true;
        }
      } catch(e) {}
    }

    return JSON.stringify({ clicked: clicked, total: 0 });
  })()`;

  try {
    const evalResult = await evaluate(wsUrl, script, 5_000);
    const parsed = parseResult(evalResult.result?.value);
    if (!parsed?.clicked) {
      return { success: false, detail: `Session #${sessionIndex + 1} not found in history panel` };
    }

    // Step 3: Auto-dismiss "Select where to open the conversation" dialog
    // Anti shows a VS Code quick-pick — first option "Open in current window" is pre-focused.
    // Press Enter to confirm the focused option (clicks don't work reliably on quick-picks).
    await new Promise((r) => setTimeout(r, 600));
    const dismissScript = `(function() {
      // Dispatch Enter keydown on the focused quick-input
      var input = document.querySelector('[class*="quick-input"] input, [class*="quickInput"] input');
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return JSON.stringify({ dismissed: true, strategy: 'enter-key' });
      }
      // Fallback: press Enter on document.activeElement
      var active = document.activeElement;
      if (active) {
        active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        return JSON.stringify({ dismissed: true, strategy: 'active-element' });
      }
      return JSON.stringify({ dismissed: false });
    })()`;

    try {
      await evaluate(wsUrl, dismissScript, 3000);
    } catch {
      /* dialog may not appear for all sessions */
    }

    return { success: true, detail: `Selected session #${sessionIndex + 1}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, detail: `Session select failed: ${msg}` };
  }
}

/** Send a chat message to Anti's Gemini via CDP. */
export async function sendChatMessage(text: string): Promise<CDPResult> {
  const pages = await findAllPages();
  if (pages.length === 0) {
    return {
      success: false,
      detail: "No CDP targets. Is Anti running with --remote-debugging-port=9000?",
    };
  }

  await ensureChatOpen(pages);

  const findScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  var input = null;
  var inputInfo = '';
  var sendBtn = null;

  // Priority 1: contenteditable — MUST exclude terminal/editor areas
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var editables = allRoots[r].querySelectorAll('[contenteditable="true"]');
      for (var i = 0; i < editables.length; i++) {
        var ed = editables[i];
        if (ed.offsetHeight === 0 || ed.offsetWidth === 0) continue;
        var cls = (ed.className || '');
        var parentHtml = (ed.parentElement && ed.parentElement.className || '');
        if (cls.indexOf('xterm') !== -1 || cls.indexOf('terminal') !== -1) continue;
        if (cls.indexOf('monaco') !== -1 || cls.indexOf('editor') !== -1) continue;
        if (parentHtml.indexOf('xterm') !== -1 || parentHtml.indexOf('terminal') !== -1) continue;
        if (ed.closest && (ed.closest('.xterm') || ed.closest('[class*="terminal"]') || ed.closest('.monaco-editor'))) continue;
        if (cls.indexOf('cursor-text') !== -1 || cls.indexOf('rounded') !== -1 || cls.indexOf('max-h') !== -1 || cls.indexOf('chat') !== -1 || cls.indexOf('message') !== -1) {
          input = ed; inputInfo = cls.substring(0, 60); break;
        }
        var ph = ed.getAttribute('placeholder') || ed.getAttribute('aria-placeholder') || ed.dataset.placeholder || '';
        if (ph.toLowerCase().indexOf('ask') !== -1 || ph.toLowerCase().indexOf('message') !== -1 || ph.toLowerCase().indexOf('chat') !== -1) {
          input = ed; inputInfo = 'placeholder:' + ph.substring(0, 40); break;
        }
        if (!input) { input = ed; inputInfo = 'fallback:' + cls.substring(0, 40); }
      }
      if (input && (inputInfo.indexOf('cursor-text') !== -1 || inputInfo.indexOf('placeholder') !== -1)) break;
    } catch(e) {}
  }

  // Priority 2: textarea (skip internal)
  if (!input) {
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var tas = allRoots[r].querySelectorAll('textarea');
        for (var i = 0; i < tas.length; i++) {
          var cls = (tas[i].className || '');
          if (cls.indexOf('ime-text-area') !== -1 || cls.indexOf('xterm') !== -1) continue;
          if (tas[i].offsetHeight > 0 && !tas[i].disabled) { input = tas[i]; inputInfo = 'textarea'; break; }
        }
        if (input) break;
      } catch(e) {}
    }
  }

  if (!input) return JSON.stringify({ found: false });

  var rect = input.getBoundingClientRect();
  var x = rect.left + rect.width / 2;
  var y = rect.top + rect.height / 2;

  // Find send button coordinates
  var sendX = 0, sendY = 0, hasSend = false;
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('button, [role="button"]');
      for (var i = 0; i < btns.length; i++) {
        var t = ((btns[i].textContent || '') + ' ' + (btns[i].title || '') + ' ' + (btns[i].getAttribute('aria-label') || '')).toLowerCase();
        if (t.indexOf('send') !== -1 && btns[i].offsetHeight > 0) {
          var sr = btns[i].getBoundingClientRect();
          sendX = sr.left + sr.width / 2;
          sendY = sr.top + sr.height / 2;
          hasSend = true;
          break;
        }
      }
      if (hasSend) break;
    } catch(e) {}
  }

  return JSON.stringify({ found: true, x: x, y: y, inputInfo: inputInfo, sendX: sendX, sendY: sendY, hasSend: hasSend });
})()`;

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const { port, page } of pages) {
      if (page.title === "Launchpad") continue;
      try {
        const findResult = await evaluate(page.webSocketDebuggerUrl, findScript);
        const info = parseResult(findResult.result?.value);
        if (!info?.found) continue;

        const commands: { method: string; params?: Record<string, unknown> }[] = [
          {
            method: "Input.dispatchMouseEvent",
            params: { type: "mousePressed", x: info.x, y: info.y, button: "left", clickCount: 1 },
          },
          {
            method: "Input.dispatchMouseEvent",
            params: { type: "mouseReleased", x: info.x, y: info.y, button: "left", clickCount: 1 },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: { type: "keyDown", key: "Backspace", code: "Backspace" },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: { type: "keyUp", key: "Backspace", code: "Backspace" },
          },
          { method: "Input.insertText", params: { text } },
        ];

        if (info.hasSend) {
          commands.push(
            {
              method: "Input.dispatchMouseEvent",
              params: {
                type: "mousePressed",
                x: info.sendX,
                y: info.sendY,
                button: "left",
                clickCount: 1,
              },
            },
            {
              method: "Input.dispatchMouseEvent",
              params: {
                type: "mouseReleased",
                x: info.sendX,
                y: info.sendY,
                button: "left",
                clickCount: 1,
              },
            },
          );
        } else {
          commands.push(
            {
              method: "Input.dispatchKeyEvent",
              params: { type: "keyDown", key: "Enter", code: "Enter" },
            },
            {
              method: "Input.dispatchKeyEvent",
              params: { type: "keyUp", key: "Enter", code: "Enter" },
            },
          );
        }

        await cdpSendCommands(page.webSocketDebuggerUrl, commands, 8000);
        return { success: true, detail: `CDP port ${port} Input.insertText (${info.inputInfo})` };
      } catch {
        /* try next target */
      }
    }

    if (attempt === 0) {
      await ensureChatOpen(pages);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { success: false, detail: `No chat input found in ${pages.length} targets` };
}

// ── Chat Messages (read from DOM) ─────────────────────────────────────

export interface AntiChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
  /** Index in the visible chat, 0-based from top */
  index: number;
  /** DJB2 hash fingerprint of message content — stable across re-renders */
  fingerprint: string;
}

export interface ChatMessagesResult {
  success: boolean;
  messages: AntiChatMessage[];
  detail: string;
}

/**
 * Read visible chat messages from Anti's Gemini chat interface via CDP.
 * Uses #cascade/#conversation ID selectors (stable) with class-based fallback.
 * Messages are fingerprinted via DJB2 hash for stable identity across re-renders.
 * Optional `sinceFingerprints` set returns only messages not already seen.
 */
export async function getChatMessages(
  since = -1,
  sinceFingerprints?: Set<string>,
): Promise<ChatMessagesResult> {
  const pages = await findAllPages();
  if (pages.length === 0) {
    return { success: false, messages: [], detail: "No CDP targets" };
  }

  const script = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var messages = [];

  // DJB2 hash for fingerprinting message content
  function djb2(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
    }
    return (hash >>> 0).toString(36);
  }

  // Filter UI chrome noise (input area, model selector, button labels)
  var UI_NOISE = ['Ask anything', 'for workflows', 'Gemini 3', 'Gemini 2', 'Flash', 'Send', 'Good', 'Bad'];
  function isUIChrome(text) {
    if (!text || text.length < 5) return true;
    // If text is mostly UI noise keywords
    var clean = text;
    for (var n = 0; n < UI_NOISE.length; n++) {
      clean = clean.replace(new RegExp(UI_NOISE[n], 'gi'), '');
    }
    clean = clean.replace(/[\\s|,@\\/]+/g, '').trim();
    return clean.length < 5;
  }

  function isThinkingEl(el) {
    var cls = (el.className || '');
    if (cls.indexOf('isolate') !== -1) return true;
    if (el.querySelector && el.querySelector('[class*="animate-spin"]')) return true;
    if (el.querySelector && el.querySelector('[class*="overflow-hidden"][class*="transition-all"]')) return true;
    var btns = el.querySelectorAll ? el.querySelectorAll('button') : [];
    for (var i = 0; i < btns.length; i++) {
      var bt = (btns[i].textContent || '').toLowerCase();
      if (bt.indexOf('thought for') !== -1 || bt.indexOf('thinking') !== -1) return true;
    }
    return false;
  }

  function isSkeleton(el) {
    // Skeleton placeholder: rounded-lg bg-gray-500/10 with fixed height, no real text
    var cls = (el.className || '');
    if (cls.indexOf('bg-gray-500/10') !== -1 && cls.indexOf('rounded-lg') !== -1) {
      var t = (el.innerText || '').trim();
      if (t.length < 3) return true;
    }
    return false;
  }

  function extractUserText(block) {
    // Pattern 1 (current): flex w-full flex-row > min-w-0 grow > whitespace-pre-wrap
    var preWrap = block.querySelector('[class*="whitespace-pre-wrap"]');
    if (preWrap) return (preWrap.innerText || '').trim();
    // Pattern 2 (legacy): flex-row w-full > min-w-0 grow
    var userEl = block.querySelector('[class*="min-w-0"][class*="grow"]');
    if (userEl && userEl.offsetHeight > 0) return (userEl.innerText || '').trim();
    return '';
  }

  function extractAssistantText(block) {
    var spaceY = block.querySelector('[class*="space-y-2"]') || block;
    var rows = spaceY.querySelectorAll('[class*="flex-row"][class*="my-2"]');
    var parts = [];
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      if (row.offsetHeight === 0) continue;

      var gapY = row.querySelector('[class*="gap-y-3"]');
      if (gapY) {
        for (var gi = 0; gi < gapY.children.length; gi++) {
          var gapChild = gapY.children[gi];
          if (gapChild.offsetHeight === 0) continue;
          if (isThinkingEl(gapChild)) continue;
          var pt = (gapChild.innerText || '').trim();
          if (pt.length > 2) parts.push(pt);
        }
      } else {
        if (isThinkingEl(row)) continue;
        var t = (row.innerText || '').trim();
        if (t.length > 2) parts.push(t);
      }
    }
    return parts.join('\\n').replace(/\\n?(Good|Bad)\\s*$/g, '').trim();
  }

  function extractFromContainer(container) {
    if (!container) return;
    var turns = container.children;
    for (var i = 0; i < turns.length; i++) {
      var turn = turns[i];
      if (turn.offsetHeight === 0) continue;

      for (var j = 0; j < turn.children.length; j++) {
        var block = turn.children[j];
        if (block.offsetHeight === 0) continue;
        var blockCls = (block.className || '');
        if (blockCls.indexOf('hidden') !== -1) continue;
        if (blockCls.indexOf('pt-3') !== -1) continue;

        // Skip skeleton/virtualized placeholders
        if (isSkeleton(block)) continue;
        // Skip input areas and UI chrome
        if (block.querySelector('textarea') || block.querySelector('input[type="text"]')) continue;
        if (block.querySelector('[contenteditable]')) continue;

        // USER message: check for flex-row with user text patterns
        var hasFlexRow = block.querySelector('[class*="flex-row"][class*="w-full"]')
                      || block.querySelector('[class*="flex"][class*="w-full"][class*="flex-row"]');
        if (hasFlexRow) {
          var utext = extractUserText(block);
          if (utext.length > 1 && !isUIChrome(utext)) {
            var fp = 'u' + djb2(utext);
            messages.push({ role: 'user', text: utext.substring(0, 2000), index: messages.length, fingerprint: fp });
            continue;
          }
        }

        // ASSISTANT message: space-y-2 with flex-row my-2 children
        var hasAssistantPattern = block.querySelector('[class*="space-y-2"]')
                               || block.querySelector('[class*="flex-row"][class*="my-2"]');
        if (hasAssistantPattern) {
          var atext = extractAssistantText(block);
          if (atext.length > 2 && !isUIChrome(atext)) {
            var fp = 'a' + djb2(atext);
            messages.push({ role: 'assistant', text: atext.substring(0, 3000), index: messages.length, fingerprint: fp });
            continue;
          }
        }

        // Fallback: any block with substantial text that wasn't matched above
        var fallbackText = (block.innerText || '').trim();
        // Remove thinking prefixes for role detection
        var cleanText = fallbackText.replace(/^Thought for \\d+s\\n*/g, '').trim();
        if (cleanText.length > 10 && !isUIChrome(cleanText)) {
          // Heuristic: if starts with thinking prefix or has space-y, it's assistant
          var isAssistant = /^Thought for/.test(fallbackText) || block.querySelector('[class*="space-y"]');
          var role = isAssistant ? 'assistant' : 'assistant'; // default to assistant for unmatched
          var fp = (role === 'user' ? 'u' : 'a') + djb2(cleanText);
          messages.push({ role: role, text: cleanText.substring(0, 3000), index: messages.length, fingerprint: fp });
        }
      }
    }
  }

  // Strategy 1: ID-based selectors (stable — from antigravity-ide-mobile)
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var container = allRoots[r].querySelector('#cascade') || allRoots[r].querySelector('#conversation');
      if (container) { extractFromContainer(container); break; }
    } catch(e) {}
  }

  // Strategy 2: Class-based fallback (Anti panel selectors)
  if (messages.length === 0) {
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var panel = allRoots[r].querySelector('.antigravity-agent-side-panel');
        if (!panel) continue;
        var msgList = panel.querySelector('[class*="gap-y-3"][class*="px-4"]');
        if (!msgList) continue;
        extractFromContainer(msgList);
        if (messages.length > 0) break;
      } catch(e) {}
    }
  }

  return JSON.stringify({ found: messages.length > 0, messages: messages, count: messages.length });
})()`;

  for (const { port, page } of pages) {
    if (page.title === "Launchpad") continue;
    try {
      const evalResult = await evaluate(page.webSocketDebuggerUrl, script);
      const info = parseResult(evalResult.result?.value);
      if (!info?.found) continue;

      const msgs = (info.messages as AntiChatMessage[]) || [];
      // Filter by fingerprints (preferred) or fallback to index
      let filtered: AntiChatMessage[];
      if (sinceFingerprints && sinceFingerprints.size > 0) {
        filtered = msgs.filter((m) => !sinceFingerprints.has(m.fingerprint));
      } else {
        filtered = since >= 0 ? msgs.filter((m) => m.index > since) : msgs;
      }
      return {
        success: true,
        messages: filtered,
        detail: `Found ${msgs.length} messages on port ${port}`,
      };
    } catch {
      /* try next target */
    }
  }

  return { success: false, messages: [], detail: "No chat messages found" };
}

/** Diagnostic: list all visible buttons across all CDP targets. */
export async function listAllButtons(): Promise<
  { port: number; title: string; buttons: string[] }[]
> {
  const pages = await findAllPages();
  const results: { port: number; title: string; buttons: string[] }[] = [];

  const script = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var btns = [];
  var acceptReject = [];

  for (var r = 0; r < allRoots.length; r++) {
    try {
      var els = allRoots[r].querySelectorAll('button, [role="button"], a[role="button"], .action-item a, .action-label');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.offsetHeight === 0 || el.offsetWidth === 0) continue;
        var text = (el.textContent || '').trim().substring(0, 60);
        var title = el.title || '';
        var aria = el.getAttribute('aria-label') || '';
        var cls = (el.className || '').substring(0, 40);
        var tag = el.tagName;
        if (text || title || aria) {
          btns.push(tag + ' | ' + JSON.stringify(text) + ' | title=' + title + ' | aria=' + aria + ' | cls=' + cls);
        }
      }
      var all = allRoots[r].querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el2 = all[i];
        if (el2.offsetHeight === 0 || el2.offsetWidth === 0) continue;
        var t2 = (el2.textContent || '').trim().toLowerCase();
        if (t2.length < 30 && (t2.indexOf('accept') !== -1 || t2.indexOf('reject') !== -1)) {
          var rect = el2.getBoundingClientRect();
          acceptReject.push(el2.tagName + ' | ' + JSON.stringify(t2) + ' | cls=' + (el2.className||'').substring(0,50) + ' | rect=' + Math.round(rect.x) + ',' + Math.round(rect.y) + ',' + Math.round(rect.width) + 'x' + Math.round(rect.height));
        }
      }
    } catch(e) {}
  }
  return JSON.stringify({ buttons: btns, acceptRejectElements: acceptReject });
})()`;

  for (const { port, page } of pages) {
    if (page.title === "Launchpad") continue;
    try {
      const result = await evaluate(page.webSocketDebuggerUrl, script, 5000);
      const val = result.result?.value;
      const buttons = typeof val === "string" ? JSON.parse(val) : [];
      results.push({ port, title: page.title, buttons });
    } catch {
      /* skip */
    }
  }
  return results;
}

/** Start a new conversation in Anti via Ctrl+Shift+L keyboard shortcut. */
export async function startNewConversation(): Promise<CDPResult> {
  const pages = await findAllPages();
  if (pages.length === 0) {
    return { success: false, detail: "No CDP targets" };
  }

  for (const { port, page } of pages) {
    if (page.title === "Launchpad") continue;
    try {
      // Ctrl+Shift+L = modifiers 6 (Ctrl=2 + Shift=4)
      await cdpSendCommands(
        page.webSocketDebuggerUrl,
        [
          {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyDown",
              key: "l",
              code: "KeyL",
              windowsVirtualKeyCode: 76,
              nativeVirtualKeyCode: 76,
              modifiers: 6,
            },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyUp",
              key: "l",
              code: "KeyL",
              windowsVirtualKeyCode: 76,
              nativeVirtualKeyCode: 76,
              modifiers: 6,
            },
          },
        ],
        3000,
      );
      return { success: true, detail: `New conversation started (Ctrl+Shift+L) on port ${port}` };
    } catch {
      /* try next */
    }
  }

  return { success: false, detail: "Failed to send Ctrl+Shift+L" };
}

/** Send keyboard shortcut Alt+Enter (Run/Accept) via CDP. */
export async function sendRun(): Promise<CDPResult> {
  return sendKeyboardShortcut("Enter", 1 /* Alt */);
}

/** Accept all files by pressing Ctrl+Enter repeatedly + navigating. */
export async function sendAcceptAllChanges(): Promise<CDPResult> {
  const pages = await findAllPages();
  if (pages.length === 0) {
    return { success: false, detail: "No CDP targets" };
  }

  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) return { success: false, detail: "No main target" };

  const wsUrl = target.page.webSocketDebuggerUrl;
  let accepted = 0;

  for (let i = 0; i < 15; i++) {
    try {
      await cdpSendCommands(
        wsUrl,
        [
          {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyDown",
              key: "Enter",
              code: "Enter",
              windowsVirtualKeyCode: 13,
              nativeVirtualKeyCode: 13,
              modifiers: 2,
            },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyUp",
              key: "Enter",
              code: "Enter",
              windowsVirtualKeyCode: 13,
              nativeVirtualKeyCode: 13,
              modifiers: 2,
            },
          },
        ],
        3000,
      );
      accepted++;

      await new Promise((r) => setTimeout(r, 400));

      await cdpSendCommands(
        wsUrl,
        [
          {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyDown",
              key: "ArrowRight",
              code: "ArrowRight",
              windowsVirtualKeyCode: 39,
              nativeVirtualKeyCode: 39,
              modifiers: 1,
            },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyUp",
              key: "ArrowRight",
              code: "ArrowRight",
              windowsVirtualKeyCode: 39,
              nativeVirtualKeyCode: 39,
              modifiers: 1,
            },
          },
        ],
        3000,
      );

      await new Promise((r) => setTimeout(r, 300));
    } catch {
      break;
    }
  }

  return accepted > 0
    ? { success: true, detail: `Accepted ${accepted} file(s)` }
    : { success: false, detail: "No files accepted" };
}

/** Send keyboard shortcut Ctrl+Backspace (Reject) via CDP. */
export async function sendReject(): Promise<CDPResult> {
  return sendKeyboardShortcut("Backspace", 2 /* Ctrl */);
}

/** Dispatch a keyboard shortcut to the active CDP target. */
async function sendKeyboardShortcut(key: string, modifiers: number): Promise<CDPResult> {
  const pages = await findAllPages();
  if (pages.length === 0) {
    return { success: false, detail: "No CDP targets" };
  }

  const keyCode = key === "Enter" ? 13 : key === "Backspace" ? 8 : 0;
  const code = key === "Enter" ? "Enter" : key === "Backspace" ? "Backspace" : `Key${key}`;
  const modStr =
    modifiers === 1 ? "Alt" : modifiers === 2 ? "Ctrl" : modifiers === 3 ? "Ctrl+Alt" : "";

  for (const { port, page } of pages) {
    if (page.title === "Launchpad") continue;
    try {
      await cdpSendCommands(
        page.webSocketDebuggerUrl,
        [
          {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyDown",
              key,
              code,
              windowsVirtualKeyCode: keyCode,
              nativeVirtualKeyCode: keyCode,
              modifiers,
            },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: {
              type: "keyUp",
              key,
              code,
              windowsVirtualKeyCode: keyCode,
              nativeVirtualKeyCode: keyCode,
              modifiers,
            },
          },
        ],
        3000,
      );
      return { success: true, detail: `Sent ${modStr}+${key} to port ${port}` };
    } catch {
      /* try next */
    }
  }

  return { success: false, detail: "No targets responded" };
}

/** Click an accept/allow/run button via CDP (fallback). */
export async function clickAccept(): Promise<CDPResult> {
  return clickButtonByText([
    "accept all",
    "accept",
    "allow",
    "always allow",
    "allow once",
    "run",
    "keep waiting",
    "continue",
    "continue generating",
    "proceed",
  ]);
}

/** Click a reject/deny button via CDP (fallback). */
export async function clickReject(): Promise<CDPResult> {
  return clickButtonByText(["reject all", "reject", "deny", "cancel", "dismiss"]);
}

async function clickButtonByText(patterns: string[]): Promise<CDPResult> {
  const pages = await findAllPages();
  if (pages.length === 0) {
    return { success: false, detail: "No CDP targets" };
  }

  const patternsJson = JSON.stringify(patterns);

  const script = `
(function() {
  var patterns = ${patternsJson};
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  var candidates = [];
  // Pass 1: standard buttons
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('button, [role="button"], a[role="button"]');
      for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        var rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        var text = ((btn.textContent || '') + ' ' + (btn.title || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase().trim();
        for (var p = 0; p < patterns.length; p++) {
          if (text.indexOf(patterns[p]) !== -1) {
            candidates.push({ btn: btn, text: text.substring(0, 80), pattern: patterns[p], priority: p });
            break;
          }
        }
      }
    } catch(e) {}
  }

  // Pass 2: broader search — action-labels, anchors, spans (diff review bar)
  if (candidates.length === 0) {
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var els = allRoots[r].querySelectorAll('a, span, div, .action-label, .action-item');
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          var directText = (el.textContent || '').trim();
          if (directText.length > 30) continue;
          var text = directText.toLowerCase();
          for (var p = 0; p < patterns.length; p++) {
            if (text === patterns[p] || (text.indexOf(patterns[p]) !== -1 && text.length < patterns[p].length + 10)) {
              candidates.push({ btn: el, text: text.substring(0, 80), pattern: patterns[p], priority: p + 100 });
              break;
            }
          }
        }
      } catch(e) {}
    }
  }

  if (candidates.length === 0) return JSON.stringify({ success: false, error: 'No matching button' });

  candidates.sort(function(a, b) { return a.priority - b.priority; });
  var best = candidates[0];
  best.btn.click();
  best.btn.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));

  return JSON.stringify({ success: true, clicked: best.text, pattern: best.pattern });
})()`;

  for (const { port, page } of pages) {
    if (page.title === "Launchpad") continue;
    try {
      const result = await evaluate(page.webSocketDebuggerUrl, script);
      const parsed = parseResult(result.result?.value);
      if (parsed?.success) {
        return {
          success: true,
          detail: `Clicked "${parsed.clicked}" (${parsed.pattern}) port ${port}`,
        };
      }
    } catch {
      /* try next */
    }
  }

  return { success: false, detail: `No matching button in ${pages.length} targets` };
}

/**
 * List ALL CDP targets (raw) — diagnostic.
 * Uses parallel port scan.
 */
export async function listAllTargets(): Promise<{ port: number; targets: CDPPage[] }[]> {
  return findAllTargetsRaw();
}

/** Diagnostic: dump Anti chat panel DOM structure for selector debugging. */
export async function debugChatDom(): Promise<
  { port: number; title: string; url: string; dom: unknown }[]
> {
  const pages = await findAllPages();
  const results: { port: number; title: string; url: string; dom: unknown }[] = [];

  const script = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var info = { panel: null, messageBlocks: [], structure: [] };

  for (var r = 0; r < allRoots.length; r++) {
    try {
      // Find the Anti chat panel
      var panel = allRoots[r].querySelector('.antigravity-agent-side-panel');
      if (!panel) continue;

      info.panel = {
        cls: (panel.className || '').substring(0, 150),
        childCount: panel.children.length,
        scrollH: panel.scrollHeight,
        h: panel.offsetHeight
      };

      // Find the message list and examine each turn's LARGE rounded-lg children
      var msgList = panel.querySelector('[class*="gap-y-3"][class*="px-4"]');
      if (msgList) {
        var lastTurn = msgList.children[msgList.children.length - 1];
        if (lastTurn) {
          for (var j = 0; j < lastTurn.children.length; j++) {
            var block = lastTurn.children[j];
            var bcls = (block.className || '');
            var isRounded = bcls.indexOf('rounded-lg') !== -1;
            // Get innerText AND innerHTML snippet to understand rendering
            var innerT = (block.innerText || '').trim().substring(0, 300);
            var innerH = (block.innerHTML || '').substring(0, 300);
            info.structure.push({
              idx: j,
              tag: block.tagName,
              cls: bcls.substring(0, 100),
              h: block.offsetHeight,
              kids: block.children.length,
              isRounded: isRounded,
              innerText: innerT,
              innerHtml: innerH
            });
          }
        }
        // Also: total turns count
        info.messageBlocks.push({ totalTurns: msgList.children.length });
      }

      // Brute force: find ANY element containing Vietnamese response text
      var allEls = panel.querySelectorAll('*');
      for (var ai = 0; ai < allEls.length; ai++) {
        var ael = allEls[ai];
        if (ael.offsetHeight === 0) continue;
        var atxt = (ael.innerText || '').trim();
        // Look for Vietnamese text (response, not thinking)
        if (atxt.indexOf('AgentBrain') !== -1 && atxt.indexOf('Neural-Memory') !== -1) {
          // Found the response! Record its class and parent
          info.messageBlocks.push({
            type: 'response-found',
            tag: ael.tagName,
            cls: (ael.className || '').substring(0, 120),
            h: ael.offsetHeight,
            kids: ael.children.length,
            text: atxt.substring(0, 200),
            parentCls: (ael.parentElement?.className || '').substring(0, 100)
          });
          break;
        }
      }

      break; // Found the panel, done
    } catch(e) {}
  }

  return JSON.stringify(info);
})()`;

  for (const { port, page } of pages) {
    if (page.title === "Launchpad") continue;
    try {
      const result = await evaluate(page.webSocketDebuggerUrl, script, 8000);
      const val = result.result?.value;
      const dom = typeof val === "string" ? JSON.parse(val) : val;
      results.push({ port, title: page.title, url: page.url, dom });
    } catch {
      /* skip */
    }
  }

  return results;
}

// ── Model Selection ───────────────────────────────────────────────────

export interface AntiModelInfo {
  name: string;
  index: number;
  isActive: boolean;
}

export interface ModelListResult {
  success: boolean;
  models: AntiModelInfo[];
  activeModel: string;
  detail: string;
}

/** List available models from Anti's model dropdown via CDP. */
export async function listModels(): Promise<ModelListResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) return { success: false, models: [], activeModel: "", detail: "No CDP targets" };

  // Anti bottom bar: model name in span.select-none.text-xs.opacity-70
  // Trigger: ancestor div[role="button"]
  const openScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  // Strategy 1: Find span with model name text + opacity-70 in bottom bar
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var spans = allRoots[r].querySelectorAll('span.opacity-70, span[class*="opacity-70"]');
      for (var i = 0; i < spans.length; i++) {
        var el = spans[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim();
        if (/gemini|claude|gpt|flash|opus|sonnet|haiku/i.test(t) && t.length < 80) {
          // Walk up to find clickable ancestor (div[role="button"] or cursor-pointer)
          var clickTarget = el;
          for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (p.getAttribute('role') === 'button' || (p.className || '').indexOf('cursor-pointer') !== -1) {
              clickTarget = p;
              break;
            }
          }
          var rect = clickTarget.getBoundingClientRect();
          return JSON.stringify({ found: true, x: rect.left + rect.width/2, y: rect.top + rect.height/2, current: t });
        }
      }
    } catch(e) {}
  }

  // Strategy 2: Any div[role="button"] containing model name text
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('[role="button"]');
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim();
        if (/gemini|claude|gpt|flash|opus|sonnet|haiku/i.test(t) && t.length < 80) {
          var rect = el.getBoundingClientRect();
          return JSON.stringify({ found: true, x: rect.left + rect.width/2, y: rect.top + rect.height/2, current: t });
        }
      }
    } catch(e) {}
  }

  return JSON.stringify({ found: false });
})()`;

  try {
    const wsUrl = target.page.webSocketDebuggerUrl;

    // Click to open dropdown
    const openResult = await evaluate(wsUrl, openScript, 5000);
    const openInfo = parseResult(openResult.result?.value);
    if (!openInfo?.found) {
      return { success: false, models: [], activeModel: "", detail: "Model selector not found" };
    }

    // Click the model button to open dropdown
    await cdpSendCommands(
      wsUrl,
      [
        {
          method: "Input.dispatchMouseEvent",
          params: {
            type: "mousePressed",
            x: openInfo.x,
            y: openInfo.y,
            button: "left",
            clickCount: 1,
          },
        },
        {
          method: "Input.dispatchMouseEvent",
          params: {
            type: "mouseReleased",
            x: openInfo.x,
            y: openInfo.y,
            button: "left",
            clickCount: 1,
          },
        },
      ],
      3000,
    );

    await new Promise((r) => setTimeout(r, 500));

    // Anti dropdown items: div with px-2 py-1 cursor-pointer, model name in child span.text-xs.font-medium
    // Active item has bg-gray-500/20, inactive has hover:bg-gray-500/10
    const readScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var models = [];

  for (var r = 0; r < allRoots.length; r++) {
    try {
      // Find model name spans inside dropdown items
      var nameSpans = allRoots[r].querySelectorAll('span.font-medium, span[class*="font-medium"]');
      for (var i = 0; i < nameSpans.length; i++) {
        var span = nameSpans[i];
        if (span.offsetHeight === 0) continue;
        var t = (span.textContent || '').trim();
        if (!t || t.length < 3 || t.length > 100) continue;
        if (!/gemini|claude|gpt|flash|opus|sonnet|haiku|pro|thinking|medium/i.test(t)) continue;

        // Walk up to find the row container (cursor-pointer div)
        var row = span;
        for (var p = span.parentElement; p; p = p.parentElement) {
          if ((p.className || '').indexOf('cursor-pointer') !== -1) { row = p; break; }
        }
        // Active: has bg-gray-500/20 without hover: prefix
        var cls = row.className || '';
        var isActive = cls.indexOf('bg-gray-500/20') !== -1 || cls.indexOf('bg-gray-500\\/20') !== -1;

        models.push({ name: t, index: models.length, isActive: isActive });
      }
      if (models.length > 0) break;

      // Fallback: any visible cursor-pointer div containing model names
      if (models.length === 0) {
        var items = allRoots[r].querySelectorAll('[class*="cursor-pointer"]');
        for (var i = 0; i < items.length; i++) {
          var el = items[i];
          if (el.offsetHeight === 0) continue;
          var t = (el.innerText || el.textContent || '').trim();
          if (!t || t.length < 3 || t.length > 100) continue;
          if (!/gemini|claude|gpt|flash|opus|sonnet|haiku|pro|thinking|medium/i.test(t)) continue;
          var cls = el.className || '';
          var isActive = cls.indexOf('bg-gray-500/20') !== -1;
          var name = t.split('\\n')[0].trim();
          models.push({ name: name, index: models.length, isActive: isActive });
        }
      }
      if (models.length > 0) break;
    } catch(e) {}
  }

  return JSON.stringify({ models: models });
})()`;

    const readResult = await evaluate(wsUrl, readScript, 5000);
    const readInfo = parseResult(readResult.result?.value);
    const models = (readInfo?.models as AntiModelInfo[]) || [];

    // Close dropdown by pressing Escape
    await cdpSendCommands(
      wsUrl,
      [
        {
          method: "Input.dispatchKeyEvent",
          params: { type: "keyDown", key: "Escape", code: "Escape" },
        },
        {
          method: "Input.dispatchKeyEvent",
          params: { type: "keyUp", key: "Escape", code: "Escape" },
        },
      ],
      2000,
    ).catch(() => {});

    const active = models.find((m) => m.isActive)?.name || String(openInfo.current || "");
    return {
      success: models.length > 0,
      models,
      activeModel: active,
      detail:
        models.length > 0
          ? `${models.length} models, active: ${active}`
          : "No models found in dropdown",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, models: [], activeModel: "", detail: `Model list failed: ${msg}` };
  }
}

/** Select a model by index in Anti's model dropdown. */
export async function selectModel(modelIndex: number): Promise<CDPResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) return { success: false, detail: "No CDP targets" };

  const wsUrl = target.page.webSocketDebuggerUrl;

  // Reuse same open logic as listModels — find span.opacity-70 with model name
  const openScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  for (var r = 0; r < allRoots.length; r++) {
    try {
      var spans = allRoots[r].querySelectorAll('span.opacity-70, span[class*="opacity-70"]');
      for (var i = 0; i < spans.length; i++) {
        var el = spans[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim();
        if (/gemini|claude|gpt|flash|opus|sonnet|haiku/i.test(t) && t.length < 80) {
          var clickTarget = el;
          for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (p.getAttribute('role') === 'button' || (p.className || '').indexOf('cursor-pointer') !== -1) {
              clickTarget = p; break;
            }
          }
          var rect = clickTarget.getBoundingClientRect();
          return JSON.stringify({ found: true, x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
        }
      }
    } catch(e) {}
  }

  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('[role="button"]');
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim();
        if (/gemini|claude|gpt|flash|opus|sonnet|haiku/i.test(t) && t.length < 80) {
          var rect = el.getBoundingClientRect();
          return JSON.stringify({ found: true, x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
        }
      }
    } catch(e) {}
  }
  return JSON.stringify({ found: false });
})()`;

  try {
    const openResult = await evaluate(wsUrl, openScript, 5000);
    const openInfo = parseResult(openResult.result?.value);
    if (!openInfo?.found) return { success: false, detail: "Model selector not found" };

    // Click to open
    await cdpSendCommands(
      wsUrl,
      [
        {
          method: "Input.dispatchMouseEvent",
          params: {
            type: "mousePressed",
            x: openInfo.x,
            y: openInfo.y,
            button: "left",
            clickCount: 1,
          },
        },
        {
          method: "Input.dispatchMouseEvent",
          params: {
            type: "mouseReleased",
            x: openInfo.x,
            y: openInfo.y,
            button: "left",
            clickCount: 1,
          },
        },
      ],
      3000,
    );

    await new Promise((r) => setTimeout(r, 500));

    // Click model by index — find span.font-medium with model name, walk up to cursor-pointer row
    const selectScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var idx = ${modelIndex};
  var count = 0;

  for (var r = 0; r < allRoots.length; r++) {
    try {
      var nameSpans = allRoots[r].querySelectorAll('span.font-medium, span[class*="font-medium"]');
      for (var i = 0; i < nameSpans.length; i++) {
        var span = nameSpans[i];
        if (span.offsetHeight === 0) continue;
        var t = (span.textContent || '').trim();
        if (!t || t.length < 3 || t.length > 100) continue;
        if (!/gemini|claude|gpt|flash|opus|sonnet|haiku|pro|thinking|medium/i.test(t)) continue;
        if (count === idx) {
          // Click the row container
          var row = span;
          for (var p = span.parentElement; p; p = p.parentElement) {
            if ((p.className || '').indexOf('cursor-pointer') !== -1) { row = p; break; }
          }
          row.click();
          return JSON.stringify({ clicked: true, name: t });
        }
        count++;
      }
      if (count > 0) break;
    } catch(e) {}
  }
  return JSON.stringify({ clicked: false });
})()`;

    const selectResult = await evaluate(wsUrl, selectScript, 5000);
    const selectInfo = parseResult(selectResult.result?.value);
    if (selectInfo?.clicked) {
      return { success: true, detail: `Selected model: ${selectInfo.name}` };
    }
    return { success: false, detail: `Model #${modelIndex + 1} not found` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, detail: `Model select failed: ${msg}` };
  }
}

// ── Conversation Mode ─────────────────────────────────────────────────

/** Toggle conversation mode between Planning and Fast. */
export async function setConversationMode(mode: "planning" | "fast"): Promise<CDPResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) return { success: false, detail: "No CDP targets" };

  const wsUrl = target.page.webSocketDebuggerUrl;

  // Anti bottom bar: button containing span.text-xs.select-none with "Planning" or "Fast"
  const script = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  // Find the mode button — a <button> with child span containing "Planning" or "Fast"
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim().toLowerCase();
        if ((t === 'planning' || t === 'fast') && (el.className || '').indexOf('cursor-pointer') !== -1) {
          el.click();
          return JSON.stringify({ found: true, current: t });
        }
      }
    } catch(e) {}
  }

  // Fallback: any button whose span child has planning/fast text
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var spans = allRoots[r].querySelectorAll('span.select-none, span[class*="select-none"]');
      for (var i = 0; i < spans.length; i++) {
        var span = spans[i];
        if (span.offsetHeight === 0) continue;
        var t = (span.textContent || '').trim().toLowerCase();
        if (t === 'planning' || t === 'fast') {
          // Click closest button ancestor
          var btn = span.closest('button') || span.parentElement;
          if (btn) btn.click();
          return JSON.stringify({ found: true, current: t });
        }
      }
    } catch(e) {}
  }

  return JSON.stringify({ found: false });
})()`;

  try {
    const result = await evaluate(wsUrl, script, 5000);
    const info = parseResult(result.result?.value);
    if (!info?.found) return { success: false, detail: "Mode toggle not found in bottom bar" };

    await new Promise((r) => setTimeout(r, 400));

    // Anti mode popup: div.font-medium with "Planning" or "Fast" text
    // Parent div.cursor-pointer is the clickable row
    const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1); // "Planning" or "Fast"
    const selectScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var target = '${modeLabel}';

  // Strategy 1: Find div.font-medium with exact mode text
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var items = allRoots[r].querySelectorAll('div.font-medium, div[class*="font-medium"]');
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim();
        if (t === target) {
          // Click parent cursor-pointer row
          var row = el;
          for (var p = el.parentElement; p; p = p.parentElement) {
            if ((p.className || '').indexOf('cursor-pointer') !== -1) { row = p; break; }
          }
          row.click();
          return JSON.stringify({ clicked: true, text: t });
        }
      }
    } catch(e) {}
  }

  // Strategy 2: Any visible cursor-pointer div containing the mode text
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var items = allRoots[r].querySelectorAll('[class*="cursor-pointer"]');
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.innerText || el.textContent || '').trim();
        if (t.indexOf(target) !== -1 && t.length < 200) {
          el.click();
          return JSON.stringify({ clicked: true, text: t.substring(0, 60) });
        }
      }
    } catch(e) {}
  }
  return JSON.stringify({ clicked: false });
})()`;

    const selectResult = await evaluate(wsUrl, selectScript, 5000);
    const selectInfo = parseResult(selectResult.result?.value);
    if (selectInfo?.clicked) {
      return { success: true, detail: `Mode set to: ${mode}` };
    }
    return { success: false, detail: `Mode option "${mode}" not found in popup` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, detail: `Mode switch failed: ${msg}` };
  }
}

// ── Workflows ─────────────────────────────────────────────────────────

export interface AntiWorkflow {
  name: string;
  index: number;
}

export interface WorkflowListResult {
  success: boolean;
  workflows: AntiWorkflow[];
  detail: string;
}

/** List available workflows from Anti's "+" menu → Workflows. */
export async function listWorkflows(): Promise<WorkflowListResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) return { success: false, workflows: [], detail: "No CDP targets" };

  const wsUrl = target.page.webSocketDebuggerUrl;

  // Click the composer toolbar "+" button (bottom bar, not header "New Conversation")
  const openScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  // Find the composer toolbar "+" button (bottom bar)
  // The toolbar is a flex row at the bottom with "Add context", "Media", "Mentions", "Workflows"
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var toolbars = allRoots[r].querySelectorAll('div[class*="mt-1"][class*="flex"][class*="w-full"][class*="justify-between"]');
      for (var t = 0; t < toolbars.length; t++) {
        var toolbar = toolbars[t];
        if (toolbar.offsetHeight === 0) continue;
        var btns = toolbar.querySelectorAll('button');
        if (btns.length > 0 && btns[0].offsetHeight > 0) {
          btns[0].click();
          return JSON.stringify({ found: true });
        }
      }
    } catch(e) {}
  }
  // Fallback: find button.rounded-full with SVG plus icon near bottom of panel
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('button.rounded-full, button[class*="rounded-full"]');
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i];
        if (el.offsetHeight === 0) continue;
        var rect = el.getBoundingClientRect();
        // Bottom area of panel (y > 600) and small button
        if (rect.y > 600 && rect.width < 40 && rect.height < 40) {
          var svg = el.querySelector('svg');
          if (svg) { el.click(); return JSON.stringify({ found: true }); }
        }
      }
    } catch(e) {}
  }
  return JSON.stringify({ found: false });
})()`;

  try {
    const openResult = await evaluate(wsUrl, openScript, 5000);
    const openInfo = parseResult(openResult.result?.value);
    if (!openInfo?.found) {
      return { success: false, workflows: [], detail: "'+' button not found" };
    }

    await new Promise((r) => setTimeout(r, 400));

    // Now click "Workflows" in the popup menu
    const clickWorkflowsScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  // Popup items have class: flex items-center justify-start gap-2 px-2 py-1 text-xs w-full hover:bg-gray-500/10 cursor-pointer
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var items = allRoots[r].querySelectorAll('[class*="cursor-pointer"][class*="flex"][class*="items-center"][class*="gap-2"]');
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim().toLowerCase();
        if (t.indexOf('workflow') !== -1 && t.length < 30) {
          el.click();
          return JSON.stringify({ found: true });
        }
      }
    } catch(e) {}
  }
  // Fallback: broader search
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var items = allRoots[r].querySelectorAll('[role="menuitem"], [class*="menu"] *, [class*="popover"] *, [class*="dropdown"] *');
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim().toLowerCase();
        if (t.indexOf('workflow') !== -1 && t.length < 30) {
          el.click();
          return JSON.stringify({ found: true });
        }
      }
    } catch(e) {}
  }
  return JSON.stringify({ found: false });
})()`;

    const clickResult = await evaluate(wsUrl, clickWorkflowsScript, 5000);
    const clickInfo = parseResult(clickResult.result?.value);
    if (!clickInfo?.found) {
      // Close menu with Escape
      await cdpSendCommands(
        wsUrl,
        [
          {
            method: "Input.dispatchKeyEvent",
            params: { type: "keyDown", key: "Escape", code: "Escape" },
          },
          {
            method: "Input.dispatchKeyEvent",
            params: { type: "keyUp", key: "Escape", code: "Escape" },
          },
        ],
        2000,
      ).catch(() => {});
      return { success: false, workflows: [], detail: "Workflows option not found in menu" };
    }

    await new Promise((r) => setTimeout(r, 500));

    // Read workflow list
    const readScript = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var workflows = [];

  for (var r = 0; r < allRoots.length; r++) {
    try {
      var items = allRoots[r].querySelectorAll(
        '[role="option"], [role="menuitem"], [class*="item"], [class*="workflow"], [class*="command"]'
      );
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.innerText || el.textContent || '').trim();
        if (!t || t.length < 2 || t.length > 200) continue;
        // Skip navigation items like "Add context", "Media", "Mentions"
        if (/^(add context|media|mentions|workflows?|back|cancel|close)$/i.test(t)) continue;
        workflows.push({ name: t.split('\\n')[0].trim().substring(0, 100), index: workflows.length });
      }
      if (workflows.length > 0) break;
    } catch(e) {}
  }

  return JSON.stringify({ workflows: workflows });
})()`;

    const readResult = await evaluate(wsUrl, readScript, 5000);
    const readInfo = parseResult(readResult.result?.value);
    const workflows = (readInfo?.workflows as AntiWorkflow[]) || [];

    // Close with Escape
    await cdpSendCommands(
      wsUrl,
      [
        {
          method: "Input.dispatchKeyEvent",
          params: { type: "keyDown", key: "Escape", code: "Escape" },
        },
        {
          method: "Input.dispatchKeyEvent",
          params: { type: "keyUp", key: "Escape", code: "Escape" },
        },
      ],
      2000,
    ).catch(() => {});

    return {
      success: workflows.length > 0,
      workflows,
      detail: workflows.length > 0 ? `${workflows.length} workflow(s) found` : "No workflows found",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, workflows: [], detail: `Workflow list failed: ${msg}` };
  }
}

/** Trigger a workflow by typing "/" + workflow name in chat input. */
export async function runWorkflow(name: string): Promise<CDPResult> {
  // Anti workflows can be triggered by typing "/" in the chat input
  // which opens a command palette, then selecting the workflow
  return sendChatMessage(`/${name}`);
}

// ── Diff review: shared script builder ──────────────────────────────────

function buildDiffReviewScript(action: "accept" | "reject"): string {
  const cssClass = action === "accept" ? "keep-changes" : "discard-changes";
  const textMatches =
    action === "accept"
      ? "directText === 'accept changes' || directText === 'accept all' || directText === 'accept'"
      : "directText === 'reject' || directText === 'reject all' || directText === 'discard changes'";

  return `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();

  // Strategy 1: Anti-specific CSS class (most reliable)
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btn = allRoots[r].querySelector('button.${cssClass}');
      if (btn && btn.offsetHeight > 0) {
        btn.click();
        btn.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return JSON.stringify({ found: true, strategy: 'css-class', clicked: (btn.textContent||'').trim().substring(0,40), tag: btn.tagName });
      }
    } catch(e) {}
  }

  // Strategy 2: Direct text match (childNodes only, not nested spans)
  for (var r = 0; r < allRoots.length; r++) {
    try {
      var els = allRoots[r].querySelectorAll('button, span, a');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.offsetHeight === 0 || el.offsetWidth === 0) continue;
        var directText = '';
        for (var c = 0; c < el.childNodes.length; c++) {
          if (el.childNodes[c].nodeType === 3) directText += el.childNodes[c].textContent;
        }
        var firstSpan = el.querySelector(':scope > span');
        if (firstSpan) directText += ' ' + (firstSpan.textContent || '');
        directText = directText.trim().toLowerCase();
        if (${textMatches}) {
          el.click();
          el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          return JSON.stringify({ found: true, strategy: 'direct-text', clicked: directText, tag: el.tagName });
        }
      }
    } catch(e) {}
  }

  return JSON.stringify({ found: false, roots: allRoots.length });
})()`;
}

/** Execute a diff review action (accept/reject) across all webview targets. */
async function executeDiffReview(action: "accept" | "reject"): Promise<CDPResult> {
  const allTargets = await findAllTargetsRaw();
  const script = buildDiffReviewScript(action);

  for (const { port, targets } of allTargets) {
    for (const target of targets) {
      try {
        const result = await evaluate(target.webSocketDebuggerUrl, script, 5000);
        const parsed = parseResult(result.result?.value);
        if (parsed?.found) {
          return {
            success: true,
            detail: `Clicked "${parsed.clicked}" [${parsed.strategy}] (${parsed.tag}) in ${target.title || target.type} port ${port}`,
          };
        }
      } catch {
        /* try next target */
      }
    }
  }

  return { success: false, detail: `No ${action} button found in any CDP target` };
}

/** Accept diff review by scanning ALL webview targets. */
export async function acceptDiffReview(): Promise<CDPResult> {
  return executeDiffReview("accept");
}

/** Reject diff review by scanning ALL webview targets. */
export async function rejectDiffReview(): Promise<CDPResult> {
  return executeDiffReview("reject");
}

// ── Permission Requests ───────────────────────────────────────────────

export interface AntiPermissionRequest {
  /** The permission prompt text, e.g. "Allow file access to D:\tmp\..." */
  text: string;
  /** Available action buttons found */
  actions: string[];
}

export interface PermissionDetectResult {
  success: boolean;
  permissions: AntiPermissionRequest[];
  detail: string;
}

/** Detect pending permission/command request popups in Anti's chat panel.
 *  Anti uses different button sets for different request types:
 *  - Command execution: "Reject" / "Run" / "Always run ^"
 *  - File access: "Deny" / "Allow Once" / "Allow This Conversation"
 *  - Tool use: "Reject" / "Run" with command preview
 */
export async function detectPermissions(): Promise<PermissionDetectResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) return { success: false, permissions: [], detail: "No CDP targets" };

  const script = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var permissions = [];

  // Known permission button texts in Anti
  var permBtnTexts = ['Reject', 'Run', 'Always run', 'Deny', 'Allow Once', 'Allow This Conversation'];

  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('button');
      var permBtns = [];
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].textContent || '').trim();
        // Normalize: "Always run ^" → "Always run", "Run Alt+⏎" → "Run"
        var clean = t.replace(/\\s*[\\^⏎↵].*$/g, '').replace(/\\s*Alt\\+.*$/g, '').trim();
        for (var p = 0; p < permBtnTexts.length; p++) {
          if (clean === permBtnTexts[p] && btns[i].offsetHeight > 0) {
            permBtns.push({ el: btns[i], text: clean, raw: t });
            break;
          }
        }
      }

      // Need at least 2 permission buttons (e.g. Reject + Run)
      if (permBtns.length >= 2) {
        // Extract the command/permission content from the parent container
        var promptText = '';
        var codeContent = '';
        var headerText = '';
        var parent = permBtns[0].el.parentElement;

        // Walk up to find the permission container (up to 10 levels)
        for (var depth = 0; depth < 10 && parent; depth++) {
          // Look for <pre> or <code> blocks — these contain the actual command
          if (!codeContent) {
            var pres = parent.querySelectorAll('pre');
            for (var pi = 0; pi < pres.length; pi++) {
              var preText = (pres[pi].textContent || '').trim();
              if (preText.length > 3) {
                codeContent = preText;
                break;
              }
            }
            if (!codeContent) {
              var codes = parent.querySelectorAll('code');
              for (var ci = 0; ci < codes.length; ci++) {
                var codeText = (codes[ci].textContent || '').trim();
                if (codeText.length > 3 && codeText !== 'copy') {
                  codeContent = codeText;
                  break;
                }
              }
            }
          }

          // Look for a header/question line (e.g. "Run command?", "Allow file access?")
          if (!headerText) {
            var fullText = (parent.innerText || '').trim();
            var lines = fullText.split('\\n');
            for (var l = 0; l < lines.length; l++) {
              var line = lines[l].trim();
              if (line.length > 5 && line.length < 200 && line !== 'copy') {
                if (line.indexOf('?') !== -1 ||
                    /command|run|execute|allow|access|permission|read|write/i.test(line)) {
                  headerText = line;
                  break;
                }
              }
            }
          }

          if (codeContent && headerText) break;
          parent = parent.parentElement;
        }

        // Build prompt text: prefer code content (the actual command), fall back to header
        if (codeContent) {
          promptText = headerText
            ? headerText + '\\n' + codeContent.substring(0, 500)
            : codeContent.substring(0, 500);
        } else if (headerText) {
          promptText = headerText;
        } else {
          // Last resort: grab container text minus button labels
          var containerText = '';
          var cp = permBtns[0].el.parentElement?.parentElement;
          if (cp) containerText = (cp.innerText || '').trim();
          for (var b = 0; b < permBtns.length; b++) {
            containerText = containerText.replace(permBtns[b].raw, '');
          }
          containerText = containerText.replace(/Always run \\^/g, '').replace(/copy/g, '').trim();
          if (containerText.length > 5) promptText = containerText.substring(0, 500);
        }

        var actions = [];
        for (var b = 0; b < permBtns.length; b++) {
          actions.push(permBtns[b].text);
        }

        permissions.push({
          text: promptText || 'Permission request detected',
          actions: actions
        });
      }
    } catch(e) {}
  }

  return JSON.stringify({ permissions: permissions });
})()`;

  try {
    const wsUrl = target.page.webSocketDebuggerUrl;
    const result = await evaluate(wsUrl, script, 5000);
    const info = parseResult(result.result?.value);
    const perms = (info?.permissions as AntiPermissionRequest[]) || [];

    return {
      success: true,
      permissions: perms,
      detail:
        perms.length > 0
          ? `${perms.length} permission request(s) pending`
          : "No pending permissions",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, permissions: [], detail: `Permission detect failed: ${msg}` };
  }
}

/** Respond to a permission prompt by clicking the matching button.
 *  Accepts any Anti button text: "Reject", "Run", "Always run",
 *  "Deny", "Allow Once", "Allow This Conversation".
 */
export async function respondPermission(action: string): Promise<CDPResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) return { success: false, detail: "No CDP targets" };

  const escaped = action.replace(/'/g, "\\'");
  const script = `
(function() {
  ${CDP_DOM_HELPERS}
  var allRoots = collectAllRoots();
  var targetText = '${escaped}';

  for (var r = 0; r < allRoots.length; r++) {
    try {
      var btns = allRoots[r].querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i];
        if (el.offsetHeight === 0) continue;
        var t = (el.textContent || '').trim();
        // Normalize button text (strip keyboard hints like "Alt+⏎", "^")
        var clean = t.replace(/\\s*[\\^⏎↵].*$/g, '').replace(/\\s*Alt\\+.*$/g, '').trim();
        if (clean === targetText) {
          el.click();
          el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          return JSON.stringify({ found: true, clicked: t });
        }
      }
    } catch(e) {}
  }
  return JSON.stringify({ found: false });
})()`;

  try {
    const wsUrl = target.page.webSocketDebuggerUrl;
    const result = await evaluate(wsUrl, script, 5000);
    const info = parseResult(result.result?.value);
    if (info?.found) {
      return { success: true, detail: `Permission: ${action}` };
    }
    return { success: false, detail: `Button "${action}" not found` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, detail: `Permission respond failed: ${msg}` };
  }
}

// ── Screenshot ────────────────────────────────────────────────────────

export interface ScreenshotResult {
  success: boolean;
  /** Base64-encoded PNG data (without data URI prefix). */
  data?: string;
  detail: string;
}

/** Capture a screenshot of the Anti IDE via CDP Page.captureScreenshot. */
export async function captureScreenshot(options?: {
  clip?: { x: number; y: number; width: number; height: number; scale?: number };
}): Promise<ScreenshotResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) {
    return {
      success: false,
      detail: "No CDP targets. Is Anti running with --remote-debugging-port=9000?",
    };
  }

  try {
    const params: Record<string, unknown> = { format: "png" };
    if (options?.clip) {
      params.clip = { ...options.clip, scale: options.clip.scale ?? 1 };
    }

    const [result] = await cdpSendCommands(
      target.page.webSocketDebuggerUrl,
      [{ method: "Page.captureScreenshot", params }],
      10_000,
    );

    const data = (result as { data?: string } | null)?.data;
    if (!data) {
      return { success: false, detail: "CDP returned empty screenshot data" };
    }

    return { success: true, data, detail: `Screenshot captured from port ${target.port}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, detail: `Screenshot failed: ${msg}` };
  }
}

// ── Task List Parser ─────────────────────────────────────────────────

export interface AntiTaskItem {
  text: string;
  checked: boolean;
  category?: "research" | "implementation" | "verification" | "other";
}

export interface TaskListResult {
  success: boolean;
  tasks: AntiTaskItem[];
  detail: string;
}

/** Parse task list (markdown checklists) from the active Anti IDE conversation. */
export async function getTaskList(): Promise<TaskListResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) {
    return { success: false, tasks: [], detail: "No CDP targets. Is Anti running?" };
  }

  const script = `(function() {
    ${CDP_DOM_HELPERS}
    var allRoots = collectAllRoots();
    var tasks = [];
    var seen = {};
    for (var r = 0; r < allRoots.length; r++) {
      try {
        var checkboxes = allRoots[r].querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < checkboxes.length; i++) {
          var cb = checkboxes[i];
          var li = cb.closest('li') || cb.parentElement;
          if (!li || li.offsetHeight === 0) continue;
          var text = (li.textContent || '').trim();
          // Remove leading checkbox characters
          text = text.replace(/^[\\u2610\\u2611\\u2612\\s]+/, '').trim();
          if (!text || seen[text]) continue;
          seen[text] = true;
          tasks.push({ text: text, checked: !!cb.checked });
        }
      } catch(e) {}
    }
    return JSON.stringify({ tasks: tasks });
  })()`;

  try {
    const evalResult = await evaluate(target.page.webSocketDebuggerUrl, script, 8_000);
    const raw = evalResult.result?.value;
    if (!raw || typeof raw !== "string") {
      return { success: false, tasks: [], detail: "CDP returned no task data" };
    }

    const parsed = JSON.parse(raw) as { tasks: { text: string; checked: boolean }[] };
    const tasks: AntiTaskItem[] = parsed.tasks.map((t) => ({
      ...t,
      category: categorizeTask(t.text),
    }));

    if (tasks.length === 0) {
      return { success: true, tasks: [], detail: "No task list found in current conversation" };
    }
    const done = tasks.filter((t) => t.checked).length;
    return { success: true, tasks, detail: `${done}/${tasks.length} tasks completed` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, tasks: [], detail: `Task parsing failed: ${msg}` };
  }
}

// ── Inbox Pending Parser ─────────────────────────────────────────────

export interface AntiInboxItem {
  title: string;
  pendingType: "terminal" | "browser" | "plan_review" | "unknown";
  workspace: string;
}

export interface InboxPendingResult {
  success: boolean;
  items: AntiInboxItem[];
  detail: string;
}

/** Parse inbox / pending conversations from the Anti IDE sidebar. */
export async function getInboxPending(): Promise<InboxPendingResult> {
  const pages = await findAllPages();
  const target = pages.find((p) => p.page.title !== "Launchpad");
  if (!target) {
    return { success: false, items: [], detail: "No CDP targets. Is Anti running?" };
  }

  // This script scans for conversation list items that have pending/waiting indicators.
  // Anti uses Electron + custom React components — selectors may need updating per version.
  const script = `(function() {
    ${CDP_DOM_HELPERS}
    var allRoots = collectAllRoots();
    var items = [];
    var seen = {};
    for (var r = 0; r < allRoots.length; r++) {
      try {
        // Strategy 1: look for list items with status badges or pending indicators
        var els = allRoots[r].querySelectorAll(
          '[class*="conversation"], [class*="list-item"], [class*="thread-item"], [class*="chat-item"], [role="listitem"]'
        );
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el.offsetHeight === 0) continue;
          // Check for pending/waiting indicators
          var hasPending = el.querySelector(
            '[class*="pending"], [class*="waiting"], [class*="badge"], [class*="status"][class*="warn"], [class*="needs-action"]'
          );
          if (!hasPending) continue;
          var titleEl = el.querySelector('[class*="title"], [class*="name"], [class*="label"], [class*="heading"]');
          var title = (titleEl || el).textContent || '';
          title = title.trim().split('\\n')[0].trim();
          if (!title || seen[title]) continue;
          seen[title] = true;
          var badge = (hasPending.textContent || '').trim().toLowerCase();
          var workspaceEl = el.querySelector('[class*="workspace"], [class*="project"], [class*="subtitle"]');
          var workspace = workspaceEl ? workspaceEl.textContent.trim() : '';
          var pendingType = 'unknown';
          if (/terminal|command|shell|cli/.test(badge)) pendingType = 'terminal';
          else if (/browser|web|url/.test(badge)) pendingType = 'browser';
          else if (/plan|review|approve/.test(badge)) pendingType = 'plan_review';
          items.push({ title: title.substring(0, 200), pendingType: pendingType, workspace: workspace.substring(0, 100) });
        }
      } catch(e) {}
    }
    return JSON.stringify({ items: items });
  })()`;

  try {
    const evalResult = await evaluate(target.page.webSocketDebuggerUrl, script, 8_000);
    const raw = evalResult.result?.value;
    if (!raw || typeof raw !== "string") {
      return { success: false, items: [], detail: "CDP returned no inbox data" };
    }

    const parsed = JSON.parse(raw) as { items: AntiInboxItem[] };
    if (parsed.items.length === 0) {
      return { success: true, items: [], detail: "No pending conversations found" };
    }
    return { success: true, items: parsed.items, detail: `${parsed.items.length} pending item(s)` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, items: [], detail: `Inbox parsing failed: ${msg}` };
  }
}

function categorizeTask(text: string): AntiTaskItem["category"] {
  const lower = text.toLowerCase();
  if (/research|investigate|explore|analyze|review/.test(lower)) return "research";
  if (/implement|build|create|add|write|refactor/.test(lower)) return "implementation";
  if (/test|verify|check|validate|confirm|assert/.test(lower)) return "verification";
  return "other";
}
