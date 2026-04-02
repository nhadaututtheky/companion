/**
 * Tests for Telegram HTML formatter — pure functions, no mocking needed.
 * Tests: escapeHTML, toTelegramHTML, splitMessage, wrapExpandable.
 */

import { describe, test, expect } from "bun:test";
import {
  escapeHTML,
  toTelegramHTML,
  splitMessage,
  wrapExpandable,
} from "../telegram/formatter.js";

// ─── escapeHTML ───────────────────────────────────────────────────────────────

describe("escapeHTML", () => {
  test("normal text passes through unchanged", () => {
    expect(escapeHTML("Hello, world!")).toBe("Hello, world!");
  });

  test("escapes < and > in script tag", () => {
    expect(escapeHTML("<script>")).toBe("&lt;script&gt;");
  });

  test("escapes ampersand", () => {
    expect(escapeHTML("&")).toBe("&amp;");
  });

  test("escapes mixed special chars: A & B < C > D", () => {
    expect(escapeHTML("A & B < C > D")).toBe("A &amp; B &lt; C &gt; D");
  });

  test("empty string returns empty string", () => {
    expect(escapeHTML("")).toBe("");
  });

  test("escapes multiple ampersands", () => {
    expect(escapeHTML("a && b")).toBe("a &amp;&amp; b");
  });
});

// ─── toTelegramHTML ───────────────────────────────────────────────────────────

describe("toTelegramHTML", () => {
  test("empty string returns empty string", () => {
    expect(toTelegramHTML("")).toBe("");
  });

  test("null / falsy value returns empty string", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(toTelegramHTML(null as any)).toBe("");
  });

  test("fenced code block with language → pre/code with class, content HTML-escaped", () => {
    const md = "```js\nconsole.log(\"hi\");\n```";
    const result = toTelegramHTML(md);
    expect(result).toBe('<pre><code class="language-js">console.log("hi");</code></pre>');
  });

  test("fenced code block without language → pre/code without class", () => {
    const md = "```\nplain text\n```";
    const result = toTelegramHTML(md);
    expect(result).toBe("<pre><code>plain text</code></pre>");
  });

  test("code block content is HTML-escaped (< > & inside)", () => {
    const md = "```html\n<div>foo & bar</div>\n```";
    const result = toTelegramHTML(md);
    expect(result).toContain("&lt;div&gt;foo &amp; bar&lt;/div&gt;");
  });

  test("inline code → <code>content</code>", () => {
    const result = toTelegramHTML("`foo`");
    expect(result).toBe("<code>foo</code>");
  });

  test("inline code content is HTML-escaped", () => {
    const result = toTelegramHTML("`a < b`");
    expect(result).toBe("<code>a &lt; b</code>");
  });

  test("bold **text** → <b>text</b>", () => {
    expect(toTelegramHTML("**bold**")).toBe("<b>bold</b>");
  });

  test("bold __text__ → <b>text</b>", () => {
    expect(toTelegramHTML("__bold__")).toBe("<b>bold</b>");
  });

  test("italic *text* → <i>text</i>", () => {
    expect(toTelegramHTML("*italic*")).toBe("<i>italic</i>");
  });

  test("bold **text** is NOT wrapped in italic — double-star not treated as italic", () => {
    const result = toTelegramHTML("**bold**");
    expect(result).not.toContain("<i>");
    expect(result).toBe("<b>bold</b>");
  });

  test("strikethrough ~~text~~ → <s>text</s>", () => {
    expect(toTelegramHTML("~~strike~~")).toBe("<s>strike</s>");
  });

  test("link [text](url) → <a href='url'>text</a>", () => {
    expect(toTelegramHTML("[Click](https://example.com)")).toBe(
      '<a href="https://example.com">Click</a>',
    );
  });

  test("heading # Title → <b>Title</b>", () => {
    expect(toTelegramHTML("# My Heading")).toBe("<b>My Heading</b>");
  });

  test("heading ## level 2 also → <b>text</b>", () => {
    expect(toTelegramHTML("## Sub")).toBe("<b>Sub</b>");
  });

  test("horizontal rule --- → unicode separator", () => {
    const result = toTelegramHTML("---");
    expect(result).toBe("─────────────────");
  });

  test("bold inside code block is NOT re-processed (code protects content)", () => {
    const md = "```\n**not bold**\n```";
    const result = toTelegramHTML(md);
    // The ** should remain as literal ** inside code, not be converted to <b>
    expect(result).toContain("**not bold**");
    expect(result).not.toContain("<b>");
  });

  test("unclosed code fence at end of string → still wrapped in pre/code", () => {
    const md = "```js\nconst x = 1;";
    const result = toTelegramHTML(md);
    expect(result).toContain("<pre><code");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("</code></pre>");
  });

  test("plain text without markdown passes through (with HTML escaping)", () => {
    expect(toTelegramHTML("Hello world")).toBe("Hello world");
  });

  test("text with & gets HTML-escaped outside code blocks", () => {
    const result = toTelegramHTML("cats & dogs");
    expect(result).toBe("cats &amp; dogs");
  });
});

