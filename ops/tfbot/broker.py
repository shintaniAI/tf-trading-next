from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from .config import BotConfig
from .store import JsonStore, OrderRecord, now_iso


@dataclass(frozen=True)
class BrokerResult:
    ok: bool
    order_id: str | None
    message: str


class Broker:
    def health(self) -> BrokerResult:
        raise NotImplementedError

    def open(self, *, date: str, side: str, quantity: int, contract: str, price_ref: float | None) -> BrokerResult:
        raise NotImplementedError

    def close_all(self, *, price_ref: float | None) -> BrokerResult:
        raise NotImplementedError


class DryRunBroker(Broker):
    def __init__(self, config: BotConfig, store: JsonStore):
        self.config = config
        self.store = store

    def health(self) -> BrokerResult:
        return BrokerResult(True, None, "DRY_RUN broker ready: 実注文なし")

    def open(self, *, date: str, side: str, quantity: int, contract: str, price_ref: float | None) -> BrokerResult:
        oid = f"{date}-dry-{uuid4().hex[:8]}"
        self.store.append_order(OrderRecord(
            id=oid,
            at=now_iso(),
            mode=self.config.mode,
            broker="dryrun",
            action="OPEN",
            side=side,
            quantity=quantity,
            contract=contract,
            price_ref=price_ref,
            status="open",
            note="DRY_RUN: 実注文なし",
        ))
        return BrokerResult(True, oid, "DRY_RUN OPEN記録完了")

    def close_all(self, *, price_ref: float | None) -> BrokerResult:
        data = self.store.load()
        changed = 0
        for order in data.get("orders", []):
            if order.get("status") == "open":
                order["status"] = "closed"
                order["closed_at"] = now_iso()
                order["close_price_ref"] = price_ref
                changed += 1
        self.store.save(data)
        return BrokerResult(True, None, f"DRY_RUN CLOSE記録完了: {changed}件")


class IbkrBroker(Broker):
    """IBKR/TWS API adapter。

    ib_insync が入っていてIB Gatewayが起動済みならPAPER/LIVEに接続する。
    実発注は contract 詳細をAPI接続後に確定するため、現時点では接続確認を主目的にする。
    """

    def __init__(self, config: BotConfig, store: JsonStore):
        self.config = config
        self.store = store

    def _connect(self):
        try:
            from ib_insync import IB  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dependency
            raise RuntimeError("ib_insync が未インストール。pip install ib_insync が必要") from exc
        ib = IB()
        ib.connect(self.config.ibkr_host, self.config.ibkr_port, clientId=self.config.ibkr_client_id, timeout=10)
        return ib

    def health(self) -> BrokerResult:
        try:
            ib = self._connect()
            accounts = ib.managedAccounts()
            ib.disconnect()
            return BrokerResult(True, None, f"IBKR接続OK accounts={accounts}")
        except Exception as exc:
            return BrokerResult(False, None, f"IBKR接続NG: {exc}")

    def open(self, *, date: str, side: str, quantity: int, contract: str, price_ref: float | None) -> BrokerResult:
        # 安全上、contract実確認前はここで止める。API接続後にFutures contractを確定して実発注を有効化する。
        return BrokerResult(False, None, "IBKR実発注はcontract/限月確認後に有効化。まず health で接続確認。")

    def close_all(self, *, price_ref: float | None) -> BrokerResult:
        return BrokerResult(False, None, "IBKR実決済はcontract/建玉照会確認後に有効化。まず health で接続確認。")


def make_broker(config: BotConfig, store: JsonStore) -> Broker:
    if config.broker == "ibkr" and config.mode in {"paper", "live"}:
        return IbkrBroker(config, store)
    return DryRunBroker(config, store)
