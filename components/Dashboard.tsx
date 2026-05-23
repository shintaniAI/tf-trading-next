"use client";
import { useState, useMemo, useEffect } from "react";
import type { Bar } from "@/lib/yahoo";
import { simulate } from "@/lib/simulate";
import { generateSignal, findPrevNYBar } from "@/lib/strategy";
import { HeroToday } from "./HeroToday";
import { KpiCards } from "./KpiCards";
import { EquityChart } from "./EquityChart";
import { MonthlyBar } from "./MonthlyBar";
import { TradesTable } from "./TradesTable";
import { IntradayChart } from "./IntradayChart";
import { WinLossChart } from "./WinLossChart";
import { GoalProgress } from "./GoalProgress";
import { AdvancedMetrics } from "./AdvancedMetrics";
import { WeekdayChart } from "./WeekdayChart";
import { YearlyTable } from "./YearlyTable";
import { MonthlyHeatmap } from "./MonthlyHeatmap";
import { PeriodPresets } from "./PeriodPresets";
import { computeMetrics, computeWeekdayStats } from "@/lib/metrics";
import { aggregateMonthly, aggregateYearly } from "@/lib/aggregate";
import { CapitalPlanner } from "./CapitalPlanner";
import { PaperDemo } from "./PaperDemo";
import { ProductionBlueprint } from "./ProductionBlueprint";

type ContractKey = "micro" | "mini" | "large";
const CONTRACTS: Record<ContractKey, { label: string; size: number }> = {
  micro: { label: "マイクロ (1pt=10円)", size: 10 },
  mini: { label: "ミニ (1pt=100円)", size: 100 },
  large: { label: "ラージ (1pt=1,000円)", size: 1000 },
};
const DEFAULT_CAPITAL: Record<ContractKey, number> = {
  micro: 50000, mini: 500000, large: 5000000,
};

