export interface MatchResult {
  matched: boolean;
  keyword: string | null;
}

/**
 * Check if the prompt contains any of the given patterns (case-insensitive).
 * Returns the first matching keyword, or null if none matched.
 */
export function matchKeywords(prompt: string, patterns: string[]): MatchResult {
  const lower = prompt.toLowerCase();
  for (const p of patterns) {
    if (lower.includes(p.toLowerCase())) {
      return { matched: true, keyword: p };
    }
  }
  return { matched: false, keyword: null };
}
