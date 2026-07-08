/**
 * Shared chart palette. Vibrant, reference-grade hues that read well on both
 * light and dark surfaces. Semantic tokens (present/late/…) map onto these so
 * every chart in the app stays visually consistent.
 *
 * Where a chart represents a single "brand" series it should prefer the theme
 * accent (`var(--accent)`) so it recolors with the active theme; the fixed hues
 * below are for multi-category charts (donut segments, grouped bars) that need
 * stable, distinguishable colors independent of the theme.
 */
export const chartPalette = [
  "#7c6cf5", // violet
  "#fb7185", // coral
  "#38bdf8", // sky
  "#34d399", // emerald
  "#fbbf24", // amber
  "#f472b6", // pink
  "#60a5fa", // blue
  "#a3e635", // lime
] as const;

/** Semantic status colors used by attendance + health surfaces. */
export const statusColors = {
  present: "#22c55e",
  late: "#f59e0b",
  undertime: "#f97316",
  absent: "#ef4444",
  neutral: "#94a3b8",
} as const;

export function paletteAt(i: number): string {
  return chartPalette[i % chartPalette.length] ?? chartPalette[0];
}
