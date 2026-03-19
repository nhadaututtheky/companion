"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useRingStore } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { RingSelector } from "./ring-selector";
import { RingWindow } from "./ring-window";

const RING_SIZE = 52;
const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];

function getSessionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return GOOGLE_COLORS[Math.abs(hash) % GOOGLE_COLORS.length]!;
}

/** Siri-style glowing orb with color bands */
function SiriOrb({ sessionIds, size }: { sessionIds: string[]; size: number }) {
  const hasLinked = sessionIds.length > 0;
  const colors = sessionIds.map((id) => getSessionColor(id));

  // Default colors when no sessions linked — Google 4-color
  const orbColors = hasLinked ? colors : GOOGLE_COLORS;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  return (
    <svg
      width={size}
      height={size}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      <defs>
        {/* Animated gradient for the orb glow */}
        <radialGradient id="orb-base" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>

        {/* Blur for glow effect */}
        <filter id="orb-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow ring — rotating color bands */}
      {orbColors.map((color, i) => {
        const total = orbColors.length;
        const startAngle = (i * 360) / total - 90;
        const endAngle = ((i + 1) * 360) / total - 90;
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;

        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={hasLinked ? 3.5 : 2.5}
            strokeLinecap="round"
            filter="url(#orb-glow)"
            opacity={hasLinked ? 1 : 0.6}
          />
        );
      })}

      {/* Inner fill — dark translucent */}
      <circle
        cx={cx}
        cy={cy}
        r={r - 4}
        fill="rgba(15,15,15,0.85)"
        stroke="none"
      />

      {/* Inner highlight */}
      <circle
        cx={cx}
        cy={cy}
        r={r - 4}
        fill="url(#orb-base)"
        stroke="none"
      />

      {/* Center dot — shows linked count or sparkle */}
      {hasLinked && (
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={14}
          fontWeight={700}
          fontFamily="var(--font-mono)"
          fill="#fff"
        >
          {sessionIds.length}
        </text>
      )}
      {!hasLinked && (
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={18}
          fill="rgba(255,255,255,0.7)"
        >
          ✦
        </text>
      )}
    </svg>
  );
}

export function MagicRing() {
  const linkedSessionIds = useRingStore((s) => s.linkedSessionIds);
  const isExpanded = useRingStore((s) => s.isExpanded);
  const isSelecting = useRingStore((s) => s.isSelecting);
  const position = useRingStore((s) => s.position);
  const setExpanded = useRingStore((s) => s.setExpanded);
  const setSelecting = useRingStore((s) => s.setSelecting);
  const setPosition = useRingStore((s) => s.setPosition);

  const hasLinked = linkedSessionIds.length > 0;
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState({ x: -1, y: -1 });

  useEffect(() => {
    if (position.x === -1) {
      const defaultX = window.innerWidth - 80;
      const defaultY = window.innerHeight - 80;
      setPos({ x: defaultX, y: defaultY });
      setPosition({ x: defaultX, y: defaultY });
    } else {
      setPos(position);
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = false;
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      dragOffsetRef.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      };
      setDragging(true);
    },
    [pos],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragging) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      if (Math.hypot(dx, dy) > 5) {
        isDraggingRef.current = true;
      }
      if (!isDraggingRef.current) return;

      const newX = Math.max(0, Math.min(window.innerWidth - RING_SIZE, e.clientX - dragOffsetRef.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - RING_SIZE, e.clientY - dragOffsetRef.current.y));
      setPos({ x: newX, y: newY });
    },
    [dragging],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    if (!isDraggingRef.current) {
      if (isSelecting) {
        setSelecting(false);
      } else if (!hasLinked) {
        setSelecting(true);
      } else {
        setExpanded(!isExpanded);
      }
    } else {
      setPosition(pos);
    }
    isDraggingRef.current = false;
  }, [dragging, hasLinked, isExpanded, isSelecting, pos, setExpanded, setSelecting, setPosition]);

  const ringCenterX = pos.x + RING_SIZE / 2;
  const ringCenterY = pos.y + RING_SIZE / 2;

  return (
    <>
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label={
          hasLinked
            ? `Shared Context — ${linkedSessionIds.length} sessions linked`
            : "Shared Context — click to link sessions"
        }
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          width: RING_SIZE,
          height: RING_SIZE,
          borderRadius: "50%",
          border: "none",
          zIndex: 40,
          cursor: dragging ? "grabbing" : "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          animation: "siri-glow 3s ease-in-out infinite",
          userSelect: "none",
          touchAction: "none",
          outline: "none",
        }}
      >
        <SiriOrb sessionIds={linkedSessionIds} size={RING_SIZE} />
      </button>

      {isSelecting && (
        <RingSelector anchorX={ringCenterX} anchorY={ringCenterY} />
      )}

      {isExpanded && hasLinked && (
        <RingWindow anchorX={ringCenterX} anchorY={ringCenterY} />
      )}
    </>
  );
}
