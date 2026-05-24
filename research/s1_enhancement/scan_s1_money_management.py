#!/usr/bin/env python3
"""Money-management scan for TF Trading S1 (Nikkei 225 micro basis).

One unit = the existing S1 position sizing from scan_s1_policies.py:
- 1 micro when Yube and NY signs are opposite/flat-combined
- 2 micro when Yube and NY signs agree
P&L is therefore in JPY for micro contract(s), before slippage/tax.
"""
import datetime
import json
import math
import os
import statistics
import time
import urllib.request
from typing import Callable, Dict, Iterable, List, Optional, Tuple

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
START = int(datetime.datetime(2010, 1, 1).timestamp())
END = int(time.time()) + 86400
OUT_DIR = "/home/yugo/.hermes/skills/tf-trading/repo/research/s1_enhancement"
INITIAL_CAPITAL = 100_000


def fetch(sym: str) -> List[Dict]:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={START}&period2={END}&interval=1d"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
        j = json.load(r)
    res = j["chart"]["result"][0]
    ts = res["timestamp"]
    q = res["indicators"]["quote"][0]
    bars = []
    for i, t in enumerate(ts):
        o = q["open"][i]
        c = q["close"][i]
        h = q["high"][i]
        l = q["low"][i]
        if o is None or c is None:
            continue
        bars.append(
            {
                "date": datetime.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"),
                "open": float(o),
                "high": float(h or o),
                "low": float(l or c),
                "close": float(c),
            }
        )
    return sorted(bars, key=lambda x: x["date"])


def percentile_rank(hist: Iterable[Optional[float]], x: float) -> Optional[float]:
    xs = [v for v in hist if v is not None]
    if not xs:
        return None
    return sum(1 for v in xs if v <= x) / len(xs)


def build_s1_rows() -> List[Dict]:
    n225 = fetch("%5EN225")
    dji = fetch("%5EDJI")

    prevny = []
    j = 0
    last = None
    for b in n225:
        while j < len(dji) and dji[j]["date"] < b["date"]:
            last = dji[j]
            j += 1
        prevny.append(last)

    rows = []
    for i, b in enumerate(n225):
        if i == 0 or b["date"] < "2011-01-01":
            continue
        prev = n225[i - 1]
        ny = prevny[i]
        yube = b["open"] - prev["close"]
        if yube == 0:
            continue
        ysign = 1 if yube > 0 else -1
        nydiff = (ny["close"] - ny["open"]) if ny else 0
        nysign = 1 if nydiff > 0 else (-1 if nydiff < 0 else 0)
        pieces = 1 if (ysign + nysign) == 0 else 2
        intraday = b["close"] - b["open"]
        pnl_yen = ysign * pieces * intraday * 10
        gap_abs = abs(yube)
        hist_gaps = [abs(n225[k]["open"] - n225[k - 1]["close"]) for k in range(max(1, i - 252), i)]
        rows.append(
            {
                "date": b["date"],
                "pnl_yen": pnl_yen,
                "pnl_pt": pnl_yen / 10,
                "base_pieces": pieces,
                "yube": yube,
                "gap_abs": gap_abs,
                "gap_pr": percentile_rank(hist_gaps, gap_abs),
                "dow": datetime.datetime.strptime(b["date"], "%Y-%m-%d").weekday(),
            }
        )
    return rows


def maxdd(pnls: List[float]) -> float:
    run = peak = 0.0
    m = 0.0
    for p in pnls:
        run += p
        peak = max(peak, run)
        m = min(m, run - peak)
    return m


def required_capital_from_any_start(pnls: List[float]) -> Dict:
    """Capital needed so starting on any trade never goes <= 0 before future profits."""
    reqs = []
    worst_start = None
    worst_end = None
    worst_req = 0.0
    for s in range(len(pnls)):
        run = 0.0
        mn = 0.0
        mn_i = s
        for e, p in enumerate(pnls[s:], s):
            run += p
            if run < mn:
                mn = run
                mn_i = e
        req = -mn
        reqs.append(req)
        if req > worst_req:
            worst_req = req
            worst_start = s
            worst_end = mn_i
    reqs_sorted = sorted(reqs)

    def q(p: float) -> float:
        if not reqs_sorted:
            return 0.0
        idx = min(len(reqs_sorted) - 1, max(0, math.ceil(len(reqs_sorted) * p) - 1))
        return reqs_sorted[idx]

    return {
        "starts": len(reqs),
        "required_capital_50pct": round(q(0.50)),
        "required_capital_80pct": round(q(0.80)),
        "required_capital_90pct": round(q(0.90)),
        "required_capital_95pct": round(q(0.95)),
        "required_capital_99pct": round(q(0.99)),
        "required_capital_100pct": round(worst_req),
        "worst_start_index": worst_start,
        "worst_end_index": worst_end,
    }


