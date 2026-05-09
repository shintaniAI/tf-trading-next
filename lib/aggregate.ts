// 月別/年別集計
import type { Trade } from "./simulate";

export type YearStat = {
  year: number;
  trades: number;
  wins: number;
  losses: number;
  winrate: number;
  totalYen: number;
  totalPt: number;
  maxDDYen: number;
  bestMonth: { ym: string; yen: number } | null;
  worstMonth: { ym: string; yen: number } | null;
};

export type MonthStat = {
  ym: string;          // YYYY-MM
  year: number;
  month: number;       // 1-12
  trades: number;
  wins: number;
  losses: number;
  winrate: number;
  totalYen: number;
  totalPt: number;
};

export function aggregateMonthly(trades: Trade[]): MonthStat[] {
  const map = new Map<string, MonthStat>();
  for (const t of trades) {
    const ym = t.date.slice(0, 7);
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(5, 7));
    const cur = map.get(ym) || {
      ym, year, month, trades: 0, wins: 0, losses: 0,
      winrate: 0, totalYen: 0, totalPt: 0,
    };
    cur.trades++;
    cur.totalYen += t.pnlYen;
    cur.totalPt += t.pnlPt!;
    if (t.pnlPt! > 0) cur.wins++;
    if (t.pnlPt! < 0) cur.losses++;
    map.set(ym, cur);
  }
  for (const v of map.values()) {
    v.winrate = (v.wins + v.losses) > 0 ? v.wins / (v.wins + v.losses) : 0;
  }
  return Array.from(map.values()).sort((a, b) => a.ym.localeCompare(b.ym));
}

export function aggregateYearly(trades: Trade[], monthly: MonthStat[]): YearStat[] {
  const yearMap = new Map<number, YearStat>();
  // trade ベースで年集計
  for (const t of trades) {
    const year = Number(t.date.slice(0, 4));
    const cur = yearMap.get(year) || {
      year, trades: 0, wins: 0, losses: 0,
      winrate: 0, totalYen: 0, totalPt: 0,
      maxDDYen: 0, bestMonth: null, worstMonth: null,
    };
    cur.trades++;
    cur.totalYen += t.pnlYen;
    cur.totalPt += t.pnlPt!;
    if (t.pnlPt! > 0) cur.wins++;
    if (t.pnlPt! < 0) cur.losses++;
    yearMap.set(year, cur);
  }

  // 年内最大DD（円）
  const ddByYear = new Map<number, number>();
  let curYearPeak = -Infinity;
  let curYear = -1;
  for (const t of trades) {
    const year = Number(t.date.slice(0, 4));
    if (year !== curYear) {
      curYear = year;
      curYearPeak = -Infinity;
    }
    const cap = t.capital;
    if (cap > curYearPeak) curYearPeak = cap;
    const dd = cap - curYearPeak;
    const prev = ddByYear.get(year) ?? 0;
    if (dd < prev) ddByYear.set(year, dd);
  }

  // ベスト/ワースト月
  const monthByYear = new Map<number, MonthStat[]>();
  for (const m of monthly) {
    const arr = monthByYear.get(m.year) || [];
    arr.push(m);
    monthByYear.set(m.year, arr);
  }

  for (const [year, stat] of yearMap.entries()) {
    stat.winrate = (stat.wins + stat.losses) > 0 ? stat.wins / (stat.wins + stat.losses) : 0;
    stat.maxDDYen = ddByYear.get(year) ?? 0;
    const months = monthByYear.get(year) || [];
    if (months.length > 0) {
      const sorted = [...months].sort((a, b) => b.totalYen - a.totalYen);
      stat.bestMonth = { ym: sorted[0].ym, yen: sorted[0].totalYen };
      stat.worstMonth = { ym: sorted[sorted.length - 1].ym, yen: sorted[sorted.length - 1].totalYen };
    }
  }

  return Array.from(yearMap.values()).sort((a, b) => b.year - a.year);
}
