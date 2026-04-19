"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  BookOpen,
  Plus,
  MagnifyingGlass,
  ArrowLeft,
  ShieldCheck,
  Tag,
  Lightning,
  Trash,
  PencilSimple,
  Upload,
  File,
  CircleNotch,
  Warning,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { fmtDate } from "@/lib/formatters";
import {
  useWikiStore,
  type WikiDomain,
  type ArticleRef,
  type WikiArticle,
  type RawFile,
} from "@/lib/stores/wiki-store";

// ── Helpers ────────────────────────────────────────────────────────────────

const WIKI_ACCENT = "var(--color-purple, #7c3aed)";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

const ALLOWED_DROP_EXTS = new Set([".md", ".txt", ".json"]);
const MAX_DROP_SIZE = 1 * 1024 * 1024; // 1 MB

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, "").trim();
}

// ── Props ──────────────────────────────────────────────────────────────────

interface WikiPanelProps {
  onClose: () => void;
}

// ── Main Panel ─────────────────────────────────────────────────────────────

export function WikiPanel({ onClose }: WikiPanelProps) {
  const view = useWikiStore((s) => s.view);
  const setView = useWikiStore((s) => s.setView);
  const activeDomain = useWikiStore((s) => s.activeDomain);
  const activeArticle = useWikiStore((s) => s.activeArticle);

  const title =
    view === "article" && activeArticle
      ? activeArticle.meta.title
      : view === "raw"
        ? "Raw Material"
        : (activeDomain ?? "Wiki KB");

  return (
    <div className="bg-bg-base flex h-full flex-col">
      {/* Header */}
      <div
        className="bg-bg-elevated flex shrink-0 items-center gap-2 px-3 py-1.5"
        style={{
          boxShadow: "0 1px 0 var(--color-border)",
        }}
      >
        {(view === "article" || view === "raw") && (
          <button
            onClick={() => setView("browse")}
            className="cursor-pointer rounded p-1 hover:bg-[var(--color-bg-base)]"
            aria-label="Back to browse"
          >
            <ArrowLeft size={14} />
          </button>
        )}
        <BookOpen size={14} className="shrink-0" style={{ color: WIKI_ACCENT }} />
        <span className="text-text-primary flex-1 truncate text-xs font-semibold">{title}</span>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1 hover:bg-[var(--color-bg-base)]"
          aria-label="Close wiki panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === "browse" && <BrowseView />}
        {view === "article" && <ArticleView />}
        {view === "raw" && <RawView />}
      </div>
    </div>
  );
}

// ── Browse View ────────────────────────────────────────────────────────────

