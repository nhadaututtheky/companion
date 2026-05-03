"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CircleNotch, Lightning, ToggleLeft, ToggleRight } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

interface HarnessSkillRow {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  tools: string[];
  priority: number;
  filePath: string;
  enabled: boolean;
  explicit: boolean;
}

interface ProjectRow {
  slug: string;
  name: string;
  dir: string;
}

export function HarnessSkillsPanel() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [skills, setSkills] = useState<HarnessSkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const selectedProject = useMemo(
    () => projects.find((p) => p.slug === selectedSlug) ?? null,
    [projects, selectedSlug],
  );

  // Load projects once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ data: ProjectRow[] }>("/api/projects");
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setProjects(list);
        if (list.length > 0) setSelectedSlug(list[0]!.slug);
        else setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load projects");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload harness skills when project changes
  const reloadSkills = useCallback(async (project: ProjectRow) => {
    setLoading(true);
    setError(null);
    setPending(new Set());
    try {
      const params = new URLSearchParams({
        projectDir: project.dir,
        projectSlug: project.slug,
      });
      const res = await api.get<{ data: HarnessSkillRow[] }>(
        `/api/skills/harness?${params.toString()}`,
      );
      setSkills(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load harness skills");
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProject) {
      void reloadSkills(selectedProject);
    }
  }, [selectedProject, reloadSkills]);

  const handleToggle = useCallback(
    async (skillId: string, nextEnabled: boolean) => {
      if (!selectedProject) return;
      setPending((prev) => new Set(prev).add(skillId));
      // Optimistic update
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? { ...s, enabled: nextEnabled, explicit: true } : s)),
      );
      try {
        await api.post("/api/skills/harness/toggle", {
          projectSlug: selectedProject.slug,
          skillId,
          enabled: nextEnabled,
        });
      } catch (err) {
        // Revert on failure
        setError(err instanceof Error ? err.message : "Toggle failed");
        await reloadSkills(selectedProject);
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(skillId);
          return next;
        });
      }
    },
    [selectedProject, reloadSkills],
  );

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <CircleNotch size={20} weight="bold" className="text-accent animate-spin" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-text-muted bg-bg-base rounded-lg p-4 text-sm">
        No projects yet. Create a project to configure harness activation rules.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightning size={16} weight="duotone" className="text-accent" />
          <h3 className="text-text-primary text-sm font-semibold">Harness Activation</h3>
        </div>
        {projects.length > 1 && (
          <select
            value={selectedSlug ?? ""}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="text-text-primary bg-bg-base rounded-md px-2 py-1 text-xs"
            aria-label="Select project"
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-text-muted text-xs">
        Skills with triggers + tools are injected into adapter context to teach
        agents when to call Companion MCP tools. Toggle off to suppress per-project.
      </p>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {skills.length === 0 ? (
        <div className="text-text-muted bg-bg-base rounded-lg p-4 text-sm">
          No harness skills found in <code>.claude/skills/</code> for this project.
        </div>
      ) : (
        <ul className="divide-bg-elevated bg-bg-base divide-y rounded-lg" role="list">
          {skills.map((skill) => {
            const busy = pending.has(skill.id);
            return (
              <li key={skill.id} className="flex items-start gap-3 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => handleToggle(skill.id, !skill.enabled)}
                  disabled={busy}
                  className="mt-0.5 cursor-pointer disabled:opacity-50"
                  aria-pressed={skill.enabled}
                  aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
                  title={skill.enabled ? "Click to disable" : "Click to enable"}
                >
                  {skill.enabled ? (
                    <ToggleRight size={26} weight="fill" className="text-accent" />
                  ) : (
                    <ToggleLeft size={26} weight="fill" className="text-text-muted" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary text-sm font-medium">{skill.name}</span>
                    <span className="text-text-muted bg-bg-elevated rounded px-1.5 py-0.5 text-[10px]">
                      P{skill.priority}
                    </span>
                    {!skill.explicit && (
                      <span className="text-text-muted text-[10px] italic">default</span>
                    )}
                  </div>
                  <p className="text-text-muted mt-0.5 text-xs">{skill.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.tools.map((t) => (
                      <code
                        key={t}
                        className="bg-bg-elevated text-text-secondary rounded px-1.5 py-0.5 text-[10px]"
                      >
                        {t}
                      </code>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
