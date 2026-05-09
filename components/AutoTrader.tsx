"use client";
import { useState, useEffect } from "react";
import type { Signal } from "@/lib/strategy";

type ConnectionStatus = "idle" | "connecting" | "ok" | "error";
type TradeMode = "PAPER" | "LIVE_VERIFICATION" | "LIVE_PRODUCTION";

const SETTINGS_KEY = "tf_kabu_settings_v1";

type Settings = {
  password: string;
  symbol: string;        // 例: 167060019 (日経225ラージ)
  autoTradeEnabled: boolean;
  emergencyStop: boolean;
  mode: TradeMode;
  maxDailyLossYen: number;
  maxConsecutiveLosses: number;
};

const DEFAULT: Settings = {
  password: "",
  symbol: "",
  autoTradeEnabled: false,
  emergencyStop: false,
  mode: "PAPER",
  maxDailyLossYen: 30000,
  maxConsecutiveLosses: 3,
};

type ConnResp = { ok: boolean; tokenPrefix?: string; mode?: string; error?: string };
type OrderResp = { ok: boolean; mode?: string; simulated?: boolean; message?: string; result?: unknown; error?: string };

export function AutoTrader({ signal, basePieces }: { signal: Signal | null; basePieces: number }) {
  const [s, setS] = useState<Settings>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const [conn, setConn] = useState<ConnectionStatus>("idle");
  const [connMsg, setConnMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<OrderResp | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // パスワードはlocalStorageに保存しない（セキュリティ）
        setS({ ...DEFAULT, ...parsed, password: "" });
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const { password: _pw, ...persist } = s;
    void _pw;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(persist));
    } catch {}
  }, [s, hydrated]);

  const isLive = s.mode !== "PAPER";

  const testConnection = async () => {
    if (!isLive) {
      setConn("ok");
      setConnMsg("PAPER モード（接続不要）");
      return;
    }
    setConn("connecting");
    setConnMsg("接続テスト中...");
    try {
      const r = await fetch("/api/kabu/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: s.password,
          verification: s.mode === "LIVE_VERIFICATION",
        }),
      });
      const j: ConnResp = await r.json();
      if (j.ok) {
        setConn("ok");
        setConnMsg(`✓ 接続OK (${j.mode}) Token: ${j.tokenPrefix}`);
      } else {
        setConn("error");
        setConnMsg(j.error || "接続失敗");
      }
    } catch (e) {
      setConn("error");
      setConnMsg(e instanceof Error ? e.message : "接続失敗");
    }
  };

  const sendOrder = async (frontOrderType: 120 | 130) => {
    if (!signal || signal.direction === "skip") {
      alert("シグナルなし - 発注できません");
      return;
    }
    if (s.emergencyStop) {
      alert("緊急停止中 - 解除してから発注してください");
      return;
    }
    if (isLive && !s.symbol) {
      alert("銘柄コード未設定。先物の銘柄コードを設定してください");
      return;
    }
    const action = frontOrderType === 120 ? "寄成 新規" : "引成 決済";
    const direction = signal.direction === "買い" ? "買い" : "売り";
    const pieces = signal.piecesLogic * basePieces;
    const modeLabel = s.mode === "PAPER" ? "PAPER（仮想）" :
                      s.mode === "LIVE_VERIFICATION" ? "検証モード（ダミー）" :
                      "🔴 本番（実マネー）";
    const ok = confirm(
      `${action}\n${direction} ${pieces}枚\nモード: ${modeLabel}\n\n発注しますか？`
    );
    if (!ok) return;

    setBusy(true);
    try {
      const tradeType = frontOrderType === 120 ? 1 : 2; // 1=新規, 2=返済
      const side: "1" | "2" = signal.direction === "買い" ? "2" : "1"; // 1=売 2=買
      // 引成決済時は反対サイド
      const orderSide: "1" | "2" =
        frontOrderType === 130 ? (side === "1" ? "2" : "1") : side;
      const r = await fetch("/api/kabu/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: s.password,
          verification: s.mode === "LIVE_VERIFICATION",
          mode: s.mode,
          symbol: s.symbol,
          side: orderSide,
          qty: pieces,
          tradeType,
          frontOrderType,
          price: 0,
        }),
      });
      const j: OrderResp = await r.json();
      setLastResult(j);
    } finally {
      setBusy(false);
    }
  };

  const dotColor = conn === "ok" ? "bg-[var(--green)]" :
                   conn === "error" ? "bg-[var(--red)]" :
                   conn === "connecting" ? "bg-[var(--gold)] animate-pulse" :
                   "bg-[var(--text-muted)]";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          🤖 自動売買
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-[var(--text-muted)] tnum">{connMsg || "未接続"}</span>
        </div>
      </div>

      {/* モード選択 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {([
          { v: "PAPER", label: "🧪 PAPER", desc: "仮想（無料・安全）" },
          { v: "LIVE_VERIFICATION", label: "🔬 検証", desc: "kabuS検証モード" },
          { v: "LIVE_PRODUCTION", label: "🔴 本番", desc: "リアルマネー" },
        ] as const).map((m) => (
          <button
            key={m.v}
            onClick={() => setS({ ...s, mode: m.v })}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
              s.mode === m.v
                ? m.v === "LIVE_PRODUCTION"
                  ? "bg-[var(--red)] text-white"
                  : m.v === "LIVE_VERIFICATION"
                  ? "bg-[var(--gold)] text-black"
                  : "bg-[var(--blue)] text-white"
                : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--border)]"
            }`}
          >
            <div>{m.label}</div>
            <div className="text-[9px] opacity-80 mt-0.5">{m.desc}</div>
          </button>
        ))}
      </div>

      {/* 接続設定（LIVE時のみ） */}
      {isLive && (
        <div className="space-y-3 mb-4 p-3 rounded-lg bg-[var(--bg-elevated)]">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
              kabu API パスワード
            </label>
            <input
              type="password"
              value={s.password}
              onChange={(e) => setS({ ...s, password: e.target.value })}
              placeholder="kabuステーション > 設定 > APIタブ で発行"
              className="mt-1 w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--blue)]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              ※ ブラウザに保存されません。リロードで再入力が必要
            </p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
              銘柄コード（先物）
            </label>
            <input
              type="text"
              value={s.symbol}
              onChange={(e) => setS({ ...s, symbol: e.target.value })}
              placeholder="例: 日経225マイクロ XX限"
              className="mt-1 w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--blue)]"
            />
          </div>
          <button
            onClick={testConnection}
            disabled={!s.password}
            className="w-full bg-[var(--blue)] hover:bg-[var(--blue)]/80 disabled:opacity-30 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-semibold transition"
          >
            🔌 接続テスト
          </button>
        </div>
      )}

      {/* 発注ボタン */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => sendOrder(120)}
          disabled={busy || !signal || signal.direction === "skip" || s.emergencyStop || (isLive && conn !== "ok")}
          className="bg-[var(--green)] hover:bg-[var(--green)]/80 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3 rounded-lg text-sm font-bold transition"
        >
          {busy ? "..." : "📈 寄成 新規"}
        </button>
        <button
          onClick={() => sendOrder(130)}
          disabled={busy || !signal || signal.direction === "skip" || s.emergencyStop || (isLive && conn !== "ok")}
          className="bg-[var(--blue)] hover:bg-[var(--blue)]/80 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3 rounded-lg text-sm font-bold transition"
        >
          {busy ? "..." : "📉 引成 決済"}
        </button>
      </div>

      {/* 緊急停止 */}
      <button
        onClick={() => setS({ ...s, emergencyStop: !s.emergencyStop })}
        className={`w-full py-2.5 rounded-lg text-sm font-bold transition ${
          s.emergencyStop
            ? "bg-[var(--red)] text-white"
            : "border border-[var(--red)] text-[var(--red)] hover:bg-[var(--red)]/10"
        }`}
      >
        {s.emergencyStop ? "🛑 緊急停止中（クリックで解除）" : "🛑 緊急停止する"}
      </button>

      {/* リスクルール表示 */}
      <details className="mt-4">
        <summary className="text-xs text-[var(--text-muted)] cursor-pointer">⚙️ リスクルール</summary>
        <div className="mt-2 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <label className="text-[var(--text-muted)] w-32">1日最大損失</label>
            <input
              type="number"
              value={s.maxDailyLossYen}
              onChange={(e) => setS({ ...s, maxDailyLossYen: Number(e.target.value) })}
              className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 tnum"
            />
            <span className="text-[var(--text-muted)]">円</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[var(--text-muted)] w-32">連敗ストッパー</label>
            <input
              type="number" min={1} max={10}
              value={s.maxConsecutiveLosses}
              onChange={(e) => setS({ ...s, maxConsecutiveLosses: Number(e.target.value) })}
              className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 tnum"
            />
            <span className="text-[var(--text-muted)]">連敗で休止</span>
          </div>
        </div>
      </details>

      {/* 最終結果 */}
      {lastResult && (
        <div className={`mt-4 p-3 rounded-lg text-xs ${lastResult.ok ? "bg-[var(--green)]/10 border border-[var(--green)]/30 text-[var(--green)]" : "bg-[var(--red)]/10 border border-[var(--red)]/30 text-[var(--red)]"}`}>
          <div className="font-bold">
            {lastResult.ok ? "✓ 発注成功" : "✗ 発注失敗"} {lastResult.mode && `(${lastResult.mode})`}
          </div>
          {lastResult.message && <div className="mt-1">{lastResult.message}</div>}
          {lastResult.error && <div className="mt-1">{lastResult.error}</div>}
        </div>
      )}

      <p className="mt-3 text-[10px] text-[var(--text-muted)] leading-relaxed">
        ⚠️ 本番モードは実マネーが動きます。検証モードで動作確認してから使用してください。
        kabu Station が起動・ログインしている必要があります（Windows のみ）。
      </p>
    </div>
  );
}
