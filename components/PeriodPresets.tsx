"use client";
type Preset = { label: string; getStart: () => string };

const presets: Preset[] = [
  { label: "1ヶ月", getStart: () => isoDaysAgo(30) },
  { label: "3ヶ月", getStart: () => isoDaysAgo(90) },
  { label: "6ヶ月", getStart: () => isoDaysAgo(180) },
  { label: "1年", getStart: () => isoDaysAgo(365) },
  { label: "3年", getStart: () => isoDaysAgo(365 * 3) },
  { label: "5年", getStart: () => isoDaysAgo(365 * 5) },
  { label: "全期間", getStart: () => "2020-01-01" },
];

function isoDaysAgo(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
}

export function PeriodPresets({
  current,
  onSelect,
}: {
  current: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {presets.map((p) => {
        const target = p.getStart();
        const active = target === current;
        return (
          <button
            key={p.label}
            onClick={() => onSelect(target)}
            className={`px-3 py-1 rounded text-xs font-semibold transition ${
              active
                ? "bg-[var(--blue)] text-white"
                : "bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
