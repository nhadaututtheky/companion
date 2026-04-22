"use client";
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

// ── Shared (compact-independent) components ──────────────────────────────────

const sharedComponents: Partial<Components> = {
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto" style={{ maxWidth: "100%" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontSize: "inherit",
            fontFamily: "var(--font-body)",
          }}
        >
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="bg-bg-elevated" style={{ borderBottom: "2px solid var(--color-border)" }}>
        {children}
      </thead>
    );
  },
  tr({ children }) {
    return <tr style={{ boxShadow: "0 1px 0 var(--color-border)" }}>{children}</tr>;
  },
  p({ children }) {
    return <p style={{ margin: "6px 0", lineHeight: 1.65 }}>{children}</p>;
  },
  blockquote({ children }) {
    return (
      <blockquote
        className="text-text-secondary"
        style={{
          borderLeft: "3px solid #4285F4",
          paddingLeft: 12,
          margin: "8px 0",
          fontStyle: "italic",
        }}
      >
        {children}
      </blockquote>
    );
  },
  ul({ children }) {
    return <ul style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ul>;
  },
  ol({ children }) {
    return <ol style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ol>;
  },
  li({ children }) {
    return <li style={{ marginBottom: 4 }}>{children}</li>;
  },
  strong({ children }) {
    return <strong className="text-text-primary font-semibold">{children}</strong>;
  },
  em({ children }) {
    return <em>{children}</em>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#4285F4", textDecoration: "none" }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.textDecoration = "underline";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.textDecoration = "none";
        }}
      >
        {children}
      </a>
    );
  },
  hr() {
    return (
      <hr
        style={{
          border: "none",
          boxShadow: "0 -1px 0 var(--color-border)",
          margin: "8px 0",
        }}
      />
    );
  },
};

// ── Compact-dependent components — pre-built for each mode ───────────────────

function buildComponents(compact: boolean): Partial<Components> {
  const pad = compact ? "6px 10px" : "8px 14px";
  const maxCodeH = compact ? 200 : 400;
  const codeFontSize = compact ? 13 : 14;

  return {
    ...sharedComponents,
    code({ className, children, ...props }) {
      const isBlock = className?.startsWith("language-");
      const lang = className?.replace("language-", "") ?? "";
      const codeText = String(children).replace(/\n$/, "");

      if (isBlock || codeText.includes("\n")) {
        return (
          <CodeBlock
            code={codeText}
            lang={lang || undefined}
            maxHeight={maxCodeH}
            fontSize={codeFontSize}
          />
        );
      }

      return (
        <code
          className="bg-bg-elevated border-border rounded border px-1.5 py-px font-mono text-[0.9em]"
          {...props}
        >
          {children}
        </code>
      );
    },
    th({ children }) {
      return (
        <th
          className="text-text-primary whitespace-nowrap text-left font-semibold"
          style={{ padding: pad }}
        >
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td
          className="text-text-primary"
          style={{ padding: pad, boxShadow: "0 1px 0 var(--color-border)" }}
        >
          {children}
        </td>
      );
    },
    h1({ children }) {
      return (
        <h3 className="font-bold" style={{ fontSize: compact ? 18 : 20, margin: "12px 0 6px" }}>
          {children}
        </h3>
      );
    },
    h2({ children }) {
      return (
        <h4 className="font-semibold" style={{ fontSize: compact ? 16 : 18, margin: "10px 0 4px" }}>
          {children}
        </h4>
      );
    },
    h3({ children }) {
      return (
        <h5 className="font-semibold" style={{ fontSize: compact ? 15 : 16, margin: "8px 0 3px" }}>
          {children}
        </h5>
      );
    },
  };
}

// Pre-built component maps — stable references, never recreated
const COMPONENTS_NORMAL = buildComponents(false);
const COMPONENTS_COMPACT = buildComponents(true);

const remarkPlugins = [remarkGfm];

// ── Memoized MarkdownMessage ─────────────────────────────────────────────────

interface MarkdownMessageProps {
  content: string;
  compact?: boolean;
}

export const MarkdownMessage = React.memo(function MarkdownMessage({
  content,
  compact = false,
}: MarkdownMessageProps) {
  const fontSize = compact ? 15 : 16;
  const components = compact ? COMPONENTS_COMPACT : COMPONENTS_NORMAL;

  return (
    <div className="markdown-content" style={{ fontSize, lineHeight: 1.65 }}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
