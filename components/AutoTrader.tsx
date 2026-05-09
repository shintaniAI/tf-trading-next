"use client";
import { useState, useEffect, useRef } from "react";
import type { Signal } from "@/lib/strategy";

type ConnectionStatus = "idle" | "connecting" | "ok" | "error";
type TradeMode = "PAPER" | "LIVE_VERIFICATION" | "LIVE_PRODUCTION";

const SETTINGS_KEY = "tf_kabu_settings_v1";

type Settings = {
  symbol: string;
  emergencyStop: boolean;
  mode: TradeMode;
  maxDailyLossYen: number;
  maxConsecutiveLosses: number;
  // スケジューラ
  schedulerEnabled: boolean;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
};

const DEFAULT: Settings = {
  symbol: "",
  emergencyStop: false,
  mode: "PAPER",
  maxDailyLossYen: 30000,
  maxConsecutiveLosses: 3,
  schedulerEnabled: false,
  openHour: 8,
  openMinute: 50,
  closeHour: 15,
  closeMinute: 25,
};

type ConnResp = { ok: boolean; tokenPrefix?: string; mode?: string; error?: string };
type OrderResp = { ok: boolean; mode?: string; simulated?: boolean; message?: string; result?: unknown; error?: string };
type LogEntry = { ts: string; type: "open" | "close" | "skip" | "error" | "manual"; message: string };

