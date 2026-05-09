"use client";
import type { Trade } from "@/lib/simulate";

export function GoalProgress({
  trades,
  initialCapital,
  goalCapital,
  startDate,
}: {
  trades: Trade[];
  initialCapital: number;
  goalCapital: number;
  startDate: string;
}) {
  // 残高推移を時系列で
  const series = [
    { date: startDate, capital: initialCapital, day: 0 },
    ...trades.map((t, i) => ({ date: t.date, capital: t.capital, day: i + 1 })),
  ];

  const finalCapital = series[series.length - 1]?.capital ?? initialCapital;
  const targetGain = goalCapital - initialCapital;
  const currentGain = finalCapital - initialCapital;
  const progressPct = targetGain > 0 ? Math.max(0, Math.min(100, (currentGain / targetGain) * 100)) : 0;

  // 目標達成日（チャート時系列で初めて goalCapital 以上になった日）
  const achievedRow = series.find((s) => s.capital >= goalCapital);
  const achieved = achievedRow != null;

  // 残高ピーク
  let peakCap = initialCapital;
  let peakDay = 0;
  let peakDate = startDate;
  for (const s of series) {
    if (s.capital > peakCap) {
      peakCap = s.capital;
      peakDay = s.day;
      peakDate = s.date;
    }
  }

  // 残額・必要日数推定
  const remaining = goalCapital - finalCapital;
  const totalDays = series.length - 1;
  const avgPerDay = totalDays > 0 ? currentGain / totalDays : 0;
  const estDaysToGoal = avgPerDay > 0 ? Math.ceil(remaining / avgPerDay) : null;

  // 倍率
  const finalMultiple = initialCapital > 0 ? finalCapital / initialCapital : 0;
  const goalMultiple = initialCapital > 0 ? goalCapital / initialCapital : 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          🎯 目標達成シミュレーション
        </h3>
        {achieved ? (
          <span className="px-2 py-0.5 rounded-full bg-[var(--green)]/15 border border-[var(--green)]/30 text-[var(--green)] text-xs font-bold">
            ✓ 達成済み
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-[var(--gold)]/15 border border-[var(--gold)]/30 text-[var(--gold)] text-xs font-bold">
            未達成
          </span>
        )}
      </div>

      {/* 進捗バー */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-[var(--text-muted)]">
            初期 {initialCapital.toLocaleString()} 円
          </span>
          <span className={`font-semibold tnum ${achieved ? "text-[var(--green)]" : "text-[var(--text)]"}`}>
            進捗 {progressPct.toFixed(1)}%
          </span>
          <span className="text-[var(--text-muted)]">
            目標 {goalCapital.toLocaleString()} 円
          </span>
        </div>
        <div className="relative h-3 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              achieved ? "bg-gradient-to-r from-[var(--green)] to-emerald-400" : "bg-gradient-to-r from-[var(--blue)] to-cyan-400"
            }`}
            style={{ width: `${Math.max(2, progressPct)}%` }}
          />
        </div>
      </div>

      {/* 詳細グリッド */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="現在残高"
          value={`${finalCapital.toLocaleString()} 円`}
          sub={`×${finalMultiple.toFixed(2)} 倍化`}
          color={finalCapital >= initialCapital ? "green" : "red"}
        />
        <Stat
          label={achieved ? "達成日" : "目標まで"}
          value={achieved
            ? achievedRow!.date
            : `${remaining > 0 ? remaining.toLocaleString() : "達成"} 円`}
          sub={achieved
            ? `運用 ${achievedRow!.day} 日目`
            : (estDaysToGoal != null ? `推定残り ${estDaysToGoal} 営業日` : "—")}
          color={achieved ? "green" : "gold"}
        />
        <Stat
          label="ピーク残高"
          value={`${peakCap.toLocaleString()} 円`}
          sub={`${peakDate}（${peakDay}日目）`}
          color="blue"
        />
        <Stat
          label="目標倍率"
          value={`× ${goalMultiple.toFixed(1)}`}
          sub={`${goalCapital.toLocaleString()} ÷ ${initialCapital.toLocaleString()}`}
        />
      </div>

      {/* 注釈 */}
      {!achieved && estDaysToGoal != null && estDaysToGoal > 0 && (
        <div className="mt-4 text-xs text-[var(--text-muted)]">
          💡 直近の平均日次損益（{Math.round(avgPerDay).toLocaleString()} 円/日）が続けば、約 <span className="text-[var(--text)] font-semibold tnum">{estDaysToGoal}</span> 営業日後に達成見込み。
          <br />相場局面で大きく変動するので参考値です。
        </div>
      )}
    </div>
  );
}

function Stat({
  label, value, sub, color = "default",
}: {
  label: string;
  value: string;
  sub: string;
  color?: "default" | "green" | "red" | "blue" | "gold";
}) {
  const colorMap = {
    default: "text-[var(--text)]",
    green: "text-[var(--green)]",
    red: "text-[var(--red)]",
    blue: "text-[var(--blue)]",
    gold: "text-[var(--gold)]",
  };
  return (
    <div className="rounded-lg bg-[var(--bg-elevated)] p-3">
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">{label}</div>
      <div className={`text-lg font-bold tnum ${colorMap[color]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-[var(--text-muted)] tnum">{sub}</div>
    </div>
  );
}
