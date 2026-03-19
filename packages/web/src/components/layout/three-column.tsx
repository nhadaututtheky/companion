"use client";

/**
 * 3-column layout — matches Pencil design.
 * Left: session list (280px)
 * Center: terminal (flex-1)
 * Right: details panel (320px)
 */
export function ThreeColumn({
  left,
  center,
  right,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="flex h-full overflow-hidden" style={{ flex: 1 }}>
      {/* Left column */}
      <aside
        className="flex flex-col flex-shrink-0 overflow-y-auto border-r"
        style={{
          width: 280,
          background: "var(--color-bg-sidebar)",
          borderColor: "var(--color-border)",
        }}
      >
        {left}
      </aside>

      {/* Center column */}
      <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {center}
      </main>

      {/* Right column */}
      <aside
        className="flex flex-col flex-shrink-0 overflow-y-auto border-l"
        style={{
          width: 320,
          background: "var(--color-bg-sidebar)",
          borderColor: "var(--color-border)",
        }}
      >
        {right}
      </aside>
    </div>
  );
}
