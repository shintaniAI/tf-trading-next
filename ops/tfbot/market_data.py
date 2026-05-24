from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass


@dataclass(frozen=True)
class Bar:
    date: str
    open: float
    close: float


def fetch_yahoo_daily(symbol: str, range_: str = "2y") -> list[Bar]:
    encoded = urllib.parse.quote(symbol, safe="")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?range={range_}&interval=1d"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as res:
        payload = json.loads(res.read().decode("utf-8"))
    result = payload["chart"]["result"][0]
    timestamps = result.get("timestamp") or []
    quote = result["indicators"]["quote"][0]
    opens = quote.get("open") or []
    closes = quote.get("close") or []
    bars: list[Bar] = []
    for ts, op, cl in zip(timestamps, opens, closes):
        if op is None or cl is None:
            continue
        date = time.strftime("%Y-%m-%d", time.gmtime(ts))
        bars.append(Bar(date=date, open=float(op), close=float(cl)))
    if len(bars) < 3:
        raise RuntimeError(f"Yahoo data too short: {symbol}")
    return bars


def fetch_signal_data(range_: str = "2y") -> tuple[list[Bar], list[Bar]]:
    return fetch_yahoo_daily("^N225", range_), fetch_yahoo_daily("^DJI", range_)
