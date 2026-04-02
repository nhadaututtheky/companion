import { describe, expect, test, beforeEach } from "bun:test";
import { VirtualScreen } from "../services/virtual-screen.js";

// ─── Basic text output ─────────────────────────────────────────────────────

describe("VirtualScreen — simple text", () => {
  test("write plain text → toString returns that text", () => {
    const screen = new VirtualScreen();
    screen.write("Hello");
    expect(screen.toString()).toBe("Hello");
  });

  test("newline creates second line", () => {
    const screen = new VirtualScreen();
    // \n advances row but NOT col — use \r\n for a true new line from col 0
    screen.write("Hello\r\nWorld");
    const lines = screen.toString().split("\n");
    expect(lines[0]).toBe("Hello");
    expect(lines[1]).toBe("World");
  });

  test("carriage return overwrites from col 0", () => {
    const screen = new VirtualScreen();
    screen.write("Hello\rWorld");
    // CR moves cursor to col 0; "World" overwrites "Hello" → "World"
    expect(screen.toString()).toBe("World");
  });

  test("CR+LF produces two lines", () => {
    const screen = new VirtualScreen();
    screen.write("Hello\r\nWorld");
    const lines = screen.toString().split("\n");
    expect(lines[0]).toBe("Hello");
    expect(lines[1]).toBe("World");
  });
});

// ─── Control characters ────────────────────────────────────────────────────

describe("VirtualScreen — control characters", () => {
  test("tab advances cursor to next 8-column stop", () => {
    const screen = new VirtualScreen();
    screen.write("A\tB");
    const out = screen.toString();
    // "A" at col 0, tab jumps to col 8, "B" at col 8
    expect(out[0]).toBe("A");
    expect(out[8]).toBe("B");
    // columns 1-7 are spaces
    for (let i = 1; i < 8; i++) {
      expect(out[i]).toBe(" ");
    }
  });

  test("backspace moves cursor back without erasing", () => {
    const screen = new VirtualScreen();
    screen.write("Hello\b\b");
    // cursor is at col 3 after two backspaces, but chars at 3-4 still exist
    // what matters: subsequent write overwrites from col 3
    screen.write("XY");
    // "HelXY"
    expect(screen.toString()).toBe("HelXY");
  });

  test("backspace at col 0 does not go negative", () => {
    const screen = new VirtualScreen();
    screen.write("\b\bHi");
    expect(screen.toString()).toBe("Hi");
  });
});

// ─── ANSI sequences ────────────────────────────────────────────────────────

describe("VirtualScreen — ANSI color / SGR", () => {
  test("ANSI color codes are stripped, text is preserved", () => {
    const screen = new VirtualScreen();
    screen.write("\x1b[31mRed\x1b[0m");
    expect(screen.toString()).toBe("Red");
  });

  test("bold + reset sequences stripped", () => {
    const screen = new VirtualScreen();
    screen.write("\x1b[1mBold\x1b[0m Normal");
    expect(screen.toString()).toBe("Bold Normal");
  });
});

// ─── Cursor positioning ────────────────────────────────────────────────────

describe("VirtualScreen — cursor positioning (CSI H)", () => {
  test("\\x1b[2;5H places cursor at row 2 col 5 (1-based)", () => {
    const screen = new VirtualScreen();
    screen.write("\x1b[2;5HX");
    const lines = screen.toString().split("\n");
    // row index 1 (0-based), col index 4 (0-based)
    expect(lines[1]![4]).toBe("X");
  });

  test("\\x1b[1;1H places cursor at top-left", () => {
    const screen = new VirtualScreen();
    screen.write("AB\x1b[1;1HZ");
    // Z overwrites col 0, "B" remains at col 1
    expect(screen.toString()).toBe("ZB");
  });
});

// ─── Cursor movement ──────────────────────────────────────────────────────

