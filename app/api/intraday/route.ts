// 日経225 イントラデー（1分足）取得用 Route Handler
import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36";

export const dynamic = "force-dynamic"; // キャッシュなし、常にfresh

export async function GET() {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?interval=1m&range=1d";
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Yahoo intraday API ${r.status}`);
    const j = await r.json();
    const result = j.chart?.result?.[0];
    if (!result) throw new Error("No intraday data");

    const ts: number[] = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const closes = q.close || [];

    const points: { time: string; price: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] == null) continue;
      const d = new Date(ts[i] * 1000);
      points.push({
        time: d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }),
        price: closes[i],
      });
    }

    const meta = result.meta || {};
    return NextResponse.json({
      symbol: meta.symbol || "^N225",
      currency: meta.currency || "JPY",
      regularMarketPrice: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose,
      points,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
