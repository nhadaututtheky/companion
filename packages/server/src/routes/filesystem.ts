/**
 * Filesystem browsing routes — safe, read-only directory listing for the session
 * project-directory picker in the browser UI.
 */

import { Hono } from "hono";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve, normalize, extname } from "path";
import { execFile } from "child_process";
import type { ApiResponse } from "@companion/shared";

// Directories filtered out of listings (noisy / irrelevant for project selection)
const HIDDEN_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".DS_Store",
]);

/** Validate that a path is an existing directory and not obviously dangerous */
function validateDir(p: string): { ok: true; resolved: string } | { ok: false; error: string; status: 400 | 403 } {
  if (!p || typeof p !== "string") {
    return { ok: false, error: "path is required", status: 400 };
  }

  let resolved: string;
  try {
    resolved = resolve(normalize(p));
  } catch {
    return { ok: false, error: "Invalid path", status: 400 };
  }

  if (!existsSync(resolved)) {
    return { ok: false, error: "Path does not exist", status: 400 };
  }

  try {
    const stat = statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, error: "Path is not a directory", status: 400 };
    }
  } catch {
    return { ok: false, error: "Cannot stat path", status: 400 };
  }

  // Optionally restrict to configured roots
  const allowedRoots = process.env.ALLOWED_BROWSE_ROOTS;
  if (allowedRoots) {
    const roots = allowedRoots.split(";").map((r) => resolve(normalize(r)));
    const allowed = roots.some((root) =>
      resolved === root || resolved.startsWith(root + "/") || resolved.startsWith(root + "\\"),
    );
    if (!allowed) {
      return { ok: false, error: "Path outside allowed roots", status: 403 };
    }
  }

  return { ok: true, resolved };
}

export const filesystemRoutes = new Hono();

/**
 * GET /api/fs/browse?path=<dir>
 * Returns subdirectories (and optionally files) of the given path.
 */
filesystemRoutes.get("/browse", (c) => {
  const rawPath = c.req.query("path") ?? "";
  const includeFiles = c.req.query("files") === "true";

  const check = validateDir(rawPath);
  if (!check.ok) {
    return c.json(
      { success: false, error: check.error } satisfies ApiResponse,
      check.status,
    );
  }

  let entries: string[];
  try {
    entries = readdirSync(check.resolved);
  } catch {
    return c.json(
      { success: false, error: "Cannot read directory" } satisfies ApiResponse,
      500,
    );
  }

  const dirs: string[] = [];
  const files: string[] = [];

  for (const entry of entries) {
    // Skip hidden entries and known noisy dirs
    if (entry.startsWith(".") || HIDDEN_DIRS.has(entry)) continue;

    try {
      const fullPath = join(check.resolved, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        dirs.push(entry);
      } else if (includeFiles) {
        files.push(entry);
      }
    } catch {
      // skip unreadable entries
    }
  }

  return c.json({
    success: true,
    data: {
      path: check.resolved,
      dirs: dirs.sort(),
      files: includeFiles ? files.sort() : [],
    },
  } satisfies ApiResponse);
});

// Max file size for reading (512KB) — prevents loading huge binaries
const MAX_READ_SIZE = 512 * 1024;

// Extensions we allow reading (text-based files only)
const READABLE_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".toml",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".rb", ".sh", ".bash",
  ".css", ".scss", ".html", ".svg", ".xml",
  ".env", ".env.example", ".gitignore", ".dockerignore",
  ".dockerfile", ".prisma", ".graphql", ".sql",
  ".csv", ".log", ".ini", ".cfg", ".conf",
]);

