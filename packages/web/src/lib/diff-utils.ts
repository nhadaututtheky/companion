/**
 * Pure diff algorithm utilities — extracted from inline-diff.tsx so they can
 * be imported independently (and tested without React / jsdom).
 */

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldNum?: number;
  newNum?: number;
}

/** LCS-based diff. Returns all lines with type + line numbers. */
export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        oldLines[i - 1] === newLines[j - 1]
          ? (dp[i - 1]?.[j - 1] ?? 0) + 1
          : Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0);
    }
  }

  // Backtrack
  const raw: Array<{ type: "context" | "remove" | "add"; content: string }> = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.unshift({ type: "context", content: oldLines[i - 1]! });
      i--;
      j--;
    } else if (
      j > 0 &&
      (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))
    ) {
      raw.unshift({ type: "add", content: newLines[j - 1]! });
      j--;
    } else {
      raw.unshift({ type: "remove", content: oldLines[i - 1]! });
      i--;
    }
  }

  // Attach line numbers
  const result: DiffLine[] = [];
  let oldNum = 1;
  let newNum = 1;

  for (const entry of raw) {
    if (entry.type === "context") {
      result.push({ ...entry, oldNum, newNum });
      oldNum++;
      newNum++;
    } else if (entry.type === "remove") {
      result.push({ ...entry, oldNum });
      oldNum++;
    } else {
      result.push({ ...entry, newNum });
      newNum++;
    }
  }

  return result;
}

/** Filter diff to only changed hunks + N lines of context around them. */
export function extractHunks(lines: DiffLine[], contextSize = 3): DiffLine[] {
  const changed = new Set<number>();
  lines.forEach((l, idx) => {
    if (l.type !== "context") changed.add(idx);
  });

  const keep = new Set<number>();
  for (const idx of changed) {
    for (
      let k = Math.max(0, idx - contextSize);
      k <= Math.min(lines.length - 1, idx + contextSize);
      k++
    ) {
      keep.add(k);
    }
  }

  return lines.filter((_, idx) => keep.has(idx));
}
