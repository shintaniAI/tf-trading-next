"use client";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from "recharts";
import type { WeekdayStats } from "@/lib/metrics";

export function WeekdayChart({ stats }: { stats: WeekdayStats[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        📅 曜日別パフォーマンス
      </h3>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats} margin={{ top: 16, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#232b38" />
            <XAxis dataKey="weekday" stroke="#8b949e" tick={{ fontSize: 12 }} />
            <YAxis stroke="#8b949e" tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} width={80} />
            <Tooltip
              contentStyle={{ background: "#131820", border: "1px solid #232b38", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#8b949e" }}
              formatter={(v, _, p) => [
                `${Number(v).toLocaleString()} 円`,
                `${p.payload.weekday}曜 ${p.payload.wins}勝${p.payload.losses}敗 (${(p.payload.winrate * 100).toFixed(0)}%)`,
              ]}
            />
            <ReferenceLine y={0} stroke="#8b949e" />
            <Bar dataKey="totalYen">
              {stats.map((s, i) => (
                <Cell key={i} fill={s.totalYen >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {stats.map((s) => (
          <div key={s.weekday} className="text-center rounded-lg bg-[var(--bg-elevated)] py-2">
            <div className="text-xs text-[var(--text-muted)]">{s.weekday}</div>
            <div className="text-sm font-bold tnum">{(s.winrate * 100).toFixed(0)}%</div>
            <div className="text-[10px] text-[var(--text-muted)] tnum">{s.wins}/{s.losses}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
