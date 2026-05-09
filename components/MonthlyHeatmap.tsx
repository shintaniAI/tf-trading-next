"use client";
import type { MonthStat } from "@/lib/aggregate";

export function MonthlyHeatmap({ monthly }: { monthly: MonthStat[] }) {
  if (monthly.length === 0) return null;

  const years = Array.from(new Set(monthly.map((m) => m.year))).sort((a, b) => a - b);
  const matrix: Record<number, Record<number, MonthStat | undefined>> = {};
  for (const y of years) matrix[y] = {};
  for (const m of monthly) {
    matrix[m.year][m.month] = m;
  }

  const allYens = monthly.map((m) => m.totalYen);
  const maxAbs = Math.max(...allYens.map(Math.abs), 1);

  const colorFor = (yen: number) => {
    const intensity = Math.min(1, Math.abs(yen) / maxAbs);
    if (yen > 0) {
      const a = 0.15 + intensity * 0.7;
      return `rgba(16, 185, 129, ${a})`;
    } else if (yen < 0) {
      const a = 0.15 + intensity * 0.7;
      return `rgba(239, 68, 68, ${a})`;
    }
    return "rgba(139, 148, 158, 0.1)";
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          🗓️ 月別ヒートマップ（年×月）
        </h3>
        <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(239,68,68,0.7)" }} /> 損
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(139,148,158,0.2)" }} /> なし
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(16,185,129,0.7)" }} /> 益
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs tnum">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="text-left py-1 pr-3 sticky left-0 bg-[var(--bg-card)]">年</th>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <th key={m} className="text-center py-1 px-1 font-normal" style={{ minWidth: 70 }}>
                  {m}月
                </th>
              ))}
              <th className="text-right pl-2 pr-2">年合計</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const yearTotal = (matrix[y]
                ? Object.values(matrix[y]).reduce((s, m) => s + (m?.totalYen ?? 0), 0)
                : 0);
              return (
                <tr key={y}>
                  <td className="py-1 pr-3 font-bold sticky left-0 bg-[var(--bg-card)]">{y}</td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const cell = matrix[y][m];
                    if (!cell) {
                      return (
                        <td key={m} className="p-0.5">
                          <div
                            className="rounded text-center py-2 px-1 text-[10px] text-[var(--text-muted)]"
                            style={{ background: "rgba(139,148,158,0.05)" }}
                          >—</div>
                        </td>
                      );
                    }
                    const isUp = cell.totalYen >= 0;
                    return (
                      <td
                        key={m}
                        className="p-0.5"
                        title={`${cell.ym}: ${cell.totalYen >= 0 ? "+" : ""}${cell.totalYen.toLocaleString()}円 / ${cell.wins}勝${cell.losses}敗 / ${(cell.winrate * 100).toFixed(0)}%`}
                      >
                        <div
                          className="rounded text-center py-1.5 px-1 cursor-help font-semibold"
                          style={{
                            background: colorFor(cell.totalYen),
                            color: isUp ? "#10b981" : "#ef4444",
                          }}
                        >
                          <div className="text-[10px] leading-tight">
                            {isUp ? "+" : ""}{(cell.totalYen / 1000).toFixed(0)}k
                          </div>
                          <div className="text-[8px] text-[var(--text-muted)] leading-tight">
                            {(cell.winrate * 100).toFixed(0)}%
                          </div>
                        </div>
                      </td>
                    );
                  })}
                  <td className={`text-right pl-2 pr-2 font-bold ${yearTotal >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {yearTotal >= 0 ? "+" : ""}{yearTotal.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-[10px] text-[var(--text-muted)]">
        💡 セル内: 上段=損益(千円単位)、下段=勝率%。ホバーで詳細
      </div>
    </div>
  );
}
