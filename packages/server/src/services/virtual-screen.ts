/**
 * VirtualScreen — Reconstructs a 2D character grid from raw PTY output.
 * Strips ANSI styling while preserving text positioning.
 * Fixes garbled output when TUI apps draw at specific cursor positions.
 */

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 500;

export class VirtualScreen {
  private grid: string[][];
  private cursorRow = 0;
  private cursorCol = 0;
  private readonly cols: number;
  private readonly rows: number;

  constructor(opts?: { cols?: number; rows?: number }) {
    this.cols = opts?.cols ?? DEFAULT_COLS;
    this.rows = opts?.rows ?? DEFAULT_ROWS;
    this.grid = this.createEmptyGrid();
  }

  /**
   * Process raw PTY output and update the virtual screen.
   */
  write(data: string): void {
    let i = 0;
    while (i < data.length) {
      const ch = data[i];

      // ESC sequence
      if (ch === "\x1b" && i + 1 < data.length) {
        const next = data[i + 1];

        // CSI sequence: ESC [
        if (next === "[") {
          i += 2;
          i = this.handleCSI(data, i);
          continue;
        }

        // OSC sequence: ESC ]
        if (next === "]") {
          i += 2;
          i = this.skipOSC(data, i);
          continue;
        }

        // Other ESC sequences — skip ESC + next char
        i += 2;
        continue;
      }

      // Carriage return
      if (ch === "\r") {
        this.cursorCol = 0;
        i++;
        continue;
      }

      // Newline
      if (ch === "\n") {
        this.cursorRow++;
        this.ensureRow();
        i++;
        continue;
      }

      // Backspace
      if (ch === "\b") {
        if (this.cursorCol > 0) this.cursorCol--;
        i++;
        continue;
      }

      // Tab
      if (ch === "\t") {
        this.cursorCol = Math.min(this.cursorCol + (8 - (this.cursorCol % 8)), this.cols - 1);
        i++;
        continue;
      }

      // Regular printable character
      if (ch !== undefined && ch.charCodeAt(0) >= 32) {
        this.ensureRow();
        if (this.cursorCol < this.cols) {
          this.grid[this.cursorRow]![this.cursorCol] = ch;
          this.cursorCol++;
        }
        i++;
        continue;
      }

      // Skip other control characters
      i++;
    }
  }

  /**
   * Get the screen content as a string (non-empty lines only).
   */
  toString(): string {
    const lines: string[] = [];
    for (const row of this.grid) {
      const line = row.join("").trimEnd();
      lines.push(line);
    }

    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    return lines.join("\n");
  }

  /**
   * Reset the screen to empty state.
   */
  clear(): void {
    this.grid = this.createEmptyGrid();
    this.cursorRow = 0;
    this.cursorCol = 0;
  }

  /**
   * Sanitize raw PTY output — strip ANSI styling, keep clean text.
   * Static utility for simple string cleaning without full screen tracking.
   */
  static sanitize(data: string): string {
    return (
      data
        // Strip CSI sequences (ESC [ ... final_byte)
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
        // Strip OSC sequences (ESC ] ... BEL/ST)
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
        // Strip other ESC sequences
        .replace(/\x1b[^[\]]/g, "")
        // Strip remaining control chars except \n, \r, \t
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    );
  }

  // ─── CSI sequence handling ────────────────────────────────────────────────

