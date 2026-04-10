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
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-semibold transition-colors cursor-pointer rounded-lg"
        style={{
          color: "var(--color-text-primary)",
          background: "transparent",
        }}
        aria-expanded={expanded}
        aria-controls={`skill-group-${group.id}`}
      >
        {expanded ? (
          <CaretDown size={12} weight="bold" style={{ color: "var(--color-text-muted)" }} />
        ) : (
          <CaretRight size={12} weight="bold" style={{ color: "var(--color-text-muted)" }} />
        )}
        {expanded ? (
          <FolderOpen size={15} weight="duotone" style={{ color: "var(--color-accent)" }} />
        ) : (
          <Folder size={15} weight="duotone" style={{ color: "var(--color-accent)" }} />
        )}
        <span>{group.label}</span>
        <span
          className="ml-auto text-xs px-1.5 py-0.5 rounded-md"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-muted)",
          }}
        >
          {group.skills.length}
        </span>
      </button>

      {/* Skill leaves + source path */}
      {expanded && (
        <div id={`skill-group-${group.id}`} role="group" aria-label={group.label}>
          {/* Source path */}
          <div className="text-xs px-3 pl-9 pb-1" style={{ color: "var(--color-text-muted)" }}>
            {group.source}
          </div>

          <div className="pl-4">
            {group.skills.map((skill) => {
              const isSelected = selectedPath === skill.filePath;
              return (
                <button
                  key={skill.filePath}
                  onClick={() => onSelect(skill)}
                  title={skill.description || skill.name}
                  aria-label={`${skill.name}${skill.description ? ` — ${skill.description}` : ""}`}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm transition-colors cursor-pointer rounded-lg"
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
                    style={{
                      color: isSelected ? "var(--color-accent)" : "var(--color-text-muted)",
                      flexShrink: 0,
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
      <div
        className="flex flex-col items-center justify-center h-full gap-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        <Package size={32} weight="duotone" />
        <span className="text-sm">Select a skill to preview</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <CircleNotch
          size={24}
          weight="bold"
          className="animate-spin"
          style={{ color: "var(--color-accent)" }}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div
        className="px-4 py-3 sticky top-0"
        style={{
          background: "var(--color-bg-card)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {skill.name}
        </h3>
        {skill.description && (
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {skill.description}
          </p>
        )}
      </div>

      {/* Content — plain preformatted markdown */}
      <pre
        className="px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap break-words"
        style={{
          color: "var(--color-text-secondary)",
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
    <div
      className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6"
      style={{ color: "var(--color-text-muted)" }}
    >
      <Package size={40} weight="duotone" />
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
          No skills found
        </p>
        <p className="text-xs mt-1">
          Skills are loaded from{" "}
          <code className="px-1 py-0.5 rounded" style={{ background: "var(--color-bg-elevated)" }}>
            ~/.claude/skills/
          </code>{" "}
          and{" "}
          <code className="px-1 py-0.5 rounded" style={{ background: "var(--color-bg-elevated)" }}>
            ~/.rune/skills/
          </code>
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
      <div className="flex items-center justify-center h-64">
        <CircleNotch
          size={24}
          weight="bold"
          className="animate-spin"
          style={{ color: "var(--color-accent)" }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center h-64 gap-2"
        style={{ color: "var(--color-text-muted)" }}
      >
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
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--color-text-muted)" }}
            />
            <input
              type="text"
              placeholder="Filter skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
              style={{
                background: "var(--color-bg-base)",
                border: "1px solid var(--glass-border)",
                color: "var(--color-text-primary)",
              }}
              aria-label="Filter skills by name"
            />
          </div>

          {/* Tree browser */}
          <div
            className="flex rounded-xl overflow-hidden"
            style={{
              border: "1px solid var(--glass-border)",
              height: "min(480px, 60vh)",
            }}
          >
            {/* Left: Tree */}
            <div
              className="shrink-0 overflow-y-auto py-2"
              style={{
                width: "clamp(180px, 35%, 280px)",
                borderRight: "1px solid var(--glass-border)",
                background: "var(--color-bg-base)",
              }}
            >
              {filteredGroups.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-32 gap-1"
                  style={{ color: "var(--color-text-muted)" }}
                >
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
            <div className="flex-1 min-w-0" style={{ background: "var(--color-bg-card)" }}>
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
