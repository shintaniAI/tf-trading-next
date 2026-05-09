import type { SimResult } from "@/lib/simulate";

function Card({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: string;
  sub?: string;
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-2">{label}</div>
      <div className={`text-3xl font-bold tnum leading-none ${colorMap[color]}`}>{value}</div>
      {sub && <div className="mt-2 text-xs text-[var(--text-muted)] tnum">{sub}</div>}
    </div>
  );
}

export function KpiCards({ sim }: { sim: SimResult }) {
  const totalYen = sim.totalYen;
  const totalPt = sim.totalPt;
  const sign = totalYen >= 0 ? "+" : "";
  const totalColor = totalYen >= 0 ? "green" : "red";
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        label="累積損益"
        value={`${sign}${totalYen.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`}
        sub={`円（${sim.roiPct >= 0 ? "+" : ""}${sim.roiPct.toFixed(1)}%）／ ${totalPt >= 0 ? "+" : ""}${totalPt.toFixed(0)} pt`}
        color={totalColor}
      />
      <Card
        label="口座残高"
        value={sim.finalCapital.toLocaleString("ja-JP")}
        sub={`初期 ${sim.initialCapital.toLocaleString("ja-JP")} 円`}
        color="blue"
      />
      <Card
        label="勝率"
        value={`${(sim.winrate * 100).toFixed(1)}%`}
        sub={`${sim.wins} 勝 ／ ${sim.losses} 敗`}
        color="gold"
      />
      <Card
        label="最大ドローダウン"
        value={`${sim.maxDDyen.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`}
        sub={`円 ／ ${sim.maxDDpt.toFixed(0)} pt`}
        color="red"
      />
    </div>
  );
}
