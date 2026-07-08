import type { CSSProperties } from "react";

/**
 * Dependency-free area sparkline for KPI cards (ref image 1 — the trend curve
 * under each metric). Pure SVG, server-renderable, smooth monotone curve.
 *
 * `preserveAspectRatio="none"` + a numeric viewBox means you can stretch it to
 * any container width via `style={{ width: "100%" }}` and it fills edge-to-edge.
 * The gradient id derives from the stroke color so same-color sparklines share
 * one <defs> gradient (SSR-stable, no id collisions).
 */
export function Sparkline({
  points,
  stroke = "var(--accent)",
  width = 260,
  height = 44,
  strokeWidth = 2,
  fill = true,
  smooth = true,
  className,
  style,
}: {
  points: number[];
  stroke?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
  smooth?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const data = points.length >= 2 ? points : [points[0] ?? 0, points[0] ?? 0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth + 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const coords = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * innerW;
    const y = pad + (1 - (v - min) / span) * innerH;
    return [x, y] as [number, number];
  });

  const line = smooth ? smoothPath(coords) : coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(pad + innerW).toFixed(1)},${(height - pad).toFixed(1)} L${pad.toFixed(1)},${(height - pad).toFixed(1)} Z`;
  const gid = `spark-${String(stroke).replace(/[^a-z0-9]/gi, "")}`;
  const last = coords[coords.length - 1];

  return (
    <svg
      className={className}
      style={style}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      role="img"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r={strokeWidth + 0.5} fill={stroke} />}
    </svg>
  );
}

/** Catmull-Rom → cubic bezier for a smooth curve through all points. */
function smoothPath(pts: [number, number][]): string {
  const first = pts[0];
  if (!first || pts.length < 2) return first ? `M${first[0]},${first[1]}` : "";
  let d = `M${first[0].toFixed(1)},${first[1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i] as [number, number];
    const p2 = pts[i + 1] as [number, number];
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Deterministic, SSR-safe decorative series (seeded — no Math.random/Date). */
export function sparkSeries(seed: number, count = 12, bias = 0.5): number[] {
  const out: number[] = [];
  let v = 42 + (seed % 18);
  for (let i = 0; i < count; i++) {
    const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const r = n - Math.floor(n); // 0..1 pseudo-random
    v += (r - (1 - bias)) * 15;
    v = Math.max(10, Math.min(92, v));
    out.push(Math.round(v));
  }
  return out;
}
