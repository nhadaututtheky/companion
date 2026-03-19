"use client";

interface CompanionLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const LETTER_COLORS = [
  "#4285F4", // C — blue
  "#EA4335", // o — red
  "#FBBC04", // m — yellow
  "#4285F4", // p — blue
  "#34A853", // a — green
  "#EA4335", // n — red
  "#FBBC04", // i — yellow
  "#4285F4", // o — blue
  "#34A853", // n — green
];

const LETTERS = "Companion".split("");

const SIZES = {
  sm: "text-base font-bold tracking-tight",
  md: "text-xl font-bold tracking-tight",
  lg: "text-3xl font-bold tracking-tight",
};

export function CompanionLogo({ size = "md", className = "" }: CompanionLogoProps) {
  return (
    <span
      className={`${SIZES[size]} ${className} font-display select-none`}
      style={{ fontFamily: "Outfit, sans-serif" }}
      aria-label="Companion"
    >
      {LETTERS.map((letter, i) => (
        <span key={i} style={{ color: LETTER_COLORS[i] }}>
          {letter}
        </span>
      ))}
    </span>
  );
}
