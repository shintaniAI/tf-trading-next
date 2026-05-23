"use client";

import { useEffect, useState } from "react";
import type { Signal } from "@/lib/strategy";

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
  signal,
  basePieces,
  contractLabel,
  contractSize,
  initialCapital,
}: {
  signal: Signal | null;
  basePieces: number;
  contractLabel: string;
  contractSize: number;
  initialCapital: number;
}) {
  const [state, setState] = useState<PaperState>({ initialCapital, positions: [] });
  const [manualExitPrice, setManualExitPrice] = useState("");
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
  const suggestedPieces = signal && signal.direction !== "skip" ? signal.piecesLogic * basePieces : 0;

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
            実資金は使わず、今日のシグナルをPAPER建玉としてブラウザに保存。何を何枚で仮エントリーしたか、あとから経過確認できる。
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

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">今日の仮エントリー候補</div>
            {signal && signal.direction !== "skip" ? (
              <div className="mt-1 text-2xl font-extrabold">
                <span className={signal.direction === "買い" ? "text-[var(--green)]" : "text-[var(--red)]"}>
                  {signal.direction} {suggestedPieces}枚
                </span>
                <span className="ml-3 text-sm font-normal text-[var(--text-muted)]">
                  {contractLabel} / 寄り {signal.open.toLocaleString("ja-JP")}
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
            PAPER建玉を保存
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
