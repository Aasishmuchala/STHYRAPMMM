// Card-level shimmer primitives. The full-page PageSkeleton was removed —
// routes no longer auto-paint a fake skeleton before mounting, so first paint
// IS the real page. These primitives are still useful for inline shimmer
// inside Suspense boundaries around heavy subtrees (TaskBoard, chart, etc.).

function Line({ w, h = 12 }: { w: string | number; h?: number }) {
  return <div className="skel" style={{ width: w, height: h }} />;
}

function Block({ h }: { h: number }) {
  return <div className="skel" style={{ height: h, borderRadius: 13 }} />;
}

export function CardSkeleton({ height = 110 }: { height?: number }) {
  return (
    <div className="skel-card" aria-busy="true" aria-label="Loading">
      <Line w="40%" h={10} />
      <div style={{ height: 10 }} />
      <Line w="80%" h={height - 22} />
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="skel-row" aria-busy="true" aria-label="Loading">
      <Block h={28} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <Line w="60%" h={11} />
        <Line w="40%" h={9} />
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <Block h={height} />;
}