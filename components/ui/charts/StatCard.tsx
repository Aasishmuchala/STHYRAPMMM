import type { ReactNode } from "react";
import { Sparkline } from "./Sparkline";

/**
 * KPI card (ref image 1 — "MONEY IN · MTD" etc.). Layout: soft-square icon +
 * uppercase label, then a big value, a small colored delta line, and a
 * full-width sparkline pinned to the bottom. Sparkline is optional so the same
 * card works on pages without a series (e.g. attendance status counts).
 */
export function StatCard({
  label,
  value,
  delta,
  trend,
  spark,
  sparkColor,
  icon,
  accent = "var(--accent)",
}: {
  label: string;
  value: ReactNode;
  /** e.g. "7 divisions" — shown as a small line under the value */
  delta?: string;
  trend?: "up" | "down" | "flat";
  /** series for the sparkline; omit to hide it */
  spark?: number[];
  sparkColor?: string;
  icon?: ReactNode;
  /** icon tint + sparkline default color */
  accent?: string;
}) {
  const line = sparkColor ?? accent;
  return (
    <div className="stat-card">
      <div className="stat-head">
        {icon && (
          <span className="stat-icon" style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}>
            {icon}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="stat-label">{label}</div>
          <div className="stat-value mono">{value}</div>
        </div>
      </div>
      {delta && (
        <div className={`stat-sub ${trend ?? "flat"}`}>
          {trend === "up" ? <Arrow up /> : trend === "down" ? <Arrow /> : null}
          <span>{delta}</span>
        </div>
      )}
      {spark && spark.length > 0 && (
        <div className="stat-spark">
          <Sparkline points={spark} stroke={line} width={280} height={46} style={{ width: "100%", height: 46 }} />
        </div>
      )}
    </div>
  );
}

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? "none" : "scaleY(-1)" }}>
      <path d="M7 17L17 7M17 7H9M17 7v8" />
    </svg>
  );
}
