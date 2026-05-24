from __future__ import annotations

import math
from dataclasses import dataclass
from .market_data import Bar


@dataclass(frozen=True)
class Signal:
    date: str
    yube: float
    yube_sign: int
    ny_diff: float
    ny_sign: int
    direction: str
    pieces_logic: int
    open: float
    close: float | None
    range: float | None
    policy_allowed: bool
    policy_reason: str
    policy_threshold: float | None = None


POLICIES: dict[str, dict[str, float | str | int]] = {
    "s1_all": {"label": "従来S1", "mode": "all"},
    "gap_abs_100": {"label": "100円以上", "mode": "abs", "threshold": 100},
    "gap_abs_300": {"label": "300円以上", "mode": "abs", "threshold": 300},
    "gap_abs_400": {"label": "400円以上", "mode": "abs", "threshold": 400},
    "gap_pr_80": {"label": "過去1年ギャップ上位20%", "mode": "percentile", "percentile": 0.8, "rolling": 252},
    "gap_pr_90": {"label": "過去1年ギャップ上位10%", "mode": "percentile", "percentile": 0.9, "rolling": 252},
}


def sign(v: float) -> int:
    return 1 if v > 0 else -1 if v < 0 else 0


def find_prev_ny_bar(dji_bars: list[Bar], target_date: str) -> Bar | None:
    prev: Bar | None = None
    for bar in dji_bars:
        if bar.date < target_date:
            prev = bar
        else:
            break
    return prev


def percentile(values: list[float], q: float) -> float:
    if not values:
        return math.inf
    values = sorted(values)
    idx = min(len(values) - 1, max(0, math.ceil(len(values) * q) - 1))
    return values[idx]


def rolling_gap_threshold(n225_bars: list[Bar], index: int, rolling: int = 252, q: float = 0.8) -> float | None:
    start = max(1, index - rolling)
    gaps = [abs(n225_bars[i].open - n225_bars[i - 1].close) for i in range(start, index)]
    if len(gaps) < 40:
        return None
    return percentile(gaps, q)


def evaluate_policy(n225_bars: list[Bar], index: int, yube: float, policy_id: str) -> tuple[bool, str, float | None]:
    policy = POLICIES.get(policy_id, POLICIES["gap_pr_80"])
    gap_abs = abs(yube)
    mode = policy["mode"]
    if mode == "all":
        return True, "従来S1のため取引対象", None
    if mode == "abs":
        threshold = float(policy["threshold"])
        ok = gap_abs >= threshold
        reason = f"ギャップ{gap_abs:.0f}円 {'>=' if ok else '<'} {threshold:.0f}円"
        return ok, reason, threshold
    threshold = rolling_gap_threshold(
        n225_bars,
        index,
        int(policy.get("rolling", 252)),
        float(policy.get("percentile", 0.8)),
    )
    if threshold is None:
        return False, "過去1年基準の作成に必要なデータ不足", None
    ok = gap_abs >= threshold
    reason = f"ギャップ{gap_abs:.0f}円 {'>=' if ok else '<'} 過去1年基準{threshold:.0f}円"
    return ok, reason, threshold


def generate_signal(n225_bars: list[Bar], dji_bars: list[Bar], policy_id: str = "gap_pr_80") -> Signal:
    if len(n225_bars) < 2:
        raise RuntimeError("n225 bars too short")
    index = len(n225_bars) - 1
    today = n225_bars[index]
    prev = n225_bars[index - 1]
    ny_prev = find_prev_ny_bar(dji_bars, today.date)
    yube = today.open - prev.close
    yube_sign = sign(yube)
    ny_diff = (ny_prev.close - ny_prev.open) if ny_prev else 0.0
    ny_sign = sign(ny_diff)
    direction = "skip" if yube_sign == 0 else "BUY" if yube_sign > 0 else "SELL"
    pieces_logic = 1 if (yube_sign + ny_sign) == 0 else 2
    day_range = None if today.close is None else today.close - today.open
    allowed, reason, threshold = evaluate_policy(n225_bars, index, yube, policy_id)
    if direction == "skip":
        allowed = False
        reason = "朝の方向が出ていないため見送り"
    return Signal(
        date=today.date,
        yube=yube,
        yube_sign=yube_sign,
        ny_diff=ny_diff,
        ny_sign=ny_sign,
        direction=direction,
        pieces_logic=pieces_logic,
        open=today.open,
        close=today.close,
        range=day_range,
        policy_allowed=allowed,
        policy_reason=reason,
        policy_threshold=threshold,
    )
