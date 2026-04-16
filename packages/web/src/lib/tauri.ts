/** Check if running inside a Tauri desktop shell */
export function isTauriEnv(): boolean {
  const w = typeof window !== "undefined" ? window : undefined;
  return !!(w as Record<string, unknown> | undefined)?.__TAURI__;
}
