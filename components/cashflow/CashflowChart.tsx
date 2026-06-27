"use client";

import type { ForecastBucket } from "@/app/finances/forecast-actions";
import { inrShort } from "@/lib/format";

export function CashflowChart({ buckets, height = 240 }: { buckets: ForecastBucket[]; height?: number }) {
  if (buckets.length === 0) {
    return <div className="chart-empty">No forecast data</div>;
  }
  // Downsample to ~60 bars for readable charts
  const stride = Math.max(1, Math.ceil(buckets.length / 60));
  const points = buckets.filter((_, i) => i % stride === 0);
  const maxAbs = Math.max(...points.flatMap((b) => [b.inflow, b.outflow]), 1);
  const width = Math.max(320, points.length * 8);
  const padX = 24;
  const padY = 22;
  const usable = height - padY * 2;
  const barW = Math.max(2, (width - padX * 2) / points.length - 1);

  let running = 0;
  let peak = 0;
  let trough = 0;
  for (const b of buckets) {
    running += b.net;
    peak = Math.max(peak, running);
    trough = Math.min(trough, running);
  }

  return (
    <div className="chart-cashflow" role="img" aria-label="90-day cash-flow forecast">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={padX} y1={padY + usable / 2} x2={width - padX} y2={padY + usable / 2} stroke="var(--line)" strokeWidth={1} opacity={0.4} />
        {points.map((b, i) => {
          const cx = padX + i * (barW + 1);
          const inH = (b.inflow / maxAbs) * (usable / 2);
          const outH = (b.outflow / maxAbs) * (usable / 2);
          return (
            <g key={b.date}>
              <rect x={cx} y={padY + usable / 2 - inH} width={barW} height={inH} fill="var(--positive)" opacity={0.85} />
              <rect x={cx} y={padY + usable / 2} width={barW} height={outH} fill="var(--danger)" opacity={0.85} />
            </g>
          );
        })}
        {/* Running balance line */}
        <path
          d={buckets
            .filter((_, i) => i % stride === 0)
            .map((b, i) => {
              const cx = padX + i * (barW + 1) + barW / 2;
              const range = Math.max(1, peak - trough);
              const cy = padY + usable * (1 - (b.runningBalance - trough) / range);
              return `${i === 0 ? "M" : "L"}${cx},${cy}`;
            })
            .join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
        />
        <text x={padX} y={padY - 6} fontSize={10} fill="var(--text-faint)">
          Green = in · Red = out · Line = running balance
        </text>
      </svg>
      <div className="cf-legend">
        <span>Peak balance: <strong className="mono">{inrShort(peak)}</strong></span>
        <span>Trough: <strong className="mono">{inrShort(trough)}</strong></span>
      </div>
    </div>
  );
}