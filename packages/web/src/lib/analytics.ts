import { APP_VERSION } from "@companion/shared";
import { isTauriEnv } from "./tauri";

const APTABASE_KEY =
  process.env.NEXT_PUBLIC_APTABASE_KEY ?? "A-US-7093276925";

const REGION = APTABASE_KEY.startsWith("A-EU-")
  ? "eu"
  : APTABASE_KEY.startsWith("A-DEV-")
    ? "dev"
    : "us";
const ENDPOINT = `https://${REGION}.aptabase.com/api/v0/event`;

const OPT_IN_KEY = "companion_analytics_opted_in";

type EventProps = Record<string, string | number | boolean>;

export function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(OPT_IN_KEY) === "true";
}

export function setAnalyticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OPT_IN_KEY, enabled ? "true" : "false");
}

let sessionId: string | null = null;
let lastActivity = 0;
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;

function getSessionId(): string {
  const now = Date.now();
  if (!sessionId || now - lastActivity > SESSION_TIMEOUT_MS) {
    sessionId = crypto.randomUUID();
  }
  lastActivity = now;
  return sessionId;
}

function detectOS(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

function getSystemProps() {
  return {
    isDebug: process.env.NODE_ENV !== "production",
    locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
    appVersion: APP_VERSION,
    osName: detectOS(),
    osVersion: "",
    engineName: isTauriEnv() ? "Tauri" : "Web",
    engineVersion: "2.0",
    sdkVersion: "companion@1.0.0",
  };
}

export async function trackEvent(name: string, props?: EventProps): Promise<void> {
  if (!isAnalyticsEnabled()) return;
  if (typeof fetch === "undefined") return;

  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "App-Key": APTABASE_KEY,
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        sessionId: getSessionId(),
        eventName: name,
        systemProps: getSystemProps(),
        props: props ?? {},
      }),
      keepalive: true,
    });
  } catch {
    // Silent fail — analytics never break the app
  }
}

export function initAnalytics(): void {
  if (!isAnalyticsEnabled()) return;
  void trackEvent("app_opened");
}
