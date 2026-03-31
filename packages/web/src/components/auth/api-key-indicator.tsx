"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut } from "@phosphor-icons/react";

export function ApiKeyIndicator() {
  const router = useRouter();
  const [keyHint, setKeyHint] = useState<string | null>(null);

  useEffect(() => {
    const key = localStorage.getItem("api_key") ?? "";
    if (key) {
      // Show first 4 chars followed by ••••
      setKeyHint(key.slice(0, 4) + "••••");
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("api_key");
    router.replace("/login");
  }, [router]);

  if (!keyHint) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5"
      style={{ borderTop: "1px solid var(--color-border)" }}
    >
      {/* Connected dot + key hint */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--color-google-green)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      <span
        className="text-xs font-mono flex-1 truncate"
        style={{ color: "var(--color-text-muted)" }}
        title="Connected — API key active"
      >
        {keyHint}
      </span>
      {/* Logout button */}
      <button
        onClick={handleLogout}
        className="flex items-center justify-center p-1 rounded cursor-pointer transition-colors"
        style={{ color: "var(--color-text-muted)" }}
        aria-label="Logout — clear API key"
        title="Logout"
      >
        <SignOut size={14} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
