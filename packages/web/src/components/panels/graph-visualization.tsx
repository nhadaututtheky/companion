"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CircleNotch,
  WarningCircle,
  TreeStructure,
  Lightning,
  Eye,
  EyeSlash,
  TextAa,
  Sparkle,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import {
  useGraphActivityStore,
  computeImpactRadius,
  type ImpactNode,
  type RevealState,
} from "@/lib/stores/graph-activity-store";

// ── Types ──────────────────────────────────────────────────────────────

interface GraphNode {
  id: number;
  filePath: string;
  symbolName: string;
  symbolType: string;
  isExported: boolean;
  description?: string | null;
}

interface GraphEdge {
  id: number;
  sourceNodeId: number;
  targetNodeId: number;
  edgeType: string;
  trustWeight: number;
}

// ── Color Map ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  function: "#A855F7",
  class: "#6366F1",
  interface: "#4285F4",
  type: "#14B8A6",
  variable: "#F59E0B",
  enum: "#EF4444",
  method: "#EC4899",
  default: "#6B7280",
};

/** Tool action → highlight color */
const ACTION_COLORS: Record<string, string> = {
  modify: "#3B82F6", // blue
  create: "#10B981", // green
  read: "#F59E0B", // amber (dimmer)
};

function getNodeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? TYPE_COLORS.default;
}

