from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class OrderRecord:
    id: str
    at: str
    mode: str
    broker: str
    action: str
    side: str
    quantity: int
    contract: str
    price_ref: float | None
    status: str
    note: str


class JsonStore:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"orders": []}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, data: dict[str, Any]) -> None:
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def append_order(self, order: OrderRecord) -> None:
        data = self.load()
        data.setdefault("orders", []).append(asdict(order))
        self.save(data)

    def open_orders(self) -> list[dict[str, Any]]:
        return [o for o in self.load().get("orders", []) if o.get("status") == "open"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
