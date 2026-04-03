"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
import { CircleNotch, WarningCircle, TreeStructure } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

// ── Types ──────────────────────────────────────────────────────────────

interface GraphNode {
  id: number;
  filePath: string;
  symbolName: string;
  symbolType: string;
  isExported: boolean;
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

function getNodeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? TYPE_COLORS.default;
}

// ── Layout ─────────────────────────────────────────────────────────────

function layoutNodes(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[],
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
      nodes.push({
        id: String(n.id),
        position: {
          x: baseX + (i % 3) * 90,
          y: baseY + Math.floor(i / 3) * 60,
        },
        data: {
          label: n.symbolName,
          filePath,
          symbolType: n.symbolType,
          isExported: n.isExported,
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

  // Load graph data
  useEffect(() => {
    if (!projectSlug) return;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);

    (async () => {
      try {
        const res = await api.codegraph.graph(projectSlug);
        if (res.success && res.data) {
          setRawData(res.data);
          const layout = layoutNodes(res.data.nodes as GraphNode[], res.data.edges as GraphEdge[]);
          setNodes(layout.nodes);
          setEdges(layout.edges);
        } else {
          setError("No graph data available — run a scan first");
        }
      } catch {
        setError("Failed to load graph data");
      }
      setLoading(false);
    })();
  }, [projectSlug, setNodes, setEdges]);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNode((prev) => (prev === node.id ? null : node.id));
  }, []);

  const selectedData = useMemo(() => {
    if (!selectedNode || !rawData) return null;
    return rawData.nodes.find((n) => n.id === Number(selectedNode));
  }, [selectedNode, rawData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <CircleNotch
          size={24}
          className="animate-spin"
         
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <WarningCircle size={24} className="mx-auto mb-2" style={{ color: "#EA4335" }} />
        <p className="text-xs">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" style={{ height: 400 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TreeStructure size={14} weight="bold" style={{ color: "#A855F7" }} />
          <span className="text-xs font-semibold">
            Dependency Graph
          </span>
          <span className="text-xs">
            {rawData?.nodes.length ?? 0} nodes · {rawData?.edges.length ?? 0} edges
          </span>
        </div>
        {rawData?.truncated && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "#FBBC0415", color: "#FBBC04" }}
          >
            Showing 500/{rawData.totalNodes} nodes
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPE_COLORS)
          .filter(([k]) => k !== "default")
          .map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <span className="rounded-full" style={{ width: 6, height: 6, background: color }} />
              <span className="text-xs" style={{ color: "var(--color-text-muted)", fontSize: 10 }}>
                {type}
              </span>
            </div>
          ))}
      </div>

      {/* Graph */}
      <div
        className="flex-1 rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--color-border)" }}
      >
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
            style={{ background: "var(--color-bg-elevated)", borderColor: "var(--color-border)" }}
          />
          <MiniMap
            nodeStrokeWidth={3}
            style={{
              background: "var(--color-bg-base)",
              border: "1px solid var(--color-border)",
            }}
          />
        </ReactFlow>
      </div>

      {/* Selected node details */}
      {selectedData && (
        <div
          className="rounded-lg p-2.5 text-xs"
         
        >
          <div className="flex items-center gap-2">
            <span
              className="px-1.5 py-0.5 rounded font-mono"
              style={{
                background: getNodeColor(selectedData.symbolType) + "20",
                color: getNodeColor(selectedData.symbolType),
                fontSize: 10,
              }}
            >
              {selectedData.symbolType}
            </span>
            <span className="font-semibold">
              {selectedData.symbolName}
            </span>
            {selectedData.isExported && (
              <span>exported</span>
            )}
          </div>
          <div className="mt-1">
            {selectedData.filePath}
          </div>
        </div>
      )}
    </div>
  );
}
