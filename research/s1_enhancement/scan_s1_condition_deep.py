#!/usr/bin/env python3
"""Deep condition scan for S1 enhancement.

Local research only: fetches public historical Yahoo data and writes md/json reports.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import statistics
import time
import urllib.parse
import urllib.request
from typing import Callable, Dict, Iterable, List, Optional

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
START = int(dt.datetime(2010, 1, 1).timestamp())
END = int(time.time()) + 86400
OUT_DIR = os.path.dirname(__file__)


def fetch(sym: str) -> List[Dict]:
    enc = urllib.parse.quote(sym, safe="")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{enc}?period1={START}&period2={END}&interval=1d"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
        j = json.load(r)
    res = j["chart"]["result"][0]
    ts = res["timestamp"]
    q = res["indicators"]["quote"][0]
    bars = []
    for i, t in enumerate(ts):
        o = q["open"][i]
        h = q["high"][i]
        l = q["low"][i]
        c = q["close"][i]
        if o is None or c is None:
            continue
        bars.append({
            "date": dt.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
            "open": float(o),
            "high": float(h or o),
            "low": float(l or c),
            "close": float(c),
        })
    return sorted(bars, key=lambda x: x["date"])


def sma(vals: List[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = []
    s = 0.0
    for i, v in enumerate(vals):
        s += v
        if i >= n:
            s -= vals[i - n]
        out.append(s / n if i >= n - 1 else None)
    return out


def stdev(vals: List[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = []
    for i in range(len(vals)):
        if i < n - 1:
            out.append(None)
        else:
            out.append(statistics.pstdev(vals[i - n + 1:i + 1]))
    return out


def percentile_rank(hist: Iterable[Optional[float]], x: Optional[float]) -> Optional[float]:
    if x is None:
        return None
    xs = [v for v in hist if v is not None]
    if not xs:
        return None
    return sum(1 for v in xs if v <= x) / len(xs)


def prev_series(source: List[Dict], target_dates: List[str]) -> List[Optional[Dict]]:
    out = []
    j = 0
    last = None
    for d in target_dates:
        while j < len(source) and source[j]["date"] < d:
            last = source[j]
            j += 1
        out.append(last)
    return out


def maxdd(pnls: List[float]) -> float:
    run = peak = 0.0
    m = 0.0
    for p in pnls:
        run += p
        peak = max(peak, run)
        m = min(m, run - peak)
    return m


def metrics(rows: List[Dict], start: Optional[str] = None, end: Optional[str] = None) -> Dict:
    xs = [r for r in rows if (start is None or r["date"] >= start) and (end is None or r["date"] <= end)]
    pnls = [r["pnl_yen"] for r in xs]
    total = sum(pnls)
    dd = maxdd(pnls)
    wins = sum(1 for p in pnls if p > 0)
    losses = sum(1 for p in pnls if p < 0)
    gp = sum(p for p in pnls if p > 0)
    gl = sum(p for p in pnls if p < 0)
    return {
        "trades": len(xs),
        "total_yen": round(total),
        "avg_yen": round(total / len(xs), 1) if xs else 0,
        "winrate": round(wins / (wins + losses) * 100, 1) if wins + losses else 0,
        "maxdd_yen": round(dd),
        "pf": round(gp / abs(gl), 3) if gl < 0 else None,
        "mar": round(total / abs(dd), 2) if dd else None,
    }


def rolling_survival(rows: List[Dict], horizon: int) -> Optional[Dict]:
    pnls = [r["pnl_yen"] for r in rows]
    if len(pnls) < horizon:
        return None
    profit = 0
    worst_total = None
    worst_dd = None
    for s in range(0, len(pnls) - horizon + 1):
        seg = pnls[s:s + horizon]
        total = sum(seg)
        dd = maxdd(seg)
        profit += total > 0
        worst_total = total if worst_total is None else min(worst_total, total)
        worst_dd = dd if worst_dd is None else min(worst_dd, dd)
    n = len(pnls) - horizon + 1
    return {"n": n, "profit_pct": round(profit / n * 100, 1), "worst_total_yen": round(worst_total), "worst_dd_yen": round(worst_dd)}


def build_rows() -> List[Dict]:
    n225 = fetch("^N225")
    dji = fetch("^DJI")
    try:
        vix = fetch("^VIX")
    except Exception:
        vix = []

    dates = [b["date"] for b in n225]
    prevny = prev_series(dji, dates)
    prevvix = prev_series(vix, dates) if vix else [None] * len(n225)

    cl = [b["close"] for b in n225]
    ma20 = sma(cl, 20)
    ma60 = sma(cl, 60)
    ma200 = sma(cl, 200)
    close_rets = [0.0] + [cl[i] - cl[i - 1] for i in range(1, len(cl))]
    vol20 = stdev(close_rets, 20)
    prev_intradays = [b["close"] - b["open"] for b in n225]

    rows = []
    for i, b in enumerate(n225):
        if i == 0 or b["date"] < "2011-01-01":
            continue
        prev = n225[i - 1]
        pp = n225[i - 2] if i >= 2 else prev
        ny = prevny[i]
        yube = b["open"] - prev["close"]
        if yube == 0:
            continue
        ysign = 1 if yube > 0 else -1
        nydiff = (ny["close"] - ny["open"]) if ny else 0.0
        nysign = 1 if nydiff > 0 else (-1 if nydiff < 0 else 0)
        pieces = 1 if (ysign + nysign) == 0 else 2
        intraday = b["close"] - b["open"]
        pnl = ysign * pieces * intraday * 10
        gap_abs = abs(yube)
        hist_gaps = [abs(n225[k]["open"] - n225[k - 1]["close"]) for k in range(max(1, i - 252), i)]
        hist_vol20 = [vol20[k] for k in range(max(20, i - 252), i)]
        vix_close = prevvix[i]["close"] if prevvix[i] else None
        hist_vix = []
        if vix_close is not None:
            # previous VIX observations before today's Nikkei date
            hist_vix = [x["close"] for x in vix if x["date"] < b["date"]][-252:]
        prev_gap = prev["open"] - pp["close"] if i >= 2 else 0.0
        prev_gap_sign = 1 if prev_gap > 0 else (-1 if prev_gap < 0 else 0)
        prev_intraday = prev["close"] - prev["open"]
        prev_intraday_sign = 1 if prev_intraday > 0 else (-1 if prev_intraday < 0 else 0)
        row = {
            "date": b["date"],
            "pnl_yen": pnl,
            "pnl_pt": pnl / 10,
            "yube": yube,
            "yube_sign": ysign,
            "gap_abs": gap_abs,
            "gap_pr": percentile_rank(hist_gaps, gap_abs),
            "base_pieces": pieces,
            "nydiff": nydiff,
            "ny_sign": nysign,
            "ny_same": pieces == 2,
            "intraday": intraday,
            "dow": dt.datetime.strptime(b["date"], "%Y-%m-%d").weekday(),
            "prev_ret": prev["close"] - pp["close"] if i >= 2 else 0.0,
            "prev_intraday": prev_intraday,
            "prev_intraday_sign": prev_intraday_sign,
            "prev_gap": prev_gap,
            "prev_gap_sign": prev_gap_sign,
            "prev_day_reversed_gap": prev_gap_sign != 0 and prev_intraday_sign == -prev_gap_sign,
            "above20": prev["close"] > ma20[i - 1] if ma20[i - 1] is not None else False,
            "above60": prev["close"] > ma60[i - 1] if ma60[i - 1] is not None else False,
            "above200": prev["close"] > ma200[i - 1] if ma200[i - 1] is not None else False,
            "vol20": vol20[i - 1],
            "vol20_pr": percentile_rank(hist_vol20, vol20[i - 1]),
            "vix": vix_close,
            "vix_pr": percentile_rank(hist_vix, vix_close) if hist_vix else None,
        }
        rows.append(row)
    # baseline previous loss streak feature, known after prior close
    last_pnls = []
    for idx, r in enumerate(rows):
        r["prev_loss1"] = idx >= 1 and rows[idx - 1]["pnl_yen"] < 0
        r["prev_loss2"] = idx >= 2 and rows[idx - 1]["pnl_yen"] < 0 and rows[idx - 2]["pnl_yen"] < 0
        last_pnls.append(r["pnl_yen"])
    return rows


def apply(rows: List[Dict], name: str, category: str, thesis: str, fn: Callable[[Dict], bool]) -> Dict:
    sel = [r for r in rows if fn(r)]
    return {
        "name": name,
        "category": category,
        "thesis": thesis,
        "full": metrics(sel),
        "train_2011_2020": metrics(sel, end="2020-12-31"),
        "test_2021_2026": metrics(sel, start="2021-01-01"),
        "rolling_1y": rolling_survival(sel, 252),
        "rolling_3y": rolling_survival(sel, 756),
    }


def main() -> None:
    rows = build_rows()
    policies = []
    add = lambda name, cat, thesis, fn: policies.append(apply(rows, name, cat, thesis, fn))
    add("baseline_S1", "baseline", "全営業日S1", lambda r: True)

    for th in [0.5, 0.7, 0.8, 0.9]:
        add(f"gap_pr_ge_{th}", "gap", f"過去1年比のギャップ分位が{int(th*100)}%以上だけ", lambda r, th=th: r["gap_pr"] is not None and r["gap_pr"] >= th)
    for lo, hi in [(0.0, 0.2), (0.2, 0.5), (0.5, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.01)]:
        add(f"gap_pr_band_{lo:.1f}_{hi:.1f}", "gap_band", f"ギャップ分位 {lo:.1f}-{hi:.1f}", lambda r, lo=lo, hi=hi: r["gap_pr"] is not None and lo <= r["gap_pr"] < hi)
    for th in [100, 200, 300, 500]:
        add(f"abs_gap_ge_{th}", "gap_abs", f"絶対ギャップ{th}円以上だけ", lambda r, th=th: r["gap_abs"] >= th)

    add("ny_same_only", "NY", "夕場方向とNY方向が同じ=2枚日だけ", lambda r: r["ny_same"])
    add("ny_opposite_only", "NY", "夕場方向とNY方向が逆=1枚日だけ", lambda r: not r["ny_same"])
    add("ny_up_only", "NY", "NY陽線後だけ", lambda r: r["ny_sign"] > 0)
    add("ny_down_only", "NY", "NY陰線後だけ", lambda r: r["ny_sign"] < 0)

    for ma in [20, 60, 200]:
        add(f"trend_aligned_ma{ma}", "trend", f"S1方向がMA{ma}トレンドと一致", lambda r, ma=ma: (r["yube_sign"] > 0 and r[f"above{ma}"]) or (r["yube_sign"] < 0 and not r[f"above{ma}"]))
        add(f"trend_contrarian_ma{ma}", "trend", f"S1方向がMA{ma}トレンドと逆", lambda r, ma=ma: not ((r["yube_sign"] > 0 and r[f"above{ma}"]) or (r["yube_sign"] < 0 and not r[f"above{ma}"])))

    for d, name in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri"]):
        add(f"only_{name}", "weekday", f"{name}だけ", lambda r, d=d: r["dow"] == d)
        add(f"skip_{name}", "weekday", f"{name}を除外", lambda r, d=d: r["dow"] != d)

    add("prev_intraday_same_as_today_gap", "overnight_intraday", "前日ザラ場方向と今日ギャップ方向が同じ", lambda r: r["prev_intraday_sign"] == r["yube_sign"])
    add("prev_intraday_opposite_today_gap", "overnight_intraday", "前日ザラ場方向と今日ギャップ方向が逆", lambda r: r["prev_intraday_sign"] == -r["yube_sign"])
    add("prev_day_reversed_own_gap", "overnight_intraday", "前日にovernightをザラ場で反転した後だけ", lambda r: r["prev_day_reversed_gap"])
    add("prev_day_followed_own_gap", "overnight_intraday", "前日にovernightをザラ場で順行した後だけ", lambda r: r["prev_gap_sign"] != 0 and r["prev_intraday_sign"] == r["prev_gap_sign"])

    add("prev_big_up_intraday_300", "prev_candle", "前日大陽線(ザラ場+300円以上)", lambda r: r["prev_intraday"] >= 300)
    add("prev_big_down_intraday_300", "prev_candle", "前日大陰線(ザラ場-300円以下)", lambda r: r["prev_intraday"] <= -300)
    add("skip_prev_big_abs_intraday_300", "prev_candle", "前日大陽/大陰線を除外", lambda r: abs(r["prev_intraday"]) < 300)
    add("skip_prev_big_abs_cc_500", "prev_candle", "前日終値ベース大変動±500円を除外", lambda r: abs(r["prev_ret"]) < 500)

    add("vix_pr_ge_0.8", "VIX", "VIX過去1年分位80%以上", lambda r: r["vix_pr"] is not None and r["vix_pr"] >= 0.8)
    add("vix_pr_lt_0.8", "VIX", "VIX過去1年分位80%未満", lambda r: r["vix_pr"] is not None and r["vix_pr"] < 0.8)
    add("vix_close_ge_25", "VIX", "VIX 25以上", lambda r: r["vix"] is not None and r["vix"] >= 25)
    add("vix_close_lt_25", "VIX", "VIX 25未満", lambda r: r["vix"] is not None and r["vix"] < 25)
    add("vol20_pr_ge_0.8", "volatility", "日経20日実現ボラ分位80%以上", lambda r: r["vol20_pr"] is not None and r["vol20_pr"] >= 0.8)
    add("vol20_pr_lt_0.8", "volatility", "日経20日実現ボラ分位80%未満", lambda r: r["vol20_pr"] is not None and r["vol20_pr"] < 0.8)

    add("skip_after_1_loss", "loss_streak", "前日S1負けなら停止", lambda r: not r["prev_loss1"])
    add("skip_after_2_losses", "loss_streak", "2連敗後だけ停止", lambda r: not r["prev_loss2"])
    add("only_after_2_losses", "loss_streak", "2連敗後だけ取引", lambda r: r["prev_loss2"])

    # Simple robust combinations: train-known gap filter + coarse risk/trend gates.
    add("gap08_and_vix_lt25", "combo", "gap>=80%かつVIX<25", lambda r: r["gap_pr"] is not None and r["gap_pr"] >= 0.8 and r["vix"] is not None and r["vix"] < 25)
    add("gap08_and_vol20_lt80", "combo", "gap>=80%かつ日経20日ボラ80%未満", lambda r: r["gap_pr"] is not None and r["gap_pr"] >= 0.8 and r["vol20_pr"] is not None and r["vol20_pr"] < 0.8)
    add("gap08_and_trend_ma20", "combo", "gap>=80%かつMA20順方向", lambda r: r["gap_pr"] is not None and r["gap_pr"] >= 0.8 and ((r["yube_sign"] > 0 and r["above20"]) or (r["yube_sign"] < 0 and not r["above20"])) )
    add("gap08_and_ny_same", "combo", "gap>=80%かつNY同方向", lambda r: r["gap_pr"] is not None and r["gap_pr"] >= 0.8 and r["ny_same"])
    add("gap08_and_prev_big_not", "combo", "gap>=80%かつ前日大線なし", lambda r: r["gap_pr"] is not None and r["gap_pr"] >= 0.8 and abs(r["prev_intraday"]) < 300)

    # Filter out too tiny test samples for ranking table, but keep all in JSON.
    ranked = sorted(
        [p for p in policies if p["test_2021_2026"]["trades"] >= 30],
        key=lambda p: ((p["test_2021_2026"]["mar"] or -999), p["test_2021_2026"]["total_yen"]),
        reverse=True,
    )
    by_cat = {}
    for p in policies:
        by_cat.setdefault(p["category"], []).append(p)
    for cat in by_cat:
        by_cat[cat].sort(key=lambda p: ((p["test_2021_2026"]["mar"] or -999), p["test_2021_2026"]["total_yen"]), reverse=True)

    summary = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "data_period": [rows[0]["date"], rows[-1]["date"]],
        "rows": len(rows),
        "policies": policies,
        "top_by_test_mar": ranked[:30],
        "best_by_category": {cat: vals[:5] for cat, vals in by_cat.items()},
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "condition_deep_scan.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    md = []
    md.append("# S1 condition deep scan")
    md.append(f"generated: {summary['generated_at']}")
    md.append(f"data: {summary['data_period'][0]} to {summary['data_period'][1]}, trades={summary['rows']}")
    md.append("")
    md.append("## Top by 2021-2026 MAR")
    md.append("|rank|policy|category|test trades|test total|test DD|test MAR|test win|train total|train DD|full total|full DD|rolling 1y profit%|")
    md.append("|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for i, p in enumerate(ranked[:25], 1):
        t = p["test_2021_2026"]; tr = p["train_2011_2020"]; f = p["full"]; r1 = p.get("rolling_1y") or {}
        md.append(f"|{i}|{p['name']}|{p['category']}|{t['trades']}|{t['total_yen']:,}|{t['maxdd_yen']:,}|{t['mar']}|{t['winrate']}%|{tr['total_yen']:,}|{tr['maxdd_yen']:,}|{f['total_yen']:,}|{f['maxdd_yen']:,}|{r1.get('profit_pct','-')}|")
    md.append("")
    md.append("## Best by category")
    for cat, vals in by_cat.items():
        md.append(f"### {cat}")
        md.append("|policy|thesis|test trades|test total|test DD|test MAR|train total|train DD|full total|full DD|")
        md.append("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
        for p in vals[:6]:
            t = p["test_2021_2026"]; tr = p["train_2011_2020"]; f = p["full"]
            md.append(f"|{p['name']}|{p['thesis']}|{t['trades']}|{t['total_yen']:,}|{t['maxdd_yen']:,}|{t['mar']}|{tr['total_yen']:,}|{tr['maxdd_yen']:,}|{f['total_yen']:,}|{f['maxdd_yen']:,}|")
        md.append("")
    with open(os.path.join(OUT_DIR, "condition_deep_scan.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    print("\n".join(md[:40]))


if __name__ == "__main__":
    main()
