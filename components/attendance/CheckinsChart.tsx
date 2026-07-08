"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = {
  label: string;
  count: number;
  range: string;
};

export function CheckinsChart({ data }: { data: Point[] }) {
  const [weeks, setWeeks] = useState(6);
  const shown = data.slice(-weeks);
  const teal = "#0d9488";
  const maxCount = Math.max(4, ...shown.map((point) => point.count));

  return (
    <div className="checkins-chart">
      <div className="chart-head">
        <div>
          <h3 className="panel-title">Check-ins over time</h3>
          <p className="panel-sub">Last {weeks} weeks of activity</p>
        </div>
        <select className="chart-range" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Time range">
          <option value={6}>Last 6 weeks</option>
          <option value={12}>Last 12 weeks</option>
        </select>
      </div>
      <div className="checkins-chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={shown} margin={{ top: 10, right: 6, left: -10, bottom: 10 }}>
            <defs>
              <linearGradient id="ci-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={teal} stopOpacity={0.26} />
                <stop offset="100%" stopColor={teal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              height={34}
              tickMargin={10}
              tick={{ fontSize: 12, fill: "var(--text-dim)" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={34}
              allowDecimals={false}
              domain={[0, maxCount]}
              tickCount={Math.min(6, maxCount + 1)}
              tick={{ fontSize: 12, fill: "var(--text-dim)" }}
            />
            <Tooltip
              cursor={{ stroke: teal, strokeWidth: 1, strokeDasharray: "4 4" }}
              content={({ active, payload }) =>
                active && payload && payload.length ? (
                  <div className="chart-tip">
                    <div className="chart-tip-label">{String(payload[0]?.payload?.range ?? "")}</div>
                    <div className="chart-tip-val">
                      {payload[0]?.value} {payload[0]?.value === 1 ? "check-in" : "check-ins"}
                    </div>
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={teal}
              strokeWidth={2.5}
              fill="url(#ci-fill)"
              dot={{ r: 4, fill: teal, strokeWidth: 2, stroke: "var(--bg-elev)" }}
              activeDot={{ r: 6, fill: teal, strokeWidth: 2, stroke: "var(--bg-elev)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
