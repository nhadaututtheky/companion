// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      ".rune/metrics/**",
      "**/*.js.map",
      "**/drizzle/**",
      "landing/**",
    ],
  },

  // Base JS rules for all files
  js.configs.recommended,

  // TypeScript rules for all TS/TSX files
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),

  // Server package — Node/Bun globals
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

  // Common rules for all TS/TSX files
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-console": "warn",
      "prefer-const": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-control-regex": "off",
    },
  },

  // React + Next.js rules only for web package
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
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Next.js core web vitals
      "@next/next/no-html-link-for-pages": "error",
      "@next/next/no-img-element": "warn",
      "@next/next/no-sync-scripts": "error",
    },
  },

  // Landing page + agents (plain JS/HTML) — ignore
  {
    files: ["landing/**", ".agents/**"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
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
);