/** Validate that a path is an existing, readable file within allowed roots */
function validateFile(
  p: string,
): { ok: true; resolved: string } | { ok: false; error: string; status: 400 | 403 } {
  if (!p || typeof p !== "string") {
    return { ok: false, error: "path is required", status: 400 };
  }

  let resolved: string;
  try {
    resolved = resolve(normalize(p));
  } catch {
    return { ok: false, error: "Invalid path", status: 400 };
  }

  if (!existsSync(resolved)) {
    return { ok: false, error: "File does not exist", status: 400 };
  }

  try {
    const stat = statSync(resolved);
    if (!stat.isFile()) {
      return { ok: false, error: "Path is not a file", status: 400 };
    }
    if (stat.size > MAX_READ_SIZE) {
      return { ok: false, error: `File too large (${(stat.size / 1024).toFixed(0)}KB > ${MAX_READ_SIZE / 1024}KB limit)`, status: 400 };
    }
  } catch {
    return { ok: false, error: "Cannot stat path", status: 400 };
  }

  // Check extension
  const ext = extname(resolved).toLowerCase();
  // Allow extensionless files like Dockerfile, Makefile
  const basename = resolved.split(/[\\/]/).pop() ?? "";
  const knownExtensionless = ["Dockerfile", "Makefile", "Procfile", "Vagrantfile", "Gemfile", "Rakefile"];
  if (ext && !READABLE_EXTENSIONS.has(ext) && !knownExtensionless.includes(basename)) {
    return { ok: false, error: `File type '${ext}' not supported for reading`, status: 400 };
  }

  // Check allowed roots (same security as validateDir)
  const allowedRoots = process.env.ALLOWED_BROWSE_ROOTS;
  if (allowedRoots) {
    const roots = allowedRoots.split(";").map((r) => resolve(normalize(r)));
    const allowed = roots.some((root) =>
      resolved === root || resolved.startsWith(root + "/") || resolved.startsWith(root + "\\"),
    );
    if (!allowed) {
      return { ok: false, error: "Path outside allowed roots", status: 403 };
    }
  }

  return { ok: true, resolved };
}

/**
 * GET /api/fs/read?path=<file>
 * Returns the text content of a file (text-based only, max 512KB).
 */
filesystemRoutes.get("/read", (c) => {
  const rawPath = c.req.query("path") ?? "";

  const check = validateFile(rawPath);
  if (!check.ok) {
    return c.json(
      { success: false, error: check.error } satisfies ApiResponse,
      check.status,
    );
  }

  let content: string;
  try {
    content = readFileSync(check.resolved, "utf-8");
  } catch {
    return c.json(
      { success: false, error: "Cannot read file" } satisfies ApiResponse,
      500,
    );
  }

  const basename = check.resolved.split(/[\\/]/).pop() ?? "";
  const ext = extname(check.resolved).toLowerCase();

  return c.json({
    success: true,
    data: {
      path: check.resolved,
      name: basename,
      ext,
      content,
      size: Buffer.byteLength(content, "utf-8"),
    },
  } satisfies ApiResponse);
});

/**
 * GET /api/fs/roots
 * Returns the home directory and any additional configured project roots.
 */
filesystemRoutes.get("/roots", (c) => {
  const home = homedir();
  const roots: { label: string; path: string }[] = [];

  // If ALLOWED_BROWSE_ROOTS is explicitly set, use those only (security restriction)
  const configured = process.env.ALLOWED_BROWSE_ROOTS;
  if (configured) {
    for (const r of configured.split(";")) {
      const normalized = resolve(normalize(r));
      if (existsSync(normalized)) {
        roots.push({ label: driveLabel(normalized), path: normalized });
      }
    }
    return c.json({ success: true, data: { roots } } satisfies ApiResponse);
  }

  // Auto-detect mode — no ALLOWED_BROWSE_ROOTS set
  roots.push({ label: "Home", path: home });

  if (process.platform === "win32") {
    // Native Windows: scan drive letters
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const drive = `${letter}:\\`;
      try {
        if (existsSync(drive)) {
          roots.push({ label: `${letter}:`, path: drive });
        }
      } catch { /* skip */ }
    }
  } else {
    // Linux/macOS — auto-detect Docker-mounted Windows drives at /mnt/<letter>
    try {
      const mntPath = "/mnt";
      if (existsSync(mntPath)) {
        const entries = readdirSync(mntPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && /^[a-z]$/i.test(entry.name)) {
            const drivePath = `${mntPath}/${entry.name}`;
            // Verify it's actually a mounted drive (has contents, not empty stub)
            try {
              const contents = readdirSync(drivePath);
              if (contents.length > 0) {
                roots.push({ label: `${entry.name.toUpperCase()}:`, path: drivePath });
              }
            } catch { /* not readable — skip */ }
          }
        }
      }
    } catch { /* /mnt doesn't exist or not readable */ }

    // Also add standard Linux/macOS roots
    for (const cp of [
      { label: "Root", path: "/" },
      { label: "Volumes", path: "/Volumes" },
      { label: "Users", path: "/Users" },
    ]) {
      if (existsSync(cp.path) && cp.path !== home) {
        roots.push(cp);
      }
    }
  }

  return c.json({ success: true, data: { roots } } satisfies ApiResponse);
});

