// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/drizzle/**",
      ".rune/metrics/**",
      "landing/**",
      "**/*.js",
      "**/*.mjs",
    ],
  },

  // Base JS rules for all files
  js.configs.recommended,

  // TypeScript rules for all TS/TSX files
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),

  // Server package — Bun globals
  {
    files: ["packages/server/**/*.ts"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        fetch: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Bun: "readonly",
      },
    },
  },

  // Shared package — minimal globals
  {
    files: ["packages/shared/**/*.ts"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },

  // React + Next.js rules for web package
  {
    files: ["packages/web/**/*.ts", "packages/web/**/*.tsx"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        Event: "readonly",
        EventSource: "readonly",
        WebSocket: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        AbortController: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        ResizeObserver: "readonly",
        navigator: "readonly",
        location: "readonly",
        history: "readonly",
        confirm: "readonly",
        alert: "readonly",
        process: "readonly",
        require: "readonly",
      },
    },
    settings: {
      react: {
        version: "19",
      },
    },
    rules: {
      // React
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/display-name": "warn",

      // React Hooks — core rules as errors, compiler rules as warnings
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // React 19 compiler rules — warn only (common patterns in existing code)
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/purity": "warn",

      // Next.js core web vitals
      "@next/next/no-html-link-for-pages": "error",
      "@next/next/no-img-element": "warn",
      "@next/next/no-sync-scripts": "error",
    },
  },

  // Test files — relaxed rules
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    languageOptions: {
      globals: {
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Custom rules for all TS/TSX files
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Practical strictness
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: false,
        },
      ],
      "prefer-const": "error",
      "no-control-regex": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Prettier — must be last to disable conflicting formatting rules
  eslintConfigPrettier,
);
