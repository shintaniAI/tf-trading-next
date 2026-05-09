"use client";
import { useEffect, useState, useRef } from "react";
import type { Signal } from "@/lib/strategy";

type ScheduledTime = { hour: number; minute: number };
type Mode = "PAPER" | "LIVE_VERIFICATION" | "LIVE_PRODUCTION";

const SCHED_KEY = "tf_scheduler_v1";

type SchedSettings = {
  enabled: boolean;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  runOnWeekends: boolean;
};

const DEFAULT_SCHED: SchedSettings = {
  enabled: false,
  openHour: 8,
  openMinute: 50,
  closeHour: 15,
  closeMinute: 25,
  runOnWeekends: false,
};

type LogEntry = {
  ts: string;
  type: "open" | "close" | "skip" | "error";
  message: string;
};

export function Scheduler({
  signal,
  basePieces,
  mode,
  password,
  symbol,
  emergencyStop,
  isAuthorized,
}: {
  signal: Signal | null;
  basePieces: number;
  mode: Mode;
  password: string;
  symbol: string;
  emergencyStop: boolean;
  isAuthorized: boolean; // 本番モード時の接続確認済みフラグ
}) {
  const [s, setS] = useState<SchedSettings>(DEFAULT_SCHED);
  const [hydrated, setHydrated] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const lastFiredRef = useRef<{ open?: string; close?: string }>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCHED_KEY);
      if (raw) setS({ ...DEFAULT_SCHED, ...JSON.parse(raw) });
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SCHED_KEY, JSON.stringify(s));
    } catch {}
  }, [s, hydrated]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const addLog = (type: LogEntry["type"], message: string) => {
    setLogs((prev) => [{ ts: new Date().toLocaleTimeString("ja-JP", { hour12: false }), type, message }, ...prev].slice(0, 30));
  };

  const fire = async (kind: "open" | "close") => {
    if (!signal || signal.direction === "skip") {
      addLog("skip", `${kind === "open" ? "寄成" : "引成"}: シグナルなしのためスキップ`);
      return;
    }
    if (emergencyStop) {
      addLog("skip", "緊急停止中のため発注しません");
      return;
    }
    if (mode !== "PAPER" && !isAuthorized) {
      addLog("error", "本番接続未確認のため発注中止");
      return;
    }
    if (mode !== "PAPER" && !symbol) {
      addLog("error", "銘柄コード未設定");
      return;
    }
    const pieces = signal.piecesLogic * basePieces;
    const sideRaw: "1" | "2" = signal.direction === "買い" ? "2" : "1";
    const side: "1" | "2" = kind === "close" ? (sideRaw === "1" ? "2" : "1") : sideRaw;
    const tradeType = kind === "open" ? 1 : 2;
    const frontOrderType = kind === "open" ? 120 : 130;
    try {
      const r = await fetch("/api/kabu/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password, mode,
          verification: mode === "LIVE_VERIFICATION",
          symbol, side, qty: pieces,
          tradeType, frontOrderType, price: 0,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        addLog(kind, `${kind === "open" ? "寄成" : "引成"} ${signal.direction}${pieces}枚 → ${j.simulated ? "PAPER" : "実発注"} 成功`);
      } else {
        addLog("error", `${kind === "open" ? "寄成" : "引成"} 失敗: ${j.error || JSON.stringify(j)}`);
      }
    } catch (e) {
      addLog("error", `${kind === "open" ? "寄成" : "引成"} 例外: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 時刻監視
  useEffect(() => {
    if (!s.enabled || !now) return;
    const dow = now.getDay(); // 0=日, 6=土
    if (!s.runOnWeekends && (dow === 0 || dow === 6)) return;
    const dateKey = now.toISOString().slice(0, 10);
    const h = now.getHours();
    const m = now.getMinutes();
    // 寄成 トリガー（指定時刻ぴったり、その分の中で1回だけ）
    if (h === s.openHour && m === s.openMinute && lastFiredRef.current.open !== dateKey) {
      lastFiredRef.current.open = dateKey;
      void fire("open");
    }
    // 引成 トリガー
    if (h === s.closeHour && m === s.closeMinute && lastFiredRef.current.close !== dateKey) {
      lastFiredRef.current.close = dateKey;
      void fire("close");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, s.enabled, s.openHour, s.openMinute, s.closeHour, s.closeMinute, s.runOnWeekends]);

  const fmtT = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          ⏰ 時刻スケジューラ（承認なし自動発注）
        </h3>
        <button
          onClick={() => setS({ ...s, enabled: !s.enabled })}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
            s.enabled
              ? "bg-[var(--green)] text-white shadow-lg shadow-[var(--green)]/20"
              : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]"
          }`}
        >
          {s.enabled ? "● 自動発注 ON" : "○ 自動発注 OFF"}
        </button>
      </div>

      {/* 注意書き */}
      <div className="mb-4 p-3 rounded-lg bg-[var(--gold)]/10 border border-[var(--gold)]/30 text-[11px] text-[var(--gold)]">
        ⚠️ ON にするとブラウザがこのページを開いてる間、設定時刻に<b>承認なしで</b>自動発注されます。
        ブラウザを閉じると止まります。
        本番モード時は事前に「接続テスト」で✓を取ってください。
      </div>

      {/* 設定 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)]">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">📈 寄成 新規</div>
          <div className="flex gap-1">
            <input
              type="number" min={0} max={23} value={s.openHour}
              onChange={(e) => setS({ ...s, openHour: Number(e.target.value) })}
              className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm tnum text-center"
            />
            <span className="text-[var(--text-muted)] self-center">:</span>
            <input
              type="number" min={0} max={59} value={s.openMinute}
              onChange={(e) => setS({ ...s, openMinute: Number(e.target.value) })}
              className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm tnum text-center"
            />
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">推奨: 08:50（寄り10分前）</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)]">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">📉 引成 決済</div>
          <div className="flex gap-1">
            <input
              type="number" min={0} max={23} value={s.closeHour}
              onChange={(e) => setS({ ...s, closeHour: Number(e.target.value) })}
              className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm tnum text-center"
            />
            <span className="text-[var(--text-muted)] self-center">:</span>
            <input
              type="number" min={0} max={59} value={s.closeMinute}
              onChange={(e) => setS({ ...s, closeMinute: Number(e.target.value) })}
              className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm tnum text-center"
            />
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">推奨: 15:25（引け5分前）</div>
        </div>
      </div>

      {/* 状態表示 */}
      {s.enabled && (
        <div className="mb-3 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--green)]/30">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
            <span>稼働中: 今日 <span className="text-[var(--text)] font-semibold">{fmtT(s.openHour, s.openMinute)}</span> 寄成 →
              <span className="text-[var(--text)] font-semibold ml-1">{fmtT(s.closeHour, s.closeMinute)}</span> 引成</span>
          </div>
          {now && (
            <div className="mt-1 text-[10px] text-[var(--text-muted)] tnum">
              現在 {now.toLocaleTimeString("ja-JP", { hour12: false })}
            </div>
          )}
        </div>
      )}

      {/* 実行ログ */}
      <details>
        <summary className="text-xs text-[var(--text-muted)] cursor-pointer">📋 実行ログ ({logs.length})</summary>
        <div className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs">
          {logs.length === 0 ? (
            <div className="text-[var(--text-muted)]">まだログなし</div>
          ) : logs.map((l, i) => (
            <div key={i} className={`px-2 py-1 rounded font-mono ${
              l.type === "error" ? "bg-[var(--red)]/10 text-[var(--red)]" :
              l.type === "skip" ? "bg-[var(--text-muted)]/10 text-[var(--text-muted)]" :
              "bg-[var(--green)]/10 text-[var(--green)]"
            }`}>
              [{l.ts}] {l.message}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
