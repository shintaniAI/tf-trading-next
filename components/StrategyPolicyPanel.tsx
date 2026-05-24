"use client";

import { useMemo } from "react";
import type { Bar } from "@/lib/yahoo";
import { simulate } from "@/lib/simulate";
import { STRATEGY_POLICIES, type StrategyPolicyId } from "@/lib/policy";

function yen(v: number) {
  return `${Math.round(v).toLocaleString("ja-JP")}円`;
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function StrategyPolicyPanel({
  n225,
  dji,
  startDate,
  contractSize,
  basePieces,
  capital,
  selectedPolicy,
  onSelect,
}: {
  n225: Bar[];
  dji: Bar[];
  startDate: string;
  contractSize: number;
  basePieces: number;
  capital: number;
  selectedPolicy: StrategyPolicyId;
  onSelect: (id: StrategyPolicyId) => void;
}) {
  const rows = useMemo(() => {
    return STRATEGY_POLICIES.map((policy) => {
      const sim = simulate(n225, dji, startDate, contractSize, basePieces, capital, policy.id);
      const maxDD = Math.abs(sim.maxDDyen);
      const score = maxDD > 0 ? sim.totalYen / maxDD : 0;
      return {
        policy,
        trades: sim.trades.length,
        totalYen: sim.totalYen,
        maxDD,
        winrate: sim.winrate,
        score,
      };
    });
  }, [n225, dji, startDate, contractSize, basePieces, capital]);

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            🧪 ロジックパターン比較
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            今回の論点を画面に反映。固定400円だけでなく、300円/100円、過去1年の上位20%/10%も同じ資金・銘柄・枚数で比較する。
          </p>
        </div>
        <div className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 text-[11px] leading-relaxed text-[var(--gold)]">
          本命候補: 固定円より「過去1年ギャップ上位20%」。400円固定は安全モード扱い。
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            <tr>
              <th className="py-2 text-left">採用</th>
              <th className="py-2 text-left">ロジック</th>
              <th className="py-2 text-right">取引数</th>
              <th className="py-2 text-right">合計損益</th>
              <th className="py-2 text-right">最大DD</th>
              <th className="py-2 text-right">勝率</th>
              <th className="py-2 text-right">利益/DD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const selected = r.policy.id === selectedPolicy;
              return (
                <tr key={r.policy.id} className={`border-b border-[var(--border)]/60 last:border-0 ${selected ? "bg-[var(--blue)]/8" : ""}`}>
                  <td className="py-2">
                    <button
                      onClick={() => onSelect(r.policy.id)}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                        selected
                          ? "bg-[var(--blue)] text-white"
                          : "border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--blue)] hover:text-[var(--blue)]"
                      }`}
                    >
                      {selected ? "選択中" : "使う"}
                    </button>
                  </td>
                  <td className="py-2 min-w-[260px]">
                    <div className="font-bold text-[var(--text)]">{r.policy.label}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{r.policy.description}</div>
                    <div className="mt-1 text-[10px] leading-relaxed text-[var(--gold)]">注意: {r.policy.riskNote}</div>
                  </td>
                  <td className="py-2 text-right tnum">{r.trades.toLocaleString("ja-JP")}回</td>
                  <td className={`py-2 text-right tnum ${r.totalYen >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {r.totalYen >= 0 ? "+" : ""}{yen(r.totalYen)}
                  </td>
                  <td className="py-2 text-right text-[var(--red)] tnum">-{yen(r.maxDD)}</td>
                  <td className="py-2 text-right tnum">{pct(r.winrate)}</td>
                  <td className="py-2 text-right tnum">{r.score.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
