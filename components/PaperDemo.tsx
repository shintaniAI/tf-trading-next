"use client";

import { useEffect, useMemo, useState } from "react";
import type { Signal } from "@/lib/strategy";
import type { Bar } from "@/lib/yahoo";
import { simulate } from "@/lib/simulate";

type PaperPosition = {
  id: string;
  date: string;
  direction: "買い" | "売り";
  contractLabel: string;
  contractSize: number;
  pieces: number;
  entryPrice: number;
  entryAt: string;
  status: "open" | "closed";
  exitPrice?: number;
  exitAt?: string;
  pnlYen?: number;
};

type PaperState = {
  initialCapital: number;
  positions: PaperPosition[];
};

const STORAGE_KEY = "tf_paper_demo_v2";

function yen(v: number) {
  return `${Math.round(v).toLocaleString("ja-JP")}円`;
}

function nowLabel() {
  return new Date().toLocaleString("ja-JP", { hour12: false });
}

function calcPnl(position: PaperPosition, exitPrice: number) {
  const sign = position.direction === "買い" ? 1 : -1;
  return sign * (exitPrice - position.entryPrice) * position.pieces * position.contractSize;
}

export function PaperDemo({
  n225,
  dji,
  signal,
  basePieces,
  contractLabel,
  contractSize,
  initialCapital,
}: {
  n225: Bar[];
  dji: Bar[];
  signal: Signal | null;
  basePieces: number;
  contractLabel: string;
  contractSize: number;
  initialCapital: number;
}) {
  const [state, setState] = useState<PaperState>({ initialCapital, positions: [] });
  const [manualExitPrice, setManualExitPrice] = useState("");
  const [ddBudgetPct, setDdBudgetPct] = useState(50);
  const [safetyBuffer, setSafetyBuffer] = useState(1.5);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PaperState;
          setState({ ...parsed, initialCapital });
        } else {
          setState({ initialCapital, positions: [] });
        }
      } catch {
        setState({ initialCapital, positions: [] });
      }
      setHydrated(true);
    };
    const id = window.setTimeout(load, 0);
    return () => window.clearTimeout(id);
  }, [initialCapital]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state, hydrated]);

  const openPositions = state.positions.filter((p) => p.status === "open");
  const closedPositions = state.positions.filter((p) => p.status === "closed");
  const realizedPnl = closedPositions.reduce((sum, p) => sum + (p.pnlYen ?? 0), 0);
  const account = state.initialCapital + realizedPnl;

  const sizing = useMemo(() => {
    const simOne = simulate(n225, dji, "2020-01-01", contractSize, 1, 1_000_000);
    const maxDDPerBase = Math.abs(simOne.maxDDyen);
    const ddBudgetYen = Math.max(0, account) * (ddBudgetPct / 100);
    const limitBasePieces = maxDDPerBase > 0 ? Math.floor(Math.max(0, account) / maxDDPerBase) : 0;
    const recommendedBasePieces = maxDDPerBase > 0
      ? Math.floor(ddBudgetYen / (maxDDPerBase * safetyBuffer))
      : 0;
    const safeBasePieces = Math.max(0, Math.min(recommendedBasePieces, 20));
    return {
      maxDDPerBase,
      ddBudgetYen,
      endurancePieces: Math.max(0, limitBasePieces),
      recommendedBasePieces: safeBasePieces,
      recommendedDDYen: maxDDPerBase * safeBasePieces,
      manualBasePieces: basePieces,
    };
  }, [n225, dji, contractSize, account, ddBudgetPct, safetyBuffer, basePieces]);

  const autoBasePieces = sizing.recommendedBasePieces > 0 ? sizing.recommendedBasePieces : basePieces;
  const suggestedPieces = signal && signal.direction !== "skip" ? signal.piecesLogic * autoBasePieces : 0;

  const unrealizedPnl = (() => {
    if (!signal?.close) return 0;
    return openPositions.reduce((sum, p) => sum + calcPnl(p, signal.close!), 0);
  })();

  const createPaperEntry = () => {
    if (!signal || signal.direction === "skip" || suggestedPieces <= 0) return;
    const position: PaperPosition = {
      id: `${signal.date}-${Date.now()}`,
      date: signal.date,
      direction: signal.direction,
      contractLabel,
      contractSize,
      pieces: suggestedPieces,
      entryPrice: signal.open,
      entryAt: nowLabel(),
      status: "open",
    };
    setState((prev) => ({ ...prev, positions: [position, ...prev.positions] }));
  };

  const closePosition = (id: string) => {
    const parsedManual = Number(manualExitPrice);
    setState((prev) => ({
      ...prev,
      positions: prev.positions.map((p) => {
        if (p.id !== id || p.status !== "open") return p;
        const exitPrice = signal?.close ?? (Number.isFinite(parsedManual) && parsedManual > 0 ? parsedManual : p.entryPrice);
        return {
          ...p,
          status: "closed",
          exitPrice,
          exitAt: nowLabel(),
          pnlYen: calcPnl(p, exitPrice),
        };
      }),
    }));
  };

  const reset = () => {
    const ok = confirm("PAPERデモ履歴を全削除します。実資金には影響ありません。削除しますか？");
    if (!ok) return;
    setState({ initialCapital, positions: [] });
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            ② デモ運用：本番同様に仮で張って保存
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
            練習モード。実資金は使わず、今日のサインを「仮の取引」としてブラウザに保存する。ボタンを押しても証券口座には注文されない。
          </p>
        </div>
        <button
          onClick={reset}
          className="rounded-lg border border-[var(--red)]/40 px-3 py-2 text-xs font-semibold text-[var(--red)] hover:bg-[var(--red)]/10"
        >
          履歴リセット
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Metric label="デモ資金" value={yen(state.initialCapital)} color="blue" />
        <Metric label="確定損益" value={`${realizedPnl >= 0 ? "+" : ""}${yen(realizedPnl)}`} color={realizedPnl >= 0 ? "green" : "red"} />
        <Metric label="評価損益" value={`${unrealizedPnl >= 0 ? "+" : ""}${yen(unrealizedPnl)}`} color={unrealizedPnl >= 0 ? "green" : "red"} />
        <Metric label="デモ残高" value={yen(account)} color="gold" />
      </div>

      <div className="mb-4 rounded-lg border border-[var(--gold)]/35 bg-[var(--gold)]/5 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]">資本金から自動で枚数計算</div>
            <div className="mt-1 text-sm font-bold text-[var(--text)]">
              推奨: 基本 {sizing.recommendedBasePieces}枚 / 今日 {suggestedPieces}枚
              <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">（{contractLabel}）</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              ロジックはこれで合ってる: 「1枚の過去最大DD × 枚数」が軍資金を越えなければ、その過去最大DDには耐えられる。
              ただし全資金でギリギリ耐えるのは危ないので、ここでは「使ってよいDD予算」と「安全係数」を入れて少し保守的に出す。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs md:w-[360px]">
            <label className="flex flex-col gap-1 text-[var(--text-muted)]">
              DD予算（資金の何%まで）
              <input
                type="number"
                min={10}
                max={100}
                step={5}
                value={ddBudgetPct}
                onChange={(e) => setDdBudgetPct(Number(e.target.value))}
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text)] tnum"
              />
            </label>
            <label className="flex flex-col gap-1 text-[var(--text-muted)]">
              安全係数
              <input
                type="number"
                min={1}
                max={3}
                step={0.1}
                value={safetyBuffer}
                onChange={(e) => setSafetyBuffer(Number(e.target.value))}
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text)] tnum"
              />
            </label>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="1枚の過去最大DD" value={`-${yen(sizing.maxDDPerBase)}`} color="red" />
          <Metric label="DD予算" value={yen(sizing.ddBudgetYen)} color="blue" />
          <Metric label="耐久枚数" value={`${sizing.endurancePieces}枚`} color="gold" />
          <Metric label="推奨DD想定" value={`-${yen(sizing.recommendedDDYen)}`} color="red" />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          計算式: 推奨基本枚数 = floor(デモ残高 × DD予算% ÷ 1枚の過去最大DD ÷ 安全係数)。
          耐久枚数 = floor(軍資金 ÷ 1枚の過去最大DD)。本番ではさらに証拠金・手数料・スリッページで小さくする。
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-[var(--blue)]/30 bg-[var(--blue)]/5 p-3 text-xs leading-relaxed text-[var(--text-muted)]">
        使い方: ① 資本金から推奨枚数を見る → ② 今日の仮エントリー候補を見る → ③「PAPER建玉を保存」を押す → ④ 引け後に「仮決済」で損益を見る。
        ここで1〜2週間動きを見て、買い/売り・枚数・損益の感覚を掴んでから本番に進む。
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">今日の仮エントリー候補（実注文なし）</div>
            {signal && signal.direction !== "skip" ? (
              <div className="mt-1 text-2xl font-extrabold">
                <span className={signal.direction === "買い" ? "text-[var(--green)]" : "text-[var(--red)]"}>
                  {signal.direction} {suggestedPieces}枚
                </span>
                <span className="ml-3 text-sm font-normal text-[var(--text-muted)]">
                  {contractLabel} / 推奨基本{autoBasePieces}枚 × 今日の係数{signal.piecesLogic} / 寄り {signal.open.toLocaleString("ja-JP")}
                </span>
              </div>
            ) : (
              <div className="mt-1 text-lg font-bold text-[var(--text-muted)]">今日はノートレード</div>
            )}
          </div>
          <button
            onClick={createPaperEntry}
            disabled={!signal || signal.direction === "skip" || suggestedPieces <= 0}
            className="rounded-lg bg-[var(--blue)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--blue)]/80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            実注文せずPAPER保存
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
        手動決済価格
        <input
          value={manualExitPrice}
          onChange={(e) => setManualExitPrice(e.target.value)}
          placeholder={signal?.close ? `今日の引け ${signal.close}` : "例: 38500"}
          className="w-40 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm text-[var(--text)] tnum"
        />
        <span>未入力なら取得済み引け値、なければ建値で決済。</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            <tr>
              <th className="py-2 text-left">状態</th>
              <th className="py-2 text-left">日付</th>
              <th className="py-2 text-left">方向</th>
              <th className="py-2 text-right">枚数</th>
              <th className="py-2 text-right">建値</th>
              <th className="py-2 text-right">決済</th>
              <th className="py-2 text-right">損益</th>
              <th className="py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {state.positions.length === 0 ? (
              <tr><td colSpan={8} className="py-6 text-center text-[var(--text-muted)]">まだPAPER建玉なし</td></tr>
            ) : state.positions.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)]/60 last:border-0">
                <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.status === "open" ? "bg-[var(--gold)]/15 text-[var(--gold)]" : "bg-[var(--green)]/15 text-[var(--green)]"}`}>{p.status === "open" ? "OPEN" : "CLOSED"}</span></td>
                <td className="py-2 tnum">{p.date}</td>
                <td className={`py-2 font-semibold ${p.direction === "買い" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{p.direction} / {p.contractLabel}</td>
                <td className="py-2 text-right tnum">{p.pieces}</td>
                <td className="py-2 text-right tnum">{p.entryPrice.toLocaleString("ja-JP")}</td>
                <td className="py-2 text-right tnum">{p.exitPrice ? p.exitPrice.toLocaleString("ja-JP") : "—"}</td>
                <td className={`py-2 text-right tnum ${(p.pnlYen ?? 0) >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{p.pnlYen == null ? "—" : `${p.pnlYen >= 0 ? "+" : ""}${yen(p.pnlYen)}`}</td>
                <td className="py-2 text-right">
                  {p.status === "open" ? (
                    <button onClick={() => closePosition(p.id)} className="rounded-md bg-[var(--green)] px-2 py-1 text-xs font-bold text-white hover:bg-[var(--green)]/80">仮決済</button>
                  ) : <span className="text-[var(--text-muted)] text-xs">完了</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: "green" | "red" | "blue" | "gold" }) {
  const cls = color === "green" ? "text-[var(--green)]" : color === "red" ? "text-[var(--red)]" : color === "blue" ? "text-[var(--blue)]" : "text-[var(--gold)]";
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
      <div className={`mt-1 text-xl font-bold tnum ${cls}`}>{value}</div>
    </div>
  );
}
