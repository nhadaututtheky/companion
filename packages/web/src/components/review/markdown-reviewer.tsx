"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, ChatText, PaperPlaneTilt, X } from "@phosphor-icons/react";

// ── Types ────────────────────────────────────────────────────────────────────

interface CommentPopup {
  x: number;
  y: number;
  afterLine: number;
  selectedText: string;
}

interface MarkdownReviewerProps {
  content: string;
  onComment: (afterLine: number, comment: string, selectedText?: string) => Promise<void>;
}

// ── Copy Button ──────────────────────────────────────────────────────────────

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
      className="absolute right-2 top-2 cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
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

// ── Comment Input Popup ──────────────────────────────────────────────────────

function CommentInput({
  popup,
  onSubmit,
  onClose,
}: {
  popup: CommentPopup;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <div
      className="fixed z-50"
      style={{
        left: Math.min(popup.x, window.innerWidth - 360),
        top: popup.y,
      }}
    >
      <div
        className="bg-bg-elevated overflow-hidden rounded-lg shadow-lg"
        style={{
          width: 340,
        }}
      >
        {/* Selected text preview */}
        {popup.selectedText && (
          <div
            className="text-text-secondary px-3 py-2 text-xs"
            style={{
              background: "rgba(66,133,244,0.08)",
              boxShadow: "0 1px 0 var(--color-border)",
              fontStyle: "italic",
            }}
          >
            &ldquo;{popup.selectedText.slice(0, 120)}
            {popup.selectedText.length > 120 ? "..." : ""}&rdquo;
          </div>
        )}

        {/* Comment input */}
        <div className="flex items-end gap-2 p-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Add comment..."
            rows={2}
            className="text-text-primary bg-bg-card border-border flex-1 resize-none rounded border px-2 py-1.5 text-sm outline-none"
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={handleSubmit}
              disabled={!text.trim()}
              className="cursor-pointer rounded p-1.5 transition-colors"
              style={{
                background: text.trim() ? "#4285F4" : "transparent",
                color: text.trim() ? "#fff" : "var(--color-text-secondary)",
              }}
              aria-label="Submit comment"
            >
              <PaperPlaneTilt size={16} weight="fill" />
            </button>
            <button
              onClick={onClose}
              className="text-text-secondary cursor-pointer rounded p-1.5 transition-colors"
              aria-label="Cancel"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="text-text-secondary px-3 py-1 text-xs" style={{ opacity: 0.6 }}>
          Ctrl+Enter to submit
        </div>
      </div>
    </div>
  );
}

// ── Line-tracked wrapper ─────────────────────────────────────────────────────

interface AstNode {
  position?: { start?: { line?: number }; end?: { line?: number } };
}