describe("VirtualScreen — cursor movement sequences", () => {
  test("\\x1b[A (cursor up) moves up one row", () => {
    const screen = new VirtualScreen();
    // Write "AB" on row 0, CR+LF to row 1 col 0, then up 1 row, write "X" at col 0
    screen.write("AB\r\n\x1b[AX");
    const lines = screen.toString().split("\n");
    expect(lines[0]).toBe("XB");
  });

  test("\\x1b[B (cursor down) moves down one row", () => {
    const screen = new VirtualScreen();
    // Start at row 0, go down 1, write "X"
    screen.write("\x1b[BX");
    const lines = screen.toString().split("\n");
    expect(lines[1]![0]).toBe("X");
  });

  test("\\x1b[C (cursor forward) moves right", () => {
    const screen = new VirtualScreen();
    // Move 3 forward then write "X" → X at col 3
    screen.write("\x1b[3CX");
    expect(screen.toString()[3]).toBe("X");
  });

  test("\\x1b[D (cursor back) moves left", () => {
    const screen = new VirtualScreen();
    screen.write("ABC\x1b[2DX");
    // "ABC", move back 2 (col 3→1), write "X" → "AXC"
    expect(screen.toString()).toBe("AXC");
  });
});

// ─── Erase sequences ──────────────────────────────────────────────────────

describe("VirtualScreen — erase sequences", () => {
  test("\\x1b[2J clears entire screen and resets cursor", () => {
    const screen = new VirtualScreen();
    screen.write("Hello\nWorld");
    screen.write("\x1b[2J");
    expect(screen.toString()).toBe("");
  });

  test("\\x1b[K (erase to end of line) clears from cursor position", () => {
    const screen = new VirtualScreen();
    screen.write("Hello");
    // Move cursor back to col 2 then erase to end
    screen.write("\x1b[3D\x1b[K");
    // "He" remains, rest cleared → "He"
    expect(screen.toString()).toBe("He");
  });
});

// ─── clear() ──────────────────────────────────────────────────────────────

describe("VirtualScreen — clear()", () => {
  test("clear() resets screen to empty", () => {
    const screen = new VirtualScreen();
    screen.write("Hello\nWorld");
    screen.clear();
    expect(screen.toString()).toBe("");
  });

  test("after clear(), new writes start from top-left", () => {
    const screen = new VirtualScreen();
    screen.write("Old content");
    screen.clear();
    screen.write("New");
    expect(screen.toString()).toBe("New");
  });
});

// ─── Static sanitize() ────────────────────────────────────────────────────

describe("VirtualScreen.sanitize()", () => {
  test("strips ANSI color codes", () => {
    expect(VirtualScreen.sanitize("\x1b[31mRed\x1b[0m")).toBe("Red");
  });

  test("strips CSI cursor movement sequences", () => {
    expect(VirtualScreen.sanitize("A\x1b[2CB")).toBe("AB");
  });

  test("preserves newlines", () => {
    const result = VirtualScreen.sanitize("Line1\nLine2");
    expect(result).toBe("Line1\nLine2");
  });

  test("preserves tabs", () => {
    const result = VirtualScreen.sanitize("A\tB");
    expect(result).toBe("A\tB");
  });

  test("strips OSC sequences (e.g., terminal title set)", () => {
    const result = VirtualScreen.sanitize("\x1b]0;My Title\x07Hello");
    expect(result).toBe("Hello");
  });

  test("plain text passthrough unchanged", () => {
    expect(VirtualScreen.sanitize("plain text")).toBe("plain text");
  });
});

// ─── Small grid / clipping ────────────────────────────────────────────────

describe("VirtualScreen — small grid (cols=10)", () => {
  test("text beyond col limit is clipped, not wrapped", () => {
    const screen = new VirtualScreen({ cols: 10, rows: 10 });
    screen.write("0123456789EXTRA");
    // VirtualScreen clips at cols, extra chars are dropped
    expect(screen.toString()).toBe("0123456789");
  });

  test("multiple lines within narrow grid", () => {
    const screen = new VirtualScreen({ cols: 10, rows: 10 });
    // Use \r\n so the second line starts at col 0
    screen.write("Hello\r\nWorld");
    const lines = screen.toString().split("\n");
    expect(lines[0]).toBe("Hello");
    expect(lines[1]).toBe("World");
  });
});
