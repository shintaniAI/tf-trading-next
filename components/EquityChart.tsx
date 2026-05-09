"use client";
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine,
} from "recharts";
import type { Trade } from "@/lib/simulate";

export function EquityChart({
  trades,
  startDate,
  initialCapital,
}: {
  trades: Trade[];
  startDate: string;
  initialCapital: number;
}) {
  const data = [
    { date: startDate, capital: initialCapital },
    ...trades.map((t) => ({ date: t.date, capital: t.capital })),
  ];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        💰 口座残高推移
      </h3>
      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#232b38" />
            <XAxis dataKey="date" stroke="#8b949e" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="#8b949e"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => v.toLocaleString()}
              width={80}
            />
            <Tooltip
              contentStyle={{
                background: "#131820", border: "1px solid #232b38",
                borderRadius: 8, fontSize: 12,
              }}
              labelStyle={{ color: "#8b949e" }}
              formatter={(v) => [`${Number(v).toLocaleString()} 円`, "残高"]}
            />
            <ReferenceLine y={initialCapital} stroke="#8b949e" strokeDasharray="4 4"
                          label={{ value: `初期 ${initialCapital.toLocaleString()}円`, fill: "#8b949e", fontSize: 11, position: "insideTopLeft" }} />
            <Area
              type="monotone" dataKey="capital" stroke="#3b82f6"
              strokeWidth={2.5} fill="url(#colorCap)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
