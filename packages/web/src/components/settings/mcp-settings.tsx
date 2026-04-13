"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash,
  FloppyDisk,
  ArrowsClockwise,
  TerminalWindow,
  Globe,
  Lightning,
  CaretDown,
  CaretRight,
  Plugs,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────

interface McpServer {
  id: string;
  name: string;
  type: "stdio" | "streamableHttp" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  enabled: boolean;
  description?: string;
}

interface DetectedServer {
  id: string;
  name: string;
  type: "stdio" | "streamableHttp" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  source: string;
  alreadyImported: boolean;
}

type ServerType = McpServer["type"];

const TYPE_LABELS: Record<ServerType, string> = {
  stdio: "Local (stdio)",
  streamableHttp: "HTTP (Streamable)",
  sse: "SSE (Server-Sent Events)",
};

const TYPE_ICONS: Record<ServerType, typeof TerminalWindow> = {
  stdio: TerminalWindow,
  streamableHttp: Globe,
  sse: Lightning,
};

// ── Helpers ────────────────────────────────────────────────────────────

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// ── Main Component ─────────────────────────────────────────────────────

export function McpSettings() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState<DetectedServer[]>([]);
  const [importing, setImporting] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    try {
      const res = await api.mcpConfig.list();
      if (res.success) {
        setServers(res.data);
      }
    } catch {
      toast.error("Failed to load MCP servers");
    }
    setLoading(false);
  }, []);

  const loadDetected = useCallback(async () => {
    try {
      const res = await api.mcpConfig.detect();
      if (res.success) {
        setDetected(res.data);
      }
    } catch {
      // Non-critical — detection may fail in Docker without ~/.claude.json
    }
  }, []);

  useEffect(() => {
    loadServers(); // eslint-disable-line react-hooks/set-state-in-effect
    loadDetected();
  }, [loadServers, loadDetected]);

  const handleSelect = (server: McpServer) => {
    setSelectedId(server.id);
    setEditing({ ...server });
    setIsNew(false);
  };

  const handleNew = () => {
    const newServer: McpServer = {
      id: "",
      name: "",
      type: "stdio",
      command: "",
      args: [],
      env: {},
      enabled: true,
      description: "",
    };
    setEditing(newServer);
    setSelectedId(null);
    setIsNew(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Server name is required");
      return;
    }

    const id = isNew ? generateId(editing.name) : editing.id;
    if (!id) {
      toast.error("Invalid server name");
      return;
    }

    setSaving(true);
    try {
      const { id: _id, ...config } = editing;
      await api.mcpConfig.save(id, config);
      toast.success(isNew ? "MCP server added" : "MCP server updated");
      setIsNew(false);
      setSelectedId(id);
      await loadServers();
    } catch {
      toast.error("Failed to save MCP server");
    }
    setSaving(false);
  };

  const handleImport = async (serverId: string) => {
    setImporting(serverId);
    try {
      await api.mcpConfig.import(serverId);
      toast.success(`Imported "${serverId}"`);
      await loadServers();
      await loadDetected();
    } catch {
      toast.error("Failed to import server");
    }
    setImporting(null);
  };

  const handleDelete = async (serverId: string) => {
    try {
      await api.mcpConfig.delete(serverId);
      toast.success("MCP server deleted");
      if (selectedId === serverId) {
        setSelectedId(null);
        setEditing(null);
      }
      await loadServers();
    } catch {
      toast.error("Failed to delete MCP server");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">MCP Servers</h3>
          <p className="mt-0.5 text-xs">
            Manage Model Context Protocol servers for your AI sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadServers}
            className="cursor-pointer rounded-full p-1.5 transition-colors"
            aria-label="Refresh"
          >
            <ArrowsClockwise size={14} />
          </button>
          <button
            onClick={handleNew}
            className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ background: "#4285F4", color: "#fff" }}
          >
            <Plus size={12} weight="bold" />
            Add Server
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "minmax(200px, 280px) 1fr", minHeight: 320 }}
      >
        {/* Left: Server list */}
        <div
          className="shadow-soft border-glass-border overflow-hidden rounded-xl border"
          style={{
            background: "var(--glass-bg-heavy)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs">Loading...</div>
          ) : servers.length === 0 && !isNew ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8">
              <Plugs size={24} />
              <p className="text-center text-xs">No MCP servers configured yet</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {servers.map((server) => {
                const Icon = TYPE_ICONS[server.type];
                const isSelected = selectedId === server.id && !isNew;
                return (
                  <button
                    key={server.id}
                    onClick={() => handleSelect(server)}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                    style={{
                      background: isSelected ? "var(--color-bg-elevated)" : "transparent",
                      borderLeft: isSelected ? "2px solid #4285F4" : "2px solid transparent",
                    }}
                  >
                    <Icon
                      size={14}
                      weight={isSelected ? "fill" : "regular"}
                      style={{
                        color: server.enabled
                          ? isSelected
                            ? "#4285F4"
                            : "var(--color-text-secondary)"
                          : "var(--color-text-muted)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-xs font-medium"
                        style={{
                          color: server.enabled
                            ? "var(--color-text-primary)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        {server.name}
                      </div>
                      <div className="text-text-muted truncate text-xs" style={{ fontSize: 10 }}>
                        {TYPE_LABELS[server.type]}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full"
                      style={{
                        width: 6,
                        height: 6,
                        background: server.enabled ? "#34A853" : "#9CA3AF",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Editor */}
        <div
          className="shadow-soft border-glass-border rounded-xl border"
          style={{
            background: "var(--glass-bg-heavy)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          {editing ? (
            <ServerEditor
              server={editing}
              isNew={isNew}
              saving={saving}
              onChange={setEditing}
              onSave={handleSave}
              onDelete={() => editing.id && handleDelete(editing.id)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs">
              Select a server to edit
            </div>
          )}
        </div>
      </div>

      {/* Detected from Claude Config */}
      <DetectedServersSection servers={detected} importing={importing} onImport={handleImport} />
    </div>
  );
}

// ── Detected Servers Section ──────────────────────────────────────────

function DetectedServersSection({
  servers,
  importing,
  onImport,
}: {
  servers: DetectedServer[];
  importing: string | null;
  onImport: (id: string) => void;
}) {
  const notImported = servers.filter((s) => !s.alreadyImported);
  if (notImported.length === 0 && servers.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Plugs size={14} weight="duotone" className="text-text-muted" />
        <span className="text-text-muted text-xs font-semibold uppercase tracking-wider">
          Detected from Claude Config
        </span>
        <span
          className="text-text-muted rounded-md px-1.5 py-0.5 text-xs"
          style={{ background: "var(--color-bg-elevated)" }}
        >
          {servers.length}
        </span>
      </div>

      {notImported.length === 0 ? (
        <p className="text-text-muted text-xs">All detected servers are already imported.</p>
      ) : (
        <div className="grid gap-2">
          {notImported.map((server) => {
            const Icon = TYPE_ICONS[server.type];
            const isImporting = importing === server.id;
            return (
              <div
                key={`${server.id}-${server.source}`}
                className="bg-bg-base shadow-soft border-glass-border flex items-center gap-3 rounded-xl border px-3 py-2.5"
              >
                <Icon size={14} weight="duotone" className="text-text-secondary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary truncate text-xs font-medium">
                      {server.name}
                    </span>
                    <span
                      className="text-text-muted bg-bg-elevated shrink-0 rounded px-1.5 py-0.5 text-xs"
                      style={{
                        fontSize: 10,
                      }}
                    >
                      {server.type === "stdio"
                        ? "stdio"
                        : server.type === "streamableHttp"
                          ? "HTTP"
                          : "SSE"}
                    </span>
                  </div>
                  <div className="text-text-muted mt-0.5 truncate text-xs" style={{ fontSize: 10 }}>
                    {server.source}
                    {server.command && ` · ${server.command}`}
                    {server.url && ` · ${server.url}`}
                  </div>
                </div>
                <button
                  onClick={() => onImport(server.id)}
                  disabled={isImporting}
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    background: isImporting ? "var(--color-bg-elevated)" : "#4285F415",
                    color: isImporting ? "var(--color-text-muted)" : "#4285F4",
                    border: "1px solid #4285F430",
                  }}
                  aria-label={`Import ${server.name}`}
                >
                  {isImporting ? (
                    <ArrowsClockwise size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} weight="bold" />
                  )}
                  Import
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Server Editor ──────────────────────────────────────────────────────

interface ServerEditorProps {
  server: McpServer;
  isNew: boolean;
  saving: boolean;
  onChange: (server: McpServer) => void;
  onSave: () => void;
  onDelete: () => void;
}

function ServerEditor({ server, isNew, saving, onChange, onSave, onDelete }: ServerEditorProps) {
  const [envOpen, setEnvOpen] = useState(false);
  const [headersOpen, setHeadersOpen] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");
  const [newHeaderKey, setNewHeaderKey] = useState("");
  const [newHeaderVal, setNewHeaderVal] = useState("");

  const update = (partial: Partial<McpServer>) => {
    onChange({ ...server, ...partial });
  };

  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    update({ env: { ...(server.env ?? {}), [newEnvKey.trim()]: newEnvVal } });
    setNewEnvKey("");
    setNewEnvVal("");
  };

  const removeEnvVar = (key: string) => {
    const env = { ...(server.env ?? {}) };
    delete env[key];
    update({ env });
  };

  const addHeader = () => {
    if (!newHeaderKey.trim()) return;
    update({ headers: { ...(server.headers ?? {}), [newHeaderKey.trim()]: newHeaderVal } });
    setNewHeaderKey("");
    setNewHeaderVal("");
  };

  const removeHeader = (key: string) => {
    const headers = { ...(server.headers ?? {}) };
    delete headers[key];
    update({ headers });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* Name */}
        <FieldGroup label="Name">
          <input
            type="text"
            value={server.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. My MCP Server"
            className="input-bordered text-text-primary bg-bg-elevated w-full rounded-lg px-3 py-2 text-xs"
          />
        </FieldGroup>

        {/* Type */}
        <FieldGroup label="Transport Type">
          <div className="flex gap-2">
            {(["stdio", "streamableHttp", "sse"] as ServerType[]).map((t) => {
              const Icon = TYPE_ICONS[t];
              const active = server.type === t;
              return (
                <button
                  key={t}
                  onClick={() => update({ type: t })}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors"
                  style={{
                    background: active ? "#4285F415" : "var(--color-bg-elevated)",
                    border: `1px solid ${active ? "#4285F4" : "var(--color-border)"}`,
                    color: active ? "#4285F4" : "var(--color-text-secondary)",
                  }}
                >
                  <Icon size={12} weight={active ? "fill" : "regular"} />
                  {t === "stdio" ? "stdio" : t === "streamableHttp" ? "HTTP" : "SSE"}
                </button>
              );
            })}
          </div>
        </FieldGroup>

        {/* stdio fields */}
        {server.type === "stdio" && (
          <>
            <FieldGroup label="Command">
              <input
                type="text"
                value={server.command ?? ""}
                onChange={(e) => update({ command: e.target.value })}
                placeholder="e.g. bun, node, npx"
                className="input-bordered text-text-primary bg-bg-elevated w-full rounded-lg px-3 py-2 font-mono text-xs"
              />
            </FieldGroup>
            <FieldGroup label="Arguments (one per line)">
              <textarea
                value={(server.args ?? []).join("\n")}
                onChange={(e) =>
                  update({
                    args: e.target.value.split("\n").filter((a) => a.trim()),
                  })
                }
                placeholder={"run\npath/to/server.ts"}
                rows={3}
                className="input-bordered text-text-primary bg-bg-elevated w-full resize-none rounded-lg px-3 py-2 font-mono text-xs"
              />
            </FieldGroup>
          </>
        )}

        {/* URL field for HTTP/SSE */}
        {(server.type === "streamableHttp" || server.type === "sse") && (
          <FieldGroup label="URL">
            <input
              type="text"
              value={server.url ?? ""}
              onChange={(e) => update({ url: e.target.value })}
              placeholder="https://example.com/mcp"
              className="input-bordered text-text-primary bg-bg-elevated w-full rounded-lg px-3 py-2 font-mono text-xs"
            />
          </FieldGroup>
        )}

        {/* Description */}
        <FieldGroup label="Description (optional)">
          <input
            type="text"
            value={server.description ?? ""}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What this server does..."
            className="input-bordered text-text-primary bg-bg-elevated w-full rounded-lg px-3 py-2 text-xs"
          />
        </FieldGroup>

        {/* Environment variables */}
        <CollapsibleSection
          title="Environment Variables"
          count={Object.keys(server.env ?? {}).length}
          open={envOpen}
          onToggle={() => setEnvOpen(!envOpen)}
        >
          {Object.entries(server.env ?? {}).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="text-text-secondary bg-bg-base rounded px-2 py-1 font-mono text-xs"
                style={{
                  minWidth: 80,
                }}
              >
                {key}
              </span>
              <span className="flex-1 truncate font-mono text-xs">{val}</span>
              <button
                onClick={() => removeEnvVar(key)}
                className="cursor-pointer rounded p-0.5"
                aria-label={`Remove ${key}`}
              >
                <Trash size={12} />
              </button>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              placeholder="KEY"
              className="input-bordered text-text-primary bg-bg-base rounded px-2 py-1 font-mono text-xs"
              style={{
                width: 100,
              }}
            />
            <input
              type="text"
              value={newEnvVal}
              onChange={(e) => setNewEnvVal(e.target.value)}
              placeholder="value"
              className="input-bordered text-text-primary bg-bg-base flex-1 rounded px-2 py-1 font-mono text-xs"
            />
            <button
              onClick={addEnvVar}
              disabled={!newEnvKey.trim()}
              className="cursor-pointer rounded p-1"
              style={{
                color: newEnvKey.trim() ? "#4285F4" : "var(--color-text-muted)",
              }}
              aria-label="Add env var"
            >
              <Plus size={14} weight="bold" />
            </button>
          </div>
        </CollapsibleSection>

        {/* Headers (for HTTP/SSE) */}
        {(server.type === "streamableHttp" || server.type === "sse") && (
          <CollapsibleSection
            title="Headers"
            count={Object.keys(server.headers ?? {}).length}
            open={headersOpen}
            onToggle={() => setHeadersOpen(!headersOpen)}
          >
            {Object.entries(server.headers ?? {}).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span
                  className="text-text-secondary bg-bg-base rounded px-2 py-1 font-mono text-xs"
                  style={{
                    minWidth: 80,
                  }}
                >
                  {key}
                </span>
                <span className="flex-1 truncate font-mono text-xs">{val}</span>
                <button
                  onClick={() => removeHeader(key)}
                  className="cursor-pointer rounded p-0.5"
                  aria-label={`Remove ${key}`}
                >
                  <Trash size={12} />
                </button>
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={newHeaderKey}
                onChange={(e) => setNewHeaderKey(e.target.value)}
                placeholder="Header-Name"
                className="input-bordered text-text-primary bg-bg-base rounded px-2 py-1 font-mono text-xs"
                style={{
                  width: 120,
                }}
              />
              <input
                type="text"
                value={newHeaderVal}
                onChange={(e) => setNewHeaderVal(e.target.value)}
                placeholder="value"
                className="input-bordered text-text-primary bg-bg-base flex-1 rounded px-2 py-1 font-mono text-xs"
              />
              <button
                onClick={addHeader}
                disabled={!newHeaderKey.trim()}
                className="cursor-pointer rounded p-1"
                style={{
                  color: newHeaderKey.trim() ? "#4285F4" : "var(--color-text-muted)",
                }}
                aria-label="Add header"
              >
                <Plus size={14} weight="bold" />
              </button>
            </div>
          </CollapsibleSection>
        )}

        {/* Enabled toggle */}
        <div className="flex items-center justify-between py-1">
          <span className="text-xs">Enabled</span>
          <button
            onClick={() => update({ enabled: !server.enabled })}
            className="relative cursor-pointer"
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              background: server.enabled ? "#4285F4" : "var(--color-bg-elevated)",
              border: `1px solid ${server.enabled ? "#4285F4" : "var(--color-border)"}`,
              transition: "background 150ms ease",
            }}
            role="switch"
            aria-checked={server.enabled}
            aria-label="Enable server"
          >
            <span
              className="absolute rounded-full"
              style={{
                top: 2,
                left: server.enabled ? 18 : 2,
                width: 14,
                height: 14,
                background: "#fff",
                transition: "left 150ms ease",
              }}
            />
          </button>
        </div>
      </div>

      {/* Footer actions */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: "1px solid var(--glass-border)" }}
      >
        {!isNew ? (
          <button
            onClick={onDelete}
            className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors"
            style={{ color: "#EA4335" }}
          >
            <Trash size={12} />
            Delete
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={onSave}
          disabled={saving || !server.name.trim()}
          className="flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: saving || !server.name.trim() ? "var(--color-bg-elevated)" : "#4285F4",
            color: saving || !server.name.trim() ? "var(--color-text-muted)" : "#fff",
          }}
        >
          {saving ? (
            <ArrowsClockwise size={12} className="animate-spin" />
          ) : (
            <FloppyDisk size={12} />
          )}
          {isNew ? "Add Server" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Shared UI ──────────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-1.5 py-1 text-left"
      >
        {open ? <CaretDown size={10} /> : <CaretRight size={10} />}
        <span className="text-xs font-medium">{title}</span>
        {count > 0 && (
          <span
            className="text-text-muted bg-bg-elevated rounded-full px-1.5 text-xs"
            style={{
              fontSize: 10,
            }}
          >
            {count}
          </span>
        )}
      </button>
      {open && <div className="flex flex-col gap-2 pl-4 pt-1">{children}</div>}
    </div>
  );
}
