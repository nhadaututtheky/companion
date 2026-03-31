/**
 * WebIntel Detector — detects library/package mentions in user messages.
 * Used for auto-injection of documentation into agent context.
 */

import { createLogger } from "../logger.js";

const log = createLogger("web-intel-detector");

/** Well-known libraries and their docs URLs (top 100) */
const KNOWN_LIBRARIES: Record<string, string> = {
  // JavaScript/TypeScript frameworks
  "react": "https://react.dev/reference/react",
  "next.js": "https://nextjs.org/docs",
  "nextjs": "https://nextjs.org/docs",
  "vue": "https://vuejs.org/guide/introduction",
  "nuxt": "https://nuxt.com/docs",
  "svelte": "https://svelte.dev/docs",
  "sveltekit": "https://svelte.dev/docs/kit",
  "angular": "https://angular.dev/guide",
  "solid": "https://docs.solidjs.com",
  "remix": "https://remix.run/docs",
  "astro": "https://docs.astro.build",

  // Server frameworks
  "hono": "https://hono.dev/docs",
  "express": "https://expressjs.com/en/api.html",
  "fastify": "https://fastify.dev/docs/latest",
  "koa": "https://koajs.com",
  "nest": "https://docs.nestjs.com",
  "nestjs": "https://docs.nestjs.com",

  // ORMs & databases
  "drizzle": "https://orm.drizzle.team/docs/overview",
  "drizzle-orm": "https://orm.drizzle.team/docs/overview",
  "prisma": "https://www.prisma.io/docs",
  "typeorm": "https://typeorm.io",
  "mongoose": "https://mongoosejs.com/docs/guide.html",
  "sequelize": "https://sequelize.org/docs/v6",
  "knex": "https://knexjs.org/guide",

  // Styling
  "tailwind": "https://tailwindcss.com/docs",
  "tailwindcss": "https://tailwindcss.com/docs",
  "styled-components": "https://styled-components.com/docs",

  // State management
  "zustand": "https://zustand.docs.pmnd.rs/getting-started/introduction",
  "redux": "https://redux.js.org/introduction/getting-started",
  "jotai": "https://jotai.org/docs/introduction",
  "tanstack-query": "https://tanstack.com/query/latest/docs",
  "react-query": "https://tanstack.com/query/latest/docs",
  "swr": "https://swr.vercel.app/docs/getting-started",

  // Validation
  "zod": "https://zod.dev",
  "yup": "https://github.com/jquense/yup",
  "joi": "https://joi.dev/api",

  // Testing
  "vitest": "https://vitest.dev/guide",
  "jest": "https://jestjs.io/docs/getting-started",
  "playwright": "https://playwright.dev/docs/intro",
  "cypress": "https://docs.cypress.io",

  // Build tools
  "vite": "https://vite.dev/guide",
  "webpack": "https://webpack.js.org/concepts",
  "esbuild": "https://esbuild.github.io",
  "turbo": "https://turbo.build/repo/docs",
  "bun": "https://bun.sh/docs",

  // Auth
  "lucia": "https://lucia-auth.com",
  "next-auth": "https://next-auth.js.org/getting-started/introduction",
  "auth.js": "https://authjs.dev/getting-started",
  "clerk": "https://clerk.com/docs",
  "supabase-auth": "https://supabase.com/docs/guides/auth",

  // APIs & HTTP
  "axios": "https://axios-http.com/docs/intro",
  "trpc": "https://trpc.io/docs",
  "graphql": "https://graphql.org/learn",
  "apollo": "https://www.apollographql.com/docs",

  // Cloud/infra
  "docker": "https://docs.docker.com/reference",
  "supabase": "https://supabase.com/docs",
  "firebase": "https://firebase.google.com/docs",
  "cloudflare-workers": "https://developers.cloudflare.com/workers",
  "vercel": "https://vercel.com/docs",

  // Telegram
  "grammy": "https://grammy.dev/guide",
  "telegraf": "https://telegraf.js.org",

  // Desktop
  "tauri": "https://v2.tauri.app/start",
  "electron": "https://www.electronjs.org/docs/latest",

  // Python
  "fastapi": "https://fastapi.tiangolo.com",
  "django": "https://docs.djangoproject.com",
  "flask": "https://flask.palletsprojects.com",
  "pydantic": "https://docs.pydantic.dev/latest",
  "sqlalchemy": "https://docs.sqlalchemy.org",
  "pytorch": "https://pytorch.org/docs/stable",
  "tensorflow": "https://www.tensorflow.org/api_docs",

  // Rust
  "tokio": "https://docs.rs/tokio/latest/tokio",
  "actix": "https://actix.rs/docs",
  "axum": "https://docs.rs/axum/latest/axum",
  "serde": "https://serde.rs",

  // Go
  "gin": "https://gin-gonic.com/docs",
  "fiber": "https://docs.gofiber.io",
};

