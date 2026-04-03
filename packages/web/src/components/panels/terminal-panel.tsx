"use client";

// xterm CSS — imported at module level so Next.js bundles it (DOM-only component)
import "@xterm/xterm/css/xterm.css";

import { useState, useEffect, useRef, useCallback } from "react";
import { TerminalWindow, X, Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface TerminalPanelProps {
  defaultCwd?: string;
  onClose: () => void;
}

export function TerminalPanel({ defaultCwd, onClose }: TerminalPanelProps) {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitAddonRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Track if already spawned to prevent double-mount in StrictMode
  const spawnedRef = useRef(false);

  const cleanupTerminal = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    xtermRef.current?.dispose();
    xtermRef.current = null;
    fitAddonRef.current = null;
  }, []);

  const spawnTerminal = useCallback(async () => {
    if (connecting || spawnedRef.current) return;
    spawnedRef.current = true;
    setConnecting(true);

    try {
      const cwd = defaultCwd ?? "/";
      const res = await api.terminal.spawn(cwd);
      const id = res.data.terminalId;
      setTerminalId(id);

      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);

      if (!termRef.current) {
        spawnedRef.current = false;
        setConnecting(false);
        return;
      }

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "JetBrains Mono, Consolas, monospace",
        theme: {
          background: "#0c1419",
          foreground: "#e0e0e0",
          cursor: "#4285F4",
          selectionBackground: "#4285F433",
          black: "#1a1a2e",
          red: "#EA4335",
          green: "#34A853",
          yellow: "#FBBC04",
          blue: "#4285F4",
          magenta: "#A855F7",
          cyan: "#22D3EE",
          white: "#e0e0e0",
          brightBlack: "#6b7280",
          brightRed: "#FF6B6B",
          brightGreen: "#00D084",
          brightYellow: "#FFE66D",
          brightBlue: "#60A5FA",
          brightMagenta: "#C084FC",
          brightCyan: "#67E8F9",
          brightWhite: "#ffffff",
        },
      });

      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(termRef.current);
      fitAddon.fit();
      xtermRef.current = term;

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = process.env.NEXT_PUBLIC_API_URL
        ? new URL(process.env.NEXT_PUBLIC_API_URL).host
        : window.location.host;
      const apiKey = localStorage.getItem("api_key") ?? "";

      const ws = new WebSocket(
        `${wsProtocol}//${wsHost}/ws/terminal/${id}`,
        apiKey ? [apiKey] : undefined,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            data?: string;
            code?: number;
          };
          if (msg.type === "output" && msg.data) {
            term.write(msg.data);
          } else if (msg.type === "exit") {
            term.writeln(`\r\n\x1b[33mProcess exited with code ${msg.code ?? 0}\x1b[0m`);
            setConnected(false);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
      };

      ws.onerror = () => {
        setConnected(false);
        setConnecting(false);
        toast.error("Terminal connection failed");
      };

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      const observer = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
          }
        } catch {
          // ignore during dispose
        }
      });
      if (termRef.current) {
        observer.observe(termRef.current);
      }
      resizeObserverRef.current = observer;
    } catch {
      spawnedRef.current = false;
      setConnecting(false);
      toast.error("Failed to spawn terminal");
    }
  }, [defaultCwd, connecting]);

  useEffect(() => {
    spawnTerminal();

    return () => {
      cleanupTerminal();
      // Kill the terminal process on the server when the panel unmounts
      const id = terminalId;
      if (id) {
        api.terminal.kill(id).catch(() => {});
      }
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKill = useCallback(() => {
    if (!terminalId) return;
    api.terminal.kill(terminalId).catch(() => {});
    cleanupTerminal();
    setTerminalId(null);
    setConnected(false);
    spawnedRef.current = false;
  }, [terminalId, cleanupTerminal]);

  const handleNewTerminal = useCallback(() => {
    handleKill();
    // Short delay to allow cleanup before re-spawning
    setTimeout(() => {
      spawnedRef.current = false;
      spawnTerminal();
    }, 100);
  }, [handleKill, spawnTerminal]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#0c1419" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{
          background: "var(--color-bg-card)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <TerminalWindow
            size={14}
            weight="bold"
           
            aria-hidden="true"
          />
          <span className="text-xs font-semibold">
            Terminal
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: connected ? "#34A853" : connecting ? "#FBBC04" : "#9CA3AF",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--color-text-muted)", fontSize: 10 }}
            aria-live="polite"
          >
            {connected ? "Connected" : connecting ? "Connecting..." : "Disconnected"}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={handleNewTerminal}
            className="p-1 rounded cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted)", background: "none", border: "none" }}
            aria-label="New terminal"
            title="New Terminal"
          >
            <Plus size={13} weight="bold" />
          </button>
          <button
            onClick={handleKill}
            disabled={!terminalId}
            className="p-1 rounded cursor-pointer transition-colors disabled:opacity-30"
            style={{ color: "var(--color-text-muted)", background: "none", border: "none" }}
            aria-label="Kill terminal"
            title="Kill Terminal"
          >
            <Trash size={13} weight="bold" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted)", background: "none", border: "none" }}
            aria-label="Close terminal panel"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      </div>

      {/* xterm.js mount point */}
      <div ref={termRef} className="flex-1 overflow-hidden" style={{ padding: "4px 8px" }} />
    </div>
  );
}
