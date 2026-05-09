"use client";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from "recharts";
import type { Trade } from "@/lib/simulate";

export function WinLossChart({ trades, limit = 30 }: { trades: Trade[]; limit?: number }) {
  const recent = trades.slice(-limit);

  // 連勝/連敗ストリーク計算
  let curStreak = 0;
  let curStreakType: "win" | "loss" | null = null;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  for (const t of recent) {
    if (t.pnlPt! > 0) {
      if (curStreakType === "win") curStreak++;
      else { curStreakType = "win"; curStreak = 1; }
      if (curStreak > maxWinStreak) maxWinStreak = curStreak;
    } else if (t.pnlPt! < 0) {
      if (curStreakType === "loss") curStreak++;
      else { curStreakType = "loss"; curStreak = 1; }
      if (curStreak > maxLossStreak) maxLossStreak = curStreak;
    }
  }

  const totalWins = recent.filter((t) => t.pnlPt! > 0).length;
  const totalLosses = recent.filter((t) => t.pnlPt! < 0).length;
  const winrate = (totalWins + totalLosses) > 0 ? totalWins / (totalWins + totalLosses) : 0;

  const data = recent.map((t) => ({
    date: t.date.slice(5), // MM-DD
    pnlYen: t.pnlYen,
    direction: t.direction,
    pieces: t.pieces,
  }));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          🎯 直近 {recent.length} 取引の勝敗
        </h3>
        <div className="text-xs text-[var(--text-muted)] tnum">
          勝率 <span className="text-[var(--text)] font-semibold">{(winrate * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* ストリーク表示 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">勝/負</div>
          <div className="text-lg font-bold tnum mt-1">
            <span className="text-[var(--green)]">{totalWins}</span>
            <span className="text-[var(--text-muted)]"> / </span>
            <span className="text-[var(--red)]">{totalLosses}</span>
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">最大連勝</div>
          <div className="text-lg font-bold tnum mt-1 text-[var(--green)]">{maxWinStreak}</div>
        </div>
        <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">最大連敗</div>
          <div className="text-lg font-bold tnum mt-1 text-[var(--red)]">{maxLossStreak}</div>
        </div>
      </div>

      {/* 勝敗ドット表示 */}
      <div className="flex flex-wrap gap-1 mb-4">
        {recent.map((t, i) => {
          const w = t.pnlPt! > 0;
          const l = t.pnlPt! < 0;
          return (
            <div
              key={i}
              title={`${t.date}: ${t.direction} ${t.pieces}枚 ${t.pnlYen >= 0 ? "+" : ""}${t.pnlYen.toLocaleString()}円`}
              className={`w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold ${
                w ? "bg-[var(--green)] text-white"
                  : l ? "bg-[var(--red)] text-white"
                  : "bg-[var(--text-muted)] text-white"
              }`}
            >
              {w ? "○" : l ? "×" : "—"}
            </div>
          );
        })}
      </div>

      {/* 損益バー */}
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#232b38" />
            <XAxis dataKey="date" stroke="#8b949e" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(data.length / 10))} />
            <YAxis stroke="#8b949e" tick={{ fontSize: 10 }} tickFormatter={(v) => v.toLocaleString()} width={70} />
            <Tooltip
              contentStyle={{ background: "#131820", border: "1px solid #232b38", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#8b949e" }}
              formatter={(v, _, p) => [
                `${Number(v).toLocaleString()} 円`,
                `${p.payload.direction} ${p.payload.pieces}枚`,
              ]}
            />
            <ReferenceLine y={0} stroke="#8b949e" />
            <Bar dataKey="pnlYen">
              {data.map((d, i) => (
                <Cell key={i} fill={d.pnlYen >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