def rolling_survival(pnls: List[float], cap: float, horizon: int) -> Optional[Dict]:
    n = max(0, len(pnls) - horizon + 1)
    if n == 0:
        return None
    survive = profit = both = 0
    min_ending = None
    for s in range(n):
        eq = cap
        mn = cap
        for p in pnls[s : s + horizon]:
            eq += p
            mn = min(mn, eq)
        a = mn > 0
        b = eq > cap
        survive += a
        profit += b
        both += a and b
        min_ending = eq if min_ending is None else min(min_ending, eq)
    return {
        "windows": n,
        "survive_pct": round(survive / n * 100, 1),
        "profit_pct": round(profit / n * 100, 1),
        "both_pct": round(both / n * 100, 1),
        "worst_end_equity": round(min_ending),
    }


class Plan:
    def __init__(self, name: str, fn: Callable[[Dict], int], note: str):
        self.name = name
        self.fn = fn
        self.note = note


def simulate(rows: List[Dict], plan: Plan, start: Optional[str] = None, end: Optional[str] = None, cap: int = INITIAL_CAPITAL) -> Dict:
    selected = [r for r in rows if (start is None or r["date"] >= start) and (end is None or r["date"] <= end)]
    state = {
        "initial": cap,
        "equity": float(cap),
        "peak": float(cap),
        "max_equity": float(cap),
        "last_units": None,
        "loss_streak": 0,
        "trade_index": 0,
    }
    pnls = []
    units_seq = []
    unit_changes = 0
    min_equity = float(cap)
    max_day_loss = 0.0
    win = loss = 0
    for r in selected:
        state["drawdown"] = state["equity"] - state["peak"]
        units = int(plan.fn(state))
        units = max(0, units)
        if state["last_units"] is not None and units != state["last_units"]:
            unit_changes += 1
        state["last_units"] = units
        p = r["pnl_yen"] * units
        pnls.append(p)
        units_seq.append(units)
        if p > 0:
            win += 1
        elif p < 0:
            loss += 1
        max_day_loss = min(max_day_loss, p)
        state["equity"] += p
        state["peak"] = max(state["peak"], state["equity"])
        state["max_equity"] = max(state["max_equity"], state["equity"])
        min_equity = min(min_equity, state["equity"])
        state["loss_streak"] = state["loss_streak"] + 1 if p < 0 else 0
        state["trade_index"] += 1
    total = sum(pnls)
    dd = maxdd(pnls)
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(p for p in pnls if p < 0)
    return {
        "trades": len(selected),
        "total_yen": round(total),
        "end_equity_10万": round(cap + total),
        "min_equity_10万": round(min_equity),
        "survive_10万": min_equity > 0,
        "maxdd_yen": round(dd),
        "max_day_loss_yen": round(max_day_loss),
        "winrate": round(win / (win + loss) * 100, 1) if win + loss else 0,
        "pf": round(gross_profit / abs(gross_loss), 3) if gross_loss < 0 else None,
        "mar": round(total / abs(dd), 2) if dd else None,
        "max_units": max(units_seq) if units_seq else 0,
        "avg_units": round(sum(units_seq) / len(units_seq), 2) if units_seq else 0,
        "unit_changes": unit_changes,
    }


