import type { Trade } from "@/lib/simulate";

const JP_WD = ["日", "月", "火", "水", "木", "金", "土"];

function fmtJP(date: string) {
  const d = new Date(date);
  return `${date.slice(5)}（${JP_WD[d.getUTCDay()]}）`;
}

export function TradesTable({ trades, limit = 10 }: { trades: Trade[]; limit?: number }) {
  const recent = [...trades].slice(-limit).reverse();
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        🔬 直近{limit}取引（手計算で検算可）
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tnum">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
              <th className="text-left py-2 px-2">日付</th>
              <th className="text-left">方向</th>
              <th className="text-right">枚</th>
              <th className="text-right">夕場</th>
              <th className="text-right">NY</th>
              <th className="text-right">値幅</th>
              <th className="text-right">計算式</th>
              <th className="text-right">pt</th>
              <th className="text-right">円</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((t) => {
              const isUp = t.pnlPt! > 0;
              return (
                <tr key={t.date} className="border-b border-[var(--border-soft)] hover:bg-[var(--bg-elevated)]">
                  <td className="py-2 px-2">{fmtJP(t.date)}</td>
                  <td className={t.direction === "買い" ? "text-[var(--green)]" : "text-[var(--red)]"}>
                    {t.direction}
                  </td>
                  <td className="text-right">{t.pieces}</td>
                  <td className={`text-right ${t.yube >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {t.yube >= 0 ? "+" : ""}{t.yube.toFixed(0)}
                  </td>
                  <td className={`text-right ${t.nyDiff >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {t.nyDiff >= 0 ? "+" : ""}{t.nyDiff.toFixed(0)}
                  </td>
                  <td className="text-right">
                    {t.range! >= 0 ? "+" : ""}{t.range!.toFixed(0)}
                  </td>
                  <td className="text-right text-xs text-[var(--text-muted)] font-mono">
                    {t.yubeSign >= 0 ? "+" : ""}{t.yubeSign}×{t.pieces}×{t.range!.toFixed(0)}
                  </td>
                  <td className={`text-right font-semibold ${isUp ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {t.pnlPt! >= 0 ? "+" : ""}{t.pnlPt!.toFixed(0)}
                  </td>
                  <td className={`text-right font-semibold ${isUp ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {t.pnlYen >= 0 ? "+" : ""}{t.pnlYen.toLocaleString()}
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
