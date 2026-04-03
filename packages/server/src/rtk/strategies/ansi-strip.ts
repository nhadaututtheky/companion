/**
 * RTK Strategy: ANSI/Control Character Stripper
 *
 * Removes ANSI escape sequences, OSC sequences, control characters,
 * progress bar artifacts, and carriage return overwrites.
 * Extends VirtualScreen.sanitize() with additional patterns.
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** CSI sequences: \x1b[...X */
const CSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/** OSC sequences: \x1b]...BEL or \x1b]...\x1b\\ */
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** Other ESC sequences */
const ESC_RE = /\x1b[^[\]]/g;

/** Control characters (except \t, \n, \r) */
const CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

/** Carriage return overwrites: text\roverwrite → keep overwrite */
const CR_OVERWRITE_RE = /^.*\r(?!\n)/gm;

/** Progress bar patterns: [====>     ] 45% or ████░░░░ */
const PROGRESS_RE = /^.*[▏▎▍▌▋▊▉█░▒▓■□●○◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\\-]{3,}.*$/gm;

/** Spinner lines that get overwritten */
const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◑◒◓|/\\-] .{0,80}$/gm;

export class AnsiStripStrategy implements RTKStrategy {
  readonly name = "ansi-strip";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    let output = input
      .replace(CSI_RE, "")
      .replace(OSC_RE, "")
      .replace(ESC_RE, "")
      .replace(CTRL_RE, "")
      .replace(CR_OVERWRITE_RE, "")
      .replace(PROGRESS_RE, "")
      .replace(SPINNER_RE, "");

    // Clean up trailing whitespace on each line
    output = output
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");

    if (output === input) return null;

    return {
      output,
      tokensSaved: tokenDiff(input, output),
    };
  }
}
