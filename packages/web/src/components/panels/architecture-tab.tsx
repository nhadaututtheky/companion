"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { codegraph } from "@/lib/api/devtools";

type DiagramType = "architecture" | "module" | "flow";

interface DiagramData {
  mermaid: string;
  type: DiagramType;
  description: string;
  nodeCount: number;
  edgeCount: number;
}

interface ArchitectureTabProps {
  projectSlug: string;
}

export function ArchitectureTab({ projectSlug }: ArchitectureTabProps) {
  const [diagramType, setDiagramType] = useState<DiagramType>("architecture");
  const [data, setData] = useState<DiagramData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);

  // For module/flow inputs
  const [fileInput, setFileInput] = useState("");
  const [symbolInput, setSymbolInput] = useState("");

  const svgRef = useRef<HTMLDivElement>(null);

  const loadDiagram = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const opts: { file?: string; symbol?: string } = {};
      if (diagramType === "module" && fileInput) opts.file = fileInput;
      if (diagramType === "flow" && symbolInput) opts.symbol = symbolInput;

      if (diagramType === "module" && !fileInput) {
        setError("Enter a file path for module diagram");
        setLoading(false);
        return;
      }
      if (diagramType === "flow" && !symbolInput) {
        setError("Enter a symbol name for flow diagram");
        setLoading(false);
        return;
      }

      const res = await codegraph.diagram(projectSlug, diagramType, opts);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError("Failed to generate diagram");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectSlug, diagramType, fileInput, symbolInput]);

  // Auto-load architecture diagram on mount
  useEffect(() => {
    if (diagramType === "architecture") {
      void loadDiagram();
    }
  }, [projectSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render mermaid SVG
  useEffect(() => {
    if (!data?.mermaid || !svgRef.current) return;

    let cancelled = false;

    const renderMermaid = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#6366f1",
            primaryTextColor: "#f8fafc",
            primaryBorderColor: "#818cf8",
            lineColor: "#64748b",
            secondaryColor: "#1e293b",
            tertiaryColor: "#0f172a",
            background: "#0f172a",
            mainBkg: "#1e293b",
            nodeBorder: "#334155",
            clusterBkg: "#1e293b20",
            clusterBorder: "#334155",
            titleColor: "#f8fafc",
            edgeLabelBackground: "#1e293b",
          },
          flowchart: { curve: "basis", padding: 12 },
          sequence: { actorMargin: 50 },
        });

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, data.mermaid);

        if (!cancelled && svgRef.current) {
          svgRef.current.innerHTML = svg;
          // Make SVG responsive
          const svgEl = svgRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
          }
        }
      } catch (err) {
        if (!cancelled && svgRef.current) {
          svgRef.current.innerHTML = `<pre style="color:#ef4444;font-size:12px;white-space:pre-wrap">${String(err)}</pre>`;
        }
      }
    };

    void renderMermaid();
    return () => { cancelled = true; };
  }, [data?.mermaid]);

  const handleCopy = () => {
    if (!data?.mermaid) return;
    navigator.clipboard.writeText(data.mermaid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const typeLabels: Record<DiagramType, string> = {
    architecture: "Architecture",
    module: "Module",
    flow: "Call Flow",
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Diagram type selector */}
      <div className="flex items-center gap-2">
        {(["architecture", "module", "flow"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setDiagramType(t)}
            className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              background: diagramType === t ? "#6366f1" : "var(--color-bg-tertiary)",
              color: diagramType === t ? "#fff" : "var(--color-text-muted)",
            }}
          >
            {typeLabels[t]}
          </button>
        ))}
      </div>

      {/* Input fields for module/flow */}
      {diagramType === "module" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={fileInput}
            onChange={(e) => setFileInput(e.target.value)}
            placeholder="e.g. src/services/auth.ts"
            className="flex-1 rounded-md border px-2.5 py-1.5 text-xs"
            style={{
              background: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            onKeyDown={(e) => e.key === "Enter" && loadDiagram()}
          />
          <button
            onClick={loadDiagram}
            disabled={loading || !fileInput}
            className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ background: "#6366f1", color: "#fff", opacity: loading || !fileInput ? 0.5 : 1 }}
          >
            Generate
          </button>
        </div>
      )}

      {diagramType === "flow" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="e.g. handleRequest"
            className="flex-1 rounded-md border px-2.5 py-1.5 text-xs"
            style={{
              background: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
            onKeyDown={(e) => e.key === "Enter" && loadDiagram()}
          />
          <button
            onClick={loadDiagram}
            disabled={loading || !symbolInput}
            className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ background: "#6366f1", color: "#fff", opacity: loading || !symbolInput ? 0.5 : 1 }}
          >
            Generate
          </button>
        </div>
      )}

      {diagramType === "architecture" && (
        <button
          onClick={loadDiagram}
          disabled={loading}
          className="cursor-pointer self-start rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: "#6366f1", color: "#fff", opacity: loading ? 0.5 : 1 }}
        >
          {loading ? "Generating..." : "Refresh"}
        </button>
      )}

      {/* Error */}
      {error && (
        <div
          className="rounded-md px-3 py-2 text-xs"
          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2"
            style={{ borderColor: "#6366f1", borderTopColor: "transparent" }}
          />
        </div>
      )}

      {/* Diagram render */}
      {data && !loading && (
        <div className="flex flex-col gap-2">
          {/* Description + stats */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {data.description}
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
              {data.nodeCount}N / {data.edgeCount}E
            </span>
          </div>

          {/* SVG container */}
          <div
            ref={svgRef}
            className="overflow-auto rounded-lg border p-3"
            style={{
              background: "var(--color-bg-secondary)",
              borderColor: "var(--color-border)",
              minHeight: 200,
              maxHeight: 500,
            }}
          />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium"
              style={{
                background: "var(--color-bg-tertiary)",
                color: "var(--color-text-muted)",
              }}
            >
              {copied ? "Copied!" : "Copy Mermaid"}
            </button>
            <button
              onClick={() => setShowSource(!showSource)}
              className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium"
              style={{
                background: "var(--color-bg-tertiary)",
                color: "var(--color-text-muted)",
              }}
            >
              {showSource ? "Hide Source" : "View Source"}
            </button>
          </div>

          {/* Source code */}
          {showSource && (
            <pre
              className="overflow-auto rounded-md border p-3 text-xs"
              style={{
                background: "var(--color-bg-secondary)",
                borderColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
                maxHeight: 300,
                whiteSpace: "pre-wrap",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {data.mermaid}
            </pre>
          )}
        </div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && diagramType !== "architecture" && (
        <div
          className="flex flex-col items-center justify-center gap-2 py-8 text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          <span>
            {diagramType === "module"
              ? "Enter a file path and click Generate"
              : "Enter a symbol name and click Generate"}
          </span>
        </div>
      )}
    </div>
  );
}