function LineBlock({
  node,
  children,
  tag,
  style,
  className,
}: {
  node?: AstNode;
  children: React.ReactNode;
  tag: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const lineStart = node?.position?.start?.line ?? 0;
  const lineEnd = node?.position?.end?.line ?? 0;
  const Tag = tag as "div";

  return (
    <Tag
      data-line-start={lineStart || undefined}
      data-line-end={lineEnd || undefined}
      style={style}
      className={className}
    >
      {children}
    </Tag>
  );
}

// ── Check if blockquote is a user comment ────────────────────────────────────

function isUserComment(children: React.ReactNode): boolean {
  const text = extractText(children);
  return text.includes("\u{1F4AC} User") || text.includes("User:");
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(el.props.children);
  }
  return "";
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MarkdownReviewer({ content, onComment }: MarkdownReviewerProps) {
  const [popup, setPopup] = useState<CommentPopup | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect text selection
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Find line info from nearest parent with data-line-end
    const startNode = range.startContainer;
    const el =
      startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : (startNode as HTMLElement);
    const lineEl = el?.closest("[data-line-end]");
    const endLineEl = (() => {
      const endNode = range.endContainer;
      const endEl =
        endNode.nodeType === Node.TEXT_NODE ? endNode.parentElement : (endNode as HTMLElement);
      return endEl?.closest("[data-line-end]");
    })();

    const afterLine = Math.max(
      parseInt(lineEl?.getAttribute("data-line-end") ?? "0"),
      parseInt(endLineEl?.getAttribute("data-line-end") ?? "0"),
    );

    if (!afterLine) return;

    setPopup({
      x: rect.left + rect.width / 2 - 170,
      y: rect.bottom + 8 + window.scrollY,
      afterLine,
      selectedText: selection.toString().trim().slice(0, 300),
    });
  }, []);

  // Close popup on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popup && !(e.target as HTMLElement).closest(".fixed.z-50")) {
        setPopup(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popup]);

  const handleSubmitComment = useCallback(
    async (text: string) => {
      if (!popup) return;
      setSubmitting(true);
      try {
        await onComment(popup.afterLine, text, popup.selectedText);
        setPopup(null);
        window.getSelection()?.removeAllRanges();
      } finally {
        setSubmitting(false);
      }
    },
    [popup, onComment],
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Toolbar hint */}
      <div
        className="text-text-secondary mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
        style={{
          background: "rgba(66,133,244,0.06)",
          border: "1px solid rgba(66,133,244,0.15)",
        }}
      >
        <ChatText size={14} weight="duotone" style={{ color: "#4285F4" }} />
        Select text to add inline comments. Agents will see your comments in the file.
      </div>

      {/* Rendered markdown */}
      <div
        className="markdown-reviewer"
        style={{ fontSize: 15, lineHeight: 1.7 }}
        onMouseUp={handleMouseUp}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // ── Code ─────────────────────────────────────────
            code({ className, children, node, ...props }) {
              const isBlock = className?.startsWith("language-");
              const lang = className?.replace("language-", "") ?? "";
              const codeText = String(children).replace(/\n$/, "");

              if (isBlock || codeText.includes("\n")) {
                return (
                  <LineBlock
                    node={node as unknown as AstNode}
                    tag="div"
                    className="group relative my-3 overflow-hidden rounded-lg"
                  >
                    {lang && (
                      <div
                        className="px-3 py-1 font-mono text-xs"
                        style={{ background: "#2d2d2d", color: "#999" }}
                      >
                        {lang}
                      </div>
                    )}
                    <pre
                      className="m-0 overflow-auto p-3 font-mono"
                      style={{
                        background: "#1e1e1e",
                        color: "#d4d4d4",
                        fontSize: 14,
                        lineHeight: 1.55,
                      }}
                    >
                      <code {...props}>{codeText}</code>
                    </pre>
                    <CopyButton text={codeText} />
                  </LineBlock>
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

            // ── Tables ───────────────────────────────────────
            table({ children, node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="div"
                  className="my-3 overflow-x-auto"
                  style={{ maxWidth: "100%" }}
                >
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "inherit" }}>
                    {children}
                  </table>
                </LineBlock>
              );
            },
            thead({ children }) {
              return (
                <thead
                  className="bg-bg-elevated"
                  style={{
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
                  className="text-text-primary whitespace-nowrap text-left font-semibold"
                  style={{
                    padding: "8px 14px",
                  }}
                >
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td
                  className="text-text-primary"
                  style={{
                    padding: "8px 14px",
                    boxShadow: "0 1px 0 var(--color-border)",
                  }}
                >
                  {children}
                </td>
              );
            },
            tr({ children }) {
              return <tr style={{ boxShadow: "0 1px 0 var(--color-border)" }}>{children}</tr>;
            },

            // ── Block elements ───────────────────────────────
            p({ children, node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="p"
                  style={{ margin: "8px 0", lineHeight: 1.7 }}
                >
                  {children}
                </LineBlock>
              );
            },

            blockquote({ children, node }) {
              const isComment = isUserComment(children);
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="blockquote"
                  style={{
                    borderLeft: isComment ? "3px solid #F59E0B" : "3px solid #4285F4",
                    paddingLeft: 14,
                    margin: "12px 0",
                    padding: isComment ? "8px 14px" : undefined,
                    paddingTop: isComment ? 8 : undefined,
                    paddingBottom: isComment ? 8 : undefined,
                    background: isComment ? "rgba(245,158,11,0.06)" : undefined,
                    borderRadius: isComment ? "0 8px 8px 0" : undefined,
                    color: isComment ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontStyle: isComment ? "normal" : "italic",
                  }}
                >
                  {children}
                </LineBlock>
              );
            },

            ul({ children, node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="ul"
                  style={{ paddingLeft: 22, margin: "6px 0" }}
                >
                  {children}
                </LineBlock>
              );
            },
            ol({ children, node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="ol"
                  style={{ paddingLeft: 22, margin: "6px 0" }}
                >
                  {children}
                </LineBlock>
              );
            },
            li({ children, node }) {
              return (
                <LineBlock node={node as unknown as AstNode} tag="li" style={{ marginBottom: 4 }}>
                  {children}
                </LineBlock>
              );
            },

            // ── Headings ─────────────────────────────────────
            h1({ children, node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="h1"
                  className="text-text-primary font-bold"
                  style={{
                    fontSize: 24,
                    margin: "20px 0 8px",
                  }}
                >
                  {children}
                </LineBlock>
              );
            },
            h2({ children, node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="h2"
                  className="text-text-primary font-semibold"
                  style={{
                    fontSize: 20,
                    margin: "18px 0 6px",
                    paddingBottom: 6,
                    boxShadow: "0 1px 0 var(--color-border)",
                  }}
                >
                  {children}
                </LineBlock>
              );
            },
            h3({ children, node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="h3"
                  className="text-text-primary font-semibold"
                  style={{
                    fontSize: 17,
                    margin: "14px 0 4px",
                  }}
                >
                  {children}
                </LineBlock>
              );
            },
            h4({ children, node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="h4"
                  className="text-text-primary font-semibold"
                  style={{
                    fontSize: 15,
                    margin: "12px 0 4px",
                  }}
                >
                  {children}
                </LineBlock>
              );
            },

            // ── Inline ───────────────────────────────────────
            strong({ children }) {
              return <strong className="text-text-primary font-semibold">{children}</strong>;
            },
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#4285F4", textDecoration: "none" }}
                >
                  {children}
                </a>
              );
            },

            // ── HR ───────────────────────────────────────────
            hr({ node }) {
              return (
                <LineBlock
                  node={node as unknown as AstNode}
                  tag="hr"
                  style={{
                    border: "none",
                    boxShadow: "0 -1px 0 var(--color-border)",
                    margin: "16px 0",
                  }}
                >
                  {null}
                </LineBlock>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>

      {/* Comment popup */}
      {popup && !submitting && (
        <CommentInput popup={popup} onSubmit={handleSubmitComment} onClose={() => setPopup(null)} />
      )}
    </div>
  );
}
