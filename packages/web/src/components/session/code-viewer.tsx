"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// ── Language mapping ─────────────────────────────────────────────────────────

const LANG_MAP: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  py: () => python(),
  rs: () => rust(),
  json: () => json(),
  jsonc: () => json(),
  css: () => css(),
  scss: () => css(),
  html: () => html(),
  htm: () => html(),
  svg: () => html(),
  xml: () => html(),
  md: () => markdown(),
  mdx: () => markdown(),
  yml: () => json(), // close enough for highlighting
  yaml: () => json(),
  toml: () => json(),
};

function getLanguageExtension(fileName: string): Extension | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const factory = LANG_MAP[ext];
  return factory ? factory() : null;
}

// ── Dark theme matching Companion palette ────────────────────────────────────

const companionDarkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--color-bg-base)",
      color: "var(--color-text-secondary)",
      fontSize: "12px",
      fontFamily: "var(--font-mono)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-bg-elevated)",
      color: "var(--color-text-muted)",
      border: "none",
      boxShadow: "1px 0 0 var(--color-border)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(66, 133, 244, 0.06)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(66, 133, 244, 0.2) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "#4285F4",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(66, 133, 244, 0.3) !important",
    },
    ".cm-line": {
      lineHeight: "1.5",
    },
  },
  { dark: true },
);

// ── Component ────────────────────────────────────────────────────────────────

interface CodeViewerProps {
  content: string;
  fileName: string;
  className?: string;
}

export function CodeViewer({ content, fileName, className }: CodeViewerProps) {
  const extensions = useMemo(() => {
    const exts: Extension[] = [
      EditorView.lineWrapping,
      EditorView.editable.of(false),
      companionDarkTheme,
    ];
    const lang = getLanguageExtension(fileName);
    if (lang) exts.push(lang);
    return exts;
  }, [fileName]);

  return (
    <CodeMirror
      value={content}
      extensions={extensions}
      readOnly
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: false,
        highlightSelectionMatches: true,
        bracketMatching: true,
        closeBrackets: false,
        autocompletion: false,
        indentOnInput: false,
      }}
      className={className}
      style={{ fontSize: 12 }}
    />
  );
}
