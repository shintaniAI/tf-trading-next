// Yahoo Finance v8 chart API ラッパー
export type Bar = { date: string; open: number; high: number; low: number; close: number };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36";

export async function fetchYahoo(symbol: string, days = 2600): Promise<Bar[]> {
  const end = Math.floor(Date.now() / 1000) + 86400;
  const start = Math.floor(Date.now() / 1000) - days * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${start}&period2=${end}&interval=1d`;

  const r = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate: 600 }, // 10分キャッシュ
  });
  if (!r.ok) throw new Error(`Yahoo API ${r.status}`);
  const j = await r.json();
  const result = j.chart?.result?.[0];
  if (!result) throw new Error("No data");

  const ts: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const opens = q.open || [];
  const highs = q.high || [];
  const lows = q.low || [];
  const closes = q.close || [];

  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    const d = new Date(ts[i] * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    bars.push({
      date: dateStr,
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
    });
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}
