"use client";

import { useEffect, useState } from "react";
import { buildForecast, type ForecastBucket } from "@/app/finances/forecast-actions";
import { CashflowChart } from "@/components/cashflow/CashflowChart";
import { fmtDate, inrShort } from "@/lib/format";

export function ForecastView({
  divisions,
  initialDivisionId,
}: {
  divisions: { id: string; slug: string; name: string }[];
  initialDivisionId: string | null;
}) {
  const [divisionId, setDivisionId] = useState(initialDivisionId);
  const [buckets, setBuckets] = useState<ForecastBucket[]>([]);
  const [totals, setTotals] = useState({ in: 0, out: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await buildForecast(divisionId, 90);
      if (cancelled) return;
      if ("ok" in res && res.ok) {
        setBuckets(res.data.buckets);
        setTotals({ in: res.data.totalIn, out: res.data.totalOut });
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [divisionId]);

  return (
    <div className="forecast-view">
      <div className="forecast-toolbar">
        <select
          className="select"
          value={divisionId ?? ""}
          onChange={(e) => setDivisionId(e.target.value || null)}
        >
          <option value="">All divisions</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="forecast-summary">
        <div className="cell">
          <div className="label">Inflows (next 90d)</div>
          <div className="v mono">{inrShort(totals.in)}</div>
        </div>
        <div className="cell">
          <div className="label">Outflows (next 90d)</div>
          <div className="v mono">{inrShort(totals.out)}</div>
        </div>
        <div className="cell">
          <div className="label">Net</div>
          <div className={`v mono ${totals.in - totals.out >= 0 ? "pos" : "neg"}`}>
            {inrShort(totals.in - totals.out)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="chart-empty">Building forecast…</div>
      ) : (
        <CashflowChart buckets={buckets} />
      )}

      <div className="forecast-table">
        <table>
          <thead>
            <tr><th>Date</th><th style={{ textAlign: "right" }}>In</th><th style={{ textAlign: "right" }}>Out</th><th style={{ textAlign: "right" }}>Balance</th></tr>
          </thead>
          <tbody>
            {buckets.slice(0, 14).map((b) => (
              <tr key={b.date}>
                <td className="mono">{fmtDate(b.date)}</td>
                <td className="mono" style={{ textAlign: "right" }}>{inrShort(b.inflow)}</td>
                <td className="mono" style={{ textAlign: "right" }}>{inrShort(b.outflow)}</td>
                <td className="mono" style={{ textAlign: "right" }}>{inrShort(b.runningBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sub" style={{ marginTop: 6 }}>Showing first 14 days. The chart covers the full 90-day window.</p>
      </div>
    </div>
  );
}