/**
 * Unit tests for telegram formatter — HTML conversion, escaping, splitting, danger detection.
 */

import { describe, it, expect } from "bun:test";
import {
  escapeHTML,
  toTelegramHTML,
  splitMessage,
  wrapExpandable,
  stripHtmlTags,
  formatCost,
  formatTokens,
  formatDuration,
  isBashDangerous,
  isFileDangerous,
  isPermissionDangerous,
  formatPermission,
  formatToolAction,
  formatToolFeed,
} from "./formatter.js";

describe("formatter", () => {
  describe("escapeHTML", () => {
    it("escapes &, <, >", () => {
      expect(escapeHTML("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
    });

    it("handles empty string", () => {
      expect(escapeHTML("")).toBe("");
    });
  });

  describe("toTelegramHTML", () => {
    it("returns empty string for empty input", () => {
      expect(toTelegramHTML("")).toBe("");
    });

    it("converts code blocks", () => {
      const result = toTelegramHTML("```js\nconst x = 1;\n```");
      expect(result).toContain("<pre><code");
      expect(result).toContain("language-js");
      expect(result).toContain("const x = 1;");
    });

    it("converts inline code", () => {
      const result = toTelegramHTML("Use `foo()` here");
      expect(result).toContain("<code>foo()</code>");
    });

    it("converts bold markdown", () => {
      const result = toTelegramHTML("This is **bold** text");
      expect(result).toContain("<b>bold</b>");
    });

    it("converts italic markdown", () => {
      const result = toTelegramHTML("This is *italic* text");
      expect(result).toContain("<i>italic</i>");
    });

    it("converts strikethrough", () => {
      const result = toTelegramHTML("This is ~~deleted~~ text");
      expect(result).toContain("<s>deleted</s>");
    });

    it("converts links", () => {
      const result = toTelegramHTML("[Click](https://example.com)");
      expect(result).toContain('<a href="https://example.com">Click</a>');
    });

    it("converts headings to bold", () => {
      const result = toTelegramHTML("# Main Title");
      expect(result).toContain("<b>Main Title</b>");
    });

    it("escapes HTML in regular text", () => {
      const result = toTelegramHTML("a <div> tag");
      expect(result).toContain("&lt;div&gt;");
    });

    it("handles unclosed code fences", () => {
      const result = toTelegramHTML("```python\nprint('hi')");
      expect(result).toContain("<pre><code");
      expect(result).toContain("print(");
    });
  });

  describe("splitMessage", () => {
    it("returns single chunk for short messages", () => {
      const chunks = splitMessage("Hello world");
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("Hello world");
    });

    it("splits long messages into multiple chunks", () => {
      const long = "A".repeat(5000);
      const chunks = splitMessage(long, 2000);
      expect(chunks.length).toBeGreaterThan(1);
      // All content should be preserved
      expect(chunks.join("").length).toBe(5000);
    });

    it("splits at natural boundaries", () => {
      const text = "Line 1\n".repeat(500);
      const chunks = splitMessage(text, 200);
      expect(chunks.length).toBeGreaterThan(1);
      // All content should be preserved (repairHtmlTags may alter slightly)
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      expect(totalLen).toBeGreaterThanOrEqual(text.length);
    });
  });

  describe("wrapExpandable", () => {
    it("returns content as-is when short", () => {
      expect(wrapExpandable("Short")).toBe("Short");
    });

    it("wraps in expandable blockquote when long", () => {
      const long = "X".repeat(600);
      const result = wrapExpandable(long, 500);
      expect(result).toContain("<blockquote expandable>");
      expect(result).toContain("</blockquote>");
    });
  });

  describe("stripHtmlTags", () => {
    it("removes HTML tags", () => {
      expect(stripHtmlTags("<b>Bold</b> and <i>italic</i>")).toBe("Bold and italic");
    });

    it("decodes HTML entities", () => {
      expect(stripHtmlTags("&amp; &lt; &gt;")).toBe("& < >");
    });
  });

  describe("formatCost", () => {
    it("formats cost with 4 decimal places", () => {
      expect(formatCost(0.0123)).toBe("<code>$0.0123</code>");
    });
  });

  describe("formatTokens", () => {
    it("formats millions", () => {
      expect(formatTokens(1_500_000)).toBe("<code>1.5M</code>");
    });

    it("formats thousands", () => {
      expect(formatTokens(45_000)).toBe("<code>45.0K</code>");
    });

    it("formats small numbers as-is", () => {
      expect(formatTokens(500)).toBe("<code>500</code>");
    });
  });

  describe("formatDuration", () => {
    it("formats milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("formats seconds", () => {
      expect(formatDuration(5500)).toBe("5.5s");
    });

    it("formats minutes", () => {
      expect(formatDuration(125_000)).toBe("2m 5s");
    });
  });

  describe("danger detection", () => {
    it("detects dangerous bash commands", () => {
      expect(isBashDangerous("rm -rf /")).toBe(true);
      expect(isBashDangerous("git push --force")).toBe(true);
      expect(isBashDangerous("sudo apt install")).toBe(true);
      expect(isBashDangerous("ls -la")).toBe(false);
      expect(isBashDangerous("cat file.txt")).toBe(false);
    });

    it("detects dangerous file paths", () => {
      expect(isFileDangerous(".env")).toBe(true);
      expect(isFileDangerous("/app/.env.local")).toBe(true);
      expect(isFileDangerous("credentials.json")).toBe(true);
      expect(isFileDangerous("src/index.ts")).toBe(false);
    });

    it("checks permission danger by tool type", () => {
      expect(isPermissionDangerous("Bash", { command: "rm -rf /" })).toBe(true);
      expect(isPermissionDangerous("Bash", { command: "ls" })).toBe(false);
      expect(isPermissionDangerous("Write", { file_path: ".env" })).toBe(true);
      expect(isPermissionDangerous("Read", {})).toBe(false);
    });
  });

  describe("formatPermission", () => {
    it("shows warning for dangerous ops", () => {
      const result = formatPermission("Bash", { command: "rm -rf /" });
      expect(result).toContain("⚠️");
      expect(result).toContain("<b>Bash</b>");
    });

    it("shows lock for safe ops", () => {
      const result = formatPermission("Read", { file_path: "/src/index.ts" });
      expect(result).toContain("🔐");
    });
  });

  describe("formatToolAction", () => {
    it("formats Bash tool", () => {
      const result = formatToolAction("Bash", { command: "npm install" });
      expect(result).toContain("💻");
      expect(result).toContain("npm install");
    });

    it("formats Read tool with shortened path", () => {
      const result = formatToolAction("Read", { file_path: "/very/long/path/to/file.ts" });
      expect(result).toContain("📖");
      expect(result).toContain("file.ts");
    });

    it("formats unknown tools", () => {
      const result = formatToolAction("CustomTool", {});
      expect(result).toContain("🔧");
      expect(result).toContain("CustomTool");
    });
  });

  describe("formatToolFeed", () => {
    it("formats tool_use blocks", () => {
      const result = formatToolFeed([
        { type: "tool_use", name: "Read", input: { file_path: "/test.ts" } },
        { type: "tool_use", name: "Bash", input: { command: "ls" } },
      ]);
      expect(result).not.toBeNull();
      expect(result).toContain("📖");
      expect(result).toContain("💻");
    });

    it("returns null when no tool_use blocks", () => {
      const result = formatToolFeed([{ type: "text" }]);
      expect(result).toBeNull();
    });
  });
});
