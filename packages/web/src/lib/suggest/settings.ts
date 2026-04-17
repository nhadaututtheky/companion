const KEY = "companion_inline_suggestions";

export function areInlineSuggestionsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const val = localStorage.getItem(KEY);
    // Default ON — only disabled if explicitly set to "false"
    return val !== "false";
  } catch {
    return true;
  }
}

export function setInlineSuggestionsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, enabled ? "true" : "false");
  } catch {
    // localStorage unavailable
  }
}
