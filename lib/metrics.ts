// 高度な分析指標
import type { Trade } from "./simulate";

export type AdvancedMetrics = {
  sharpeRatio: number;        // シャープレシオ（年率）
  sortinoRatio: number;       // ソルティノ（下方リスクのみ）
  calmarRatio: number;        // リターン/最大DD
  profitFactor: number;       // 総勝ち / 総負け
  expectedValue: number;      // 期待値（円/取引）
  riskRewardRatio: number;    // 平均勝ち / 平均負け
  cagrPct: number;            // 年複利成長率
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  maxDDDays: number;          // 最大DD継続日数
  recoveryDays: number;       // DD回復まで日数
  underwaterDays: number;     // アンダーウォーター総日数
  totalDays: number;
  tradesPerMonth: number;
  volatilityPct: number;      // 日次リターンの標準偏差(年率)
};

export function computeMetrics(
  trades: Trade[],
  initialCapital: number,
  contractSize: number
): AdvancedMetrics {
  if (trades.length === 0) {
    return {
      sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, profitFactor: 0,
      expectedValue: 0, riskRewardRatio: 0, cagrPct: 0,
      avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0,
      maxDDDays: 0, recoveryDays: 0, underwaterDays: 0, totalDays: 0,
      tradesPerMonth: 0, volatilityPct: 0,
    };
  }

  const wins = trades.filter((t) => t.pnlYen > 0);
  const losses = trades.filter((t) => t.pnlYen < 0);
  const totalWin = wins.reduce((s, t) => s + t.pnlYen, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnlYen, 0));

  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? 99 : 0);
  const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
  const winrate = (wins.length + losses.length) > 0 ? wins.length / (wins.length + losses.length) : 0;
  const expectedValue = winrate * avgWin - (1 - winrate) * avgLoss;
  const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

  const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.pnlYen)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnlYen)) : 0;

  // 日次リターン率
  let prevCap = initialCapital;
  const dailyReturns: number[] = [];
  for (const t of trades) {
    const r = prevCap > 0 ? (t.capital - prevCap) / prevCap : 0;
    dailyReturns.push(r);
    prevCap = t.capital;
  }
  const meanReturn = dailyReturns.reduce((s, x) => s + x, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, x) => s + (x - meanReturn) ** 2, 0) / dailyReturns.length;
  const stdReturn = Math.sqrt(variance);
  // 年率化（年250営業日と仮定）
  const sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(250) : 0;
  // ソルティノ: 下方偏差のみ
  const downReturns = dailyReturns.filter((r) => r < 0);
  const downStd = downReturns.length > 0
    ? Math.sqrt(downReturns.reduce((s, r) => s + r * r, 0) / downReturns.length)
    : 0;
  const sortinoRatio = downStd > 0 ? (meanReturn / downStd) * Math.sqrt(250) : 0;
  const volatilityPct = stdReturn * Math.sqrt(250) * 100;

  // 最大DD継続日数 + 回復日数
  let peak = initialCapital;
  let inDD = false;
  let curDDLen = 0;
  let maxDDLen = 0;
  let totalUnderwater = 0;
  let lastDDStart = 0;
  let recoveryDays = 0;
  let firstMaxDDFound = false;

  for (let i = 0; i < trades.length; i++) {
    const cap = trades[i].capital;
    if (cap >= peak) {
      if (inDD && !firstMaxDDFound) {
        recoveryDays = i - lastDDStart;
        if (curDDLen >= maxDDLen) firstMaxDDFound = true;
      }
      peak = cap;
      inDD = false;
      curDDLen = 0;
    } else {
      if (!inDD) {
        inDD = true;
        lastDDStart = i;
      }
      curDDLen++;
      totalUnderwater++;
      if (curDDLen > maxDDLen) maxDDLen = curDDLen;
    }
  }

  // CAGR
  const totalDays = trades.length;
  const finalCap = trades[trades.length - 1].capital;
  const yearsApprox = totalDays / 250;
  const cagr = yearsApprox > 0 && initialCapital > 0
    ? Math.pow(finalCap / initialCapital, 1 / yearsApprox) - 1
    : 0;

  // 最大DD（円）
  let maxDDYen = 0;
  let p = initialCapital;
  for (const t of trades) {
    if (t.capital > p) p = t.capital;
    const dd = t.capital - p;
    if (dd < maxDDYen) maxDDYen = dd;
  }
  const totalReturnPct = (finalCap - initialCapital) / initialCapital;
  const calmarRatio = maxDDYen < 0 ? totalReturnPct / Math.abs(maxDDYen / initialCapital) : 0;

  // 月平均取引数
  const startD = new Date(trades[0].date);
  const endD = new Date(trades[trades.length - 1].date);
  const months = Math.max(1, (endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24 * 30));
  const tradesPerMonth = trades.length / months;

  return {
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    profitFactor,
    expectedValue,
    riskRewardRatio,
    cagrPct: cagr * 100,
    avgWin,
    avgLoss,
    largestWin,
    largestLoss,
    maxDDDays: maxDDLen,
    recoveryDays,
    underwaterDays: totalUnderwater,
    totalDays,
    tradesPerMonth,
    volatilityPct,
  };
}

export type WeekdayStats = {
  weekday: string;
  trades: number;
  wins: number;
  losses: number;
  winrate: number;
  totalYen: number;
};

export function computeWeekdayStats(trades: Trade[]): WeekdayStats[] {
  const JP_WD = ["日", "月", "火", "水", "木", "金", "土"];
  const map = new Map<string, WeekdayStats>();
  for (const wd of JP_WD) {
    map.set(wd, { weekday: wd, trades: 0, wins: 0, losses: 0, winrate: 0, totalYen: 0 });
  }
  for (const t of trades) {
    const d = new Date(t.date);
    const wd = JP_WD[d.getUTCDay()];
    const cur = map.get(wd)!;
    cur.trades++;
    cur.totalYen += t.pnlYen;
    if (t.pnlYen > 0) cur.wins++;
    if (t.pnlYen < 0) cur.losses++;
  }
  for (const v of map.values()) {
    v.winrate = (v.wins + v.losses) > 0 ? v.wins / (v.wins + v.losses) : 0;
  }
  // 月〜金のみ返す
  return ["月", "火", "水", "木", "金"].map((wd) => map.get(wd)!);
}
