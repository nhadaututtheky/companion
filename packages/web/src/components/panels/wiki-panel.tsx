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
        : activeDomain ?? "Wiki KB";

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--color-bg-base)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg-elevated)",
        }}
      >
        {(view === "article" || view === "raw") && (
          <button
            onClick={() => setView("browse")}
            className="p-1 rounded hover:bg-[var(--color-bg-base)] cursor-pointer"
            aria-label="Back to browse"
          >
            <ArrowLeft size={14} />
          </button>
        )}
        <BookOpen size={14} style={{ color: WIKI_ACCENT, flexShrink: 0 }} />
        <span
          className="text-xs font-semibold truncate flex-1"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-bg-base)] cursor-pointer"
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
        const [articlesRes, coreRes] = await Promise.all([
          api.wiki.listArticles(slug),
          api.wiki.getCore(slug).catch(() => null),
        ]);
        if (articlesRes.success && articlesRes.data) {
          setArticles(articlesRes.data as ArticleRef[]);
        }
        if (coreRes?.success && coreRes.data) {
          setCoreContent(coreRes.data.content);
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
      <div className="flex items-center justify-center p-8 gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
        <CircleNotch size={14} className="animate-spin" /> Loading...
      </div>
    );
  }

  // Domain list (no domain selected)
  if (!activeDomain) {
    return (
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Domains
          </span>
          <button
            onClick={() => setShowNewDomain(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer"
            style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
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
          <div className="text-xs p-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
            No wiki domains yet. Create one to start building your knowledge base.
          </div>
        )}

        {domains.map((d) => (
          <button
            key={d.slug}
            onClick={() => selectDomain(d.slug)}
            className="flex items-center gap-3 p-3 rounded-lg text-left cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
          >
            <BookOpen size={18} style={{ color: WIKI_ACCENT, flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                {d.name}
              </div>
              <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {d.articleCount} articles &middot; {fmtTokens(d.totalTokens)} tokens
              </div>
            </div>
            {d.hasCore && (
              <ShieldCheck size={14} style={{ color: "#10b981", flexShrink: 0 }} weight="fill" />
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
      <div className="p-3 flex flex-col gap-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveDomain(null)}
            className="text-xs cursor-pointer hover:underline"
            style={{ color: "var(--color-text-secondary)" }}
          >
            All domains
          </button>
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>/</span>
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {activeDomain}
          </span>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 rounded px-2 py-1"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        >
          <MagnifyingGlass size={12} style={{ color: "var(--color-text-secondary)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles..."
            aria-label="Search wiki articles"
            className="flex-1 text-xs bg-transparent outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 relative">
          <button
            onClick={() => setView("raw")}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer"
            style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
          >
            <Upload size={12} /> Raw Files
          </button>
          <CompileButton domain={activeDomain} onDone={() => selectDomain(activeDomain)} />
          <LintButton domain={activeDomain} />
        </div>
      </div>

      {/* Loading articles */}
      {loading && (
        <div className="flex items-center justify-center p-4 gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
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
          className="flex items-center gap-2 px-3 py-2 text-left cursor-pointer"
          style={{
            borderBottom: "1px solid var(--color-border)",
            background: "rgba(16, 185, 129, 0.05)",
          }}
        >
          <ShieldCheck size={14} style={{ color: "#10b981" }} weight="fill" />
          <span className="text-xs font-medium flex-1" style={{ color: "var(--color-text-primary)" }}>
            Core Rules (L0)
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            {fmtTokens(Math.ceil(coreContent.length / 4))} tokens
          </span>
        </button>
      )}

      {/* Article list */}
      {!loading && filteredArticles.length === 0 && (
        <div className="text-xs p-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
          {searchQuery
            ? "No articles match your search."
            : "No articles yet. Add raw material and compile."}
        </div>
      )}

      {!loading && filteredArticles.map((a) => (
        <button
          key={a.slug}
          onClick={() => openArticle(a.slug)}
          className="flex items-start gap-2 px-3 py-2 text-left cursor-pointer hover:bg-[var(--color-bg-elevated)]"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <File size={14} style={{ color: "var(--color-text-secondary)", marginTop: 1, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
              {a.title}
            </div>
            {a.tags.length > 0 && (
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {a.tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            {fmtTokens(a.tokens)}
          </span>
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

  const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
    <div
      className="flex flex-col gap-2 p-3 rounded-lg"
      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Domain name (e.g. Trading)"
        aria-label="Domain name"
        className="text-xs bg-transparent outline-none px-2 py-1 rounded"
        style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        autoFocus
      />
      <input
        type="text"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder={`Slug: ${autoSlug || "trading"}`}
        aria-label="Domain slug"
        className="text-xs bg-transparent outline-none px-2 py-1 rounded"
        style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 rounded cursor-pointer"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={creating || (!slug && !autoSlug)}
          className="text-xs px-2 py-1 rounded cursor-pointer font-medium"
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
  useEffect(() => () => { setCompiling(false); }, [setCompiling]);

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
      className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer"
      style={{
        background: compiling ? "var(--color-bg-elevated)" : WIKI_ACCENT,
        color: compiling ? "var(--color-text-secondary)" : "#fff",
        border: compiling ? "1px solid var(--color-border)" : "none",
      }}
    >
      {compiling ? (
        <CircleNotch size={12} className="animate-spin" />
      ) : (
        <Lightning size={12} />
      )}
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
        className="flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer relative"
        style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        title="Check for stale articles"
      >
        {linting ? (
          <CircleNotch size={12} className="animate-spin" />
        ) : (
          <Warning size={12} />
        )}
        Lint
        {issues !== null && warningCount > 0 && (
          <span
            className="text-[9px] font-bold px-1 py-0.5 rounded-full leading-none"
            style={{ background: "#f59e0b", color: "#000", minWidth: 14, textAlign: "center" }}
          >
            {warningCount}
          </span>
        )}
      </button>

      {showResults && issues !== null && (
        <div
          className="absolute left-0 right-0 z-20 rounded-lg mx-3 mt-1 p-3 flex flex-col gap-1.5 max-h-48 overflow-y-auto"
          style={{
            background: "var(--color-bg-base)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Lint Results
            </span>
            <button
              onClick={() => setShowResults(false)}
              className="text-xs cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
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
                className="text-[11px] flex items-start gap-1.5"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <span style={{ color: issue.severity === "warning" ? "#f59e0b" : "var(--color-text-secondary)" }}>
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
    return (
      <div className="p-4 text-xs text-center" style={{ color: "var(--color-text-secondary)" }}>
        No article selected.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Meta bar */}
      <div
        className="px-3 py-2 flex flex-wrap gap-x-4 gap-y-1"
        style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-elevated)" }}
      >
        <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
          {fmtTokens(article.meta.tokens)} tokens
        </span>
        {article.meta.compiledBy !== "manual" && (
          <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
            by {article.meta.compiledBy}
          </span>
        )}
        {article.meta.compiledAt && (
          <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
            {new Date(article.meta.compiledAt).toLocaleDateString()}
          </span>
        )}
        {article.meta.tags.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag size={10} style={{ color: "var(--color-text-secondary)" }} />
            {article.meta.tags.map((t) => (
              <span key={t} className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
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
          className="ml-auto flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
          style={{ background: "var(--color-bg-base)", color: "var(--color-text-secondary)" }}
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
            className="w-full text-xs bg-transparent outline-none rounded p-2 font-mono min-h-[300px] resize-y"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-end text-xs px-3 py-1 rounded cursor-pointer font-medium"
            style={{ background: WIKI_ACCENT, color: "#fff", opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      ) : (
        <div
          className="p-3 text-xs leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--color-text-primary)" }}
        >
          {article.content}
        </div>
      )}

      {/* Source files */}
      {article.meta.compiledFrom.length > 0 && (
        <div className="px-3 py-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          <span className="text-[10px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Compiled from:
          </span>
          <div className="flex flex-col gap-0.5 mt-1">
            {article.meta.compiledFrom.map((f) => (
              <span key={f} className="text-[10px] font-mono" style={{ color: "var(--color-text-secondary)" }}>
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
        className="m-3 p-4 rounded-lg flex flex-col items-center gap-2 cursor-pointer"
        style={{
          border: "2px dashed var(--color-border)",
          background: "var(--color-bg-elevated)",
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        onClick={() => setPasteMode(true)}
      >
        <Upload size={20} style={{ color: "var(--color-text-secondary)" }} />
        <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          Drop files here or click to paste text
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
          Supports .md, .txt, .json (max 1 MB)
        </span>
      </div>

      {/* Paste form */}
      {pasteMode && (
        <div className="mx-3 mb-3 flex flex-col gap-2 p-3 rounded-lg"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        >
          <input
            type="text"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder="Filename (e.g. research-notes)"
            aria-label="Raw file name"
            className="text-xs bg-transparent outline-none px-2 py-1 rounded"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            autoFocus
          />
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Paste your raw material here..."
            aria-label="Raw file content"
            className="w-full text-xs bg-transparent outline-none rounded p-2 font-mono min-h-[120px] resize-y"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setPasteMode(false); setPasteContent(""); setPasteName(""); }}
              className="text-xs px-2 py-1 rounded cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Cancel
            </button>
            <button
              onClick={handlePaste}
              disabled={!pasteContent || !pasteName}
              className="text-xs px-2 py-1 rounded cursor-pointer font-medium"
              style={{ background: WIKI_ACCENT, color: "#fff", opacity: !pasteContent || !pasteName ? 0.5 : 1 }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center p-4 gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          <CircleNotch size={14} className="animate-spin" /> Loading...
        </div>
      ) : rawFiles.length === 0 ? (
        <div className="text-xs p-4 text-center" style={{ color: "var(--color-text-secondary)" }}>
          No raw files yet. Drop files or paste text above.
        </div>
      ) : (
        rawFiles.map((f) => (
          <div
            key={f.name}
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <File size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate" style={{ color: "var(--color-text-primary)" }}>
                {f.name}
              </div>
              <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                {fmtBytes(f.sizeBytes)} &middot; {new Date(f.modifiedAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => handleDelete(f.name)}
              className="p-1 rounded cursor-pointer hover:bg-[var(--color-bg-elevated)]"
              aria-label={`Delete ${f.name}`}
            >
              <Trash size={12} style={{ color: "var(--color-text-secondary)" }} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
