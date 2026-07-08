import type { ReactNode } from "react";

export type DonutSegment = { label: string; value: number; color: string };

/**
 * Segmented donut / ring chart (ref image 3 — "Project Completed"). Pure SVG,
 * server-renderable. Rounded segment caps + a small gap between segments give
 * the clean, modern look. Center content is passed as children (big number +
 * caption) and overlaid via an absolutely-positioned layer for crisp text.
 */
export function DonutChart({
  segments,
  size = 176,
  thickness = 20,
  gap = 3,
  trackColor = "var(--track)",
  children,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** gap between segments, in degrees */
  gap?: number;
  trackColor?: string;
  children?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);

  // Fraction of the circumference used by one degree of gap.
  const gapLen = (gap / 360) * circumference;

  let offset = 0;
  const arcs = total > 0
    ? segments
        .filter((s) => s.value > 0)
        .map((seg) => {
          const frac = seg.value / total;
          const rawLen = frac * circumference;
          const len = Math.max(0, rawLen - gapLen);
          const dash = `${len} ${circumference - len}`;
          const arc = { color: seg.color, dash, offset: -offset };
          offset += rawLen;
          return arc;
        })
    : [];

  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden="true">
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              strokeLinecap="round"
            />
          ))}
        </g>
      </svg>
      {children != null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 2,
            pointerEvents: "none",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
