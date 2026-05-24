import type { Signal } from "@/lib/strategy";

const JP_WD = ["日", "月", "火", "水", "木", "金", "土"];

function fmtJP(date: string) {
  const d = new Date(date);
  return `${date}（${JP_WD[d.getUTCDay()]}）`;
}

export function HeroToday({
  signal,
  basePieces,
  contractSize,
  policyLabel,
  policyReason,
  tradeAllowed = true,
}: {
  signal: Signal | null;
  basePieces: number;
  contractSize: number;
  policyLabel?: string;
  policyReason?: string;
  tradeAllowed?: boolean;
}) {
  if (!signal || !tradeAllowed || signal.direction === "skip") {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
          📅 {signal ? fmtJP(signal.date) : "--"} {policyLabel ? ` / ${policyLabel}` : ""}
        </div>
        <div className="mt-2 text-5xl font-bold text-[var(--text-muted)]">休 ノートレード</div>
        {policyReason && <div className="mt-3 text-sm text-[var(--gold)]">{policyReason}</div>}
      </div>
    );
  }

  const isBuy = signal.direction === "買い";
  const arrow = isBuy ? "▲" : "▼";
  const pieces = signal.piecesLogic * basePieces;
  const colorMain = isBuy ? "text-[var(--green)]" : "text-[var(--red)]";

  let pnlBlock = (
    <div className="text-right">
      <div className="text-xs uppercase tracking-widest text-[var(--text-muted)]">引け待ち</div>
      <div className="mt-1 text-3xl font-bold text-[var(--text-muted)]">—</div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">15:00 大引けで決済</div>
    </div>
  );

  if (signal.range != null && signal.close != null) {
    const pnlPt = signal.yubeSign * pieces * signal.range;
    const pnlYen = pnlPt * contractSize;
    const isUp = pnlYen >= 0;
    pnlBlock = (
      <div className="text-right">
        <div className="text-xs uppercase tracking-widest text-[var(--text-muted)]">本日確定損益</div>
        <div
          className={`mt-1 text-4xl font-extrabold tnum ${isUp ? "text-[var(--green)]" : "text-[var(--red)]"}`}
        >
          {isUp ? "+" : ""}
          {pnlYen.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)] tnum">
          円 ／ {pnlPt >= 0 ? "+" : ""}
          {pnlPt.toFixed(0)} pt
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 shadow-2xl">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
        <div>
          <div className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
            📅 {fmtJP(signal.date)} の指示 {policyLabel ? ` / ${policyLabel}` : ""}
          </div>
          <div className={`mt-2 text-7xl font-extrabold leading-none ${colorMain}`}>
            {arrow} {signal.direction} {pieces}枚
          </div>
          <div className="mt-3 text-sm text-[var(--text-muted)]">
            夕場 <span className={signal.yube >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>
              {signal.yube >= 0 ? "+" : ""}{signal.yube.toFixed(0)}
            </span> pt 　|
            NY前日 <span className={signal.nyDiff >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>
              {signal.nyDiff >= 0 ? "+" : ""}{signal.nyDiff.toFixed(0)}
            </span> pt 　|
            寄り {signal.open.toLocaleString()} → 引け{" "}
            {signal.close != null ? signal.close.toLocaleString() : "—"}
          </div>
          {policyReason && <div className="mt-2 text-xs text-[var(--gold)]">{policyReason}</div>}
        </div>
        {pnlBlock}
      </div>
    </div>
  );
}
