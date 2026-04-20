import { APP_VERSION } from "@companion/shared";
import { isTauriEnv } from "./tauri";
import { trackEvent } from "./analytics";

export type FeedbackType = "bug" | "feature" | "general";

export interface FeedbackMeta {
  label: string;
  emoji: string;
  color: string;
  description: string;
}

export const FEEDBACK_TYPES: Record<FeedbackType, FeedbackMeta> = {
  bug: {
    label: "Report a Bug",
    emoji: "🐛",
    color: "#ef4444",
    description: "Something broken or acting unexpectedly?",
  },
  feature: {
    label: "Feature Request",
    emoji: "💡",
    color: "#f59e0b",
    description: "An idea to make Companion better?",
  },
  general: {
    label: "General Feedback",
    emoji: "💬",
    color: "#3b82f6",
    description: "Thoughts, praise, anything else.",
  },
};

/**
 * Telegram handle for receiving feedback. Override via NEXT_PUBLIC_FEEDBACK_TELEGRAM
 * at build time; defaults to the official Companion feedback bot.
 */
const TELEGRAM_HANDLE =
  process.env.NEXT_PUBLIC_FEEDBACK_TELEGRAM ?? "xlabsfeedback";

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

function buildTemplate(type: FeedbackType): string {
  const meta = FEEDBACK_TYPES[type];
  const platform = detectPlatform();
  const surface = isTauriEnv() ? "Desktop" : "Web";
  return `[Companion v${APP_VERSION} · ${platform} ${surface}]
Type: ${meta.emoji} ${meta.label}

`;
}

export function buildFeedbackUrl(type: FeedbackType): string {
  const text = encodeURIComponent(buildTemplate(type));
  return `https://t.me/${TELEGRAM_HANDLE}?text=${text}`;
}

/** Open Telegram with a pre-filled feedback template. */
export function openFeedback(type: FeedbackType): void {
  const url = buildFeedbackUrl(type);
  void trackEvent("feedback_sent", { type });
  window.open(url, "_blank", "noopener,noreferrer");
}
