"use client";

import { useMemo, useState } from "react";
import type { Bar } from "@/lib/yahoo";
import { simulate } from "@/lib/simulate";

type ContractKey = "micro" | "mini" | "large";

type ContractSpec = {
  key: ContractKey;
  label: string;
  shortLabel: string;
  size: number;
};

const CONTRACTS: ContractSpec[] = [
  { key: "micro", label: "日経225マイクロ", shortLabel: "マイクロ", size: 10 },
  { key: "mini", label: "日経225ミニ", shortLabel: "ミニ", size: 100 },
  { key: "large", label: "日経225ラージ", shortLabel: "ラージ", size: 1000 },
];

function yen(v: number) {
  return `${Math.round(v).toLocaleString("ja-JP")}円`;
}

function pct(v: number) {
  return `${v.toFixed(0)}%`;
}

export function CapitalPlanner({
  n225,
  dji,
  selectedCapital,
}: {
  n225: Bar[];
  dji: Bar[];
  selectedCapital: number;
}) {
  const [riskPct, setRiskPct] = useState(20);

  const benchmarks = useMemo(() => {
    const firstDate = n225[0]?.date ?? "2020-01-01";
    const lastDate = n225[n225.length - 1]?.date ?? firstDate;
    const firstMs = new Date(firstDate).getTime();
    const lastMs = new Date(lastDate).getTime();
    const years = Math.max((lastMs - firstMs) / (365.25 * 24 * 60 * 60 * 1000), 1);

    return CONTRACTS.map((contract) => {
      const sim = simulate(n225, dji, "2020-01-01", contract.size, 1, 1_000_000);
      const maxDDYen = Math.abs(sim.maxDDyen);
      return {
        ...contract,
        totalYenPerBase: sim.totalYen,
        annualYenPerBase: sim.totalYen / years,
        maxDDYenPerBase: maxDDYen,
        winrate: sim.winrate,
        trades: sim.trades.length,
      };
    });
  }, [n225, dji]);

  const capitalRows = useMemo(() => {
    const baseCapitals = [50_000, 100_000, 300_000, 500_000, 1_000_000, 3_000_000, 5_000_000, 10_000_000];
    const capitals = Array.from(new Set([...baseCapitals, selectedCapital].filter((v) => v > 0))).sort((a, b) => a - b);

    return capitals.map((capital) => {
      const riskBudget = capital * (riskPct / 100);
      const candidates = benchmarks.map((b) => {
        const rawBasePieces = b.maxDDYenPerBase > 0 ? Math.floor(riskBudget / b.maxDDYenPerBase) : 0;
        const basePieces = Math.max(0, Math.min(rawBasePieces, 20));
        return {
          ...b,
          capital,
          riskBudget,
          basePieces,
          maxSignalPieces: basePieces * 2,
          expectedAnnual: b.annualYenPerBase * basePieces,
          expectedTotal: b.totalYenPerBase * basePieces,
          estimatedDD: b.maxDDYenPerBase * basePieces,
        };
      }).filter((c) => c.basePieces >= 1);

      const best = candidates.sort((a, b) => b.expectedAnnual - a.expectedAnnual)[0];
      return best ?? { capital, riskBudget, basePieces: 0 };
    });
  }, [benchmarks, riskPct, selectedCapital]);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            ① 過去検証：資本金別の推奨枚数
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
            ここは「いくら資金があれば、何を何枚までなら無理がないか」を見る場所。利益額より先に、過去に一番きつかった負け幅（DD）に耐えられるかを確認する。
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          許容する一時負け幅
          <input
            type="number"
            min={5}
            max={80}
            step={5}
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
            className="w-20 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text)] tnum"
          />
          %
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="md:col-span-3 rounded-lg border border-[var(--blue)]/30 bg-[var(--blue)]/5 p-3 text-xs leading-relaxed text-[var(--text-muted)]">
          読み方: まず資本金の行を見る → 推奨銘柄を見る → 基本枚数を守る。最大枚数はNYダウも同じ向きで「勢いが強い日」だけ使う上限。
          初心者は、表がミニやラージを出していても、最初はマイクロ1枚で動きに慣れるのが安全。
        </div>
        {benchmarks.map((b) => (
          <div key={b.key} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="text-xs font-bold text-[var(--text)]">{b.label} / 基本1枚</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[var(--text-muted)]">
              <div>過去合計利益</div><div className="text-right text-[var(--green)] tnum">+{yen(b.totalYenPerBase)}</div>
              <div>年平均</div><div className="text-right tnum">+{yen(b.annualYenPerBase)}</div>
              <div>最大の一時負け</div><div className="text-right text-[var(--red)] tnum">-{yen(b.maxDDYenPerBase)}</div>
              <div>勝率</div><div className="text-right tnum">{(b.winrate * 100).toFixed(1)}%</div>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border)]">
            <tr>
              <th className="py-2 text-left">資本金</th>
              <th className="py-2 text-left">推奨銘柄</th>
              <th className="py-2 text-right">基本枚数</th>
              <th className="py-2 text-right">最大枚数</th>
              <th className="py-2 text-right">想定一時負け</th>
              <th className="py-2 text-right">年期待</th>
            </tr>
          </thead>
          <tbody>
            {capitalRows.map((r) => (
              <tr key={r.capital} className="border-b border-[var(--border)]/60 last:border-0">
                <td className="py-2 tnum font-semibold">{yen(r.capital)}</td>
                {"shortLabel" in r ? (
                  <>
                    <td className="py-2">{r.shortLabel}</td>
                    <td className="py-2 text-right tnum">{r.basePieces}枚</td>
                    <td className="py-2 text-right tnum">{r.maxSignalPieces}枚</td>
                    <td className="py-2 text-right text-[var(--red)] tnum">-{yen(r.estimatedDD)}</td>
                    <td className="py-2 text-right text-[var(--green)] tnum">+{yen(r.expectedAnnual)}</td>
                  </>
                ) : (
                  <td colSpan={5} className="py-2 text-right text-[var(--gold)]">
                    見送り推奨（DD許容 {pct(riskPct)} ではマイクロ1枚も重い）
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
        目安: 「基本枚数」は通常日、夕場とNYが同方向の日だけロジック上2倍。手数料・スリッページ・証拠金変更は未反映なので、本番前に業者別で再計算する。
      </p>
    </section>
  );
}