// Max search results returned
const MAX_SEARCH_RESULTS = 200;

// Ripgrep search timeout (ms)
const SEARCH_TIMEOUT_MS = 10_000;

interface RgMatchData {
  path: { text: string };
  line_number: number;
  lines: { text: string };
  submatches: Array<{ start: number; end: number }>;
}

interface RgMessage {
  type: string;
  data: RgMatchData;
}

interface SearchMatch {
  file: string;
  line: number;
  col: number;
  text: string;
}

interface RgResult {
  matches: SearchMatch[];
  truncated: boolean;
  rgNotFound: boolean;
}

/** Wraps execFile(rg) in a promise, resolves with parsed matches */
function runRipgrep(args: string[]): Promise<RgResult> {
  return new Promise((resolve) => {
    execFile(
      "rg",
      args,
      { timeout: SEARCH_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ matches: [], truncated: false, rgNotFound: true });
          return;
        }

        const matches: SearchMatch[] = [];
        let truncated = false;

        if (stdout) {
          const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
          for (const raw of lines) {
            if (matches.length >= MAX_SEARCH_RESULTS) {
              truncated = true;
              break;
            }
            try {
              const msg = JSON.parse(raw) as RgMessage;
              if (msg.type !== "match") continue;

              const d = msg.data;
              const col = d.submatches[0]?.start ?? 0;
              matches.push({
                file: d.path.text,
                line: d.line_number,
                col,
                text: d.lines.text.replace(/\n$/, ""),
              });
            } catch {
              // skip malformed JSON lines
            }
          }
        }

        resolve({ matches, truncated, rgNotFound: false });
      },
    );
  });
}

/**
 * GET /api/fs/search?q=<query>&path=<dir>&glob=<pattern>
 * Full-text search using ripgrep (rg). Returns matched lines with highlight ranges.
 */
filesystemRoutes.get("/search", async (c) => {
  const query = c.req.query("q") ?? "";
  const rawPath = c.req.query("path") ?? "";
  const glob = c.req.query("glob") ?? "";

  if (!query.trim()) {
    return c.json({ success: false, error: "q (search query) is required" } satisfies ApiResponse, 400);
  }

  const check = validateDir(rawPath);
  if (!check.ok) {
    return c.json({ success: false, error: check.error } satisfies ApiResponse, check.status);
  }

  const args = [
    "--json",
    "--max-count=5",
    "--max-filesize=1M",
    "--no-heading",
    query,
    check.resolved,
  ];

  if (glob) {
    args.unshift(`--glob=${glob}`);
  }

  const result = await runRipgrep(args);

  if (result.rgNotFound) {
    return c.json({ success: false, error: "ripgrep not installed" } satisfies ApiResponse, 500);
  }

  return c.json({
    success: true,
    data: {
      matches: result.matches,
      total: result.matches.length,
      truncated: result.truncated,
    },
  } satisfies ApiResponse);
});

/** Smart label for a root path: /mnt/c → "C:", /projects/foo → "foo" */
function driveLabel(normalized: string): string {
  const mntMatch = normalized.match(/^\/mnt\/([a-z])$/i);
  if (mntMatch) return `${mntMatch[1]!.toUpperCase()}:`;
  return normalized.split(/[\\/]/).pop() ?? normalized;
}