  private handleCSI(data: string, start: number): number {
    // Parse params: digits and semicolons until a letter
    let i = start;
    let params = "";
    while (i < data.length) {
      const c = data[i]!;
      if ((c >= "0" && c <= "9") || c === ";" || c === "?") {
        params += c;
        i++;
      } else {
        break;
      }
    }

    if (i >= data.length) return i;

    const cmd = data[i];
    i++; // consume the command character

    const parts = params.split(";").map((p) => (p === "" ? 0 : parseInt(p, 10)));

    switch (cmd) {
      case "H": // Cursor Position (row;col) — 1-based
      case "f": {
        const row = (parts[0] || 1) - 1;
        const col = (parts[1] || 1) - 1;
        this.cursorRow = Math.max(0, row);
        this.cursorCol = Math.max(0, Math.min(col, this.cols - 1));
        this.ensureRow();
        break;
      }

      case "A": // Cursor Up
        this.cursorRow = Math.max(0, this.cursorRow - (parts[0] || 1));
        break;

      case "B": // Cursor Down
        this.cursorRow += parts[0] || 1;
        this.ensureRow();
        break;

      case "C": // Cursor Forward
        this.cursorCol = Math.min(this.cols - 1, this.cursorCol + (parts[0] || 1));
        break;

      case "D": // Cursor Back
        this.cursorCol = Math.max(0, this.cursorCol - (parts[0] || 1));
        break;

      case "G": // Cursor Horizontal Absolute (col) — 1-based
        this.cursorCol = Math.max(0, Math.min((parts[0] || 1) - 1, this.cols - 1));
        break;

      case "J": {
        // Erase in Display
        const mode = parts[0] || 0;
        if (mode === 2 || mode === 3) {
          // Clear entire screen
          this.grid = this.createEmptyGrid();
          this.cursorRow = 0;
          this.cursorCol = 0;
        } else if (mode === 0) {
          // Clear from cursor to end
          this.clearLine(this.cursorRow, this.cursorCol);
          for (let r = this.cursorRow + 1; r < this.grid.length; r++) {
            this.grid[r] = this.createEmptyRow();
          }
        } else if (mode === 1) {
          // Clear from start to cursor
          for (let r = 0; r < this.cursorRow; r++) {
            this.grid[r] = this.createEmptyRow();
          }
          const currentRow = this.grid[this.cursorRow];
          if (currentRow) {
            for (let c = 0; c <= this.cursorCol && c < this.cols; c++) {
              currentRow[c] = " ";
            }
          }
        }
        break;
      }

      case "K": {
        // Erase in Line
        const lineMode = parts[0] || 0;
        this.ensureRow();
        if (lineMode === 0) {
          // Clear from cursor to end of line
          this.clearLine(this.cursorRow, this.cursorCol);
        } else if (lineMode === 1) {
          // Clear from start to cursor
          const curRow = this.grid[this.cursorRow];
          if (curRow) {
            for (let c = 0; c <= this.cursorCol && c < this.cols; c++) {
              curRow[c] = " ";
            }
          }
        } else if (lineMode === 2) {
          // Clear entire line
          this.grid[this.cursorRow] = this.createEmptyRow();
        }
        break;
      }

      // SGR (Select Graphic Rendition) — styling, just ignore
      case "m":
        break;

      // Other CSI commands — ignore
      default:
        break;
    }

    return i;
  }

  private skipOSC(data: string, start: number): number {
    let i = start;
    while (i < data.length) {
      // BEL terminates OSC
      if (data[i] === "\x07") return i + 1;
      // ST (ESC \) terminates OSC
      if (data[i] === "\x1b" && i + 1 < data.length && data[i + 1] === "\\") return i + 2;
      i++;
    }
    return i;
  }

  private ensureRow(): void {
    while (this.grid.length <= this.cursorRow) {
      this.grid.push(this.createEmptyRow());
    }
    // Enforce scrollback limit
    if (this.grid.length > this.rows) {
      this.grid.splice(0, this.grid.length - this.rows);
      this.cursorRow = this.grid.length - 1;
    }
  }

  private clearLine(row: number, fromCol: number): void {
    const gridRow = this.grid[row];
    if (!gridRow) return;
    for (let c = fromCol; c < this.cols; c++) {
      gridRow[c] = " ";
    }
  }

  private createEmptyRow(): string[] {
    return new Array(this.cols).fill(" ");
  }

  private createEmptyGrid(): string[][] {
    return [];
  }
}
