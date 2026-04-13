"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react";

export function ApiKeyIndicator() {
  const router = useRouter();
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const key = localStorage.getItem("api_key") ?? "";
    if (key && key !== "__no_auth__") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read on mount
      setKeyHint(key.slice(0, 4) + "••••");
    }
    // Fetch server version
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
    fetch(`${base}/api/setup-status`)
      .then((r) => r.json())
      .then((d) => {
        if (d.version) setVersion(d.version);
      })
      .catch(() => {});
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("api_key");
    router.replace("/login");
  }, [router]);

  return (
    <div className="flex flex-col gap-0" style={{ borderTop: "1px solid var(--color-border)" }}>
      {/* Version badge */}
      {version && (
        <div
          className="flex items-center justify-center px-4 py-1.5"
          style={{ borderBottom: keyHint ? "1px solid var(--color-border)" : undefined }}
        >
          <span
            className="text-[10px] font-mono text-text-muted"
            title={`Companion v${version}`}
          >
            v{version}
          </span>
        </div>
      )}
      {/* Auth row — only show if authenticated with key */}
      {keyHint && (
        <div className="flex items-center gap-2 px-4 py-2.5">
          <span
            className="rounded-full shrink-0" style={{
              width: 6,
              height: 6,
              background: "var(--color-google-green)",
              }}
            aria-hidden="true"
          />
          <span className="text-xs font-mono flex-1 truncate" title="Connected — API key active">
            {keyHint}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center p-1 rounded cursor-pointer transition-colors"
            aria-label="Logout — clear API key"
            title="Logout"
          >
            <SignOut size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
