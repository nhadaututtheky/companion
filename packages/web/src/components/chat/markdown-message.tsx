"use client";
import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "@phosphor-icons/react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1 rounded cursor-pointer transition-opacity opacity-0 group-hover:opacity-100"
      style={{
        background: "rgba(255,255,255,0.1)",
        color: copied ? "#34A853" : "rgba(255,255,255,0.6)",
      }}
      aria-label="Copy code"
    >
      {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
    </button>
  );
}

interface MarkdownMessageProps {
  content: string;
  compact?: boolean;
}

export function MarkdownMessage({ content, compact = false }: MarkdownMessageProps) {
  const fontSize = compact ? 15 : 16;

  return (
    <div className="markdown-content" style={{ fontSize, lineHeight: 1.65 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Code blocks ──────────────────────────────────
          code({ className, children, ...props }) {
            const isBlock = className?.startsWith("language-");
            const lang = className?.replace("language-", "") ?? "";
            const codeText = String(children).replace(/\n$/, "");

            if (isBlock || codeText.includes("\n")) {
              return (
                <div
                  className="relative group my-2 rounded-lg overflow-hidden"
                  style={{ maxHeight: compact ? 200 : 400 }}
                >
                  {lang && (
                    <div
                      className="px-3 py-1 text-xs font-mono"
                      style={{ background: "#2d2d2d", color: "#999" }}
                    >
                      {lang}
                    </div>
                  )}
                  <pre
                    className="overflow-auto p-3 m-0 font-mono" style={{
                      background: "#1e1e1e",
                      color: "#d4d4d4",
                      fontSize: compact ? 13 : 14,
                      lineHeight: 1.55,
                      }}
                  >
                    <code {...props}>{codeText}</code>
                  </pre>
                  <CopyButton text={codeText} />
                </div>
              );
            }

            // Inline code
            return (
              <code
                className="bg-bg-elevated border border-border font-mono" style={{
                  borderRadius: 4,
                  padding: "1px 5px",
                  fontSize: "0.9em",
                  }}
                {...props}
              >
                {children}
              </code>
            );
          },

          // ── Tables ──────────────────────────────────────
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2" style={{ maxWidth: "100%" }}>
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
              <thead
                className="bg-bg-elevated" style={{
                  borderBottom: "2px solid var(--color-border)",
                }}
              >
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th
                className="text-left text-text-primary whitespace-nowrap font-semibold" style={{
                  padding: compact ? "6px 10px" : "8px 14px",
                  }}
              >
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td
                className="text-text-primary" style={{
                  padding: compact ? "6px 10px" : "8px 14px",
                  borderBottom: "1px solid var(--color-border)",
                  }}
              >
                {children}
              </td>
            );
          },
          tr({ children }) {
            return <tr style={{ borderBottom: "1px solid var(--color-border)" }}>{children}</tr>;
          },

          // ── Block elements ──────────────────────────────
          p({ children }) {
            return <p style={{ margin: "6px 0", lineHeight: 1.65 }}>{children}</p>;
          },
          blockquote({ children }) {
            return (
              <blockquote
                className="text-text-secondary" style={{
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

          // ── Inline elements ─────────────────────────────
          strong({ children }) {
            return (
              <strong className="text-text-primary font-semibold">
                {children}
              </strong>
            );
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

          // ── Headings (scale down for chat) ──────────────
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

          // ── Horizontal rule ─────────────────────────────
          hr() {
            return (
              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--color-border)",
                  margin: "8px 0",
                }}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
