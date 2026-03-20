/**
 * Fan Layout — Geometry calculations for the hand fan (扇子) UI.
 *
 * Ring orb = pivot point. Fan blades radiate as a semicircle (~180°).
 * Direction adapts based on orb screen position (always opens AWAY from nearest edge).
 */

export const FAN_RADIUS = 260;
export const FAN_INNER_RADIUS = 36; // just outside the ring orb
export const FAN_SPREAD = 160; // degrees of total spread
export const BLADE_GAP = 2; // degrees gap between blades

export type FanDirection = "up-left" | "up-right" | "down-left" | "down-right";

/**
 * Determine which direction the fan should open based on orb position.
 * Fan opens AWAY from the closest screen corner.
 */
export function getFanDirection(
  orbX: number,
  orbY: number,
  viewW: number,
  viewH: number,
): FanDirection {
  const isRight = orbX > viewW / 2;
  const isBottom = orbY > viewH / 2;

  if (isBottom && isRight) return "up-left";
  if (isBottom && !isRight) return "up-right";
  if (!isBottom && isRight) return "down-left";
  return "down-right";
}

/**
 * Get the base rotation angle for the fan center based on direction.
 * This is the angle pointing from the pivot toward the fan center.
 */
export function getBaseAngle(dir: FanDirection): number {
  switch (dir) {
    case "up-left": return -135; // point up-left
    case "up-right": return -45; // point up-right
    case "down-left": return 135; // point down-left
    case "down-right": return 45; // point down-right
  }
}

/**
 * Calculate blade angles for N blades within the fan spread.
 * Returns array of { startAngle, endAngle, midAngle } in degrees.
 */
export function getBladeAngles(
  bladeCount: number,
  direction: FanDirection,
): Array<{ startAngle: number; endAngle: number; midAngle: number }> {
  if (bladeCount === 0) return [];

  const baseAngle = getBaseAngle(direction);
  const totalGap = (bladeCount - 1) * BLADE_GAP;
  const availableSpread = FAN_SPREAD - totalGap;
  const bladeSpread = availableSpread / bladeCount;

  const startOffset = baseAngle - FAN_SPREAD / 2;

  return Array.from({ length: bladeCount }, (_, i) => {
    const start = startOffset + i * (bladeSpread + BLADE_GAP);
    const end = start + bladeSpread;
    return {
      startAngle: start,
      endAngle: end,
      midAngle: (start + end) / 2,
    };
  });
}

/**
 * Generate SVG path for a blade (sector/wedge shape).
 * Returns path `d` attribute string.
 */
export function bladePath(
  startAngle: number,
  endAngle: number,
  innerR: number = FAN_INNER_RADIUS,
  outerR: number = FAN_RADIUS,
): string {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  const x1 = innerR * Math.cos(startRad);
  const y1 = innerR * Math.sin(startRad);
  const x2 = outerR * Math.cos(startRad);
  const y2 = outerR * Math.sin(startRad);
  const x3 = outerR * Math.cos(endRad);
  const y3 = outerR * Math.sin(endRad);
  const x4 = innerR * Math.cos(endRad);
  const y4 = innerR * Math.sin(endRad);

  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3}`,
    `L ${x4} ${y4}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}`,
    "Z",
  ].join(" ");
}

/**
 * Get the position for label text on a blade (near the outer arc).
 */
export function bladeLabelPosition(
  midAngle: number,
  radius: number = FAN_RADIUS * 0.7,
): { x: number; y: number } {
  const rad = (midAngle * Math.PI) / 180;
  return {
    x: radius * Math.cos(rad),
    y: radius * Math.sin(rad),
  };
}

/**
 * Get content area center (for messages/overlay).
 * Sits in the middle of the fan surface.
 */
export function getContentCenter(
  direction: FanDirection,
  radius: number = FAN_RADIUS * 0.5,
): { x: number; y: number } {
  const baseAngle = getBaseAngle(direction);
  const rad = (baseAngle * Math.PI) / 180;
  return {
    x: radius * Math.cos(rad),
    y: radius * Math.sin(rad),
  };
}
