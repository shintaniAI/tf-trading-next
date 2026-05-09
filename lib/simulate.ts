// バックテスト/シミュレーション
import type { Bar } from "./yahoo";
import { generateSignal, findPrevNYBar, type Signal } from "./strategy";

export type Trade = Signal & {
  pieces: number; // 実際の建玉枚数 = basePieces × piecesLogic
  pnlYen: number;
  cumPt: number;
  capital: number;
};

export type SimResult = {
  trades: Trade[];
  totalPt: number;
  totalYen: number;
  finalCapital: number;
  initialCapital: number;
  roiPct: number;
  wins: number;
  losses: number;
  winrate: number;
  maxDDpt: number;
  maxDDyen: number;
};

export function simulate(
  n225Bars: Bar[],
  djiBars: Bar[],
  startDate: string,
  contractSize: number, // 1pt当たり円
  basePieces: number,
  initialCapital: number
): SimResult {
  const trades: Trade[] = [];
  let cumPt = 0;
  let capital = initialCapital;

  for (let i = 1; i < n225Bars.length; i++) {
    const today = n225Bars[i];
    if (today.date < startDate) continue;
    if (today.close == null) continue;

    const prev = n225Bars[i - 1];
    const nyPrev = findPrevNYBar(djiBars, today.date);
    const sig = generateSignal(today, prev, nyPrev);
    if (!sig || sig.direction === "skip" || sig.pnlPt == null) continue;

    const pieces = basePieces * sig.piecesLogic;
    const pnlPt = sig.yubeSign * pieces * (sig.range ?? 0);
    const pnlYen = pnlPt * contractSize;
    cumPt += pnlPt;
    capital += pnlYen;

    trades.push({
      ...sig,
      pieces,
      pnlPt,
      pnlYen,
      cumPt: Math.round(cumPt * 10) / 10,
      capital: Math.round(capital),
    });
  }

  const totalPt = trades.reduce((s, t) => s + t.pnlPt!, 0);
  const totalYen = trades.reduce((s, t) => s + t.pnlYen, 0);
  const wins = trades.filter((t) => t.pnlPt! > 0).length;
  const losses = trades.filter((t) => t.pnlPt! < 0).length;

  // 最大DD
  let peak = 0;
  let maxDD = 0;
  let runCum = 0;
  for (const t of trades) {
    runCum += t.pnlPt!;
    if (runCum > peak) peak = runCum;
    const dd = runCum - peak;
    if (dd < maxDD) maxDD = dd;
  }

  return {
    trades,
    totalPt,
    totalYen,
    finalCapital: initialCapital + totalYen,
    initialCapital,
    roiPct: initialCapital > 0 ? (totalYen / initialCapital) * 100 : 0,
    wins,
    losses,
    winrate: (wins + losses) > 0 ? wins / (wins + losses) : 0,
    maxDDpt: maxDD,
    maxDDyen: maxDD * contractSize,
  };
}
