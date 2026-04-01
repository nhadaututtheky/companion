"use client";
import { useEffect, useState } from "react";
import { Lock, CheckCircle, XCircle } from "@phosphor-icons/react";

interface PermissionRequest {
  requestId: string;
  toolName: string;
  description?: string;
}

interface PermissionGateProps {
  permissions: PermissionRequest[];
  onRespond: (requestId: string, behavior: "allow" | "deny") => void;
  autoApproveSeconds?: number;
}

function PermissionCard({
  req,
  onRespond,
  autoApproveSeconds,
}: {
  req: PermissionRequest;
  onRespond: (id: string, b: "allow" | "deny") => void;
  autoApproveSeconds?: number;
}) {
  const [countdown, setCountdown] = useState(autoApproveSeconds ?? 0);

  useEffect(() => {
    if (!autoApproveSeconds) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          onRespond(req.requestId, "allow");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoApproveSeconds, req.requestId, onRespond]);

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-xl"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid #FBBC04",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center gap-2">
        <Lock size={14} weight="bold" style={{ color: "#FBBC04", flexShrink: 0 }} />
        <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {req.toolName}
        </span>
        {autoApproveSeconds && countdown > 0 && (
          <span
            className="ml-auto text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: "#FBBC0420", color: "#FBBC04" }}
          >
            {countdown}s
          </span>
        )}
      </div>

      {req.description && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          {req.description}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onRespond(req.requestId, "allow")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity cursor-pointer"
          style={{ background: "#34A853", color: "#fff" }}
        >
          <CheckCircle size={13} weight="bold" /> Allow
        </button>
        <button
          onClick={() => onRespond(req.requestId, "deny")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity cursor-pointer"
          style={{
            background: "var(--color-bg-elevated)",
            color: "#EA4335",
            border: "1px solid #EA433530",
          }}
        >
          <XCircle size={13} weight="bold" /> Deny
        </button>
      </div>
    </div>
  );
}

export function PermissionGate({
  permissions,
  onRespond,
  autoApproveSeconds,
}: PermissionGateProps) {
  if (permissions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {permissions.map((req) => (
        <PermissionCard
          key={req.requestId}
          req={req}
          onRespond={onRespond}
          autoApproveSeconds={autoApproveSeconds}
        />
      ))}
    </div>
  );
}
