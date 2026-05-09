"use client";
import type { AdvancedMetrics as Metrics } from "@/lib/metrics";

export function AdvancedMetrics({ metrics }: { metrics: Metrics }) {
  const cards: { label: string; value: string; sub?: string; tooltip?: string; color?: string; rating?: "good" | "ok" | "bad" }[] = [
    {
      label: "Sharpe Ratio",
      value: metrics.sharpeRatio.toFixed(2),
      sub: "リスク調整後リターン",
      tooltip: "1.0以上=良好、2.0以上=優秀、3.0以上=異常に良い",
      rating: metrics.sharpeRatio >= 2 ? "good" : metrics.sharpeRatio >= 1 ? "ok" : "bad",
    },
    {
      label: "Sortino Ratio",
      value: metrics.sortinoRatio.toFixed(2),
      sub: "下方リスクのみ",
      tooltip: "下方リスクのみ考慮した調整後リターン",
      rating: metrics.sortinoRatio >= 2 ? "good" : metrics.sortinoRatio >= 1 ? "ok" : "bad",
    },
    {
      label: "Calmar Ratio",
      value: metrics.calmarRatio.toFixed(2),
      sub: "リターン / 最大DD",
      tooltip: "3以上=優秀、リスクに対するリターン効率",
      rating: metrics.calmarRatio >= 3 ? "good" : metrics.calmarRatio >= 1 ? "ok" : "bad",
    },
    {
      label: "Profit Factor",
      value: metrics.profitFactor.toFixed(2),
      sub: "勝ち合計 / 負け合計",
      tooltip: "1.5以上=良好、2以上=優秀、1未満=損失中",
      rating: metrics.profitFactor >= 2 ? "good" : metrics.profitFactor >= 1.5 ? "ok" : "bad",
    },
    {
      label: "期待値 / 取引",
      value: `${metrics.expectedValue >= 0 ? "+" : ""}${Math.round(metrics.expectedValue).toLocaleString()} 円`,
      sub: "1取引あたり期待利益",
      tooltip: "(勝率×平均勝ち) - (負率×平均負け)",
      rating: metrics.expectedValue > 0 ? "good" : "bad",
    },
    {
      label: "リスクリワード比",
      value: `1:${metrics.riskRewardRatio.toFixed(2)}`,
      sub: "平均負け1 → 平均勝ち",
      tooltip: "1:1.5以上が望ましい",
      rating: metrics.riskRewardRatio >= 1.5 ? "good" : metrics.riskRewardRatio >= 1 ? "ok" : "bad",
    },
    {
      label: "CAGR (年複利)",
      value: `${metrics.cagrPct >= 0 ? "+" : ""}${metrics.cagrPct.toFixed(1)}%`,
      sub: "年率複利成長",
      tooltip: "S&P500長期平均=10%程度",
      rating: metrics.cagrPct >= 30 ? "good" : metrics.cagrPct >= 10 ? "ok" : "bad",
    },
    {
      label: "ボラティリティ",
      value: `${metrics.volatilityPct.toFixed(1)}%`,
      sub: "日次リターン標準偏差(年率)",
      tooltip: "20%以下=安定、30%以上=高ボラ",
      rating: metrics.volatilityPct <= 20 ? "good" : metrics.volatilityPct <= 40 ? "ok" : "bad",
    },
    {
      label: "平均勝ち",
      value: `+${Math.round(metrics.avgWin).toLocaleString()} 円`,
      sub: "勝った時の平均",
      color: "green",
    },
    {
      label: "平均負け",
      value: `-${Math.round(metrics.avgLoss).toLocaleString()} 円`,
      sub: "負けた時の平均",
      color: "red",
    },
    {
      label: "最大勝ち",
      value: `+${Math.round(metrics.largestWin).toLocaleString()} 円`,
      sub: "1日の最高",
      color: "green",
    },
    {
      label: "最大負け",
      value: `${Math.round(metrics.largestLoss).toLocaleString()} 円`,
      sub: "1日の最悪",
      color: "red",
    },
    {
      label: "最大DD継続",
      value: `${metrics.maxDDDays} 日`,
      sub: "DDが続いた最長期間",
    },
    {
      label: "DD回復",
      value: `${metrics.recoveryDays} 日`,
      sub: "最大DD後の回復日数",
    },
    {
      label: "アンダーウォーター",
      value: `${metrics.underwaterDays} / ${metrics.totalDays} 日`,
      sub: `${((metrics.underwaterDays / Math.max(1, metrics.totalDays)) * 100).toFixed(0)}% の期間DD中`,
    },
    {
      label: "月間取引数",
      value: `${metrics.tradesPerMonth.toFixed(1)} 回`,
      sub: "1ヶ月あたり",
    },
  ];

  const ratingColor = (r?: "good" | "ok" | "bad", forced?: string) => {
    if (forced === "green") return "text-[var(--green)]";
    if (forced === "red") return "text-[var(--red)]";
    if (r === "good") return "text-[var(--green)]";
    if (r === "ok") return "text-[var(--gold)]";
    if (r === "bad") return "text-[var(--red)]";
    return "text-[var(--text)]";
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        📊 高度な分析指標
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <div
            key={i}
            className="rounded-lg bg-[var(--bg-elevated)] p-3 hover:bg-[var(--border)] transition cursor-help"
            title={c.tooltip}
          >
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
              {c.label}
            </div>
            <div className={`text-xl font-bold tnum ${ratingColor(c.rating, c.color)}`}>
              {c.value}
            </div>
            {c.sub && <div className="text-[10px] text-[var(--text-muted)] mt-1">{c.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
