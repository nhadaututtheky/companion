"use client";

import { useState, useEffect, useCallback } from "react";
import { Power, Eye, EyeSlash, Info } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { isTauriEnv } from "@/lib/tauri";

/** Tauri autostart JS API — dynamically imported to avoid errors in browser mode */
async function getAutostart() {
  const mod = await import("@tauri-apps/plugin-autostart");
  return mod;
}

export function DesktopTab() {
  const [autostart, setAutostart] = useState(false);
  const [showOnStartup, setShowOnStartup] = useState(true);
  const [loading, setLoading] = useState(true);
  const isDesktop = isTauriEnv();

  // Load current state
  useEffect(() => {
    if (!isDesktop) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // Load autostart status from Tauri plugin
        const { isEnabled } = await getAutostart();
        setAutostart(await isEnabled());
      } catch {
        // Plugin not available — leave as false
      }

      try {
        // Load show-on-startup from server settings
        const res = await api.settings.get("desktop.showOnStartup");
        setShowOnStartup(res.data?.value !== "false");
      } catch {
        // Default: show on startup
      }

      setLoading(false);
    })();
  }, [isDesktop]);

  const toggleAutostart = useCallback(async () => {
    try {
      const { enable, disable, isEnabled } = await getAutostart();
      if (await isEnabled()) {
        await disable();
        setAutostart(false);
      } else {
        await enable();
        setAutostart(true);
      }
    } catch (err) {
      console.error("Failed to toggle autostart:", err);
    }
  }, []);

  const toggleShowOnStartup = useCallback(async () => {
    const newValue = !showOnStartup;
    setShowOnStartup(newValue);
    try {
      await api.settings.set("desktop.showOnStartup", String(newValue));
    } catch (err) {
      console.error("Failed to save show-on-startup:", err);
      setShowOnStartup(!newValue); // revert
    }
  }, [showOnStartup]);

  if (!isDesktop) {
    return (
      <div className="text-text-muted flex flex-col items-center gap-3 py-16 text-sm">
        <Info size={32} weight="duotone" />
        <p>Desktop settings are only available in the Companion desktop app.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-text-primary mb-1 text-sm font-semibold">Startup</h3>
        <p className="text-text-muted mb-4 text-xs">
          Control how Companion starts when you log into Windows.
        </p>

        {/* Start with Windows */}
        <label className="mb-3 flex cursor-pointer items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-[var(--color-bg-elevated)]">
          <div className="flex items-center gap-3">
            <Power size={18} weight="bold" className="text-text-secondary" />
            <div>
              <div className="text-text-primary text-sm font-medium">Start with Windows</div>
              <div className="text-text-muted text-xs">
                Automatically launch Companion when you log in
              </div>
            </div>
          </div>
          <button
            onClick={toggleAutostart}
            disabled={loading}
            className="relative h-6 w-11 cursor-pointer rounded-full transition-colors disabled:opacity-50"
            style={{
              background: autostart ? "var(--color-accent)" : "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
            role="switch"
            aria-checked={autostart}
            aria-label="Start with Windows"
          >
            <span
              className="absolute top-0.5 block h-4 w-4 rounded-full shadow-sm transition-transform"
              style={{
                background: "var(--color-text-primary)",
                transform: autostart ? "translateX(22px)" : "translateX(3px)",
              }}
            />
          </button>
        </label>

        {/* Show window on startup */}
        <label className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-[var(--color-bg-elevated)]">
          <div className="flex items-center gap-3">
            {showOnStartup ? (
              <Eye size={18} weight="bold" className="text-text-secondary" />
            ) : (
              <EyeSlash size={18} weight="bold" className="text-text-secondary" />
            )}
            <div>
              <div className="text-text-primary text-sm font-medium">Show window on startup</div>
              <div className="text-text-muted text-xs">
                {showOnStartup
                  ? "Window opens immediately when Companion starts"
                  : "Companion starts hidden in the system tray"}
              </div>
            </div>
          </div>
          <button
            onClick={toggleShowOnStartup}
            disabled={loading}
            className="relative h-6 w-11 cursor-pointer rounded-full transition-colors disabled:opacity-50"
            style={{
              background: showOnStartup ? "var(--color-accent)" : "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
            role="switch"
            aria-checked={showOnStartup}
            aria-label="Show window on startup"
          >
            <span
              className="absolute top-0.5 block h-4 w-4 rounded-full shadow-sm transition-transform"
              style={{
                background: "var(--color-text-primary)",
                transform: showOnStartup ? "translateX(22px)" : "translateX(3px)",
              }}
            />
          </button>
        </label>
      </div>
    </div>
  );
}
