function Line({ w, h = 12 }: { w: string | number; h?: number }) {
  return <div className="skel" style={{ width: w, height: h }} />;
}

export function PageSkeleton() {
  return (
    <div className="app" aria-busy="true" aria-label="Loading">
      <aside className="side">
        <div className="brand">
          <div className="mark" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><Line w={70} h={11} /><Line w={96} h={8} /></div>
        </div>
        <div className="nav-group" style={{ gap: 10, marginTop: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => <Line key={i} w="80%" h={14} />)}
        </div>
        <div className="nav-group" style={{ gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => <Line key={i} w="68%" h={13} />)}
        </div>
      </aside>
      <div>
        <div className="top">
          <Line w={120} h={30} /><div style={{ flex: 1 }} /><Line w={30} h={30} />
        </div>
        <main>
          <div style={{ marginBottom: 26 }}><Line w={120} h={11} /><div style={{ height: 12 }} /><Line w={280} h={34} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginBottom: 26 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel" style={{ height: 96, borderRadius: i === 0 ? "14px 0 0 14px" : i === 3 ? "0 14px 14px 0" : 0 }} />)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 22 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <Line w={140} h={11} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel" style={{ height: 110, borderRadius: 13 }} />)}
              </div>
              <div className="skel" style={{ height: 220, borderRadius: 13, marginTop: 8 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div className="skel" style={{ height: 150, borderRadius: 13 }} />
              <div className="skel" style={{ height: 300, borderRadius: 14 }} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