export function Dashboard({ n225, dji }: { n225: Bar[]; dji: Bar[] }) {
  const today = n225[n225.length - 1];
  const prev = n225[n225.length - 2];
  const nyPrev = findPrevNYBar(dji, today.date);
  const sigToday = generateSignal(today, prev, nyPrev);

  // 画面の主目的
  const [activeSection, setActiveSection] = useState<"history" | "demo" | "live">("history");
  // 設定状態
  const defaultStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 180);
    return d.toISOString().slice(0, 10);
  })();
  const [startDate, setStartDate] = useState(defaultStart);
  const [contract, setContract] = useState<ContractKey>("mini");
  const [pieces, setPieces] = useState(1);
  const [capital, setCapital] = useState(DEFAULT_CAPITAL["mini"]);
  const [goalCapital, setGoalCapital] = useState(DEFAULT_CAPITAL["mini"] * 10);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    const first = window.setTimeout(update, 0);
    const t = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  const handleContractChange = (next: ContractKey) => {
    setContract(next);
    setCapital(DEFAULT_CAPITAL[next]);
    setGoalCapital(DEFAULT_CAPITAL[next] * 10);
  };

  const sim = useMemo(
    () => simulate(n225, dji, startDate, CONTRACTS[contract].size, pieces, capital),
    [n225, dji, startDate, contract, pieces, capital]
  );

  const metrics = useMemo(
    () => computeMetrics(sim.trades, capital),
    [sim.trades, capital]
  );

  const weekdayStats = useMemo(() => computeWeekdayStats(sim.trades), [sim.trades]);
  const monthlyStats = useMemo(() => aggregateMonthly(sim.trades), [sim.trades]);
  const yearlyStats = useMemo(() => aggregateYearly(sim.trades, monthlyStats), [sim.trades, monthlyStats]);

  const isAbnormal = Math.abs(sim.roiPct) > 200;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* ヘッダー */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">📈 TF Trading Dashboard</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">過去検証・デモ運用・Xserver本番運用を1画面で管理</p>
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--green)]/10 border border-[var(--green)]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
            <span className="text-xs font-semibold text-[var(--green)]">ライブ</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)] tnum" suppressHydrationWarning>
            {now ? now.toLocaleString("ja-JP", { hour12: false }) : "—"}
          </p>
        </div>
      </header>

      {/* HERO + リアルタイム */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <HeroToday signal={sigToday} basePieces={pieces} contractSize={CONTRACTS[contract].size} />
        <IntradayChart />
      </div>

      {/* 3目的ナビ */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        {([
          { key: "history", title: "① 過去検証", desc: "資本金別に何枚張れるか" },
          { key: "demo", title: "② デモ運用", desc: "仮建玉を保存して経過確認" },
          { key: "live", title: "③ 本番運用", desc: "Xserver + APIで24h稼働" },
        ] as const).map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveSection(item.key)}
            className={`rounded-xl border p-4 text-left transition ${
              activeSection === item.key
                ? "border-[var(--blue)] bg-[var(--blue)]/10 shadow-lg shadow-[var(--blue)]/10"
                : "border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            <div className="text-sm font-bold text-[var(--text)]">{item.title}</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">{item.desc}</div>
          </button>
        ))}
      </div>

      <div className="mb-6 space-y-4">
        {activeSection === "history" && <CapitalPlanner n225={n225} dji={dji} selectedCapital={capital} />}
        {activeSection === "demo" && (
          <PaperDemo
            signal={sigToday}
            basePieces={pieces}
            contractLabel={CONTRACTS[contract].label}
            contractSize={CONTRACTS[contract].size}
            initialCapital={capital}
          />
        )}
        {activeSection === "live" && <ProductionBlueprint />}
      </div>

      {/* モード + 設定パネル */}
      <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-end">
          {/* 共通設定 */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">共通設定</div>
            <div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              ここで変えた資本金・銘柄・基本枚数が、過去検証とPAPERデモの両方に反映される。
            </div>
          </div>

          {/* 設定 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Field label="開始日">
              <div className="space-y-1">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min="2010-01-01"
                  className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:border-[var(--blue)]"
                />
                <PeriodPresets current={startDate} onSelect={setStartDate} />
              </div>
            </Field>
            <Field label="銘柄">
              <select
                value={contract}
                onChange={(e) => handleContractChange(e.target.value as ContractKey)}
                className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:border-[var(--blue)]"
              >
                <option value="micro">マイクロ (1pt=10円)</option>
                <option value="mini">ミニ (1pt=100円)</option>
                <option value="large">ラージ (1pt=1,000円)</option>
              </select>
            </Field>
            <Field label="基本枚数">
              <input
                type="number" min={1} max={20} value={pieces}
                onChange={(e) => setPieces(Number(e.target.value))}
                className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:border-[var(--blue)]"
              />
            </Field>
            <Field label="投資金（初期）">
              <input
                type="number" min={10000} step={10000} value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:border-[var(--blue)]"
              />
            </Field>
            <Field label="🎯 目標額">
              <input
                type="number" min={10000} step={10000} value={goalCapital}
                onChange={(e) => setGoalCapital(Number(e.target.value))}
                className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:border-[var(--gold)]"
              />
            </Field>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="mb-6">
        <KpiCards sim={sim} />
      </div>

      {/* 🎯 目標達成シミュレーション */}
      <div className="mb-6">
        <GoalProgress
          trades={sim.trades}
          initialCapital={capital}
          goalCapital={goalCapital}
          startDate={startDate}
        />
      </div>

      {/* 警告 */}
      {isAbnormal && (
        <div className="mb-6 rounded-lg border border-[var(--gold)] bg-[var(--gold)]/10 px-4 py-3 text-sm text-[var(--gold)]">
          ⚠️ ROI {sim.roiPct >= 0 ? "+" : ""}{sim.roiPct.toFixed(0)}% は過去相場の暴騰結果。
          実取引はスリッページ・突発ニュースで結果が変わる。マイクロ1枚から段階的に。
        </div>
      )}

      {/* チャート2列 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <EquityChart trades={sim.trades} startDate={startDate} initialCapital={capital} />
        </div>
        <div>
          <MonthlyBar trades={sim.trades} />
        </div>
      </div>

      {/* 勝敗グラフ + 曜日別 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <WinLossChart trades={sim.trades} limit={30} />
        <WeekdayChart stats={weekdayStats} />
      </div>

      {/* 高度な分析指標 */}
      <div className="mb-6">
        <AdvancedMetrics metrics={metrics} />
      </div>

      {/* 年別パフォーマンス */}
      <div className="mb-6">
        <YearlyTable stats={yearlyStats} />
      </div>

      {/* 月別ヒートマップ */}
      <div className="mb-6">
        <MonthlyHeatmap monthly={monthlyStats} />
      </div>

      {/* 直近10取引 */}
      <div className="mb-6">
        <TradesTable trades={sim.trades} limit={10} />
      </div>

      {/* ロジック説明 */}
      <details className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          📖 戦略ロジック S1（順張り全営業日）
        </summary>
        <div className="mt-4 space-y-2 text-sm">
          {[
            "① 夕場 = 当日始値 − 前日終値（オーバーナイトギャップ）",
            "② NY = 前日NYダウ 終値 − 始値",
            "③ 方向 = sign(夕場) → +なら買い、−なら売り",
            "④ 枚数 = 夕場とNY同符号→2倍、逆符号→1倍",
            "⑤ 寄り建て・引け決済（デイトレ）",
            "⑥ 損益pt = 夕場符号 × 枚数 × 値幅",
            "⑦ 円換算 = pt × (マイクロ:10 / ミニ:100 / ラージ:1000)",
          ].map((s, i) => (
            <div key={i} className="rounded-md bg-[var(--bg-elevated)] border-l-2 border-[var(--blue)] px-3 py-2 font-mono text-xs">
              {s}
            </div>
          ))}
          <div className="mt-3 text-xs text-[var(--text-muted)]">
            ※ 逆張り不採用（バックテストで -87,062pt 悪化のため）<br />
            ※ バックテスト実績: 2020/1〜2026/5 で +138,978pt、7年連続プラス
          </div>
        </div>
      </details>

      {/* フッター */}
      <footer className="mt-8 pt-4 border-t border-[var(--border)] text-xs text-[var(--text-muted)] flex items-center justify-between">
        <div>
          データソース: Yahoo Finance ^N225 / ^DJI
        </div>
        <div>
          本番設計: Xserver VPS + Broker API（業者確定後に接続）
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
