/**
 * Version Check Service — polls GitHub releases for new versions.
 * Caches result to avoid hammering the API.
 */

import { APP_VERSION } from "@companion/shared";
import { createLogger } from "../logger.js";

const log = createLogger("version-check");

const GITHUB_REPO = "nhadaututtheky/companion-release";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

let cachedResult: UpdateInfo | null = null;
let cachedAt = 0;

/**
 * Compare semver strings. Returns:
 *  1 if a > b, -1 if a < b, 0 if equal.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export async function checkForUpdate(force = false): Promise<UpdateInfo> {
  // Return cached if still fresh
  if (!force && cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  const currentVersion = APP_VERSION;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": `Companion/${currentVersion}`,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      log.warn("GitHub API returned non-OK", { status: res.status });
      return buildNoUpdate(currentVersion);
    }

    const release = (await res.json()) as GitHubRelease;

    if (release.draft || release.prerelease) {
      return buildNoUpdate(currentVersion);
    }

    const latestVersion = release.tag_name.replace(/^v/, "");
    const available = compareSemver(latestVersion, currentVersion) > 0;

    const result: UpdateInfo = {
      available,
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url,
      releaseNotes: release.body?.slice(0, 2000) ?? "",
      publishedAt: release.published_at,
    };

    cachedResult = result;
    cachedAt = Date.now();

    if (available) {
      log.info("Update available", { current: currentVersion, latest: latestVersion });
    }

    return result;
  } catch (err) {
    log.warn("Update check failed", { error: String(err) });
    return buildNoUpdate(currentVersion);
  }
}

function buildNoUpdate(currentVersion: string): UpdateInfo {
  return {
    available: false,
    currentVersion,
    latestVersion: currentVersion,
    releaseUrl: "",
    releaseNotes: "",
    publishedAt: "",
  };
}