// ── Patterns ────────────────────────────────────────────────────────────────

/**
 * Patterns that indicate library mentions in user messages.
 * Returns matched library names (lowercase, deduplicated).
 */
const MENTION_PATTERNS = [
  // "use X", "using X", "with X library"
  /\b(?:use|using|with|setup|configure|install)\s+(@?[\w-]+(?:\/[\w-]+)?)/gi,
  // "X docs", "X documentation", "X API"
  /\b(@?[\w-]+(?:\/[\w-]+)?)\s+(?:docs|documentation|api|guide|reference|tutorial)/gi,
  // "import from X", "import X"
  /\bimport\s+.*?\s+from\s+['"](@?[\w-]+(?:\/[\w-]+)?)['"]/gi,
  // "how does X work", "how to X"
  /\bhow\s+(?:does|to\s+(?:use|setup|configure))\s+(@?[\w-]+(?:\/[\w-]+)?)/gi,
  // npm package patterns: @scope/name or kebab-case
  /\b(@[\w-]+\/[\w-]+)\b/g,
];

/** Patterns that indicate error messages with library names */
const ERROR_PATTERNS = [
  /Cannot find module ['"](@?[\w-]+(?:\/[\w-]+)?)['"]/i,
  /Module not found.*['"](@?[\w-]+(?:\/[\w-]+)?)['"]/i,
  /(\w+) is not a function/i,
  /No matching export in ['"](@?[\w-]+(?:\/[\w-]+)?)['"]/i,
];

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect library/package mentions in a user message.
 * Returns unique lowercase library names.
 */
export function detectLibraryMentions(message: string): string[] {
  const found = new Set<string>();

  // Check against known library names first (case-insensitive)
  const lowerMsg = message.toLowerCase();
  for (const lib of Object.keys(KNOWN_LIBRARIES)) {
    if (lowerMsg.includes(lib)) {
      found.add(lib);
    }
  }

  // Apply regex patterns
  for (const pattern of MENTION_PATTERNS) {
    pattern.lastIndex = 0; // reset regex state
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message)) !== null) {
      const name = match[1]?.toLowerCase().trim();
      if (name && name.length > 1 && name.length < 50) {
        found.add(name);
      }
    }
  }

  return [...found];
}

/**
 * Detect library name from error messages.
 */
export function detectErrorLibrary(message: string): string | null {
  for (const pattern of ERROR_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

/**
 * Resolve a library name to its documentation URL.
 * Strategy: known map → npm registry → null.
 */
export async function resolveDocsUrl(libraryName: string): Promise<string | null> {
  const normalized = libraryName.toLowerCase().trim();

  // 1. Check known map
  if (KNOWN_LIBRARIES[normalized]) {
    return KNOWN_LIBRARIES[normalized]!;
  }

  // 2. Try npm registry
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(normalized)}`, {
      signal: AbortSignal.timeout(5000),
      headers: { "Accept": "application/json" },
    });

    if (res.ok) {
      const data = await res.json() as {
        homepage?: string;
        repository?: { url?: string } | string;
      };

      // Prefer homepage
      if (data.homepage && data.homepage.startsWith("http")) {
        return data.homepage;
      }

      // Fall back to repository URL
      const repoUrl = typeof data.repository === "string"
        ? data.repository
        : data.repository?.url;

      if (repoUrl) {
        // Convert git URLs to HTTPS
        const cleaned = repoUrl
          .replace(/^git\+/, "")
          .replace(/\.git$/, "")
          .replace(/^git:\/\//, "https://")
          .replace(/^ssh:\/\/git@/, "https://");

        if (cleaned.startsWith("http")) {
          return cleaned;
        }
      }
    }
  } catch (err) {
    log.debug("npm registry lookup failed", { library: normalized, error: String(err) });
  }

  // 3. Try PyPI
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(normalized)}/json`, {
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json() as {
        info?: {
          project_urls?: Record<string, string>;
          home_page?: string;
        };
      };

      const urls = data.info?.project_urls;
      if (urls) {
        // Prefer "Documentation" or "Docs" key
        const docsUrl = urls["Documentation"] ?? urls["Docs"] ?? urls["Homepage"];
        if (docsUrl?.startsWith("http")) return docsUrl;
      }

      if (data.info?.home_page?.startsWith("http")) return data.info.home_page;
    }
  } catch {
    // Silently skip PyPI fallback
  }

  return null;
}

/**
 * Get the known docs URL for a library (sync, from hardcoded map only).
 */
export function getKnownDocsUrl(libraryName: string): string | undefined {
  return KNOWN_LIBRARIES[libraryName.toLowerCase().trim()];
}
