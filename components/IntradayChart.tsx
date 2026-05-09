"use client";
import { useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

type Point = { time: string; price: number };
type IntradayData = {
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  points: Point[];
  error?: string;
};

export function IntradayChart() {
  const [data, setData] = useState<IntradayData | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/intraday", { cache: "no-store" });
      const j = await r.json();
      if (!j.error) {
        setData(j);
        setUpdatedAt(new Date());
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // 30秒ごと更新
    return () => clearInterval(t);
  }, []);

  if (!data || data.points.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          📡 日経225 リアルタイム
        </h3>
        <div className="h-[300px] flex items-center justify-center text-[var(--text-muted)] text-sm">
          {data?.error ? `データ取得失敗: ${data.error}` : "ロード中..."}
        </div>
      </div>
    );
  }

  const current = data.regularMarketPrice ?? data.points[data.points.length - 1]?.price ?? 0;
  const prev = data.previousClose ?? data.points[0]?.price ?? 0;
  const change = current - prev;
  const changePct = prev > 0 ? (change / prev) * 100 : 0;
  const isUp = change >= 0;

  const minPrice = Math.min(...data.points.map((p) => p.price));
  const maxPrice = Math.max(...data.points.map((p) => p.price));
  const padding = (maxPrice - minPrice) * 0.1;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          📡 日経225 リアルタイム
        </h3>
        <div className="text-xs text-[var(--text-muted)] tnum">
          {updatedAt ? updatedAt.toLocaleTimeString("ja-JP", { hour12: false }) : "—"} 更新 (30秒ごと)
        </div>
      </div>

      <div className="flex items-baseline gap-3 mb-3">
        <div className={`text-3xl font-bold tnum ${isUp ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {current.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}
        </div>
        <div className={`text-sm font-semibold tnum ${isUp ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(1)} ({isUp ? "+" : ""}{changePct.toFixed(2)}%)
        </div>
        <div className="text-xs text-[var(--text-muted)] tnum">
          前日終値 {prev.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}
        </div>
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="intradayGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.4} />
                <stop offset="100%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#232b38" />
            <XAxis dataKey="time" stroke="#8b949e" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(data.points.length / 8))} />
            <YAxis
              stroke="#8b949e"
              tick={{ fontSize: 10 }}
              domain={[minPrice - padding, maxPrice + padding]}
              tickFormatter={(v) => v.toLocaleString()}
              width={70}
            />
            <Tooltip
              contentStyle={{ background: "#131820", border: "1px solid #232b38", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#8b949e" }}
              formatter={(v) => [`${Number(v).toLocaleString()}`, "日経225"]}
            />
            <ReferenceLine y={prev} stroke="#8b949e" strokeDasharray="4 4" />
            <Area
              type="monotone" dataKey="price"
              stroke={isUp ? "#10b981" : "#ef4444"}
              strokeWidth={2}
              fill="url(#intradayGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
