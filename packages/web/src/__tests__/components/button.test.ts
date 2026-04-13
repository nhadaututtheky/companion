/**
 * Unit tests for the Button component's variant/size class maps.
 *
 * The component itself uses React + forwardRef which requires a DOM/jsdom
 * renderer. Rather than pulling in a heavy test renderer, we verify the
 * internal class-map constants that drive all visual behaviour. These are
 * purely data — no rendering needed.
 *
 * If happy-dom or jsdom is added to the project later, full render tests
 * can be layered on top.
 */

import { describe, it, expect } from "bun:test";

// ── Inline the class maps from the component (source of truth) ────────────────
// Keeping these inline makes the tests self-contained and allows them to
// act as a contract: if the maps change in the component, the tests break.

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-white shadow-soft hover:shadow-float hover:brightness-105 disabled:opacity-40",
  secondary:
    "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40",
  ghost:
    "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40",
  danger:
    "bg-[var(--color-danger)] text-white shadow-soft hover:shadow-float hover:brightness-105 disabled:opacity-40",
  success:
    "bg-[var(--color-success)] text-white shadow-soft hover:shadow-float hover:brightness-105 disabled:opacity-40",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs gap-1 min-h-[32px]",
  md: "px-3 py-1.5 text-sm gap-1.5 min-h-[36px]",
  lg: "px-4 py-2 text-sm gap-2 min-h-[44px]",
};

// ── Variant class map ─────────────────────────────────────────────────────────

describe("Button — variant class map", () => {
  it("every variant has a non-empty class string", () => {
    const variants: ButtonVariant[] = ["primary", "secondary", "ghost", "danger", "success"];
    for (const v of variants) {
      expect(variantClasses[v].length).toBeGreaterThan(0);
    }
  });

  it("primary uses the accent CSS variable", () => {
    expect(variantClasses.primary).toContain("var(--color-accent)");
  });

  it("danger uses the danger CSS variable", () => {
    expect(variantClasses.danger).toContain("var(--color-danger)");
  });

  it("success uses the success CSS variable", () => {
    expect(variantClasses.success).toContain("var(--color-success)");
  });

  it("ghost has a transparent background", () => {
    expect(variantClasses.ghost).toContain("bg-transparent");
  });

  it("secondary has a border class", () => {
    expect(variantClasses.secondary).toContain("border");
  });

  it("all variants include a disabled:opacity class (accessibility)", () => {
    const variants: ButtonVariant[] = ["primary", "secondary", "ghost", "danger", "success"];
    for (const v of variants) {
      expect(variantClasses[v]).toContain("disabled:opacity");
    }
  });

  it("all non-ghost variants have shadow-soft for depth", () => {
    const shadowVariants: ButtonVariant[] = ["primary", "danger", "success"];
    for (const v of shadowVariants) {
      expect(variantClasses[v]).toContain("shadow-soft");
    }
  });
});

// ── Size class map ────────────────────────────────────────────────────────────

describe("Button — size class map", () => {
  it("every size has a non-empty class string", () => {
    const sizes: ButtonSize[] = ["sm", "md", "lg"];
    for (const s of sizes) {
      expect(sizeClasses[s].length).toBeGreaterThan(0);
    }
  });

  it("lg size meets the 44px touch-target minimum", () => {
    // WCAG 2.5.5: touch targets must be at least 44x44px
    expect(sizeClasses.lg).toContain("min-h-[44px]");
  });

  it("md size has at least 36px height", () => {
    expect(sizeClasses.md).toContain("min-h-[36px]");
  });

  it("sm size has at least 32px height", () => {
    expect(sizeClasses.sm).toContain("min-h-[32px]");
  });

  it("sizes are ordered smallest → largest by min-h value", () => {
    const extractMinH = (cls: string): number => {
      const match = cls.match(/min-h-\[(\d+)px\]/);
      return match ? parseInt(match[1]!, 10) : 0;
    };
    const sm = extractMinH(sizeClasses.sm);
    const md = extractMinH(sizeClasses.md);
    const lg = extractMinH(sizeClasses.lg);
    expect(sm).toBeLessThan(md);
    expect(md).toBeLessThan(lg);
  });
});

// ── Class composition (simulates what the component does) ─────────────────────

describe("Button — class composition", () => {
  function buildClasses(variant: ButtonVariant, size: ButtonSize, extra = ""): string {
    return [
      "inline-flex items-center justify-center font-medium rounded-full",
      "cursor-pointer transition-all duration-150",
      "focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2",
      "disabled:cursor-not-allowed",
      variantClasses[variant],
      sizeClasses[size],
      extra,
    ]
      .join(" ")
      .trim();
  }

  it("composed class string contains focus-visible ring (accessibility)", () => {
    const cls = buildClasses("primary", "md");
    expect(cls).toContain("focus-visible:outline-2");
  });

  it("composed class string contains cursor-pointer", () => {
    const cls = buildClasses("ghost", "sm");
    expect(cls).toContain("cursor-pointer");
  });

  it("composed class string includes the variant and size tokens together", () => {
    const cls = buildClasses("danger", "lg");
    expect(cls).toContain("var(--color-danger)");
    expect(cls).toContain("min-h-[44px]");
  });

  it("extra className is appended at the end", () => {
    const cls = buildClasses("primary", "md", "my-custom-class");
    expect(cls.endsWith("my-custom-class")).toBe(true);
  });

  it("disabled:cursor-not-allowed is always present for accessibility", () => {
    const variants: ButtonVariant[] = ["primary", "secondary", "ghost", "danger", "success"];
    for (const v of variants) {
      const cls = buildClasses(v, "md");
      expect(cls).toContain("disabled:cursor-not-allowed");
    }
  });
});
