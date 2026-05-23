"use client";

export function ProductionBlueprint() {
  const steps = [
    {
      title: "1. Xserver常駐APIサーバー",
      body: "Next/Vercelの画面とは分離。Xserver VPS上でNode/Python daemonを24時間起動し、毎営業日08:50と15:25に発注処理を実行。",
      status: "設計済み",
    },
    {
      title: "2. Broker API Adapter",
      body: "IBKR/国内API対応業者が決まり次第、発注・建玉照会・決済をadapter化。デモ/PAPER/LIVEで同じロジックを通す。",
      status: "業者待ち",
    },
    {
      title: "3. Safety Guard",
      body: "最大枚数、最大損失、二重発注防止、祝日判定、手動停止、API失敗時のSlack通知を本番前に必須化。",
      status: "必須",
    },
    {
      title: "4. Dashboard Monitor",
      body: "この画面は監視・設定・履歴確認。実際の発注はブラウザ依存にせずXserver側のcron/daemonで実行。",
      status: "方針確定",
    },
  ];

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          ③ 本番運用：Xserver + Broker APIで24時間稼働
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
          ここは「実際にお金を動かす時の全体像」を見る場所。本番は画面を開いている間だけ動く方式にせず、Xserver VPSに常駐プロセスを置き、同じS1ロジックで自動発注する。
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-[var(--blue)]/30 bg-[var(--blue)]/5 p-3 text-xs leading-relaxed text-[var(--text-muted)]">
        初心者向けの理解: Vercel画面は「メーター・監視画面」。実際に注文ボタンを押す役はXserver側の自動プログラム。
        証券会社API・手数料・証拠金・安全停止が全部揃うまで、実資金の発注はOFFのまま。
      </div>

      <div className="mb-4 rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 p-3 text-xs leading-relaxed text-[var(--red)]">
        🔒 LIVE発注は現在OFF。業者API・APIキー・証拠金・手数料込みPL・安全停止条件が揃うまで、このダッシュボードから本番発注はできない設計。
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {steps.map((step) => (
          <div key={step.title} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-[var(--text)]">{step.title}</h3>
              <span className="shrink-0 rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--gold)]">
                {step.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">本番アーキテクチャ</div>
        <div className="overflow-x-auto font-mono text-xs leading-6 text-[var(--text-muted)]">
          <pre>{`Dashboard(Vercel): 設定・監視・履歴
        │
        ▼
Xserver VPS: tf-trading daemon / cron
        │  08:50 signal → open
        │  15:25 close
        ▼
Broker API: order / positions / account
        │
        ▼
Trade log DB + Slack alert`}</pre>
        </div>
      </div>
    </section>
  );
}
