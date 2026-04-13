"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  CaretRight,
  CaretDown,
  FileText,
  FolderOpen,
  Folder,
  Package,
  CircleNotch,
  Warning,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

// ── Types ───────────────────────────────────────────────────────────

interface SkillLeaf {
  name: string;
  description: string;
  filePath: string;
}

interface SkillGroup {
  id: string;
  label: string;
  source: string;
  skills: SkillLeaf[];
}

// ── Skill Tree Node ─────────────────────────────────────────────────

function SkillTreeGroup({
  group,
  selectedPath,
  onSelect,
}: {
  group: SkillGroup;
  selectedPath: string | null;
  onSelect: (skill: SkillLeaf) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-text-primary flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
        style={{
          background: "transparent",
        }}
        aria-expanded={expanded}
        aria-controls={`skill-group-${group.id}`}
      >
        {expanded ? (
          <CaretDown size={12} weight="bold" className="text-text-muted" />
        ) : (
          <CaretRight size={12} weight="bold" className="text-text-muted" />
        )}
        {expanded ? (
          <FolderOpen size={15} weight="duotone" className="text-accent" />
        ) : (
          <Folder size={15} weight="duotone" className="text-accent" />
        )}
        <span>{group.label}</span>
        <span className="text-text-muted bg-bg-elevated ml-auto rounded-md px-1.5 py-0.5 text-xs">
          {group.skills.length}
        </span>
      </button>

      {/* Skill leaves + source path */}
      {expanded && (
        <div id={`skill-group-${group.id}`} role="group" aria-label={group.label}>
          {/* Source path */}
          <div className="text-text-muted px-3 pb-1 pl-9 text-xs">{group.source}</div>

          <div className="pl-4">
            {group.skills.map((skill) => {
              const isSelected = selectedPath === skill.filePath;
              return (
                <button
                  key={skill.filePath}
                  onClick={() => onSelect(skill)}
                  title={skill.description || skill.name}
                  aria-label={`${skill.name}${skill.description ? ` — ${skill.description}` : ""}`}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors"
                  style={{
                    color: isSelected ? "var(--color-accent)" : "var(--color-text-secondary)",
                    background: isSelected
                      ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                      : "transparent",
                    fontWeight: isSelected ? 500 : 400,
                  }}
                >
                  <FileText
                    size={14}
                    weight={isSelected ? "fill" : "regular"}
                    className="shrink-0"
                    style={{
                      color: isSelected ? "var(--color-accent)" : "var(--color-text-muted)",
                    }}
                  />
                  <span className="truncate">{skill.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Markdown Preview ────────────────────────────────────────────────

function SkillPreview({
  skill,
  content,
  loading,
}: {
  skill: SkillLeaf | null;
  content: string | null;
  loading: boolean;
}) {
  if (!skill) {
    return (
      <div className="text-text-muted flex h-full flex-col items-center justify-center gap-2">
        <Package size={32} weight="duotone" />
        <span className="text-sm">Select a skill to preview</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <CircleNotch size={24} weight="bold" className="text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div
        className="bg-bg-card shadow-soft sticky top-0 px-4 py-3"
      >
        <h3 className="text-text-primary text-sm font-semibold">{skill.name}</h3>
        {skill.description && <p className="text-text-muted mt-0.5 text-xs">{skill.description}</p>}
      </div>

      {/* Content — plain preformatted markdown */}
      <pre
        className="text-text-secondary whitespace-pre-wrap break-words px-4 py-3 text-xs leading-relaxed"
        style={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        }}
      >
        {content ?? "No content available"}
      </pre>
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-text-muted flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      <Package size={40} weight="duotone" />
      <div>
        <p className="text-text-secondary text-sm font-medium">No skills found</p>
        <p className="mt-1 text-xs">
          Skills are loaded from{" "}
          <code className="bg-bg-elevated rounded px-1 py-0.5">~/.claude/skills/</code> and{" "}
          <code className="bg-bg-elevated rounded px-1 py-0.5">~/.rune/skills/</code>
        </p>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function SkillsTab() {
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillLeaf | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const selectGenRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groups;

    return groups
      .map((group) => ({
        ...group,
        skills: group.skills.filter(
          (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.skills.length > 0);
  }, [groups, searchQuery]);

  // Clear selection if filtered groups no longer contain it
  useEffect(() => {
    if (
      selectedSkill &&
      !filteredGroups.some((g) => g.skills.some((s) => s.filePath === selectedSkill.filePath))
    ) {
      setSelectedSkill(null);
      setPreviewContent(null);
    }
  }, [filteredGroups, selectedSkill]);

  // Fetch skill groups
  useEffect(() => {
    let cancelled = false;

    async function fetchSkills() {
      try {
        const res = await api.get<{ success: boolean; data: SkillGroup[] }>("/api/skills");
        if (cancelled) return;
        if (Array.isArray(res.data)) {
          setGroups(res.data);
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load skills");
          setLoading(false);
        }
      }
    }

    fetchSkills();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch skill content on selection (race-safe via generation counter)
  const handleSelect = useCallback(async (skill: SkillLeaf) => {
    const gen = ++selectGenRef.current;
    setSelectedSkill(skill);
    setPreviewLoading(true);
    setPreviewContent(null);

    try {
      const res = await api.get<{ success: boolean; data: { content: string } }>(
        `/api/skills/content?path=${encodeURIComponent(skill.filePath)}`,
      );
      if (gen !== selectGenRef.current) return; // stale response
      setPreviewContent(res.data?.content ?? "No content available");
    } catch (err) {
      if (gen !== selectGenRef.current) return;
      const msg = err instanceof Error ? err.message : "Failed to load";
      setPreviewContent(`Error: ${msg}`);
    } finally {
      if (gen === selectGenRef.current) setPreviewLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <CircleNotch size={24} weight="bold" className="text-accent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-text-muted flex h-64 flex-col items-center justify-center gap-2">
        <Warning size={32} weight="duotone" style={{ color: "var(--color-danger, #ef4444)" }} />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Search input */}
          <div className="relative">
            <MagnifyingGlass
              size={14}
              weight="bold"
              className="text-text-muted absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              type="text"
              placeholder="Filter skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-text-primary bg-bg-base w-full rounded-lg py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              aria-label="Filter skills by name"
            />
          </div>

          {/* Tree browser */}
          <div
            className="shadow-soft flex overflow-hidden rounded-xl "
            style={{
              height: "min(480px, 60vh)",
            }}
          >
            {/* Left: Tree */}
            <div
              className="bg-bg-base shrink-0 overflow-y-auto py-2"
              style={{
                width: "clamp(180px, 35%, 280px)",
              }}
            >
              {filteredGroups.length === 0 ? (
                <div className="text-text-muted flex h-32 flex-col items-center justify-center gap-1">
                  <MagnifyingGlass size={20} weight="duotone" />
                  <span className="text-xs">No matches</span>
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <SkillTreeGroup
                    key={group.id}
                    group={group}
                    selectedPath={selectedSkill?.filePath ?? null}
                    onSelect={handleSelect}
                  />
                ))
              )}
            </div>

            {/* Right: Preview */}
            <div className="bg-bg-card min-w-0 flex-1">
              <SkillPreview
                skill={selectedSkill}
                content={previewContent}
                loading={previewLoading}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
