"use client";
type CheckItem = {
  label: string;
  status: "ok" | "ng" | "unknown";
  note?: string;
};

export function ConnectionChecklist({ items }: { items: CheckItem[] }) {
  const allOk = items.every((i) => i.status === "ok");
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          ✅ 本番接続 チェックリスト
        </h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          allOk
            ? "bg-[var(--green)]/15 text-[var(--green)] border border-[var(--green)]/30"
            : "bg-[var(--gold)]/15 text-[var(--gold)] border border-[var(--gold)]/30"
        }`}>
          {allOk ? "✓ 本番運用可能" : "🔧 準備中"}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
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
    </div>
  );
}
