const STORAGE_KEY = "companion_dismissed_tips";
const TIPS_ENABLED_KEY = "companion_tips_enabled";

export function isDismissed(tipId: string): boolean {
  try {
    const dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
    return dismissed.includes(tipId);
  } catch {
    return false;
  }
}

export function dismissTip(tipId: string): void {
  try {
    const dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
    if (!dismissed.includes(tipId)) {
      dismissed.push(tipId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
    }
  } catch {
    // ignore
  }
}

export function areTipsEnabled(): boolean {
  try {
    const val = localStorage.getItem(TIPS_ENABLED_KEY);
    return val === null || val === "true";
  } catch {
    return true;
  }
}

export function setTipsEnabled(enabled: boolean): void {
  localStorage.setItem(TIPS_ENABLED_KEY, String(enabled));
}

export function resetDismissedTips(): void {
  localStorage.removeItem(STORAGE_KEY);
}
