"use client";

/**
 * Rich code block for assistant messages.
 *
 *   - Shiki-highlighted tokens (Tokyo Night / GitHub Light depending on theme)
 *   - Chrome bar: macOS-style traffic lights, language badge, copy button
 *   - Gracefully degrades to plain <pre> while Shiki loads, so first paint
 *     is never blocked.
 *   - Language is lazy-loaded; unknown languages fall back to escaped plain.
 */

import { useEffect, useState } from "react";
import { Copy, Check } from "@phosphor-icons/react";
import { highlightCode, resolveLanguage, escapePre } from "@/lib/shiki-singleton";
import { useUiStore } from "@/lib/stores/ui-store";

interface CodeBlockProps {
  code: string;
  lang?: string;
  maxHeight: number;
  fontSize: number;
}

export function CodeBlock({ code, lang, maxHeight, fontSize }: CodeBlockProps) {
  const theme = useUiStore((s) => s.theme);
  const resolvedLang = resolveLanguage(lang);
  const [html, setHtml] = useState<string>(() => escapePre(code));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!resolvedLang) {
      setHtml(escapePre(code));
      return;
    }
    highlightCode(code, resolvedLang, theme === "dark" ? "dark" : "light").then((out) => {
      if (!cancelled) setHtml(out);
    });
    return () => {
      cancelled = true;
    };
  }, [code, resolvedLang, theme]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div
      className="group relative my-2 overflow-hidden rounded-lg"
      style={{
        border: "1px solid var(--color-border)",
        background: theme === "dark" ? "#1a1b26" : "#ffffff",
        fontSize,
      }}
    >
      {/* Chrome bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{
          background: theme === "dark" ? "#16161e" : "#f6f8fa",
          boxShadow: `0 1px 0 ${theme === "dark" ? "#292e42" : "var(--color-border)"}`,
        }}
      >
        {/* Traffic lights */}
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
          <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
          <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
        </div>
        {/* Language badge */}
        <span
          className="ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
          style={{
            color: theme === "dark" ? "#a9b1d6" : "#57606a",
            background: theme === "dark" ? "#292e42" : "#eaeef2",
          }}
        >
          {resolvedLang ?? lang ?? "text"}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="cursor-pointer rounded px-1.5 py-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            color: copied
              ? "#34A853"
              : theme === "dark"
                ? "#a9b1d6"
                : "#57606a",
            background: "transparent",
          }}
          aria-label={copied ? "Copied" : "Copy code"}
          title={copied ? "Copied!" : "Copy code"}
        >
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
        </button>
      </div>

      {/* Highlighted body — shiki wraps code in its own <pre><code>. */}
      <div
        className="shiki-host overflow-auto"
        style={{
          maxHeight,
          lineHeight: 1.55,
        }}
        // Shiki output is trusted library output, not user-authored HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
