"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Database,
  Plus,
  Trash,
  Table,
  Play,
  CircleNotch,
  ArrowLeft,
  X,
  Key,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface Connection {
  id: string;
  name: string;
  type: string;
  connectionString: string;
  projectSlug: string | null;
  createdAt: string;
}

interface TableInfo {
  name: string;
  type: string;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}

export default function DatabasePage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConn, setSelectedConn] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<ColumnInfo[]>([]);
  const [queryText, setQueryText] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPath, setAddPath] = useState("");

  // Load connections
  const loadConnections = useCallback(async () => {
    try {
      const res = await api.database.connections();
      setConnections(res.data);
    } catch {
      toast.error("Failed to load connections");
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Load tables when connection selected
  useEffect(() => {
    if (!selectedConn) {
      setTables([]);
      setSelectedTable(null);
      return;
    }
    (async () => {
      try {
        const res = await api.database.tables(selectedConn);
        setTables(res.data);
      } catch {
        toast.error("Failed to load tables");
        setTables([]);
      }
    })();
  }, [selectedConn]);

  // Load schema when table selected
  useEffect(() => {
    if (!selectedConn || !selectedTable) {
      setTableSchema([]);
      return;
    }
    (async () => {
      try {
        const res = await api.database.schema(selectedConn, selectedTable);
        setTableSchema(res.data);
        setQueryText(`SELECT * FROM "${selectedTable}" LIMIT 100`);
      } catch {
        toast.error("Failed to load schema");
      }
    })();
  }, [selectedConn, selectedTable]);

  const handleAddConnection = async () => {
    if (!addName.trim() || !addPath.trim()) return;
    try {
      await api.database.addConnection({
        name: addName,
        type: "sqlite",
        connectionString: addPath,
      });
      toast.success("Connection added");
      setAddName("");
      setAddPath("");
      setShowAddForm(false);
      loadConnections();
    } catch (err) {
      toast.error(`Failed: ${err}`);
    }
  };

  const handleRemoveConnection = async (id: string) => {
    try {
      await api.database.removeConnection(id);
      if (selectedConn === id) {
        setSelectedConn(null);
        setResult(null);
      }
      loadConnections();
    } catch {
      toast.error("Failed to remove");
    }
  };

  const handleRunQuery = async () => {
    if (!selectedConn || !queryText.trim()) return;
    setLoading(true);
    setQueryError(null);
    try {
      const res = await api.database.query(selectedConn, queryText);
      setResult(res.data);
    } catch (err) {
      setQueryError(String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "100vh", background: "var(--color-bg-base)" }}>
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — connections + tables */}
        <aside
          className="flex flex-col flex-shrink-0 border-r overflow-y-auto"
          style={{
            width: 240,
            background: "var(--color-bg-sidebar, var(--color-bg-card))",
            borderColor: "var(--color-border)",
          }}
        >
          {/* Connections header */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Link
              href="/"
              className="p-1 rounded cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
              aria-label="Back"
            >
              <ArrowLeft size={14} weight="bold" />
            </Link>
            <Database size={14} weight="bold" style={{ color: "var(--color-text-secondary)" }} />
            <span className="text-xs font-bold" style={{ color: "var(--color-text-primary)" }}>
              Databases
            </span>
            <button
              onClick={() => setShowAddForm(true)}
              className="ml-auto p-1 rounded cursor-pointer"
              style={{ color: "var(--color-text-muted)", background: "none", border: "none" }}
              aria-label="Add connection"
            >
              <Plus size={14} weight="bold" />
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="px-3 py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
              <input
                placeholder="Connection name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full mb-1.5 px-2 py-1 text-xs rounded"
                style={{
                  background: "var(--color-bg-base)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                  outline: "none",
                }}
              />
              <input
                placeholder="SQLite file path"
                value={addPath}
                onChange={(e) => setAddPath(e.target.value)}
                className="w-full mb-1.5 px-2 py-1 text-xs rounded font-mono"
                style={{
                  background: "var(--color-bg-base)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                  outline: "none",
                }}
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleAddConnection}
                  className="flex-1 py-1 text-xs rounded cursor-pointer font-semibold"
                  style={{ background: "var(--color-accent)", color: "#fff", border: "none" }}
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-2 py-1 text-xs rounded cursor-pointer"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-secondary)",
                    border: "none",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Connection list */}
          {connections.map((c) => (
            <div key={c.id}>
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                style={{
                  background: selectedConn === c.id ? "var(--color-bg-elevated)" : "transparent",
                  color: "var(--color-text-primary)",
                }}
                onClick={() => setSelectedConn(selectedConn === c.id ? null : c.id)}
              >
                <Database
                  size={13}
                  weight={selectedConn === c.id ? "fill" : "regular"}
                  style={{ flexShrink: 0, color: "var(--color-accent)" }}
                />
                <span className="text-xs font-medium truncate flex-1">{c.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveConnection(c.id);
                  }}
                  className="p-0.5 rounded opacity-0 hover:opacity-100"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-text-muted)",
                    cursor: "pointer",
                  }}
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash size={12} />
                </button>
              </div>

              {/* Tables under this connection */}
              {selectedConn === c.id && tables.length > 0 && (
                <div style={{ paddingLeft: 20 }}>
                  {tables.map((t) => (
                    <div
                      key={t.name}
                      className="flex items-center gap-1.5 px-2 py-1 cursor-pointer"
                      style={{
                        background:
                          selectedTable === t.name ? "var(--color-bg-card)" : "transparent",
                        color:
                          selectedTable === t.name
                            ? "var(--color-text-primary)"
                            : "var(--color-text-secondary)",
                        fontSize: 12,
                      }}
                      onClick={() => setSelectedTable(selectedTable === t.name ? null : t.name)}
                    >
                      <Table size={11} style={{ flexShrink: 0 }} />
                      <span className="truncate">{t.name}</span>
                      <span className="text-xs opacity-50" style={{ fontSize: 10 }}>
                        {t.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {connections.length === 0 && !showAddForm && (
            <div
              className="px-3 py-6 text-center text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              No connections yet.
              <br />
              Click + to add a SQLite database.
            </div>
          )}
        </aside>

        {/* Main area */}
        <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Schema bar */}
          {selectedTable && tableSchema.length > 0 && (
            <div
              className="flex items-center gap-3 px-4 py-2 overflow-x-auto border-b"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-bg-card)",
                flexShrink: 0,
              }}
            >
              <span className="text-xs font-bold" style={{ color: "var(--color-text-secondary)" }}>
                {selectedTable}
              </span>
              {tableSchema.map((col) => (
                <span
                  key={col.cid}
                  className="text-xs whitespace-nowrap"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <span
                    style={{
                      color: col.pk ? "var(--color-accent)" : "var(--color-text-secondary)",
                    }}
                  >
                    {col.pk ? (
                      <Key size={10} weight="bold" style={{ display: "inline", marginRight: 2 }} />
                    ) : null}
                    {col.name}
                  </span>
                  <span style={{ opacity: 0.5, marginLeft: 2 }}>{col.type || "?"}</span>
                </span>
              ))}
            </div>
          )}

          {/* Query editor */}
          {selectedConn && (
            <div
              className="flex items-start gap-2 px-4 py-3 border-b"
              style={{ borderColor: "var(--color-border)", flexShrink: 0 }}
            >
              <textarea
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleRunQuery();
                  }
                }}
                placeholder="SELECT * FROM ... (Ctrl+Enter to run)"
                rows={3}
                style={{
                  flex: 1,
                  background: "var(--color-bg-base)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 13,
                  resize: "vertical",
                  outline: "none",
                }}
              />
              <button
                onClick={handleRunQuery}
                disabled={loading || !queryText.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer"
                style={{
                  background: "var(--color-accent)",
                  color: "#fff",
                  border: "none",
                  opacity: loading || !queryText.trim() ? 0.5 : 1,
                }}
                aria-label="Run query"
              >
                {loading ? (
                  <CircleNotch size={14} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Play size={14} weight="fill" />
                )}
                Run
              </button>
            </div>
          )}

          {/* Query error */}
          {queryError && (
            <div
              className="flex items-start gap-2 px-4 py-2 text-xs"
              style={{
                background: "#ef444415",
                color: "#ef4444",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <Warning size={14} weight="bold" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{queryError}</span>
              <button
                onClick={() => setQueryError(null)}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#ef4444",
                }}
                aria-label="Dismiss error"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {!selectedConn ? (
              <div
                className="flex flex-col items-center justify-center h-full gap-3"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Database size={40} weight="light" />
                <p className="text-sm">Select or add a database connection to get started</p>
              </div>
            ) : result ? (
              <div style={{ minWidth: "100%" }}>
                {result.truncated && (
                  <div
                    className="px-4 py-1.5 text-xs"
                    style={{
                      background: "#f59e0b15",
                      color: "#f59e0b",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    Results truncated to {result.rowCount} rows (max 1000)
                  </div>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {result.columns.map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: "6px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                            color: "var(--color-text-secondary)",
                            borderBottom: "2px solid var(--color-border)",
                            background: "var(--color-bg-card)",
                            position: "sticky",
                            top: 0,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: "1px solid var(--color-border)" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            "var(--color-bg-card)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                      >
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            style={{
                              padding: "4px 12px",
                              color:
                                cell === null
                                  ? "var(--color-text-muted)"
                                  : "var(--color-text-primary)",
                              fontFamily: "var(--font-mono, monospace)",
                              maxWidth: 300,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontStyle: cell === null ? "italic" : "normal",
                            }}
                            title={cell === null ? "NULL" : String(cell)}
                          >
                            {cell === null ? "NULL" : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
                </div>
              </div>
            ) : selectedConn && !loading ? (
              <div
                className="flex flex-col items-center justify-center h-full gap-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Play size={24} weight="light" />
                <p className="text-xs">Run a query to see results</p>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
