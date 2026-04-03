/**
 * RTK Strategy: Stack Trace Compressor
 *
 * Detects stack traces (Node, Python, Rust, Java/Go) and compresses them:
 * - Keep top 3 frames + root cause line
 * - Collapse middle frames with count
 * - Preserve error message and first/last frames
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Minimum stack trace frames to trigger compression */
const MIN_FRAMES = 6;

/** Frames to keep at top of trace */
const KEEP_TOP = 3;

/** Frames to keep at bottom of trace */
const KEEP_BOTTOM = 1;

// ─── Stack Trace Detectors ──────────────────────────────────────────────────

/** Node.js / JavaScript: "    at FunctionName (file:line:col)" */
const NODE_FRAME_RE = /^\s+at\s+/;

/** Python: '  File "path", line N' */
const PYTHON_FRAME_RE = /^\s+File\s+"/;

/** Rust: "   \d+: " or "stack backtrace:" */
const RUST_FRAME_RE = /^\s+\d+:\s+/;

/** Java / Go: "	at com.package.Class.method(File.java:123)" or "goroutine" */
const JAVA_FRAME_RE = /^\s+at\s+[\w.$]+\(/;

/** Generic: any line starting with whitespace that looks like a frame */
const GENERIC_FRAME_RE = /^\s{2,}(at\s|in\s|from\s|File\s|→\s|\d+:\s)/;

function isStackFrame(line: string): boolean {
  return (
    NODE_FRAME_RE.test(line) ||
    PYTHON_FRAME_RE.test(line) ||
    RUST_FRAME_RE.test(line) ||
    JAVA_FRAME_RE.test(line) ||
    GENERIC_FRAME_RE.test(line)
  );
}

// ─── Strategy ───────────────────────────────────────────────────────────────

interface StackRegion {
  /** Index of first frame line */
  start: number;
  /** Index of last frame line (inclusive) */
  end: number;
  /** Error/message line(s) before the trace */
  errorLines: number[];
}

export class StackTraceStrategy implements RTKStrategy {
  readonly name = "stack-trace";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    const lines = input.split("\n");
    const regions = this.findStackRegions(lines);

    if (regions.length === 0) return null;

    // Rebuild output with compressed stack regions
    const outputLines: string[] = [];
    let lastEnd = -1;

    for (const region of regions) {
      // Add non-stack lines between regions
      for (let i = lastEnd + 1; i < region.start; i++) {
        // Skip error lines that are part of this region (already before start)
        if (!region.errorLines.includes(i)) {
          outputLines.push(lines[i]!);
        }
      }

      // Add error message lines
      for (const errIdx of region.errorLines) {
        outputLines.push(lines[errIdx]!);
      }

      const frameCount = region.end - region.start + 1;

      if (frameCount <= MIN_FRAMES) {
        // Short trace — keep all frames
        for (let i = region.start; i <= region.end; i++) {
          outputLines.push(lines[i]!);
        }
      } else {
        // Compress: keep top N + bottom M, collapse middle
        const topEnd = region.start + KEEP_TOP;
        const bottomStart = region.end - KEEP_BOTTOM + 1;
        const omitted = bottomStart - topEnd;

        for (let i = region.start; i < topEnd; i++) {
          outputLines.push(lines[i]!);
        }
        outputLines.push(`    ... (${omitted} frames omitted)`);
        for (let i = bottomStart; i <= region.end; i++) {
          outputLines.push(lines[i]!);
        }
      }

      lastEnd = region.end;
    }

    // Add remaining lines after last region
    for (let i = lastEnd + 1; i < lines.length; i++) {
      outputLines.push(lines[i]!);
    }

    const output = outputLines.join("\n");
    if (output.length >= input.length) return null;

    return {
      output,
      tokensSaved: tokenDiff(input, output),
    };
  }

  private findStackRegions(lines: string[]): StackRegion[] {
    const regions: StackRegion[] = [];
    let i = 0;

    while (i < lines.length) {
      if (isStackFrame(lines[i]!)) {
        // Found start of stack trace — look backward for error message
        const errorLines: number[] = [];
        let lookback = i - 1;
        while (lookback >= 0 && lookback >= i - 3) {
          const prev = lines[lookback]!.trim();
          if (
            prev &&
            !isStackFrame(lines[lookback]!) &&
            (prev.includes("Error") ||
              prev.includes("error") ||
              prev.includes("Exception") ||
              prev.includes("panic") ||
              prev.includes("Traceback") ||
              prev.startsWith("Caused by"))
          ) {
            errorLines.unshift(lookback);
          }
          lookback--;
        }

        // Find end of stack trace
        const start = i;
        while (i < lines.length && isStackFrame(lines[i]!)) {
          i++;
        }
        const end = i - 1;

        regions.push({ start, end, errorLines });
      } else {
        i++;
      }
    }

    return regions;
  }
}