function truncateLabel(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

// ── Layout ─────────────────────────────────────────────────────────────

type LabelMode = "symbol" | "feature";

function layoutNodes(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[],
  labelMode: LabelMode = "symbol",
): { nodes: Node[]; edges: Edge[] } {
  // Group nodes by file for clustering
  const fileGroups = new Map<string, GraphNode[]>();
  for (const n of rawNodes) {
    const group = fileGroups.get(n.filePath) ?? [];
    group.push(n);
    fileGroups.set(n.filePath, group);
  }

  const nodes: Node[] = [];
  let fileIdx = 0;
  const cols = Math.ceil(Math.sqrt(fileGroups.size));

  for (const [filePath, group] of fileGroups) {
    const col = fileIdx % cols;
    const row = Math.floor(fileIdx / cols);
    const baseX = col * 300;
    const baseY = row * 250;

    for (let i = 0; i < group.length; i++) {
      const n = group[i];
      const color = getNodeColor(n.symbolType);
      // Feature mode: show description if available, otherwise symbol name with indicator
      const featureLabel = n.description ? truncateLabel(n.description, 40) : n.symbolName;
      const label = labelMode === "feature" ? featureLabel : n.symbolName;
      nodes.push({
        id: String(n.id),
        position: {
          x: baseX + (i % 3) * (labelMode === "feature" ? 140 : 90),
          y: baseY + Math.floor(i / 3) * 60,
        },
        data: {
          label,
          fullDescription: n.description ?? null,
          filePath,
          symbolType: n.symbolType,
          isExported: n.isExported,
          symbolName: n.symbolName,
        },
        style: {
          background: color + "20",
          border: `1.5px solid ${color}`,
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 11,
          color: "var(--color-text-primary)",
          minWidth: 60,
        },
      });
    }
    fileIdx++;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = rawEdges
    .filter((e) => nodeIds.has(String(e.sourceNodeId)) && nodeIds.has(String(e.targetNodeId)))
    .map((e) => ({
      id: `e-${e.id}`,
      source: String(e.sourceNodeId),
      target: String(e.targetNodeId),
      animated: e.trustWeight > 0.7,
      style: {
        stroke: "var(--color-text-muted)",
        strokeWidth: Math.max(1, e.trustWeight * 2),
        opacity: 0.4,
      },
      label: e.edgeType !== "import" ? e.edgeType : undefined,
      labelStyle: { fontSize: 9, fill: "var(--color-text-muted)" },
    }));

  return { nodes, edges };
}

// ── Highlight helpers ──────────────────────────────────────────────────

const DECAY_MS = 10_000; // 10s highlight decay

/** Fog-of-war style presets */
const FOG_STYLES: Record<RevealState, { filter: string; opacity: number }> = {
  untouched: { filter: "grayscale(100%) brightness(0.5)", opacity: 0.25 },
  read: { filter: "grayscale(40%) brightness(0.8)", opacity: 0.6 },
  modified: { filter: "none", opacity: 1.0 },
  hot: { filter: "none", opacity: 1.0 },
};

function applyHighlights(
  baseNodes: Node[],
  touchedNodes: Map<string, { count: number; lastTouched: number; toolAction: string }>,
  impactNodes: Map<string, ImpactNode>,
  fogEnabled: boolean,
  revealStates: Map<string, RevealState>,
): Node[] {
  const now = Date.now();

  return baseNodes.map((node) => {
    const touch = touchedNodes.get(node.id);
    const impact = impactNodes.get(node.id);
    const revealState = revealStates.get(node.id) ?? "untouched";

    // Fog base styles (applied when fog is on)
    const fogStyle = fogEnabled ? FOG_STYLES[revealState] : { filter: "none", opacity: 1.0 };

    // Active touch highlight (within decay window) — always visible regardless of fog
    if (touch && now - touch.lastTouched < DECAY_MS) {
      const elapsed = now - touch.lastTouched;
      const fadeRatio = 1 - elapsed / DECAY_MS;
      const actionColor = ACTION_COLORS[touch.toolAction] ?? ACTION_COLORS.modify;
      const glowIntensity = Math.round(fadeRatio * 20);
      const borderWidth = 2 + Math.min(touch.count, 5);

      return {
        ...node,
        className: "node-active",
        style: {
          ...node.style,
          border: `${borderWidth}px solid ${actionColor}`,
          boxShadow: `0 0 ${glowIntensity}px ${actionColor}80`,
          filter: "none", // always clear fog for active nodes
          opacity: 1,
          transition: "all 300ms ease",
        },
        data: {
          ...node.data,
          touchCount: touch.count,
        },
      };
    }

    // Impact radius highlight (secondary glow)
    if (impact) {
      const sourceTouch = touchedNodes.get(impact.fromNodeId);
      if (sourceTouch && now - sourceTouch.lastTouched < DECAY_MS) {
        const fadeRatio = 1 - (now - sourceTouch.lastTouched) / DECAY_MS;
        const dimOpacity = fadeRatio * 0.4;

        return {
          ...node,
          className: "node-impact",
          style: {
            ...node.style,
            boxShadow: `0 0 8px rgba(59, 130, 246, ${dimOpacity})`,
            filter: fogEnabled ? "grayscale(20%)" : "none",
            opacity: fogEnabled ? 0.8 : 1,
            transition: "all 300ms ease",
          },
        };
      }
    }

    // Hot nodes get a persistent subtle pulse even when not actively being touched
    if (fogEnabled && revealState === "hot") {
      return {
        ...node,
        className: "node-hot",
        style: {
          ...node.style,
          filter: "none",
          opacity: 1,
          boxShadow: "0 0 6px rgba(239, 68, 68, 0.4)",
          transition: "all 400ms ease",
        },
      };
    }

    // Default: apply fog or clear
    return {
      ...node,
      className: undefined,
      style: {
        ...node.style,
        filter: fogStyle.filter,
        opacity: fogStyle.opacity,
        boxShadow: "none",
        transition: "all 500ms ease",
      },
    };
  });
}

// ── Component ──────────────────────────────────────────────────────────

interface GraphVisualizationProps {
  projectSlug: string;
}

export function GraphVisualization({ projectSlug }: GraphVisualizationProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    truncated: boolean;
    totalNodes: number;
  } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [labelMode, setLabelMode] = useState<LabelMode>("symbol");

  // Keep base layout (without highlights) for re-application
  const baseNodesRef = useRef<Node[]>([]);
  const baseEdgesRef = useRef<Edge[]>([]);

  // Graph activity store
  const touchedNodes = useGraphActivityStore((s) => s.touchedNodes);
  const totalEvents = useGraphActivityStore((s) => s.totalEvents);
  const revealStates = useGraphActivityStore((s) => s.revealStates);
  const fogEnabled = useGraphActivityStore((s) => s.fogEnabled);
  const setFogEnabled = useGraphActivityStore((s) => s.setFogEnabled);

  // Load graph data (only on project change, NOT on label mode change)
  useEffect(() => {
    if (!projectSlug) return;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- loading tied to fetch
    setError(null);

    (async () => {
      try {
        const res = await api.codegraph.graph(projectSlug);
        if (res.success && res.data) {
          setRawData(res.data);
        } else {
          setError("No graph data available — run a scan first");
        }
      } catch {
        setError("Failed to load graph data");
      }
      setLoading(false);
    })();
  }, [projectSlug]);

  // Re-layout when data or label mode changes (no API call)
  useEffect(() => {
    if (!rawData) return;
    const layout = layoutNodes(
      rawData.nodes as GraphNode[],
      rawData.edges as GraphEdge[],
      labelMode,
    );
    baseNodesRef.current = layout.nodes;
    baseEdgesRef.current = layout.edges;
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [rawData, labelMode, setNodes, setEdges]);

  // Track which nodes need highlight updates to avoid full re-renders (M3 fix)
  const prevHighlightedRef = useRef<Set<string>>(new Set());

  // Unified highlight + decay effect
  // Uses recursive setTimeout instead of setInterval for cleaner cleanup (H2 fix)
  // NOTE: impactNodes computed inline to avoid infinite re-render loop (P2-C1 fix)
  useEffect(() => {
    if (baseNodesRef.current.length === 0) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let cancelled = false;

    const updateHighlights = () => {
      if (cancelled) return;

      // Compute active touches and impact radius
      const now = Date.now();
      const activeTouches = new Set<string>();
      for (const [nodeId, touch] of touchedNodes) {
        if (now - touch.lastTouched < DECAY_MS) {
          activeTouches.add(nodeId);
        }
      }

      // Compute impact inline (not stored in global state to avoid re-render loop)
      const currentImpacts =
        activeTouches.size > 0 && baseEdgesRef.current.length > 0
          ? computeImpactRadius(activeTouches, baseEdgesRef.current, 2, 15)
          : new Map<string, ImpactNode>();

      // Determine which nodes actually need style changes
      const nowHighlighted = new Set([...activeTouches, ...currentImpacts.keys()]);
      const prevHighlighted = prevHighlightedRef.current;

      // Only rebuild nodes that changed state (entered or left highlight)
      const changed = new Set<string>();
      for (const id of nowHighlighted) {
        if (!prevHighlighted.has(id)) changed.add(id);
      }
      for (const id of prevHighlighted) {
        if (!nowHighlighted.has(id)) changed.add(id);
      }
      // Always update actively highlighted nodes (fade ratio changes)
      for (const id of activeTouches) changed.add(id);

      prevHighlightedRef.current = nowHighlighted;

      if (changed.size === 0 && nowHighlighted.size === 0) return;

      const highlighted = applyHighlights(
        baseNodesRef.current,
        touchedNodes,
        currentImpacts,
        fogEnabled,
        revealStates,
      );
      setNodes(highlighted);

      // Schedule next decay tick if there are still active highlights
      if (activeTouches.size > 0 && !cancelled) {
        timeoutId = setTimeout(updateHighlights, 2000);
      }
    };

    // Throttle via RAF
    rafId = requestAnimationFrame(updateHighlights);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [touchedNodes, setNodes, fogEnabled, revealStates]);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNode((prev) => (prev === node.id ? null : node.id));
  }, []);

  const selectedData = useMemo(() => {
    if (!selectedNode || !rawData) return null;
    return rawData.nodes.find((n) => n.id === Number(selectedNode));
  }, [selectedNode, rawData]);

  // Coverage calculation for fog-of-war
  const coverage = useMemo(() => {
    if (!rawData || rawData.nodes.length === 0) return { revealed: 0, total: 0, percent: 0 };
    const total = rawData.nodes.length;
    const revealed = revealStates.size;
    return {
      revealed,
      total,
      percent: Math.round((revealed / total) * 100),
    };
  }, [rawData, revealStates]);

  // Apply fog to edges: edges between two revealed nodes are visible, others are fogged
  useEffect(() => {
    if (!fogEnabled || baseEdgesRef.current.length === 0) {
      // Restore base edges when fog is off
      if (baseEdgesRef.current.length > 0) {
        setEdges(baseEdgesRef.current);
      }
      return;
    }

    const revealedNodeIds = new Set(revealStates.keys());
    const foggedEdges = baseEdgesRef.current.map((edge) => {
      const sourceRevealed = revealedNodeIds.has(edge.source);
      const targetRevealed = revealedNodeIds.has(edge.target);

      if (sourceRevealed && targetRevealed) {
        // Both revealed — show edge normally
        return { ...edge, style: { ...edge.style, opacity: 0.6 } };
      }
      // At least one fogged — dim the edge
      return { ...edge, style: { ...edge.style, opacity: 0.05 } };
    });

    setEdges(foggedEdges);
  }, [fogEnabled, revealStates, setEdges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <CircleNotch size={24} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <WarningCircle size={24} className="mx-auto mb-2" style={{ color: "#EA4335" }} />
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" style={{ height: 400 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TreeStructure size={14} weight="bold" style={{ color: "#A855F7" }} />
          <span className="text-xs font-semibold">Dependency Graph</span>
          <span className="text-xs">
            {rawData?.nodes.length ?? 0} nodes · {rawData?.edges.length ?? 0} edges
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Label mode toggle */}
          <button
            type="button"
            onClick={() => setLabelMode((m) => (m === "symbol" ? "feature" : "symbol"))}
            className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5"
            style={{
              background: labelMode === "feature" ? "#10B98120" : "transparent",
              border: `1px solid ${labelMode === "feature" ? "#10B981" : "var(--color-border)"}`,
            }}
            aria-label={labelMode === "feature" ? "Show symbol names" : "Show feature labels"}
            title={
              labelMode === "feature"
                ? "Labels: Feature — click for Symbol"
                : "Labels: Symbol — click for Feature"
            }
          >
            {labelMode === "feature" ? (
              <Sparkle size={12} style={{ color: "#10B981" }} />
            ) : (
              <TextAa size={12} className="text-text-muted" />
            )}
            <span
              className="text-xs"
              style={{ color: labelMode === "feature" ? "#10B981" : "var(--color-text-muted)" }}
            >
              {labelMode === "feature" ? "Feature" : "Symbol"}
            </span>
          </button>

          {/* Fog-of-war toggle */}
          <button
            type="button"
            onClick={() => setFogEnabled(!fogEnabled)}
            className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5"
            style={{
              background: fogEnabled ? "#6366F120" : "transparent",
              border: `1px solid ${fogEnabled ? "#6366F1" : "var(--color-border)"}`,
            }}
            aria-label={fogEnabled ? "Disable fog-of-war" : "Enable fog-of-war"}
            title={fogEnabled ? "Fog: ON — click to disable" : "Fog: OFF — click to enable"}
          >
            {fogEnabled ? (
              <EyeSlash size={12} style={{ color: "#6366F1" }} />
            ) : (
              <Eye size={12} className="text-text-muted" />
            )}
            <span
              className="text-xs"
              style={{ color: fogEnabled ? "#6366F1" : "var(--color-text-muted)" }}
            >
              Fog
            </span>
          </button>

          {/* Coverage indicator (when fog is on) */}
          {fogEnabled && coverage.total > 0 && (
            <span className="text-xs" style={{ color: "#10B981" }}>
              {coverage.percent}% explored
            </span>
          )}

          {/* Live activity indicator */}
          {totalEvents > 0 && (
            <div className="flex items-center gap-1">
              <Lightning
                size={12}
                weight="fill"
                style={{ color: "#3B82F6" }}
                className="animate-pulse"
              />
              <span className="text-xs" style={{ color: "#3B82F6" }}>
                {totalEvents} events
              </span>
            </div>
          )}
          {rawData?.truncated && (
            <span
              className="rounded px-1.5 py-0.5 text-xs"
              style={{ background: "#FBBC0415", color: "#FBBC04" }}
            >
              Showing 500/{rawData.totalNodes} nodes
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPE_COLORS)
          .filter(([k]) => k !== "default")
          .map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <span className="rounded-full" style={{ width: 6, height: 6, background: color }} />
              <span className="text-text-muted text-xs" style={{ fontSize: 10 }}>
                {type}
              </span>
            </div>
          ))}
        {/* Activity legend */}
        {totalEvents > 0 && (
          <>
            <span style={{ color: "var(--color-border)" }}>|</span>
            {Object.entries(ACTION_COLORS).map(([action, color]) => (
              <div key={action} className="flex items-center gap-1">
                <span
                  className="rounded-full"
                  style={{ width: 6, height: 6, background: color, boxShadow: `0 0 4px ${color}` }}
                />
                <span className="text-text-muted text-xs" style={{ fontSize: 10 }}>
                  {action}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Graph */}
      <div className="border-border flex-1 overflow-hidden rounded-lg border">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--color-border)" gap={20} size={1} />
          <Controls
            showInteractive={false}
            className="bg-bg-elevated"
            style={{ borderColor: "var(--color-border)" }}
          />
          <MiniMap nodeStrokeWidth={3} className="bg-bg-base border-border border" />
        </ReactFlow>
      </div>

      {/* Selected node details */}
      {selectedData && (
        <div className="rounded-lg p-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 font-mono"
              style={{
                background: getNodeColor(selectedData.symbolType) + "20",
                color: getNodeColor(selectedData.symbolType),
                fontSize: 10,
              }}
            >
              {selectedData.symbolType}
            </span>
            <span className="font-semibold">{selectedData.symbolName}</span>
            {selectedData.isExported && <span>exported</span>}
            {/* Show touch count if node has been touched */}
            {touchedNodes.has(String(selectedData.id)) && (
              <span
                className="rounded px-1 py-0.5 font-mono text-xs"
                style={{ background: "#3B82F620", color: "#3B82F6", fontSize: 10 }}
              >
                ×{touchedNodes.get(String(selectedData.id))?.count}
              </span>
            )}
          </div>
          {selectedData.description && (
            <div className="mt-1" style={{ color: "#10B981" }}>
              {selectedData.description}
            </div>
          )}
          <div className="mt-1">{selectedData.filePath}</div>
        </div>
      )}
    </div>
  );
}
