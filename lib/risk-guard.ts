// リスク管理ガード
import type { Trade } from "./simulate";

export type RiskRules = {
  maxDailyLossYen: number;       // 1日最大損失（超えたら当日休止）
  maxConsecutiveLosses: number;  // 連敗ストッパー（N連敗で翌日休止）
  maxMonthlyDDPct: number;       // 月最大DD% (超えたら見直し)
  emergencyStop: boolean;        // 手動緊急停止フラグ
};

export const DEFAULT_RULES: RiskRules = {
  maxDailyLossYen: 30000,        // 3万円/日
  maxConsecutiveLosses: 3,
  maxMonthlyDDPct: 10,
  emergencyStop: false,
};

export type GuardResult = {
  canTrade: boolean;
  reason?: string;
};

export function checkRisk(rules: RiskRules, recent: Trade[]): GuardResult {
  if (rules.emergencyStop) {
    return { canTrade: false, reason: "🛑 緊急停止が手動でONになっています" };
  }
  if (recent.length === 0) return { canTrade: true };

  // 直近の連敗数
  let streak = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].pnlYen < 0) streak++;
    else break;
  }
  if (streak >= rules.maxConsecutiveLosses) {
    return {
      canTrade: false,
      reason: `🔻 ${streak}連敗中。連敗ストッパー(${rules.maxConsecutiveLosses})により休止`,
    };
  }

  // 当日の損失合計
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = recent.filter((t) => t.date === today);
  const todayLoss = todayTrades.reduce((s, t) => s + t.pnlYen, 0);
  if (todayLoss < -rules.maxDailyLossYen) {
    return {
      canTrade: false,
      reason: `📉 当日損失 ${todayLoss.toLocaleString()}円。1日上限 -${rules.maxDailyLossYen.toLocaleString()}円を超過`,
    };
  }

  return { canTrade: true };
}