def make_plans() -> List[Plan]:
    plans = []
    for n in [1, 2, 3]:
        plans.append(Plan(f"fixed_{n}u", lambda st, n=n: n, f"常に{n}ユニット"))

    # Rebalanced equity steps: add/decrease units according to current equity above initial.
    for step in [100_000, 200_000, 300_000, 500_000]:
        for cap_units in [3, 5, 10]:
            plans.append(
                Plan(
                    f"equity_rebalanced_step{step//10000}万_cap{cap_units}",
                    lambda st, step=step, cap_units=cap_units: min(cap_units, 1 + max(0, int((st["equity"] - st["initial"]) // step))),
                    f"現在資金が初期+{step:,}円増えるごとに+1、落ちたら減らす、上限{cap_units}u",
                )
            )

    # Sticky new-high steps: only increase after realized equity high exceeds threshold; do not downshift.
    for step in [100_000, 200_000, 300_000, 500_000]:
        for cap_units in [3, 5, 10]:
            plans.append(
                Plan(
                    f"new_high_sticky_step{step//10000}万_cap{cap_units}",
                    lambda st, step=step, cap_units=cap_units: min(cap_units, 1 + max(0, int((st["max_equity"] - st["initial"]) // step))),
                    f"過去最高資金が初期+{step:,}円を超えるごとに+1、以後戻さない、上限{cap_units}u",
                )
            )

    # Drawdown/recovery boosts: add size while in drawdown from peak.
    for dd_th in [20_000, 30_000, 50_000, 80_000, 100_000]:
        plans.append(
            Plan(
                f"dd_boost_2u_after{dd_th//10000}万DD",
                lambda st, dd_th=dd_th: 2 if st["drawdown"] <= -dd_th else 1,
                f"ピークから{dd_th:,}円以上DD中だけ2u",
            )
        )
        plans.append(
            Plan(
                f"dd_boost_3u_after{dd_th//10000}万DD",
                lambda st, dd_th=dd_th: 3 if st["drawdown"] <= -dd_th else 1,
                f"ピークから{dd_th:,}円以上DD中だけ3u",
            )
        )

    # Loss-streak boosts, a simpler proxy for DD-after sizing.
    plans.append(Plan("after_1_loss_2u", lambda st: 2 if st["loss_streak"] >= 1 else 1, "前回負け後だけ2u"))
    plans.append(Plan("after_2_losses_2u", lambda st: 2 if st["loss_streak"] >= 2 else 1, "2連敗後だけ2u"))
    plans.append(Plan("after_2_losses_3u", lambda st: 3 if st["loss_streak"] >= 2 else 1, "2連敗後だけ3u"))
    return plans


def filter_rows(rows: List[Dict], policy: str) -> List[Dict]:
    if policy == "baseline_S1":
        return list(rows)
    if policy == "gap_pr_ge_0.8":
        return [r for r in rows if r["gap_pr"] is not None and r["gap_pr"] >= 0.8]
    if policy == "gap_pr_ge_0.7":
        return [r for r in rows if r["gap_pr"] is not None and r["gap_pr"] >= 0.7]
    if policy == "abs_gap_ge_100":
        return [r for r in rows if r["gap_abs"] >= 100]
    raise ValueError(policy)


def fmt_yen(v) -> str:
    if v is None:
        return "-"
    return f"{int(round(v)):,}"


def main() -> None:
    rows = build_s1_rows()
    policies = ["baseline_S1", "gap_pr_ge_0.8", "gap_pr_ge_0.7", "abs_gap_ge_100"]
    plans = make_plans()
    all_results = []
    for pol in policies:
        pr = filter_rows(rows, pol)
        base_pnls = [r["pnl_yen"] for r in pr]
        capital = required_capital_from_any_start(base_pnls)
        if capital["worst_start_index"] is not None:
            capital["worst_start_date"] = pr[capital["worst_start_index"]]["date"]
            capital["worst_end_date"] = pr[capital["worst_end_index"]]["date"]
        stress = {
            "policy": pol,
            "trades": len(pr),
            "total_yen_fixed_1u": round(sum(base_pnls)),
            "maxdd_yen_fixed_1u": round(maxdd(base_pnls)),
            "max_day_loss_yen_fixed_1u": round(min(base_pnls) if base_pnls else 0),
            "required_capital_from_any_start": capital,
            "rolling_1y_10万": rolling_survival(base_pnls, INITIAL_CAPITAL, 252),
            "rolling_3y_10万": rolling_survival(base_pnls, INITIAL_CAPITAL, 756),
        }
        for plan in plans:
            res = {
                "policy": pol,
                "plan": plan.name,
                "note": plan.note,
                "full": simulate(pr, plan),
                "train_2011_2020": simulate(pr, plan, end="2020-12-31"),
                "test_2021_2026": simulate(pr, plan, start="2021-01-01"),
            }
            res["stress_fixed_1u"] = stress
            all_results.append(res)

    # A conservative rank: must survive 100k both full/test, then maximize test total with DD penalty.
    def score(x: Dict) -> Tuple:
        f = x["full"]
        t = x["test_2021_2026"]
        ok = f["survive_10万"] and t["survive_10万"]
        return (ok, t["total_yen"] / max(1, abs(t["maxdd_yen"])), f["total_yen"] / max(1, abs(f["maxdd_yen"])), t["total_yen"])

    ranked = sorted(all_results, key=score, reverse=True)
    baseline_results = [r for r in all_results if r["policy"] == "baseline_S1"]
    baseline_ranked = sorted(baseline_results, key=score, reverse=True)

    # Also rank by total to see aggressive variants, separately.
    aggressive = sorted(
        [r for r in all_results if r["full"]["survive_10万"] and r["test_2021_2026"]["survive_10万"]],
        key=lambda x: (x["test_2021_2026"]["total_yen"], x["full"]["total_yen"]),
        reverse=True,
    )

    summary = {
        "generated_at": datetime.datetime.now().isoformat(),
        "data_period": [rows[0]["date"], rows[-1]["date"]],
        "initial_capital_yen": INITIAL_CAPITAL,
        "unit_definition": "1u = existing S1 micro sizing; 1 or 2 micro depending on Yube/NY agreement",
        "top_by_risk_adjusted_score": ranked[:40],
        "baseline_policy_top": baseline_ranked[:40],
        "top_by_test_total_survivors": aggressive[:40],
        "stress_by_policy": {pol: next(r["stress_fixed_1u"] for r in all_results if r["policy"] == pol) for pol in policies},
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    json_path = os.path.join(OUT_DIR, "money_management_scan.json")
    md_path = os.path.join(OUT_DIR, "money_management_scan.md")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    md = []
    md.append("# S1 money management scan")
    md.append(f"generated: {summary['generated_at']}")
    md.append(f"data: {summary['data_period'][0]} to {summary['data_period'][1]}")
    md.append(f"initial capital: {INITIAL_CAPITAL:,} yen")
    md.append("unit: 1u = existing S1 micro sizing (1 or 2 micro by Yube/NY agreement)")
    md.append("")
    md.append("## Fixed 1u stress / start timing")
    md.append("|policy|trades|total|maxDD|max 1-day loss|required capital 95%|required capital 100%|worst start -> trough|1y profit%|3y profit%|")
    md.append("|---|---:|---:|---:|---:|---:|---:|---|---:|---:|")
    for pol, st in summary["stress_by_policy"].items():
        cap = st["required_capital_from_any_start"]
        r1 = st["rolling_1y_10万"] or {}
        r3 = st["rolling_3y_10万"] or {}
        md.append(
            f"|{pol}|{st['trades']}|{fmt_yen(st['total_yen_fixed_1u'])}|{fmt_yen(st['maxdd_yen_fixed_1u'])}|{fmt_yen(st['max_day_loss_yen_fixed_1u'])}|"
            f"{fmt_yen(cap['required_capital_95pct'])}|{fmt_yen(cap['required_capital_100pct'])}|{cap.get('worst_start_date','-')} -> {cap.get('worst_end_date','-')}|"
            f"{r1.get('profit_pct','-')}|{r3.get('profit_pct','-')}|"
        )
    md.append("")
    md.append("## Baseline S1 money-management variants (risk-adjusted)")
    md.append("|rank|plan|test total|test DD|test MAR|full total|full DD|max units|avg units|changes|min equity|note|")
    md.append("|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|")
    for i, r in enumerate(baseline_ranked[:20], 1):
        t = r["test_2021_2026"]
        f = r["full"]
        md.append(
            f"|{i}|{r['plan']}|{fmt_yen(t['total_yen'])}|{fmt_yen(t['maxdd_yen'])}|{t['mar']}|{fmt_yen(f['total_yen'])}|{fmt_yen(f['maxdd_yen'])}|"
            f"{f['max_units']}|{f['avg_units']}|{f['unit_changes']}|{fmt_yen(f['min_equity_10万'])}|{r['note']}|"
        )
    md.append("")
    md.append("## All policies: top risk-adjusted")
    md.append("|rank|policy|plan|test total|test DD|test MAR|full total|full DD|max units|min equity|note|")
    md.append("|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|")
    for i, r in enumerate(ranked[:20], 1):
        t = r["test_2021_2026"]
        f = r["full"]
        md.append(
            f"|{i}|{r['policy']}|{r['plan']}|{fmt_yen(t['total_yen'])}|{fmt_yen(t['maxdd_yen'])}|{t['mar']}|{fmt_yen(f['total_yen'])}|{fmt_yen(f['maxdd_yen'])}|"
            f"{f['max_units']}|{fmt_yen(f['min_equity_10万'])}|{r['note']}|"
        )
    md.append("")
    md.append("## Aggressive survivors by 2021-2026 total")
    md.append("|rank|policy|plan|test total|test DD|full total|full DD|max units|avg units|min equity|note|")
    md.append("|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|")
    for i, r in enumerate(aggressive[:20], 1):
        t = r["test_2021_2026"]
        f = r["full"]
        md.append(
            f"|{i}|{r['policy']}|{r['plan']}|{fmt_yen(t['total_yen'])}|{fmt_yen(t['maxdd_yen'])}|{fmt_yen(f['total_yen'])}|{fmt_yen(f['maxdd_yen'])}|"
            f"{f['max_units']}|{f['avg_units']}|{fmt_yen(f['min_equity_10万'])}|{r['note']}|"
        )
    md.append("")
    md.append("## Working interpretation")
    md.append("- Sizing does not change hit-rate; it changes path risk and yen P&L. Winrate changes only if the trade filter changes.")
    md.append("- Drawdown-after boost is intentionally included as a hypothesis test; treat it as dangerous unless it improves both full and test MAR with acceptable min equity.")
    md.append("- Sticky new-high / equity-step variants are the candidates for 'when to size up after profits'.")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")

    print("\n".join(md[:80]))
    print(f"\nwrote: {json_path}\nwrote: {md_path}")


if __name__ == "__main__":
    main()
