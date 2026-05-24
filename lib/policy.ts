import type { Bar } from "./yahoo";
import type { Signal } from "./strategy";

export type StrategyPolicyId =
  | "s1_all"
  | "gap_abs_100"
  | "gap_abs_300"
  | "gap_abs_400"
  | "gap_pr_80"
  | "gap_pr_90";

export type StrategyPolicy = {
  id: StrategyPolicyId;
  label: string;
  shortLabel: string;
  description: string;
  mode: "all" | "abs" | "percentile";
  absThreshold?: number;
  percentile?: number;
  rollingDays?: number;
  riskNote: string;
};

export type PolicyEvaluation = {
  allowed: boolean;
  reason: string;
  thresholdText?: string;
  currentGapAbs: number;
};

export const STRATEGY_POLICIES: StrategyPolicy[] = [
  {
    id: "s1_all",
    label: "従来S1：全営業日",
    shortLabel: "全営業日",
    description: "朝のギャップ方向についていき、NYダウ同方向なら2倍。取引数は多いがDDも大きい。",
    mode: "all",
    riskNote: "利益機会は最大。ただしノイズ日も全部入るので初心者の初期運用には重い。",
  },
  {
    id: "gap_abs_100",
    label: "100円未満無視：広め",
    shortLabel: "100円以上",
    description: "小さすぎるギャップだけ捨てる。従来S1に近い取引頻度を残す。",
    mode: "abs",
    absThreshold: 100,
    riskNote: "利益は狙いやすいが、DD削減は300/400円ほど強くない。",
  },
  {
    id: "gap_abs_300",
    label: "300円未満無視：準安全",
    shortLabel: "300円以上",
    description: "ある程度はっきり動いた日だけ入る。400円固定より取引回数を確保しやすい。",
    mode: "abs",
    absThreshold: 300,
    riskNote: "固定円なので、日経の価格水準が変わると基準の意味が変わる。",
  },
  {
    id: "gap_abs_400",
    label: "400円未満無視：超安全",
    shortLabel: "400円以上",
    description: "かなり強いギャップの日だけ入る。近年は強いが、昔は取引が少なすぎる。",
    mode: "abs",
    absThreshold: 400,
    riskNote: "近年高ボラ相場に偏る。最終ロジックではなく安全モード扱い。",
  },
  {
    id: "gap_pr_80",
    label: "過去1年ギャップ上位20%：本命候補",
    shortLabel: "上位20%",
    description: "直近約1年の中で大きいギャップの日だけ取引。相場水準の変化に合わせて基準が動く。",
    mode: "percentile",
    percentile: 0.8,
    rollingDays: 252,
    riskNote: "固定400円より時代差に強い。本命候補として追加検証中。",
  },
  {
    id: "gap_pr_90",
    label: "過去1年ギャップ上位10%：厳選",
    shortLabel: "上位10%",
    description: "直近約1年の中でも特に大きいギャップだけ取引。勝率重視・頻度少なめ。",
    mode: "percentile",
    percentile: 0.9,
    rollingDays: 252,
    riskNote: "安全寄りだが取引機会は減る。400円固定の代替候補。",
  },
];

export function getPolicy(id: StrategyPolicyId): StrategyPolicy {
  return STRATEGY_POLICIES.find((p) => p.id === id) ?? STRATEGY_POLICIES[0];
}

function percentileThreshold(values: number[], percentile: number): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
  return sorted[idx];
}

export function rollingGapThreshold(
  n225Bars: Bar[],
  index: number,
  rollingDays = 252,
  percentile = 0.8
): number | null {
  const start = Math.max(1, index - rollingDays);
  const gaps: number[] = [];
  for (let j = start; j < index; j++) {
    const today = n225Bars[j];
    const prev = n225Bars[j - 1];
    if (!today || !prev || today.open == null || prev.close == null) continue;
    gaps.push(Math.abs(today.open - prev.close));
  }
  // 1年分がない初期期間でも、最低40営業日あれば暫定判定する。
  if (gaps.length < 40) return null;
  return percentileThreshold(gaps, percentile);
}

export function evaluatePolicy(
  n225Bars: Bar[],
  index: number,
  signal: Signal | null,
  policyId: StrategyPolicyId
): PolicyEvaluation {
  const policy = getPolicy(policyId);
  const currentGapAbs = Math.abs(signal?.yube ?? 0);

  if (!signal || signal.direction === "skip") {
    return { allowed: false, reason: "朝の方向が出ていないためノートレード", currentGapAbs };
  }

  if (policy.mode === "all") {
    return { allowed: true, reason: "従来S1なので全営業日を取引対象", currentGapAbs };
  }

  if (policy.mode === "abs") {
    const threshold = policy.absThreshold ?? 0;
    const allowed = currentGapAbs >= threshold;
    return {
      allowed,
      currentGapAbs,
      thresholdText: `${threshold.toLocaleString("ja-JP")}円`,
      reason: allowed
        ? `ギャップ${currentGapAbs.toFixed(0)}円 ≥ ${threshold}円のため取引対象`
        : `ギャップ${currentGapAbs.toFixed(0)}円 < ${threshold}円のため見送り`,
    };
  }

  const threshold = rollingGapThreshold(
    n225Bars,
    index,
    policy.rollingDays ?? 252,
    policy.percentile ?? 0.8
  );
  if (threshold == null) {
    return {
      allowed: false,
      currentGapAbs,
      reason: "過去1年基準を作るための過去データが不足しているため見送り",
    };
  }
  const allowed = currentGapAbs >= threshold;
  return {
    allowed,
    currentGapAbs,
    thresholdText: `${threshold.toFixed(0)}円`,
    reason: allowed
      ? `ギャップ${currentGapAbs.toFixed(0)}円 ≥ 過去1年基準${threshold.toFixed(0)}円のため取引対象`
      : `ギャップ${currentGapAbs.toFixed(0)}円 < 過去1年基準${threshold.toFixed(0)}円のため見送り`,
  };
}