// ─── splitMessage ─────────────────────────────────────────────────────────────

describe("splitMessage", () => {
  test("short text returns single-element array", () => {
    const chunks = splitMessage("Hello");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Hello");
  });

  test("text exactly at maxLen returns single chunk", () => {
    const text = "a".repeat(50);
    const chunks = splitMessage(text, 50);
    expect(chunks).toHaveLength(1);
  });

  test("long text is split into multiple chunks", () => {
    const text = "a".repeat(200);
    const chunks = splitMessage(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("each chunk is ≤ maxLen (small maxLen)", () => {
    // Use newlines so it can split naturally
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}: ${"x".repeat(10)}`);
    const text = lines.join("\n");
    const maxLen = 50;
    const chunks = splitMessage(text, maxLen);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(maxLen);
    }
  });

  test("prefers splitting at newline boundary", () => {
    // Two distinct lines; maxLen forces a split; newline is the natural boundary
    const line1 = "a".repeat(30);
    const line2 = "b".repeat(30);
    const text = line1 + "\n" + line2;
    const chunks = splitMessage(text, 40);
    // The first chunk should end with line1 content (split at newline)
    expect(chunks[0]).toContain("a");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  test("no empty chunks in result", () => {
    const text = "Hello\n\nWorld\n\nFoo";
    const chunks = splitMessage(text, 10);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  test("concatenating all chunks recreates original text (modulo HTML repair)", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Sentence ${i} ends here.`).join(" ");
    const chunks = splitMessage(text, 60);
    // All content should be preserved across chunks
    const joined = chunks.join("");
    expect(joined.length).toBe(text.length);
  });
});

// ─── wrapExpandable ───────────────────────────────────────────────────────────

describe("wrapExpandable", () => {
  test("short content returned as-is", () => {
    const content = "Short text";
    expect(wrapExpandable(content)).toBe(content);
  });

  test("content exactly at default threshold (500) returned as-is", () => {
    const content = "a".repeat(500);
    expect(wrapExpandable(content)).toBe(content);
  });

  test("content exceeding default threshold wrapped in expandable blockquote", () => {
    const content = "a".repeat(501);
    const result = wrapExpandable(content);
    expect(result).toBe(`<blockquote expandable>${content}</blockquote>`);
  });

  test("custom maxPreview threshold — short content with small threshold → wrapped", () => {
    const content = "Hello World"; // 11 chars
    const result = wrapExpandable(content, 5);
    expect(result).toBe(`<blockquote expandable>${content}</blockquote>`);
  });

  test("custom maxPreview threshold — content under threshold → returned as-is", () => {
    const content = "Hi";
    expect(wrapExpandable(content, 100)).toBe("Hi");
  });

  test("wrapped result starts with <blockquote expandable> and ends with </blockquote>", () => {
    const content = "x".repeat(600);
    const result = wrapExpandable(content);
    expect(result.startsWith("<blockquote expandable>")).toBe(true);
    expect(result.endsWith("</blockquote>")).toBe(true);
  });
});
