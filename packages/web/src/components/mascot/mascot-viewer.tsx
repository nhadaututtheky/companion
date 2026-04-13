"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

interface MascotViewerProps {
  lottieFile: string;
  size?: number;
  className?: string;
}

/**
 * Renders a dotLottie mascot animation.
 * Expects a .lottie file path from public/mascots/.
 */
export function MascotViewer({ lottieFile, size = 120, className }: MascotViewerProps) {
  return (
    <div
      className={`${className || ""} rounded-full overflow-hidden`} style={{
        width: size,
        height: size,
        pointerEvents: "none",
      }}
    >
      <DotLottieReact src={lottieFile} loop autoplay style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
