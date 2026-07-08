import type { CSSProperties } from "react";

export type BarDatum = { label: string; values: number[] };

/**
 * Grouped rounded bar chart (ref image 3 — "Tracker Detail"). A faint "ghost"
 * track sits behind each bar so empty periods still read as a slot; the value
 * floats above each bar. Supports 1..n series per column via `values`+`colors`.
 *
 * Heights are computed in EXPLICIT PIXELS against a fixed `height` zone rather
 * than nested percentages — nested %-heights inside flex items collapse to
 * zero in some layouts (the earlier version rendered as empty tracks).
 */
export function BarChart({
  data,
  colors,
  height = 150,
  showValues = true,
  barWidth = 16,
  className,
  style,
}: {
  data: BarDatum[];
  colors: string[];
  height?: number;
  showValues?: boolean;
  barWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const max = Math.max(1, ...data.flatMap((d) => d.values));

  return (
    <div className={className} style={style}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
            <div
              style={{
                position: "relative",
                width: "100%",
                height,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 5,
              }}
            >
              {d.values.map((v, si) => {
                const px = v > 0 ? Math.max(6, Math.round((v / max) * height)) : 0;
                const color = colors[si % colors.length] ?? "var(--accent)";
                return (
                  <div
                    key={si}
                    title={`${d.label}: ${v}`}
                    style={{ position: "relative", width: barWidth, height, display: "flex", alignItems: "flex-end" }}
                  >
                    {/* ghost track */}
                    <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: "color-mix(in srgb, var(--text) 5%, transparent)" }} />
                    {showValues && v > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: px + 6,
                          textAlign: "center",
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: "var(--text-dim)",
                        }}
                      >
                        {v}
                      </div>
                    )}
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        height: px,
                        borderRadius: 999,
                        background: v > 0 ? `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 70%, transparent))` : "transparent",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 500 }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
