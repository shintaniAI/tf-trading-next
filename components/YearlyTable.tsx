"use client";
import type { YearStat } from "@/lib/aggregate";

export function YearlyTable({ stats }: { stats: YearStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        📅 年別パフォーマンス（古い順を含む全期間）
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tnum">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
              <th className="text-left py-2 px-2">年</th>
              <th className="text-right">取引</th>
              <th className="text-right">勝/負</th>
              <th className="text-right">勝率</th>
              <th className="text-right">累積pt</th>
              <th className="text-right">累積円</th>
              <th className="text-right">最大DD</th>
              <th className="text-right">ベスト月</th>
              <th className="text-right">ワースト月</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const isUp = s.totalYen >= 0;
              return (
                <tr key={s.year} className="border-b border-[var(--border-soft)] hover:bg-[var(--bg-elevated)]">
                  <td className="py-2 px-2 font-bold">{s.year}</td>
                  <td className="text-right">{s.trades}</td>
                  <td className="text-right text-xs">
                    <span className="text-[var(--green)]">{s.wins}</span>
                    <span className="text-[var(--text-muted)]"> / </span>
                    <span className="text-[var(--red)]">{s.losses}</span>
                  </td>
                  <td className="text-right">{(s.winrate * 100).toFixed(1)}%</td>
                  <td className={`text-right font-semibold ${s.totalPt >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {s.totalPt >= 0 ? "+" : ""}{s.totalPt.toFixed(0)}
                  </td>
                  <td className={`text-right font-bold ${isUp ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {s.totalYen >= 0 ? "+" : ""}{s.totalYen.toLocaleString()}
                  </td>
                  <td className="text-right text-[var(--red)]">
                    {s.maxDDYen.toLocaleString()}
                  </td>
                  <td className="text-right text-xs">
                    {s.bestMonth ? (
                      <>
                        <span className="text-[var(--text-muted)]">{s.bestMonth.ym}</span>{" "}
                        <span className="text-[var(--green)]">+{s.bestMonth.yen.toLocaleString()}</span>
                      </>
                    ) : "—"}
                  </td>
                  <td className="text-right text-xs">
                    {s.worstMonth ? (
                      <>
                        <span className="text-[var(--text-muted)]">{s.worstMonth.ym}</span>{" "}
                        <span className={s.worstMonth.yen < 0 ? "text-[var(--red)]" : "text-[var(--green)]"}>
                          {s.worstMonth.yen >= 0 ? "+" : ""}{s.worstMonth.yen.toLocaleString()}
                        </span>
                      </>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
