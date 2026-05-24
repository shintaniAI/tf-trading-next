from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")
QUARTER_MONTHS = (3, 6, 9, 12)


def jst_today() -> date:
    return datetime.now(JST).date()


def parse_date(value: str | None) -> date:
    if not value:
        return jst_today()
    return date.fromisoformat(value)


def nth_weekday(year: int, month: int, weekday: int, nth: int) -> date:
    """weekday: Monday=0 ... Sunday=6"""
    d = date(year, month, 1)
    add = (weekday - d.weekday()) % 7
    return d + timedelta(days=add + 7 * (nth - 1))


def equinox_day(year: int, spring: bool) -> int:
    # 国立天文台の近似式。2099年までの祝日判定には十分。
    if spring:
        return int(20.8431 + 0.242194 * (year - 1980) - int((year - 1980) / 4))
    return int(23.2488 + 0.242194 * (year - 1980) - int((year - 1980) / 4))


def base_japanese_holidays(year: int) -> set[date]:
    holidays: set[date] = {
        date(year, 1, 1),  # 元日
        nth_weekday(year, 1, 0, 2),  # 成人の日
        date(year, 2, 11),  # 建国記念の日
        date(year, 2, 23),  # 天皇誕生日
        date(year, 3, equinox_day(year, True)),  # 春分の日
        date(year, 4, 29),  # 昭和の日
        date(year, 5, 3),  # 憲法記念日
        date(year, 5, 4),  # みどりの日
        date(year, 5, 5),  # こどもの日
        nth_weekday(year, 7, 0, 3),  # 海の日
        date(year, 8, 11),  # 山の日
        nth_weekday(year, 9, 0, 3),  # 敬老の日
        date(year, 9, equinox_day(year, False)),  # 秋分の日
        nth_weekday(year, 10, 0, 2),  # スポーツの日
        date(year, 11, 3),  # 文化の日
        date(year, 11, 23),  # 勤労感謝の日
    }
    return holidays


def japanese_holidays(year: int) -> set[date]:
    holidays = base_japanese_holidays(year)

    # 国民の休日: 祝日に挟まれた平日
    span = [date(year, 1, 1) + timedelta(days=i) for i in range((date(year, 12, 31) - date(year, 1, 1)).days + 1)]
    for d in span[1:-1]:
        if d.weekday() < 5 and d not in holidays and (d - timedelta(days=1)) in holidays and (d + timedelta(days=1)) in holidays:
            holidays.add(d)

    # 振替休日: 祝日が日曜なら次の平日を休日にする
    for h in sorted(list(holidays)):
        if h.weekday() == 6:
            sub = h + timedelta(days=1)
            while sub in holidays:
                sub += timedelta(days=1)
            holidays.add(sub)
    return holidays


def is_japanese_holiday(d: date) -> bool:
    return d in japanese_holidays(d.year)


def is_market_business_day(d: date) -> bool:
    return d.weekday() < 5 and not is_japanese_holiday(d)


def second_friday(year: int, month: int) -> date:
    return nth_weekday(year, month, 4, 2)


def quarterly_sq_date(year: int, month: int) -> date | None:
    if month not in QUARTER_MONTHS:
        return None
    return second_friday(year, month)


def is_quarterly_sq_day(d: date) -> bool:
    return d.month in QUARTER_MONTHS and d == second_friday(d.year, d.month)


def next_quarterly_expiry(after: date) -> date:
    candidates: list[date] = []
    for year in (after.year, after.year + 1):
        for month in QUARTER_MONTHS:
            sq = second_friday(year, month)
            if sq > after:
                candidates.append(sq)
    return min(candidates)


def next_contract_month(after: date) -> str:
    sq = next_quarterly_expiry(after)
    return f"{sq.year}{sq.month:02d}"


@dataclass(frozen=True)
class MarketDateDecision:
    ok: bool
    reason: str
    trading_date: str
    next_contract_month: str


def check_market_date(target: date, *, avoid_sq_day: bool = True) -> MarketDateDecision:
    if not is_market_business_day(target):
        reason = "土日" if target.weekday() >= 5 else "日本市場の祝日"
        return MarketDateDecision(False, reason, target.isoformat(), next_contract_month(target))
    if avoid_sq_day and is_quarterly_sq_day(target):
        return MarketDateDecision(False, "メジャーSQ日のため自動建てを停止", target.isoformat(), next_contract_month(target))
    return MarketDateDecision(True, "取引日OK", target.isoformat(), next_contract_month(target))
