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

    // On Windows, prefer pwsh (PowerShell 7+) > powershell.exe > cmd.exe
    let shell: string;
    if (process.platform === "win32") {
      shell = "cmd.exe";
      // Try PowerShell variants (cmd.exe is the safest fallback for Bun.spawn)
      for (const candidate of ["pwsh.exe", "powershell.exe"]) {
        try {
          const check = Bun.spawnSync(["where", candidate]);
          if (check.exitCode === 0) {
            shell = candidate;
            break;
          }
        } catch {
          // candidate not found, continue
        }
      }
    } else {
      shell = process.env.SHELL ?? "/bin/bash";
    }

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([shell], {
        cwd,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, TERM: "xterm-256color" },
      });
    } catch (err) {
      log.error("Failed to spawn terminal process", { id, cwd, shell, error: String(err) });
      throw new Error(`Failed to spawn shell: ${shell}`);
    }

    const terminal: TerminalProcess = {
      id,
      cwd,
      proc,
      createdAt: Date.now(),
      subscribers: new Set(),
    };

    this.terminals.set(id, terminal);

    this.pipeStream(terminal, proc.stdout as ReadableStream<Uint8Array> | null);
    this.pipeStream(terminal, proc.stderr as ReadableStream<Uint8Array> | null);

    proc.exited.then((code) => {
      log.info("Terminal process exited", { id, code });
      this.broadcast(terminal, JSON.stringify({ type: "exit", code }));
      // Delay cleanup so late subscribers can still see the exit message
      setTimeout(() => this.terminals.delete(id), 2000);
    });

    log.info("Terminal spawned", { id, cwd, shell, pid: proc.pid });
    return id;
  }

  private async pipeStream(terminal: TerminalProcess, stream: ReadableStream<Uint8Array> | null) {
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
