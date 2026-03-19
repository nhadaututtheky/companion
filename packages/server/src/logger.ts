// Lightweight structured logger — no external deps

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<Level, string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const RESET = "\x1b[0m";

function getLogLevel(): Level {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVEL_ORDER) return env as Level;
  return "info";
}

const globalLevel = getLogLevel();
const jsonFormat = process.env.LOG_FORMAT === "json";

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

function formatData(data?: Record<string, unknown>): string {
  if (!data) return "";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    const str = typeof val === "string" ? val : JSON.stringify(val);
    parts.push(`${key}=${str}`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

export function createLogger(module: string): Logger {
  const prefix = `[${module}]`;

  function log(
    level: Level,
    msg: string,
    data?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[globalLevel]) return;

    if (jsonFormat) {
      const entry = {
        ...data,
        ts: new Date().toISOString(),
        level,
        module,
        msg,
      };
      process.stdout.write(JSON.stringify(entry) + "\n");
      return;
    }

    const color = LEVEL_COLORS[level];
    const ts = new Date().toISOString().slice(11, 23);
    const levelTag = level.toUpperCase().padEnd(5);
    const line = `${color}${ts} ${levelTag}${RESET} ${prefix} ${msg}${formatData(data)}`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
}
