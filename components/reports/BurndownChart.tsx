"use client";

export type BurndownPoint = {
  day: string;
  total: number;
  done: number;
};

export function BurndownChart({ data, height = 220 }: { data: BurndownPoint[]; height?: number }) {
  if (data.length === 0) {
    return <div className="chart-empty">No data</div>;
  }
  const max = Math.max(...data.map((d) => d.total), 1);
  const width = Math.max(320, data.length * 18);
  const padX = 28;
  const padY = 18;

  const x = (i: number) => padX + (i * (width - padX * 2)) / Math.max(1, data.length - 1);
  const y = (v: number) => padY + (height - padY * 2) * (1 - v / max);

  const totalPath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.total)}`).join(" ");
  const donePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.done)}`).join(" ");
  const fillPath = `${totalPath} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  return (
    <div className="chart-burndown" role="img" aria-label="Burndown chart">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line
            key={i}
            x1={padX}
            y1={padY + (height - padY * 2) * p}
            x2={width - padX}
            y2={padY + (height - padY * 2) * p}
            stroke="var(--line)"
            strokeWidth={1}
            opacity={0.4}
          />
        ))}
        <path d={fillPath} fill="var(--accent)" opacity={0.08} />
        <path d={totalPath} fill="none" stroke="var(--text-faint)" strokeWidth={2} />
        <path d={donePath} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.done)} r={2.5} fill="var(--accent)" />
        ))}
        <text x={padX} y={height - 4} fontSize={10} fill="var(--text-faint)">
          {data[0]?.day}
        </text>
        <text x={width - padX} y={height - 4} fontSize={10} fill="var(--text-faint)" textAnchor="end">
          {data[data.length - 1]?.day}
        </text>
      </svg>
    </div>
  );
}