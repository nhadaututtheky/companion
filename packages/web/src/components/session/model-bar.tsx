"use client";
import { useState, useCallback } from "react";
import { Lightning, X, Plus } from "@phosphor-icons/react";
import { ModelDropdown } from "./model-dropdown";
import { api } from "@/lib/api-client";
import { getPersonaById } from "@companion/shared";
import { PersonaAvatar } from "@/components/persona/persona-avatar";

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  contextWindow: number;
  free: boolean;
  capabilities: { toolUse: boolean; streaming: boolean; vision: boolean; reasoning: boolean };
  /** Expert Mode persona ID assigned to this debate participant */
  personaId?: string;
}

interface ModelBarProps {
  /** Current main session model (e.g. "claude-sonnet-4-6") */
  mainModel: string;
  /** Active debate participant models */
  debateParticipants: ModelInfo[];
  /** Called when user tags a free model into debate */
  onAddParticipant: (model: ModelInfo) => void;
  /** Called when user removes a debate participant */
  onRemoveParticipant: (modelId: string) => void;
  disabled?: boolean;
}

/** Compact bar below the composer showing main model + debate participants */
export function ModelBar({
  mainModel,
  debateParticipants,
  onAddParticipant,
  onRemoveParticipant,
  disabled,
}: ModelBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchModels = useCallback(async () => {
    if (availableModels.length > 0) return; // already loaded
    setLoading(true);
    try {
      const res = await api.models.list();
      const models: ModelInfo[] = [];
      for (const group of [...res.data.free, ...res.data.configured]) {
        for (const m of group.models) {
          models.push({
            id: m.id,
            name: m.name,
            provider: m.provider,
            providerName: group.provider.name,
            contextWindow: m.contextWindow,
            free: m.free,
            capabilities: m.capabilities,
          });
        }
      }
      setAvailableModels(models);
    } catch {
      // Failed to load — dropdown will show empty
    } finally {
      setLoading(false);
    }
  }, [availableModels.length]);

  const handleOpenDropdown = () => {
    if (disabled) return;
    setDropdownOpen(true);
    fetchModels();
  };

  const mainModelLabel = formatModelName(mainModel);

  return (
    <div className="text-text-muted flex items-center gap-1.5 px-1 py-0.5 text-xs">
      {/* Main session model chip */}
      <span
        className="text-text-secondary bg-bg-elevated inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium"
        style={{
          fontSize: 11,
        }}
        title={`Main session: ${mainModel}`}
      >
        <Lightning size={11} weight="fill" className="text-accent" />
        {mainModelLabel}
      </span>

      {/* Debate participant chips */}
      {debateParticipants.map((p) => {
        const persona = p.personaId ? getPersonaById(p.personaId) : undefined;
        return (
          <span
            key={p.id}
            className="group inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium"
            style={{
              background: "#10b98115",
              color: "#10b981",
              fontSize: 11,
            }}
            title={`${p.name} (${p.providerName})${persona ? ` — ${persona.name}` : ""} — Context: ${formatContextWindow(p.contextWindow)}`}
          >
            {persona && <PersonaAvatar persona={persona} size={14} showBadge={false} />}
            {p.free && (
              <span
                className="font-bold"
                style={{
                  fontSize: 9,
                  padding: "0 3px",
                  borderRadius: "var(--radius-xs)",
                  background: "#10b98120",
                }}
              >
                FREE
              </span>
            )}
            {p.name}
            <button
              onClick={() => onRemoveParticipant(p.id)}
              className="cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: "#10b981" }}
              aria-label={`Remove ${p.name} from debate`}
            >
              <X size={10} weight="bold" />
            </button>
          </span>
        );
      })}

      {/* Add model button */}
      <div className="relative">
        <button
          onClick={handleOpenDropdown}
          disabled={disabled}
          className="text-text-muted inline-flex cursor-pointer items-center gap-0.5 rounded-md px-1.5 py-0.5 transition-colors disabled:opacity-40"
          style={{
            fontSize: 11,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          aria-label="Add model to debate"
          title="Tag a free model into debate"
        >
          <Plus size={11} weight="bold" />
          <span>Model</span>
        </button>

        {dropdownOpen && (
          <ModelDropdown
            models={availableModels}
            activeIds={new Set(debateParticipants.map((p) => p.id))}
            mainModelId={mainModel}
            loading={loading}
            onSelect={(model) => {
              onAddParticipant(model);
              setDropdownOpen(false);
            }}
            onClose={() => setDropdownOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function formatModelName(model: string): string {
  if (model.includes("sonnet")) return "Sonnet 4.6";
  if (model.includes("opus")) return "Opus 4.6";
  if (model.includes("haiku")) return "Haiku 4.5";
  // Strip common prefixes
  return model.replace(/^(claude-|openai\/|anthropic\/)/, "");
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}
