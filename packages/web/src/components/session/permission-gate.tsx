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
      className="bg-bg-card flex flex-col gap-2 rounded-xl p-3"
      style={{
        border: "1px solid #FBBC04",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-center gap-2">
        <Lock size={14} weight="bold" className="shrink-0" style={{ color: "#FBBC04" }} />
        <span className="text-sm font-semibold">{req.toolName}</span>
        {autoApproveSeconds && countdown > 0 && (
          <span
            className="ml-auto rounded px-1.5 py-0.5 font-mono text-xs"
            style={{ background: "#FBBC0420", color: "#FBBC04" }}
          >
            {countdown}s
          </span>
        )}
      </div>

      {req.description && <p className="text-xs leading-relaxed">{req.description}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onRespond(req.requestId, "allow")}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity"
          style={{ background: "#34A853", color: "#fff" }}
        >
          <CheckCircle size={13} weight="bold" /> Allow
        </button>
        <button
          onClick={() => onRespond(req.requestId, "deny")}
          className="bg-bg-elevated flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity"
          style={{
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