export function AutoTrader({ signal, basePieces }: { signal: Signal | null; basePieces: number }) {
  const [s, setS] = useState<Settings>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);
  const [password, setPassword] = useState(""); // session のみ（localStorage非保存）
  const [conn, setConn] = useState<ConnectionStatus>("idle");
  const [connMsg, setConnMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const lastFiredRef = useRef<{ open?: string; close?: string }>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setS({ ...DEFAULT, ...JSON.parse(raw) });
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  }, [s, hydrated]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isLive = s.mode !== "PAPER";
  const isAuthorized = !isLive || conn === "ok";

  const addLog = (type: LogEntry["type"], message: string) => {
    setLogs((prev) => [
      { ts: new Date().toLocaleTimeString("ja-JP", { hour12: false }), type, message },
      ...prev,
    ].slice(0, 30));
  };

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
        body: JSON.stringify({ password, verification: s.mode === "LIVE_VERIFICATION" }),
      });
      const j: ConnResp = await r.json();
      if (j.ok) { setConn("ok"); setConnMsg(`✓ 接続OK (${j.mode}) Token: ${j.tokenPrefix}`); }
      else { setConn("error"); setConnMsg(j.error || "接続失敗"); }
    } catch (e) {
      setConn("error");
      setConnMsg(e instanceof Error ? e.message : "接続失敗");
    }
  };

  const sendOrder = async (kind: "open" | "close", silent = false) => {
    if (!signal || signal.direction === "skip") {
      addLog("skip", `${kind === "open" ? "寄成" : "引成"}: シグナルなしのためスキップ`);
      return;
    }
    if (s.emergencyStop) {
      addLog("skip", "緊急停止中のため発注しません");
      return;
    }
    if (isLive && !isAuthorized) {
      addLog("error", "本番接続未確認のため発注中止");
      return;
    }
    if (isLive && !s.symbol) {
      addLog("error", "銘柄コード未設定");
      return;
    }
    const pieces = signal.piecesLogic * basePieces;
    const sideRaw: "1" | "2" = signal.direction === "買い" ? "2" : "1";
    const side: "1" | "2" = kind === "close" ? (sideRaw === "1" ? "2" : "1") : sideRaw;
    const tradeType = kind === "open" ? 1 : 2;
    const frontOrderType = kind === "open" ? 120 : 130;
    const action = kind === "open" ? "寄成 新規" : "引成 決済";

    if (!silent) {
      const modeLabel = s.mode === "PAPER" ? "PAPER（仮想）" :
                        s.mode === "LIVE_VERIFICATION" ? "検証（ダミー）" :
                        "🔴 本番（実マネー）";
      const ok = confirm(`${action}\n${signal.direction} ${pieces}枚\nモード: ${modeLabel}\n\n発注しますか？`);
      if (!ok) { addLog("skip", `${action}: ユーザーキャンセル`); return; }
    }

    setBusy(true);
    try {
      const r = await fetch("/api/kabu/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password, mode: s.mode,
          verification: s.mode === "LIVE_VERIFICATION",
          symbol: s.symbol, side, qty: pieces,
          tradeType, frontOrderType, price: 0,
        }),
      });
      const j: OrderResp = await r.json();
      if (j.ok) {
        const t: LogEntry["type"] = silent ? kind : "manual";
        addLog(t, `${action} ${signal.direction}${pieces}枚 → ${j.simulated ? "PAPER成功" : "実発注成功"}`);
      } else {
        addLog("error", `${action} 失敗: ${j.error || JSON.stringify(j)}`);
      }
    } catch (e) {
      addLog("error", `${action} 例外: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // 時刻監視（自動発注 - 承認なし）
  useEffect(() => {
    if (!s.schedulerEnabled || !now) return;
    const dow = now.getDay();
    if (dow === 0 || dow === 6) return; // 土日スキップ
    const dateKey = now.toISOString().slice(0, 10);
    const h = now.getHours();
    const m = now.getMinutes();
    if (h === s.openHour && m === s.openMinute && lastFiredRef.current.open !== dateKey) {
      lastFiredRef.current.open = dateKey;
      void sendOrder("open", true); // silent=true で承認なし
    }
    if (h === s.closeHour && m === s.closeMinute && lastFiredRef.current.close !== dateKey) {
      lastFiredRef.current.close = dateKey;
      void sendOrder("close", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, s.schedulerEnabled, s.openHour, s.openMinute, s.closeHour, s.closeMinute]);

  // チェックリスト判定
  const checklistItems = [
    {
      label: "1. 三菱UFJ eスマート証券 口座開設",
      status: "unknown" as const,
      note: "https://kabu.com/ で開設（1〜2週）",
    },
    {
      label: "2. 信用 + 先物・OP 口座 適性審査",
      status: "unknown" as const,
      note: "投資経験「あり」+ 投資目的「収益性重視」で申請",
    },
    {
      label: "3. kabu Station PRO 起動・ログイン",
      status: "unknown" as const,
      note: "Windows 必須。常時起動 or VPS",
    },
    {
      label: "4. API パスワード入力",
      status: (password ? "ok" : "ng") as "ok" | "ng",
      note: password ? "✓ 入力済み" : "下記のフォームに kabu Station 設定 > APIタブ で設定したパスワード",
    },
    {
      label: "5. 銘柄コード設定",
      status: (s.symbol ? "ok" : "ng") as "ok" | "ng",
      note: s.symbol ? `✓ ${s.symbol}` : "日経225マイクロの限月銘柄コード（kabuステーション > 銘柄検索）",
    },
    {
      label: "6. API 接続テスト成功",
      status: (conn === "ok" && isLive ? "ok" : conn === "error" ? "ng" : "unknown") as "ok" | "ng" | "unknown",
      note: connMsg || "下の「接続テスト」ボタンで確認",
    },
    {
      label: "7. 証拠金入金",
      status: "unknown" as const,
      note: "マイクロなら最低1.2万円〜（最初は最小ロットで）",
    },
  ];

  const allChecksOk = checklistItems.every((i) => i.status === "ok");
  const dotColor = conn === "ok" ? "bg-[var(--green)]" :
                   conn === "error" ? "bg-[var(--red)]" :
                   conn === "connecting" ? "bg-[var(--gold)] animate-pulse" :
                   "bg-[var(--text-muted)]";

  return (
    <div className="space-y-4">
      {/* メインカード */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            🤖 自動売買コントロール
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
              onClick={() => { setS({ ...s, mode: m.v }); setConn("idle"); setConnMsg(""); }}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                s.mode === m.v
                  ? m.v === "LIVE_PRODUCTION" ? "bg-[var(--red)] text-white"
                  : m.v === "LIVE_VERIFICATION" ? "bg-[var(--gold)] text-black"
                  : "bg-[var(--blue)] text-white"
                  : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--border)]"
              }`}
            >
              <div>{m.label}</div>
              <div className="text-[9px] opacity-80 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>

        {/* LIVE設定 */}
        {isLive && (
          <div className="space-y-3 mb-4 p-3 rounded-lg bg-[var(--bg-elevated)]">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                kabu API パスワード
              </label>
              <input
                type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="kabuステーション > 設定 > APIタブ で設定"
                className="mt-1 w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--blue)]"
              />
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">※ ブラウザに保存されません</p>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                銘柄コード
              </label>
              <input
                type="text" value={s.symbol}
                onChange={(e) => setS({ ...s, symbol: e.target.value })}
                placeholder="例: 167060019 (要kabuS銘柄検索)"
                className="mt-1 w-full bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--blue)]"
              />
            </div>
            <button
              onClick={testConnection}
              disabled={!password}
              className="w-full bg-[var(--blue)] hover:bg-[var(--blue)]/80 disabled:opacity-30 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-semibold transition"
            >
              🔌 接続テスト
            </button>
          </div>
        )}

        {/* 手動発注 */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => sendOrder("open")}
            disabled={busy || !signal || signal.direction === "skip" || s.emergencyStop || (isLive && !isAuthorized)}
            className="bg-[var(--green)] hover:bg-[var(--green)]/80 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3 rounded-lg text-sm font-bold transition"
          >
            {busy ? "..." : "📈 寄成 新規（手動）"}
          </button>
          <button
            onClick={() => sendOrder("close")}
            disabled={busy || !signal || signal.direction === "skip" || s.emergencyStop || (isLive && !isAuthorized)}
            className="bg-[var(--blue)] hover:bg-[var(--blue)]/80 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3 rounded-lg text-sm font-bold transition"
          >
            {busy ? "..." : "📉 引成 決済（手動）"}
          </button>
        </div>

        {/* 緊急停止 */}
        <button
          onClick={() => setS({ ...s, emergencyStop: !s.emergencyStop })}
          className={`w-full py-2.5 rounded-lg text-sm font-bold transition ${
            s.emergencyStop ? "bg-[var(--red)] text-white" : "border border-[var(--red)] text-[var(--red)] hover:bg-[var(--red)]/10"
          }`}
        >
          {s.emergencyStop ? "🛑 緊急停止中（クリックで解除）" : "🛑 緊急停止する"}
        </button>
      </div>

      {/* スケジューラ - 承認なし自動発注 */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            ⏰ 時刻スケジューラ（承認なし自動発注）
          </h3>
          <button
            onClick={() => setS({ ...s, schedulerEnabled: !s.schedulerEnabled })}
            disabled={s.emergencyStop}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
              s.schedulerEnabled
                ? "bg-[var(--green)] text-white shadow-lg shadow-[var(--green)]/20"
                : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]"
            } disabled:opacity-30`}
          >
            {s.schedulerEnabled ? "● 自動発注 ON" : "○ 自動発注 OFF"}
          </button>
        </div>

        <div className="mb-4 p-3 rounded-lg bg-[var(--gold)]/10 border border-[var(--gold)]/30 text-[11px] text-[var(--gold)] leading-relaxed">
          ⚠️ <b>承認なし自動発注</b>: ON にすると設定時刻に確認なしで発注。
          このブラウザタブを開いてる間だけ動く（Vercelデプロイでもタブ閉じれば停止）。
          <br />
          24/7 完全自動化したい場合は、このページをブラウザで常に開く or Windows のVPSで運用する必要あり。
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)]">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">📈 寄成</div>
            <div className="flex gap-1">
              <input type="number" min={0} max={23} value={s.openHour}
                onChange={(e) => setS({ ...s, openHour: Number(e.target.value) })}
                className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm tnum text-center" />
              <span className="text-[var(--text-muted)] self-center">:</span>
              <input type="number" min={0} max={59} value={s.openMinute}
                onChange={(e) => setS({ ...s, openMinute: Number(e.target.value) })}
                className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm tnum text-center" />
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1">推奨 08:50</div>
          </div>
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)]">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">📉 引成</div>
            <div className="flex gap-1">
              <input type="number" min={0} max={23} value={s.closeHour}
                onChange={(e) => setS({ ...s, closeHour: Number(e.target.value) })}
                className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm tnum text-center" />
              <span className="text-[var(--text-muted)] self-center">:</span>
              <input type="number" min={0} max={59} value={s.closeMinute}
                onChange={(e) => setS({ ...s, closeMinute: Number(e.target.value) })}
                className="w-14 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm tnum text-center" />
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1">推奨 15:25</div>
          </div>
        </div>

        {s.schedulerEnabled && now && (
          <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--green)]/30 text-xs text-[var(--text-muted)] mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
              稼働中: 現在 <span className="text-[var(--text)] font-semibold tnum">{now.toLocaleTimeString("ja-JP", { hour12: false })}</span>
            </div>
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

      {/* チェックリスト */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            ✅ 本番接続チェックリスト
          </h3>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            allChecksOk
              ? "bg-[var(--green)]/15 text-[var(--green)] border border-[var(--green)]/30"
              : "bg-[var(--gold)]/15 text-[var(--gold)] border border-[var(--gold)]/30"
          }`}>
            {allChecksOk ? "✓ 本番運用可能" : "🔧 準備中"}
          </span>
        </div>
        <ul className="space-y-2">
          {checklistItems.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                item.status === "ok" ? "bg-[var(--green)] text-white" :
                item.status === "ng" ? "bg-[var(--red)] text-white" :
                "bg-[var(--text-muted)] text-white"
              }`}>
                {item.status === "ok" ? "✓" : item.status === "ng" ? "✗" : "?"}
              </span>
              <div className="flex-1">
                <div className={item.status === "ok" ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>
                  {item.label}
                </div>
                {item.note && (
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.note}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[10px] text-[var(--text-muted)] leading-relaxed">
          全項目に ✓ がつくまでは PAPER モードでテスト。実取引開始は **マイクロ1枚（資金1.2万円）** から段階的に。
        </p>
      </div>
    </div>
  );
}
