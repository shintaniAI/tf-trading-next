from __future__ import annotations

from dataclasses import dataclass
from .config import BotConfig
from .store import JsonStore


@dataclass(frozen=True)
class RiskDecision:
    ok: bool
    reason: str


class RiskGuard:
    def __init__(self, config: BotConfig, store: JsonStore):
        self.config = config
        self.store = store

    def can_open(self, date: str, quantity: int) -> RiskDecision:
        if quantity <= 0:
            return RiskDecision(False, "quantityが0以下")
        if quantity > self.config.max_base_pieces * 2:
            return RiskDecision(False, f"quantity {quantity} が最大許可 {self.config.max_base_pieces * 2} を超過")
        open_orders = self.store.open_orders()
        if open_orders:
            return RiskDecision(False, f"未決済建玉が{len(open_orders)}件あるため二重発注防止")
        data = self.store.load()
        same_day = [o for o in data.get("orders", []) if o.get("action") == "OPEN" and o.get("id", "").startswith(date)]
        if same_day:
            return RiskDecision(False, "同日OPEN済みのため二重発注防止")
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
