/**
 * Unit tests for resolveTemplateVariables — pure function, no DB required.
 */

import { describe, it, expect } from "bun:test";
import { resolveTemplateVariables } from "../services/templates.js";

describe("resolveTemplateVariables", () => {
  it("replaces a single variable", () => {
    const result = resolveTemplateVariables(
      "Review the {{project_name}} codebase",
      { project_name: "companion" },
    );
    expect(result).toBe("Review the companion codebase");
  });

  it("replaces multiple distinct variables", () => {
    const result = resolveTemplateVariables(
      "Fix bug in {{file}} at line {{line}}",
      { file: "index.ts", line: "42" },
    );
    expect(result).toBe("Fix bug in index.ts at line 42");
  });

  it("keeps unresolved placeholders when key is missing", () => {
    const result = resolveTemplateVariables(
      "Deploy {{project}} to {{env}}",
      { project: "companion" },
    );
    expect(result).toBe("Deploy companion to {{env}}");
  });

  it("returns prompt unchanged when variables object is empty", () => {
    const result = resolveTemplateVariables("Hello {{name}}", {});
    expect(result).toBe("Hello {{name}}");
  });

  it("returns prompt unchanged when there are no placeholders", () => {
    const result = resolveTemplateVariables("No variables here", { key: "value" });
    expect(result).toBe("No variables here");
  });

  it("returns empty string when prompt is empty", () => {
    const result = resolveTemplateVariables("", { key: "value" });
    expect(result).toBe("");
  });

  it("replaces multiple occurrences of the same variable", () => {
    const result = resolveTemplateVariables(
      "{{name}} is great. I love {{name}}.",
      { name: "Companion" },
    );
    expect(result).toBe("Companion is great. I love Companion.");
  });

  it("does not replace {{foo-bar}} because hyphen is not a word character", () => {
    // The regex is /\{\{(\w+)\}\}/ — \w+ won't match "foo-bar"
    const result = resolveTemplateVariables("Hello {{foo-bar}}", { "foo-bar": "world" });
    expect(result).toBe("Hello {{foo-bar}}");
  });

  it("replaces variable with empty string value", () => {
    const result = resolveTemplateVariables("prefix {{val}} suffix", { val: "" });
    expect(result).toBe("prefix  suffix");
  });

  it("handles prompt with only a placeholder and no surrounding text", () => {
    const result = resolveTemplateVariables("{{cmd}}", { cmd: "/ship" });
    expect(result).toBe("/ship");
  });

  it("ignores extra keys in the variables map that are not in the prompt", () => {
    const result = resolveTemplateVariables("Hello {{name}}", {
      name: "world",
      extra: "ignored",
      another: "also-ignored",
    });
    expect(result).toBe("Hello world");
  });
});
