// TF戦略: 順張り全営業日トレード
import type { Bar } from "./yahoo";

export type Signal = {
  date: string;
  weekday: string;
  yube: number; // 夕場上下
  yubeSign: 1 | -1 | 0;
  nyDiff: number;
  nySign: 1 | -1 | 0;
  direction: "買い" | "売り" | "skip";
  piecesLogic: 1 | 2;
  open: number;
  close: number | null;
  range: number | null;
  pnlPt: number | null; // (yubeSign × piecesLogic × range)、ベース1枚で計算
};

const JP_WD = ["日", "月", "火", "水", "木", "金", "土"];

export function generateSignal(target: Bar, prev: Bar, nyPrev: Bar | null): Signal | null {
  const yube = target.open - prev.close;
  const yubeSign = yube > 0 ? 1 : yube < 0 ? -1 : 0;
  const nyDiff = nyPrev ? nyPrev.close - nyPrev.open : 0;
  const nySign = nyDiff > 0 ? 1 : nyDiff < 0 ? -1 : 0;
  const direction = yubeSign === 0 ? "skip" : yubeSign > 0 ? "買い" : "売り";
  const piecesLogic = (yubeSign + nySign) === 0 ? 1 : 2;
  const range = target.close != null ? target.close - target.open : null;
  const pnlPt = range != null && yubeSign !== 0 ? yubeSign * piecesLogic * range : null;

  const d = new Date(target.date);
  const wd = JP_WD[d.getUTCDay()];

  return {
    date: target.date,
    weekday: wd,
    yube,
    yubeSign: yubeSign as 1 | -1 | 0,
    nyDiff,
    nySign: nySign as 1 | -1 | 0,
    direction,
    piecesLogic: piecesLogic as 1 | 2,
    open: target.open,
    close: target.close,
    range,
    pnlPt,
  };
}

export function findPrevNYBar(djiBars: Bar[], targetDate: string): Bar | null {
  // targetDate より前の最後のNY営業日
  let prev: Bar | null = null;
  for (const b of djiBars) {
    if (b.date < targetDate) prev = b;
    else break;
  }
  return prev;
}
