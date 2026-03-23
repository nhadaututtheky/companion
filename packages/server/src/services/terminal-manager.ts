import { createLogger } from "../logger.js";
import { randomUUID } from "crypto";

const log = createLogger("terminal");

interface TerminalProcess {
  id: string;
  cwd: string;
  proc: ReturnType<typeof Bun.spawn> | null;
  createdAt: number;
  subscribers: Set<{ send: (data: string) => void }>;
}

class TerminalManager {
  private terminals = new Map<string, TerminalProcess>();

  spawn(cwd: string): string {
    const id = randomUUID();
    const shell =
      process.platform === "win32"
        ? "powershell.exe"
        : (process.env.SHELL ?? "/bin/bash");

    const proc = Bun.spawn([shell], {
      cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, TERM: "xterm-256color" },
    });

    const terminal: TerminalProcess = {
      id,
      cwd,
      proc,
      createdAt: Date.now(),
      subscribers: new Set(),
    };

    this.terminals.set(id, terminal);

    this.pipeStream(terminal, proc.stdout);
    this.pipeStream(terminal, proc.stderr);

    proc.exited.then((code) => {
      log.info("Terminal process exited", { id, code });
      this.broadcast(terminal, JSON.stringify({ type: "exit", code }));
      this.terminals.delete(id);
    });

    log.info("Terminal spawned", { id, cwd, shell });
    return id;
  }

  private async pipeStream(
    terminal: TerminalProcess,
    stream: ReadableStream<Uint8Array> | null
  ) {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        this.broadcast(terminal, JSON.stringify({ type: "output", data: text }));
      }
    } catch {
      // Stream closed — expected on process exit
    }
  }

  private broadcast(terminal: TerminalProcess, data: string) {
    for (const sub of terminal.subscribers) {
      try {
        sub.send(data);
      } catch {
        // Subscriber disconnected — ignore
      }
    }
  }

  write(id: string, data: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal?.proc?.stdin) return false;
    const stdin = terminal.proc.stdin;
    // stdin is FileSink when piped via "pipe" — narrow away the fd (number) case
    if (typeof stdin === "number") return false;
    stdin.write(data);
    return true;
  }

  resize(id: string, _cols: number, _rows: number): boolean {
    // Bun.spawn does not support PTY resize — would need node-pty for full PTY support
    return this.terminals.has(id);
  }

  subscribe(id: string, ws: { send: (data: string) => void }): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;
    terminal.subscribers.add(ws);
    return true;
  }

  unsubscribe(id: string, ws: { send: (data: string) => void }) {
    const terminal = this.terminals.get(id);
    if (!terminal) return;
    terminal.subscribers.delete(ws);
    if (terminal.subscribers.size === 0) {
      this.kill(id);
    }
  }

  kill(id: string): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;
    try {
      terminal.proc?.kill();
    } catch {
      // Process already dead — ignore
    }
    this.terminals.delete(id);
    log.info("Terminal killed", { id });
    return true;
  }

  list(): Array<{ id: string; cwd: string; createdAt: number }> {
    return Array.from(this.terminals.values()).map((t) => ({
      id: t.id,
      cwd: t.cwd,
      createdAt: t.createdAt,
    }));
  }

  get(id: string): TerminalProcess | undefined {
    return this.terminals.get(id);
  }

  killAll() {
    for (const id of this.terminals.keys()) {
      this.kill(id);
    }
  }
}

export const terminalManager = new TerminalManager();
