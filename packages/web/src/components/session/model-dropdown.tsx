"use client";
import { useRef, useEffect } from "react";
import { CircleNotch, Eye, Brain, Lightning } from "@phosphor-icons/react";
import type { ModelInfo } from "./model-bar";

interface ModelDropdownProps {
  models: ModelInfo[];
  activeIds: Set<string>;
  mainModelId: string;
  loading: boolean;
  onSelect: (model: ModelInfo) => void;
  onClose: () => void;
}

/** Dropdown showing available free + configured models grouped by provider */
export function ModelDropdown({
  models,
  activeIds,
  mainModelId,
  loading,
  onSelect,
  onClose,
}: ModelDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Group models by provider
  const freeModels = models.filter((m) => m.free);
  const configuredModels = models.filter((m) => !m.free);

  // Group free models by providerName
  const freeByProvider = new Map<string, ModelInfo[]>();
  for (const m of freeModels) {
    const existing = freeByProvider.get(m.providerName) ?? [];
    existing.push(m);
    freeByProvider.set(m.providerName, existing);
  }

  const configuredByProvider = new Map<string, ModelInfo[]>();
  for (const m of configuredModels) {
    const existing = configuredByProvider.get(m.providerName) ?? [];
    existing.push(m);
    configuredByProvider.set(m.providerName, existing);
  }

  return (
    <div
      ref={ref}
      className="bg-bg-card absolute bottom-full left-0 z-50 mb-1 overflow-hidden rounded-lg shadow-lg"
      style={{
        minWidth: 260,
        maxHeight: 340,
        overflowY: "auto",
      }}
    >
      {loading ? (
        <div className="text-text-muted flex items-center justify-center gap-2 py-6">
          <CircleNotch size={16} className="animate-spin" />
          <span className="text-xs">Loading models...</span>
        </div>
      ) : (
        <>
          {/* Free models section */}
          {freeByProvider.size > 0 && (
            <>
              <div
                className="text-text-muted bg-bg-base px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{
                  boxShadow: "0 1px 0 var(--color-border)",
                }}
              >
                Free models
              </div>
              {Array.from(freeByProvider.entries()).map(([providerName, providerModels]) => (
                <div key={providerName}>
                  <div className="text-text-muted px-3 py-1 text-xs" style={{ fontSize: 10 }}>
                    {providerName}
                  </div>
                  {providerModels.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      isActive={activeIds.has(m.id)}
                      isMainModel={m.id === mainModelId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              ))}
            </>
          )}

          {/* Configured models section */}
          {configuredByProvider.size > 0 && (
            <>
              <div
                className="text-text-muted bg-bg-base px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{
                  boxShadow: "0 1px 0 var(--color-border)",
                  borderTop: freeByProvider.size > 0 ? "1px solid var(--color-border)" : undefined,
                }}
              >
                Your providers
              </div>
              {Array.from(configuredByProvider.entries()).map(([providerName, providerModels]) => (
                <div key={providerName}>
                  <div className="text-text-muted px-3 py-1 text-xs" style={{ fontSize: 10 }}>
                    {providerName}
                  </div>
                  {providerModels.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      isActive={activeIds.has(m.id)}
                      isMainModel={m.id === mainModelId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              ))}
            </>
          )}

          {/* Empty state */}
          {models.length === 0 && !loading && (
            <div className="text-text-muted px-3 py-4 text-center text-xs">
              No models available. Check provider settings.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModelRow({
  model,
  isActive,
  isMainModel,
  onSelect,
}: {
  model: ModelInfo;
  isActive: boolean;
  isMainModel: boolean;
  onSelect: (model: ModelInfo) => void;
}) {
  const contextLabel = formatContext(model.contextWindow);

  return (
    <button
      onClick={() => {
        if (!isActive && !isMainModel) onSelect(model);
      }}
      disabled={isActive || isMainModel}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-default"
      style={{
        background: isActive ? "var(--color-bg-elevated)" : "transparent",
        color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        opacity: isMainModel ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isActive && !isMainModel) {
          (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
      title={buildTooltip(model)}
    >
      <span className="flex-1 truncate font-medium">{model.name}</span>

      {/* Capability hints */}
      <span className="text-text-muted flex items-center gap-1">
        {(model.capabilities as Record<string, boolean>).reasoning && (
          <span title="Reasoning">
            <Lightning size={10} weight="fill" style={{ color: "#f59e0b" }} />
          </span>
        )}
        {model.capabilities.vision && (
          <span title="Vision">
            <Eye size={10} weight="bold" />
          </span>
        )}
        {model.capabilities.toolUse && (
          <span title="Tool use">
            <Brain size={10} weight="bold" />
          </span>
        )}
        <span className="font-mono" style={{ fontSize: 9 }}>
          {contextLabel}
        </span>
      </span>

      {/* Free badge */}
      {model.free && (
        <span
          className="font-semibold"
          style={{
            fontSize: 9,
            padding: "1px 4px",
            borderRadius: "var(--radius-xs)",
            background: "#10b98115",
            color: "#10b981",
          }}
        >
          Free
        </span>
      )}

      {/* Active indicator */}
      {isActive && <span style={{ color: "#10b981", fontSize: 11 }}>✓</span>}

      {isMainModel && (
        <span className="text-text-muted font-medium" style={{ fontSize: 9 }}>
          main
        </span>
      )}
    </button>
  );
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

function buildTooltip(model: ModelInfo): string {
  const parts = [model.name, `Provider: ${model.providerName}`];
  parts.push(`Context: ${formatContext(model.contextWindow)} tokens`);
  const caps: string[] = [];
  if (model.capabilities.toolUse) caps.push("Tool use");
  if (model.capabilities.streaming) caps.push("Streaming");
  if (model.capabilities.vision) caps.push("Vision");
  if (caps.length > 0) parts.push(`Capabilities: ${caps.join(", ")}`);
  return parts.join("\n");
}
