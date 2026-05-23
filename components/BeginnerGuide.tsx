"use client";

const FLOW_STEPS = [
  {
    title: "1. まず過去検証を見る",
    body: "このルールを過去に毎日やったら、どれくらい増減したかを見る場所。初心者は最初にここで「資金に対して何枚が重すぎないか」だけ確認すればOK。",
  },
  {
    title: "2. 次にデモ運用で練習",
    body: "実際のお金は使わず、今日のサインを仮で保存する場所。買い/売り・枚数・損益の動きに慣れるための練習モード。",
  },
  {
    title: "3. 最後に本番運用へ進む",
    body: "本番はこのブラウザ画面から直接発注しない。Xserver上の自動プログラムが、証券会社APIにつないで朝に建て、引けで決済する設計。",
  },
];

const TERMS = [
  { term: "日経225先物", desc: "日経平均が上がる/下がるに賭ける取引。株を1社ずつ買うのではなく、指数そのものを売買する。" },
  { term: "マイクロ / ミニ / ラージ", desc: "同じ日経225でも取引サイズが違う。初心者は損益の振れが小さいマイクロから見るのが安全。" },
  { term: "1pt", desc: "日経平均が1円動く単位。マイクロ1枚は1pt=10円、ミニ1枚は1pt=100円、ラージ1枚は1pt=1,000円。" },
  { term: "建玉", desc: "まだ決済していないポジションのこと。買いで持っている、売りで持っている、という状態。" },
  { term: "DD / ドローダウン", desc: "一時的な最大負け幅。利益より先に「どれくらい耐える必要があるか」を見るための数字。" },
  { term: "スリッページ", desc: "理論上の価格と実際に約定する価格のズレ。本番ではこれで成績が少し悪くなる前提で見る。" },
];

export function BeginnerGuide() {
  return (
    <section className="mb-6 rounded-xl border border-[var(--blue)]/30 bg-[var(--blue)]/5 p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--blue)]">初心者向けに一言で</div>
          <h2 className="mt-1 text-xl font-extrabold text-[var(--text)]">
            この画面は「日経225を自動売買する前の安全確認ダッシュボード」
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            やることはシンプル。過去データで勝てていたかを確認し、実資金なしでデモ練習し、最後にXserverと証券会社APIへつないで本番化する。
            まだLIVE発注はOFFなので、この画面を触っても実際のお金は動かない。
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {FLOW_STEPS.map((step) => (
              <div key={step.title} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
                <div className="text-sm font-bold text-[var(--text)]">{step.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">用語ミニ辞典</div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {TERMS.map((item) => (
              <div key={item.term} className="rounded-md bg-[var(--bg-elevated)] px-3 py-2">
                <div className="text-xs font-bold text-[var(--text)]">{item.term}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
