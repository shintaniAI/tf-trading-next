from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from .calendar import check_market_date, parse_date
from .config import BotConfig
from .contracts import estimate_pnl_yen
from .store import JsonStore


@dataclass(frozen=True)
class RiskDecision:
    ok: bool
    reason: str


class RiskGuard:
    def __init__(self, config: BotConfig, store: JsonStore):
        self.config = config
        self.store = store

    def target_date(self) -> date:
        return parse_date(self.config.trading_date)

    def _orders(self) -> list[dict]:
        return list(self.store.load().get("orders", []))

    def _order_date(self, order: dict) -> str:
        raw = str(order.get("id", ""))
        return raw[:10] if len(raw) >= 10 else str(order.get("date", ""))

    def _pnl_yen(self, order: dict) -> int | None:
        if order.get("pnl_yen") is not None:
            try:
                return int(order["pnl_yen"])
            except (TypeError, ValueError):
                return None
        return estimate_pnl_yen(
            side=str(order.get("side", "")),
            entry=order.get("price_ref"),
            exit_=order.get("close_price_ref"),
            quantity=int(order.get("quantity", 0)),
            contract=str(order.get("contract", self.config.contract)),
        )

    def realized_pnl_for_date(self, target: str) -> int:
        total = 0
        for order in self._orders():
            if order.get("status") != "closed" or self._order_date(order) != target:
                continue
            pnl = self._pnl_yen(order)
            if pnl is not None:
                total += pnl
        return total

    def realized_pnl_for_month(self, target: str) -> int:
        prefix = target[:7]
        total = 0
        for order in self._orders():
            if order.get("status") != "closed" or not self._order_date(order).startswith(prefix):
                continue
            pnl = self._pnl_yen(order)
            if pnl is not None:
                total += pnl
        return total

    def consecutive_losing_days(self) -> int:
        by_day: dict[str, int] = {}
        for order in self._orders():
            if order.get("status") != "closed":
                continue
            pnl = self._pnl_yen(order)
            if pnl is None:
                continue
            day = self._order_date(order)
            by_day[day] = by_day.get(day, 0) + pnl
        streak = 0
        for day in sorted(by_day.keys(), reverse=True):
            if by_day[day] < 0:
                streak += 1
                continue
            if by_day[day] > 0:
                break
        return streak

    def can_open(self, signal_date: str, quantity: int, *, force: bool = False) -> RiskDecision:
        force = force or self.config.force
        target = self.target_date()
        market = check_market_date(target, avoid_sq_day=self.config.avoid_sq_day)
        if not market.ok and not force:
            return RiskDecision(False, f"取引日ガード: {target.isoformat()} は {market.reason}")
        if signal_date != target.isoformat() and not force:
            return RiskDecision(False, f"シグナル鮮度ガード: signal={signal_date}, target={target.isoformat()}。古い日足で発注しない")
        if quantity <= 0:
            return RiskDecision(False, "quantityが0以下")
        if quantity > self.config.max_base_pieces * 2:
            return RiskDecision(False, f"quantity {quantity} が最大許可 {self.config.max_base_pieces * 2} を超過")
        open_orders = self.store.open_orders()
        if open_orders:
            return RiskDecision(False, f"未決済建玉が{len(open_orders)}件あるため二重発注防止")
        data = self.store.load()
        same_day = [o for o in data.get("orders", []) if o.get("action") == "OPEN" and o.get("id", "").startswith(signal_date)]
        if same_day:
            return RiskDecision(False, "同日OPEN済みのため二重発注防止")
        day_pnl = self.realized_pnl_for_date(target.isoformat())
        if day_pnl <= -self.config.max_daily_loss_yen:
            return RiskDecision(False, f"日次損失停止: {day_pnl:,}円 <= -{self.config.max_daily_loss_yen:,}円")
        month_pnl = self.realized_pnl_for_month(target.isoformat())
        if month_pnl <= -self.config.max_monthly_loss_yen:
            return RiskDecision(False, f"月次損失停止: {month_pnl:,}円 <= -{self.config.max_monthly_loss_yen:,}円")
        streak = self.consecutive_losing_days()
        if streak >= self.config.max_consecutive_losses:
            return RiskDecision(False, f"連敗停止: {streak}連敗 >= {self.config.max_consecutive_losses}連敗")
        return RiskDecision(True, "OK")

    def can_close(self) -> RiskDecision:
        if not self.store.open_orders():
            return RiskDecision(False, "未決済建玉なし")
        return RiskDecision(True, "OK")

    def live_gate(self) -> RiskDecision:
        if self.config.mode == "live" and not self.config.live_enabled:
            return RiskDecision(False, "TF_MODE=live だが TF_LIVE_ENABLED=false のためLIVE発注禁止")
        if self.config.mode == "live" and self.config.max_base_pieces > 1:
            return RiskDecision(False, "初期LIVEはmax_base_pieces=1のみ許可")
        return RiskDecision(True, "OK")
