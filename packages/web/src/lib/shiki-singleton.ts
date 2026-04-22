/**
 * Lazy Shiki singleton for chat code block highlighting.
 *
 * Keeps memory + first-paint cheap by:
 *   - Only loading the highlighter engine on the first code block render.
 *   - Preloading ONLY our 2 themes up front and lazy-loading languages on
 *     demand (the bundled language list is multi-MB otherwise).
 *   - Caching an alias map so the same language is never loaded twice.
 *
 * Tokyo Night for dark, GitHub Light for light — both are native Shiki
 * themes (no remote fetch needed).
 */

import type { Highlighter, BundledLanguage, BundledTheme } from "shiki";

const DARK_THEME: BundledTheme = "tokyo-night";
const LIGHT_THEME: BundledTheme = "github-light";

// Languages we always preload. The rest are loaded lazily — shiki's
// `loadLanguage` accepts any BundledLanguage and no-ops if already loaded.
const CORE_LANGS: BundledLanguage[] = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "json",
  "bash",
  "python",
  "rust",
  "go",
  "html",
  "css",
  "markdown",
  "sql",
  "yaml",
  "toml",
];

// Common label → canonical id mapping. Kept small; unknown labels fall back
// to plain <pre> rendering (no tokens) rather than trying to auto-detect.
const LANG_ALIASES: Record<string, BundledLanguage> = {
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  js: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  go: "go",
  golang: "go",
  sh: "bash",
  shell: "bash",
  bash: "bash",
  zsh: "bash",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  markdown: "markdown",
  sql: "sql",
  java: "java",
  kotlin: "kotlin",
  swift: "swift",
  php: "php",
  ruby: "ruby",
  rb: "ruby",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cs: "csharp",
  csharp: "csharp",
  dockerfile: "dockerfile",
  docker: "dockerfile",
};

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<BundledLanguage>();

export function resolveLanguage(raw: string | undefined): BundledLanguage | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return LANG_ALIASES[key] ?? null;
}

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter } = await import("shiki");
      const h = await createHighlighter({
        themes: [DARK_THEME, LIGHT_THEME],
        langs: CORE_LANGS,
      });
      for (const lang of CORE_LANGS) loadedLangs.add(lang);
      return h;
    })();
  }
  return highlighterPromise;
}

/**
 * Highlight a code string to HTML. Returns `null` when the language isn't
 * recognised — caller should render plain text in that case.
 */
export async function highlightCode(
  code: string,
  lang: BundledLanguage,
  theme: "dark" | "light",
): Promise<string> {
  const h = await getHighlighter();
  if (!loadedLangs.has(lang)) {
    try {
      await h.loadLanguage(lang);
      loadedLangs.add(lang);
    } catch {
      // Fallback: shiki couldn't load — return unhighlighted html-escaped code.
      return escapePre(code);
    }
  }
  return h.codeToHtml(code, {
    lang,
    theme: theme === "dark" ? DARK_THEME : LIGHT_THEME,
  });
}

export function escapePre(code: string): string {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre><code>${escaped}</code></pre>`;
}
