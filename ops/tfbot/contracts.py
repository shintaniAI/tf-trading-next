from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .calendar import next_contract_month, second_friday


@dataclass(frozen=True)
class ContractSpec:
    name: str
    multiplier_yen_per_point: int
    ibkr_exchange: str = "OSE.JPN"
    currency: str = "JPY"


CONTRACTS: dict[str, ContractSpec] = {
    "micro": ContractSpec("micro", 10),
    "mini": ContractSpec("mini", 100),
    "large": ContractSpec("large", 1000),
}


def contract_spec(contract: str) -> ContractSpec:
    return CONTRACTS.get(contract, CONTRACTS["micro"])


def estimate_pnl_yen(side: str, entry: float | None, exit_: float | None, quantity: int, contract: str) -> int | None:
    if entry is None or exit_ is None:
        return None
    direction = 1 if side.upper() == "BUY" else -1
    spec = contract_spec(contract)
    return round((exit_ - entry) * direction * quantity * spec.multiplier_yen_per_point)


def ibkr_contract_hint(contract: str, target: date) -> dict[str, str | int]:
    """API接続後に確認するための限月ヒント。実発注contractはIBKR照会で最終確定する。"""
    month = next_contract_month(target)
    return {
        "contract": contract_spec(contract).name,
        "multiplier_yen_per_point": contract_spec(contract).multiplier_yen_per_point,
        "expiry_month": month,
        "sq_date": second_friday(int(month[:4]), int(month[4:])).isoformat(),
        "exchange_hint": contract_spec(contract).ibkr_exchange,
        "currency": contract_spec(contract).currency,
        "note": "IBKRのconId/localSymbolはAPI接続後にreqContractDetailsで確認してから有効化する",
    }