function BrowseView() {
  const domains = useWikiStore((s) => s.domains);
  const setDomains = useWikiStore((s) => s.setDomains);
  const activeDomain = useWikiStore((s) => s.activeDomain);
  const setActiveDomain = useWikiStore((s) => s.setActiveDomain);
  const articles = useWikiStore((s) => s.articles);
  const setArticles = useWikiStore((s) => s.setArticles);
  const coreContent = useWikiStore((s) => s.coreContent);
  const setCoreContent = useWikiStore((s) => s.setCoreContent);
  const loading = useWikiStore((s) => s.loading);
  const setLoading = useWikiStore((s) => s.setLoading);
  const setView = useWikiStore((s) => s.setView);
  const setActiveArticle = useWikiStore((s) => s.setActiveArticle);
  const searchQuery = useWikiStore((s) => s.searchQuery);
  const setSearchQuery = useWikiStore((s) => s.setSearchQuery);
  const [showNewDomain, setShowNewDomain] = useState(false);
  const [flaggedSlugs, setFlaggedSlugs] = useState<Set<string>>(new Set());

  const loadDomains = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.wiki.listDomains();
      if (res.success && res.data) {
        setDomains(res.data as WikiDomain[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [setDomains, setLoading]);

  // Load domains on mount
  useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const selectDomain = useCallback(
    async (slug: string) => {
      setActiveDomain(slug);
      setLoading(true);
      try {
        const [articlesRes, coreRes, flagsRes] = await Promise.all([
          api.wiki.listArticles(slug),
          api.wiki.getCore(slug).catch(() => null),
          api.wiki.getFlags(slug).catch(() => null),
        ]);
        if (articlesRes.success && articlesRes.data) {
          setArticles(articlesRes.data as ArticleRef[]);
        }
        if (coreRes?.success && coreRes.data) {
          setCoreContent(coreRes.data.content);
        }
        if (flagsRes?.success && Array.isArray(flagsRes.data)) {
          setFlaggedSlugs(new Set(flagsRes.data.map((f: { slug: string }) => f.slug)));
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    },
    [setActiveDomain, setArticles, setCoreContent, setLoading],
  );

  const openArticle = useCallback(
    async (slug: string) => {
      if (!activeDomain) return;
      try {
        const res = await api.wiki.getArticle(activeDomain, slug);
        if (res.success && res.data) {
          setActiveArticle(res.data as WikiArticle);
          setView("article");
        }
      } catch {
        /* ignore */
      }
    },
    [activeDomain, setActiveArticle, setView],
  );

  const filteredArticles = searchQuery
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : articles;

  if (loading && domains.length === 0 && !activeDomain) {
    return (
      <div className="text-text-secondary flex items-center justify-center gap-2 p-8 text-xs">
        <CircleNotch size={14} className="animate-spin" /> Loading...
      </div>
    );
  }

  // Domain list (no domain selected)
  if (!activeDomain) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary text-xs font-medium">Domains</span>
          <button
            onClick={() => setShowNewDomain(true)}
            className="bg-bg-elevated border-border flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs"
          >
            <Plus size={12} /> New
          </button>
        </div>

        {showNewDomain && (
          <NewDomainForm
            onCreated={() => {
              setShowNewDomain(false);
              loadDomains();
            }}
            onCancel={() => setShowNewDomain(false)}
          />
        )}

        {domains.length === 0 && !showNewDomain && (
          <div className="text-text-secondary p-4 text-center text-xs">
            No wiki domains yet. Create one to start building your knowledge base.
          </div>
        )}

        {domains.map((d) => (
          <button
            key={d.slug}
            onClick={() => selectDomain(d.slug)}
            className="bg-bg-elevated flex cursor-pointer items-center gap-3 rounded-lg p-3 text-left shadow-sm"
          >
            <BookOpen size={18} className="shrink-0" style={{ color: WIKI_ACCENT }} />
            <div className="min-w-0 flex-1">
              <div className="text-text-primary truncate text-sm font-medium">{d.name}</div>
              <div className="text-text-secondary text-xs">
                {d.articleCount} articles &middot; {fmtTokens(d.totalTokens)} tokens
              </div>
            </div>
            {d.hasCore && (
              <ShieldCheck
                size={14}
                className="shrink-0"
                style={{ color: "#10b981" }}
                weight="fill"
              />
            )}
          </button>
        ))}
      </div>
    );
  }

  // Domain selected — show articles
  return (
    <div className="flex flex-col gap-0">
      {/* Domain header + actions */}
      <div className="flex flex-col gap-2 p-3" style={{ boxShadow: "0 1px 0 var(--color-border)" }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveDomain(null)}
            className="text-text-secondary cursor-pointer text-xs hover:underline"
          >
            All domains
          </button>
          <span className="text-text-secondary text-xs">/</span>
          <span className="text-text-primary text-xs font-semibold">{activeDomain}</span>
        </div>

        {/* Search */}
        <div className="shadow-soft bg-bg-elevated flex items-center gap-2 rounded px-2 py-1">
          <MagnifyingGlass size={12} className="text-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles..."
            aria-label="Search wiki articles"
            className="text-text-primary flex-1 bg-transparent text-xs outline-none"
          />
        </div>

        {/* Actions */}
        <div className="relative flex gap-2">
          <button
            onClick={() => setView("raw")}
            className="bg-bg-elevated border-border flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs"
          >
            <Upload size={12} /> Raw Files
          </button>
          <CompileButton domain={activeDomain} onDone={() => selectDomain(activeDomain)} />
          <LintButton domain={activeDomain} />
        </div>
      </div>

      {/* Loading articles */}
      {loading && (
        <div className="text-text-secondary flex items-center justify-center gap-2 p-4 text-xs">
          <CircleNotch size={14} className="animate-spin" /> Loading articles...
        </div>
      )}

      {/* Core rules (pinned) */}
      {!loading && coreContent && (
        <button
          onClick={() => {
            setActiveArticle({
              slug: "_core",
              meta: {
                title: "Core Rules (L0)",
                domain: activeDomain,
                compiledFrom: [],
                compiledBy: "manual",
                compiledAt: "",
                tokens: Math.ceil(coreContent.length / 4),
                tags: ["core", "rules"],
                manuallyEdited: true,
              },
              content: coreContent,
            });
            setView("article");
          }}
          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-left"
          style={{
            boxShadow: "0 1px 0 var(--color-border)",
            background: "rgba(16, 185, 129, 0.05)",
          }}
        >
          <ShieldCheck size={14} style={{ color: "#10b981" }} weight="fill" />
          <span className="text-text-primary flex-1 text-xs font-medium">Core Rules (L0)</span>
          <span className="text-text-secondary text-xs">
            {fmtTokens(Math.ceil(coreContent.length / 4))} tokens
          </span>
        </button>
      )}

      {/* Article list */}
      {!loading && filteredArticles.length === 0 && (
        <div className="text-text-secondary p-4 text-center text-xs">
          {searchQuery
            ? "No articles match your search."
            : "No articles yet. Add raw material and compile."}
        </div>
      )}

      {!loading &&
        filteredArticles.map((a) => (
          <button
            key={a.slug}
            onClick={() => openArticle(a.slug)}
            className="flex cursor-pointer items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-bg-elevated)]"
            style={{ boxShadow: "0 1px 0 var(--color-border)" }}
          >
            <File size={14} className="text-text-secondary shrink-0" style={{ marginTop: 1 }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <div className="text-text-primary truncate text-xs font-medium">{a.title}</div>
                {flaggedSlugs.has(a.slug) && (
                  <Warning
                    size={12}
                    weight="fill"
                    className="shrink-0"
                    style={{ color: "var(--color-warning, #f59e0b)" }}
                  />
                )}
              </div>
              {a.tags.length > 0 && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {a.tags.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="text-text-secondary bg-bg-elevated rounded px-1.5 py-0.5 text-[10px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-0.5 flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-text-secondary text-[10px]">{fmtTokens(a.tokens)}</span>
              {a.confidence && (
                <span
                  className="rounded px-1 text-[9px]"
                  style={{
                    background:
                      a.confidence === "extracted"
                        ? "rgba(16,185,129,0.15)"
                        : a.confidence === "ambiguous"
                          ? "rgba(239,68,68,0.15)"
                          : "rgba(245,158,11,0.15)",
                    color:
                      a.confidence === "extracted"
                        ? "var(--color-success, #10b981)"
                        : a.confidence === "ambiguous"
                          ? "var(--color-danger, #ef4444)"
                          : "var(--color-warning, #f59e0b)",
                  }}
                >
                  {a.confidence}
                </span>
              )}
            </div>
          </button>
        ))}
    </div>
  );
}

// ── New Domain Form ────────────────────────────────────────────────────────

function NewDomainForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const autoSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const handleCreate = async () => {
    const finalSlug = slug || autoSlug;
    if (!finalSlug || finalSlug.length < 2) return;
    setCreating(true);
    try {
      await api.wiki.createDomain(finalSlug, name || finalSlug);
      onCreated();
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-bg-elevated flex flex-col gap-2 rounded-lg p-3 shadow-sm">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Domain name (e.g. Trading)"
        aria-label="Domain name"
        className="text-text-primary border-border rounded bg-transparent px-2 py-1 text-xs outline-none"
        autoFocus
      />
      <input
        type="text"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder={`Slug: ${autoSlug || "trading"}`}
        aria-label="Domain slug"
        className="text-text-primary border-border rounded bg-transparent px-2 py-1 text-xs outline-none"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-text-secondary cursor-pointer rounded px-2 py-1 text-xs"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={creating || (!slug && !autoSlug)}
          className="cursor-pointer rounded px-2 py-1 text-xs font-medium"
          style={{
            background: WIKI_ACCENT,
            color: "#fff",
            opacity: creating || (!slug && !autoSlug) ? 0.5 : 1,
          }}
        >
          {creating ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}

// ── Compile Button ─────────────────────────────────────────────────────────

function CompileButton({ domain, onDone }: { domain: string; onDone: () => void }) {
  const compiling = useWikiStore((s) => s.compiling);
  const setCompiling = useWikiStore((s) => s.setCompiling);

  // Reset compiling state on unmount (prevents stuck spinner)
  useEffect(
    () => () => {
      setCompiling(false);
    },
    [setCompiling],
  );

  const handleCompile = useCallback(async () => {
    if (compiling) return;
    setCompiling(true);
    try {
      await api.wiki.compile(domain);
      onDone();
    } catch {
      /* ignore */
    } finally {
      setCompiling(false);
    }
  }, [compiling, domain, onDone, setCompiling]);

  return (
    <button
      onClick={handleCompile}
      disabled={compiling}
      className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs"
      style={{
        background: compiling ? "var(--color-bg-elevated)" : WIKI_ACCENT,
        color: compiling ? "var(--color-text-secondary)" : "#fff",
        border: compiling ? "1px solid var(--color-border)" : "none",
      }}
    >
      {compiling ? <CircleNotch size={12} className="animate-spin" /> : <Lightning size={12} />}
      {compiling ? "Compiling..." : "Compile"}
    </button>
  );
}

// ── Lint Button ───────────────────────────────────────────────────────────

interface LintIssue {
  target: string;
  severity: string;
  code: string;
  message: string;
}

function LintButton({ domain }: { domain: string }) {
  const [linting, setLinting] = useState(false);
  const [issues, setIssues] = useState<LintIssue[] | null>(null);
  const [showResults, setShowResults] = useState(false);

  const handleLint = useCallback(async () => {
    if (linting) return;
    setLinting(true);
    try {
      const res = await api.wiki.lint(domain);
      if (res.success && res.data) {
        setIssues(res.data.issues);
        setShowResults(true);
      }
    } catch {
      /* ignore */
    } finally {
      setLinting(false);
    }
  }, [linting, domain]);

  const warningCount = issues?.filter((i) => i.severity === "warning").length ?? 0;

  return (
    <>
      <button
        onClick={handleLint}
        disabled={linting}
        className="bg-bg-elevated border-border relative flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs"
        title="Check for stale articles"
      >
        {linting ? <CircleNotch size={12} className="animate-spin" /> : <Warning size={12} />}
        Lint
        {issues !== null && warningCount > 0 && (
          <span
            className="rounded-full px-1 py-0.5 text-center text-[9px] font-bold leading-none"
            style={{ background: "#f59e0b", color: "#000", minWidth: 14 }}
          >
            {warningCount}
          </span>
        )}
      </button>

      {showResults && issues !== null && (
        <div
          className="bg-bg-base fixed z-50 flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg p-3 shadow-lg"
          style={{
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            width: "min(400px, calc(100vw - 2rem))",
            top: "auto",
            marginTop: 4,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-text-primary text-xs font-semibold">Lint Results</span>
            <button
              onClick={() => setShowResults(false)}
              className="text-text-secondary cursor-pointer text-xs"
              aria-label="Close lint results"
            >
              <X size={12} />
            </button>
          </div>
          {issues.length === 0 ? (
            <div className="text-xs" style={{ color: "#10b981" }}>
              All clear — no issues found.
            </div>
          ) : (
            issues.map((issue, i) => (
              <div
                key={`${issue.target}-${issue.code}-${i}`}
                className="text-text-secondary flex items-start gap-1.5 text-[11px]"
              >
                <span
                  style={{
                    color: issue.severity === "warning" ? "#f59e0b" : "var(--color-text-secondary)",
                  }}
                >
                  {issue.severity === "warning" ? "⚠" : "ℹ"}
                </span>
                <span>{issue.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}

// ── Article View ───────────────────────────────────────────────────────────

function ArticleView() {
  const article = useWikiStore((s) => s.activeArticle);
  const activeDomain = useWikiStore((s) => s.activeDomain);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset edit state when article changes
  useEffect(() => {
    setEditing(false);
    setEditContent("");
  }, [article?.slug]);

  const handleSave = useCallback(async () => {
    if (!activeDomain || !article || saving) return;
    setSaving(true);
    try {
      await api.wiki.updateArticle(activeDomain, article.slug, { content: editContent });
      setEditing(false);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }, [activeDomain, article, editContent, saving]);

  if (!article) {
    return <div className="text-text-secondary p-4 text-center text-xs">No article selected.</div>;
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Meta bar */}
      <div
        className="bg-bg-elevated flex flex-wrap gap-x-4 gap-y-1 px-3 py-2"
        style={{
          boxShadow: "0 1px 0 var(--color-border)",
        }}
      >
        <span className="text-text-secondary text-[10px]">
          {fmtTokens(article.meta.tokens)} tokens
        </span>
        {article.meta.compiledBy !== "manual" && (
          <span className="text-text-secondary text-[10px]">by {article.meta.compiledBy}</span>
        )}
        {article.meta.compiledAt && (
          <span className="text-text-secondary text-[10px]">
            {fmtDate(article.meta.compiledAt)}
          </span>
        )}
        {article.meta.confidence && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background:
                article.meta.confidence === "extracted"
                  ? "rgba(16,185,129,0.15)"
                  : article.meta.confidence === "ambiguous"
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(245,158,11,0.15)",
              color:
                article.meta.confidence === "extracted"
                  ? "var(--color-success, #10b981)"
                  : article.meta.confidence === "ambiguous"
                    ? "var(--color-danger, #ef4444)"
                    : "var(--color-warning, #f59e0b)",
            }}
          >
            {article.meta.confidence}
          </span>
        )}
        {article.meta.sourceUrl && (
          <a
            href={article.meta.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] underline"
            style={{ color: "var(--color-accent, #6366f1)" }}
          >
            source
          </a>
        )}
        {article.meta.tags.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag size={10} className="text-text-secondary" />
            {article.meta.tags.map((t) => (
              <span key={t} className="text-text-secondary text-[10px]">
                {t}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={() => {
            if (!editing) {
              setEditContent(article.content);
              setEditing(true);
            } else {
              setEditing(false);
            }
          }}
          className="text-text-secondary ml-auto flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
          style={{ background: "var(--color-bg-base)" }}
        >
          <PencilSimple size={10} /> {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {/* Content */}
      {editing ? (
        <div className="flex flex-col gap-2 p-3">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="text-text-primary border-border min-h-[300px] w-full resize-y rounded bg-transparent p-2 font-mono text-xs outline-none"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer self-end rounded px-3 py-1 text-xs font-medium"
            style={{ background: WIKI_ACCENT, color: "#fff", opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      ) : (
        <div className="text-text-primary whitespace-pre-wrap p-3 text-xs leading-relaxed">
          {article.content}
        </div>
      )}

      {/* Source files */}
      {article.meta.compiledFrom.length > 0 && (
        <div className="px-3 py-2" style={{ boxShadow: "0 -1px 0 var(--color-border)" }}>
          <span className="text-text-secondary text-[10px] font-medium">Compiled from:</span>
          <div className="mt-1 flex flex-col gap-0.5">
            {article.meta.compiledFrom.map((f) => (
              <span key={f} className="text-text-secondary font-mono text-[10px]">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Raw Material View ──────────────────────────────────────────────────────

function RawView() {
  const activeDomain = useWikiStore((s) => s.activeDomain);
  const rawFiles = useWikiStore((s) => s.rawFiles);
  const setRawFiles = useWikiStore((s) => s.setRawFiles);
  const [loading, setLoading] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const [pasteName, setPasteName] = useState("");

  const loadRawFiles = useCallback(async () => {
    if (!activeDomain) return;
    setLoading(true);
    try {
      const res = await api.wiki.listRawFiles(activeDomain);
      if (res.success && res.data) {
        setRawFiles(res.data as RawFile[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [activeDomain, setRawFiles]);

  useEffect(() => {
    if (activeDomain) loadRawFiles();
  }, [activeDomain, loadRawFiles]);

  const handlePaste = async () => {
    if (!activeDomain || !pasteContent || !pasteName) return;
    const safe = sanitizeFilename(pasteName);
    if (!safe) return;
    const filename = safe.endsWith(".md") ? safe : `${safe}.md`;
    try {
      await api.wiki.uploadRaw(activeDomain, filename, pasteContent);
      setPasteMode(false);
      setPasteContent("");
      setPasteName("");
      loadRawFiles();
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (filename: string) => {
    if (!activeDomain) return;
    try {
      await api.wiki.deleteRaw(activeDomain, filename);
      loadRawFiles();
    } catch {
      /* ignore */
    }
  };

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (!activeDomain) return;

      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        // Guard: file type + size
        const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        if (!ALLOWED_DROP_EXTS.has(ext) || file.size > MAX_DROP_SIZE) continue;

        const text = await file.text();
        try {
          await api.wiki.uploadRaw(activeDomain, file.name, text);
        } catch {
          /* ignore */
        }
      }
      loadRawFiles();
    },
    [activeDomain, loadRawFiles],
  );

  return (
    <div className="flex flex-col gap-0">
      {/* Drop zone */}
      <div
        className="bg-bg-elevated m-3 flex cursor-pointer flex-col items-center gap-2 rounded-lg p-4"
        style={{
          border: "2px dashed var(--color-border)",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        onClick={() => setPasteMode(true)}
      >
        <Upload size={20} className="text-text-secondary" />
        <span className="text-text-secondary text-xs">Drop files here or click to paste text</span>
        <span className="text-text-secondary text-[10px]">
          Supports .md, .txt, .json (max 1 MB)
        </span>
      </div>

      {/* Paste form */}
      {pasteMode && (
        <div className="bg-bg-elevated mx-3 mb-3 flex flex-col gap-2 rounded-lg p-3 shadow-sm">
          <input
            type="text"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder="Filename (e.g. research-notes)"
            aria-label="Raw file name"
            className="text-text-primary border-border rounded bg-transparent px-2 py-1 text-xs outline-none"
            autoFocus
          />
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Paste your raw material here..."
            aria-label="Raw file content"
            className="text-text-primary border-border min-h-[120px] w-full resize-y rounded bg-transparent p-2 font-mono text-xs outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setPasteMode(false);
                setPasteContent("");
                setPasteName("");
              }}
              className="text-text-secondary cursor-pointer rounded px-2 py-1 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handlePaste}
              disabled={!pasteContent || !pasteName}
              className="cursor-pointer rounded px-2 py-1 text-xs font-medium"
              style={{
                background: WIKI_ACCENT,
                color: "#fff",
                opacity: !pasteContent || !pasteName ? 0.5 : 1,
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="text-text-secondary flex items-center justify-center gap-2 p-4 text-xs">
          <CircleNotch size={14} className="animate-spin" /> Loading...
        </div>
      ) : rawFiles.length === 0 ? (
        <div className="text-text-secondary p-4 text-center text-xs">
          No raw files yet. Drop files or paste text above.
        </div>
      ) : (
        rawFiles.map((f) => (
          <div
            key={f.name}
            className="flex items-center gap-2 px-3 py-2"
            style={{ boxShadow: "0 1px 0 var(--color-border)" }}
          >
            <File size={14} className="text-text-secondary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-text-primary truncate text-xs">{f.name}</div>
              <div className="text-text-secondary text-[10px]">
                {fmtBytes(f.sizeBytes)} &middot; {fmtDate(f.modifiedAt)}
              </div>
            </div>
            <button
              onClick={() => handleDelete(f.name)}
              className="cursor-pointer rounded p-1 hover:bg-[var(--color-bg-elevated)]"
              aria-label={`Delete ${f.name}`}
            >
              <Trash size={12} className="text-text-secondary" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
