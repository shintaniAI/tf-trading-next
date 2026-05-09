"use client";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell } from "recharts";
import type { Trade } from "@/lib/simulate";

export function MonthlyBar({ trades }: { trades: Trade[] }) {
  const map = new Map<string, { yen: number; wins: number; losses: number }>();
  for (const t of trades) {
    const ym = t.date.slice(0, 7);
    const cur = map.get(ym) || { yen: 0, wins: 0, losses: 0 };
    cur.yen += t.pnlYen;
    if (t.pnlPt! > 0) cur.wins++;
    if (t.pnlPt! < 0) cur.losses++;
    map.set(ym, cur);
  }
  const data = Array.from(map.entries()).map(([ym, v]) => ({ ym, ...v })).sort((a, b) => a.ym.localeCompare(b.ym));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        📅 月別損益
      </h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#232b38" />
            <XAxis dataKey="ym" stroke="#8b949e" tick={{ fontSize: 11 }} />
            <YAxis stroke="#8b949e" tick={{ fontSize: 11 }}
                   tickFormatter={(v) => v.toLocaleString()} width={80} />
            <Tooltip
              contentStyle={{
                background: "#131820", border: "1px solid #232b38",
                borderRadius: 8, fontSize: 12,
              }}
              labelStyle={{ color: "#8b949e" }}
              formatter={(v, _, p) => [
                `${Number(v).toLocaleString()} 円`,
                `${p.payload.wins}勝 ${p.payload.losses}敗`,
              ]}
            />
            <Bar dataKey="yen">
              {data.map((d, i) => (
                <Cell key={i} fill={d.yen >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
