#!/usr/bin/env python3
"""Extended money-management comparisons for TF Trading S1.

No orders / no external state changes. Fetches historical Yahoo data and writes local reports only.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import sys
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)

from scan_s1_money_management import (  # noqa: E402
    INITIAL_CAPITAL,
    build_s1_rows,
    filter_rows,
    maxdd,
    required_capital_from_any_start,
)

OUT_DIR = HERE


@dataclass
class Plan:
    name: str
    fn: Callable[[Dict], int]
    note: str


def _profit_units(equity: float, initial: float, step: int, cap_units: int) -> int:
    return min(cap_units, 1 + max(0, int((equity - initial) // step)))


def make_extended_plans() -> List[Plan]:
    plans: List[Plan] = []
    for n in [1, 2, 3, 5, 10]:
        plans.append(Plan(f"fixed_{n}u", lambda st, n=n: n, f"固定{n}u"))

    for step in [100_000, 200_000, 300_000, 500_000]:
        for cap_units in [3, 5, 10]:
            step_label = f"{step // 10000}万"
            plans.append(
                Plan(
                    f"profit_rebalanced_step{step_label}_cap{cap_units}",
                    lambda st, step=step, cap_units=cap_units: _profit_units(st["equity"], st["initial"], step, cap_units),
                    f"現在利益が{step_label}円増えるごとに+1u、DD中は減らす、上限{cap_units}u",
                )
            )
            plans.append(
                Plan(
                    f"new_high_sticky_step{step_label}_cap{cap_units}",
                    lambda st, step=step, cap_units=cap_units: _profit_units(st["max_equity"], st["initial"], step, cap_units),
                    f"過去最高益が{step_label}円増えるごとに+1u、以後落とさない、上限{cap_units}u",
                )
            )
            plans.append(
                Plan(
                    f"dd_recovered_step{step_label}_cap{cap_units}",
                    lambda st, step=step, cap_units=cap_units: max(
                        st.get("last_units") or 1,
                        _profit_units(st["max_equity"], st["initial"], step, cap_units)
                        if st["equity"] >= st["peak"]
                        else (st.get("last_units") or 1),
                    ),
                    f"利益閾値到達後もDD中は増やさず、高値/DD回復確認後に+1u、上限{cap_units}u",
                )
            )
            plans.append(
                Plan(
                    f"monthly_profit_step{step_label}_cap{cap_units}",
                    lambda st, step=step, cap_units=cap_units: monthly_units(st, "equity", step, cap_units),
                    f"月初だけ現在利益で見直し（{step_label}円ごと+1u、DD中は減る）、上限{cap_units}u",
                )
            )
            plans.append(
                Plan(
                    f"monthly_new_high_step{step_label}_cap{cap_units}",
                    lambda st, step=step, cap_units=cap_units: monthly_units(st, "max_equity", step, cap_units),
                    f"月初だけ過去最高益で見直し（{step_label}円ごと+1u、sticky）、上限{cap_units}u",
                )
            )
    return plans


def monthly_units(st: Dict, basis: str, step: int, cap_units: int) -> int:
    month = st["date"][:7]
    key = (basis, step, cap_units)
    locks = st.setdefault("monthly_locks", {})
    if key not in locks or st.get("last_month") != month:
        locks[key] = _profit_units(st[basis], st["initial"], step, cap_units)
    return locks[key]


def simulate(rows: List[Dict], plan: Plan, start: Optional[str] = None, end: Optional[str] = None, cap: int = INITIAL_CAPITAL) -> Dict:
    selected = [r for r in rows if (start is None or r["date"] >= start) and (end is None or r["date"] <= end)]
    st: Dict = {
        "initial": float(cap),
        "equity": float(cap),
        "peak": float(cap),
        "max_equity": float(cap),
        "last_units": None,
        "last_month": None,
        "monthly_locks": {},
        "loss_streak": 0,
    }
    pnls: List[float] = []
    units_seq: List[int] = []
    unit_changes = 0
    min_equity = float(cap)
    max_day_loss = 0.0
    win = loss = 0
    for r in selected:
        st["date"] = r["date"]
        st["drawdown"] = st["equity"] - st["peak"]
        units = max(0, int(plan.fn(st)))
        if st["last_units"] is not None and units != st["last_units"]:
            unit_changes += 1
        st["last_units"] = units
        p = r["pnl_yen"] * units
        pnls.append(p)
        units_seq.append(units)
        if p > 0:
            win += 1
        elif p < 0:
            loss += 1
        max_day_loss = min(max_day_loss, p)
        st["equity"] += p
        st["peak"] = max(st["peak"], st["equity"])
        st["max_equity"] = max(st["max_equity"], st["equity"])
        min_equity = min(min_equity, st["equity"])
        st["loss_streak"] = st["loss_streak"] + 1 if p < 0 else 0
        st["last_month"] = r["date"][:7]
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(p for p in pnls if p < 0)
    total = sum(pnls)
    dd = maxdd(pnls)
    return {
        "trades": len(selected),
        "total_yen": round(total),
        "maxdd_yen": round(dd),
        "max_day_loss_yen": round(max_day_loss),
        "end_equity_10万": round(cap + total),
        "min_equity_10万": round(min_equity),
        "survive_10万": min_equity > 0,
        "winrate": round(win / (win + loss) * 100, 1) if win + loss else 0,
        "pf": round(gross_profit / abs(gross_loss), 3) if gross_loss < 0 else None,
        "mar": round(total / abs(dd), 2) if dd else None,
        "max_units": max(units_seq) if units_seq else 0,
        "avg_units": round(sum(units_seq) / len(units_seq), 2) if units_seq else 0,
        "unit_changes": unit_changes,
    }


def any_start_required_dynamic(rows: List[Dict], plan: Plan) -> Dict:
    reqs: List[float] = []
    worst_req = 0.0
    worst_start = worst_end = None
    n = len(rows)
    for s in range(n):
        st: Dict = {
            "initial": 0.0,
            "equity": 0.0,
            "peak": 0.0,
            "max_equity": 0.0,
            "last_units": None,
            "last_month": None,
            "monthly_locks": {},
            "loss_streak": 0,
        }
        mn = 0.0
        mn_i = s
        for e, r in enumerate(rows[s:], s):
            st["date"] = r["date"]
            st["drawdown"] = st["equity"] - st["peak"]
            units = max(0, int(plan.fn(st)))
            st["last_units"] = units
            p = r["pnl_yen"] * units
            st["equity"] += p
            if st["equity"] < mn:
                mn = st["equity"]
                mn_i = e
            st["peak"] = max(st["peak"], st["equity"])
            st["max_equity"] = max(st["max_equity"], st["equity"])
            st["loss_streak"] = st["loss_streak"] + 1 if p < 0 else 0
            st["last_month"] = r["date"][:7]
        req = -mn
        reqs.append(req)
        if req > worst_req:
            worst_req = req
            worst_start = s
            worst_end = mn_i
    reqs_sorted = sorted(reqs)

    def q(p: float) -> int:
        if not reqs_sorted:
            return 0
        idx = min(len(reqs_sorted) - 1, max(0, math.ceil(len(reqs_sorted) * p) - 1))
        return round(reqs_sorted[idx])

    return {
        "starts": len(reqs),
        "required_capital_90pct": q(0.90),
        "required_capital_95pct": q(0.95),
        "required_capital_99pct": q(0.99),
        "required_capital_100pct": round(worst_req),
        "worst_start_date": rows[worst_start]["date"] if worst_start is not None else None,
        "worst_end_date": rows[worst_end]["date"] if worst_end is not None else None,
    }


def add_years_approx(d: dt.date, years: int) -> dt.date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(month=2, day=28, year=d.year + years)


def month_starts(first: str, last: str, years: int) -> List[str]:
    f = dt.date.fromisoformat(first).replace(day=1)
    l = dt.date.fromisoformat(last)
    out = []
    cur = f
    while add_years_approx(cur, years) <= l:
        out.append(cur.isoformat())
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)
    return out


def rolling_calendar(rows: List[Dict], plan: Plan, years: int) -> Dict:
    starts = month_starts(rows[0]["date"], rows[-1]["date"], years)
    totals = []
    dds = []
    wins = 0
    for s in starts:
        e = (add_years_approx(dt.date.fromisoformat(s), years) - dt.timedelta(days=1)).isoformat()
        res = simulate(rows, plan, start=s, end=e)
        totals.append(res["total_yen"])
        dds.append(res["maxdd_yen"])
        wins += res["total_yen"] > 0
    totals_sorted = sorted(totals)
    return {
        "years": years,
        "windows": len(starts),
        "profit_pct": round(wins / len(starts) * 100, 1) if starts else None,
        "worst_total_yen": min(totals) if totals else None,
        "median_total_yen": round(totals_sorted[len(totals_sorted) // 2]) if totals else None,
        "worst_maxdd_yen": min(dds) if dds else None,
    }


def fmt(v) -> str:
    if v is None:
        return "-"
    return f"{int(round(v)):,}"


def risk_basis_table(pol: str, rows: List[Dict]) -> List[Dict]:
    train = [r for r in rows if r["date"] <= "2020-12-31"]
    test = [r for r in rows if r["date"] >= "2021-01-01"]
    train_p = [r["pnl_yen"] for r in train]
    day_loss = abs(min(train_p)) if train_p else 0
    cum_dd = abs(maxdd(train_p)) if train_p else 0
    out = []
    for budget in [100_000, 200_000, 300_000]:
        for basis, denom in [("1日最大損失基準", day_loss), ("累積DD基準", cum_dd)]:
            units = max(1, min(10, int(budget // max(1, denom))))
            plan = Plan(f"risk_{basis}_{budget}_{units}u", lambda st, units=units: units, f"trainの{basis}で{budget:,}円以内になる最大固定u")
            out.append(
                {
                    "policy": pol,
                    "budget_yen": budget,
                    "basis": basis,
                    "train_1u_max_day_loss": round(-day_loss),
                    "train_1u_maxdd": round(-cum_dd),
                    "units": units,
                    "train": simulate(train, plan),
                    "test": simulate(test, plan),
                    "full": simulate(rows, plan),
                }
            )
    return out


def main() -> None:
    rows_all = build_s1_rows()
    policies = ["baseline_S1", "gap_pr_ge_0.8", "gap_pr_ge_0.7", "abs_gap_ge_100"]
    plans = make_extended_plans()
    all_results = []
    risk_rows = []
    rolling_focus = []
    start_risk_focus = []

    for pol in policies:
        rows = filter_rows(rows_all, pol)
        risk_rows.extend(risk_basis_table(pol, rows))
        for plan in plans:
            rec = {
                "policy": pol,
                "plan": plan.name,
                "note": plan.note,
                "full": simulate(rows, plan),
                "train_2011_2020": simulate(rows, plan, end="2020-12-31"),
                "test_2021_2026": simulate(rows, plan, start="2021-01-01"),
            }
            all_results.append(rec)

        focus_names = [
            "fixed_1u",
            "fixed_3u",
            "new_high_sticky_step10万_cap3",
            "profit_rebalanced_step10万_cap3",
            "monthly_new_high_step10万_cap3",
            "monthly_profit_step10万_cap3",
            "new_high_sticky_step20万_cap5",
        ]
        focus_plans = [p for p in plans if p.name in focus_names]
        for p in focus_plans:
            rolling_focus.append(
                {
                    "policy": pol,
                    "plan": p.name,
                    "rolling_1y": rolling_calendar(rows, p, 1),
                    "rolling_3y": rolling_calendar(rows, p, 3),
                    "rolling_5y": rolling_calendar(rows, p, 5),
                }
            )
        for p in [p for p in focus_plans if p.name in ["fixed_1u", "fixed_3u", "new_high_sticky_step10万_cap3", "monthly_new_high_step10万_cap3"]]:
            start_risk_focus.append({"policy": pol, "plan": p.name, **any_start_required_dynamic(rows, p)})

    def score(rec: Dict) -> Tuple:
        t = rec["test_2021_2026"]
        f = rec["full"]
        ok = t["survive_10万"] and f["survive_10万"]
        return (ok, t["total_yen"] / max(1, abs(t["maxdd_yen"])), f["total_yen"] / max(1, abs(f["maxdd_yen"])), t["total_yen"])

    ranked = sorted(all_results, key=score, reverse=True)
    aggressive = sorted(
        [r for r in all_results if r["test_2021_2026"]["survive_10万"] and r["full"]["survive_10万"]],
        key=lambda r: (r["test_2021_2026"]["total_yen"], -abs(r["test_2021_2026"]["maxdd_yen"])),
        reverse=True,
    )

    summary = {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "data_period": [rows_all[0]["date"], rows_all[-1]["date"]],
        "policies": policies,
        "top_risk_adjusted": ranked[:60],
        "top_total": aggressive[:60],
        "risk_basis_table": risk_rows,
        "rolling_focus": rolling_focus,
        "start_risk_focus": start_risk_focus,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    json_path = os.path.join(OUT_DIR, "money_management_extended_scan.json")
    md_path = os.path.join(OUT_DIR, "money_management_extended_scan.md")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    md: List[str] = []
    md.append("# S1 extended money-management scan")
    md.append(f"generated: {summary['generated_at']}")
    md.append(f"data: {summary['data_period'][0]} to {summary['data_period'][1]}")
    md.append("unit: 1u = existing S1 micro sizing (1 or 2 micro by Yube/NY agreement)")
    md.append("")
    md.append("## 1) Top risk-adjusted / train-test checked")
    md.append("|rank|policy|plan|test total|test DD|test MAR|full total|full DD|max u|avg u|changes|note|")
    md.append("|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|")
    for i, r in enumerate(ranked[:25], 1):
        t = r["test_2021_2026"]
        f = r["full"]
        md.append(f"|{i}|{r['policy']}|{r['plan']}|{fmt(t['total_yen'])}|{fmt(t['maxdd_yen'])}|{t['mar']}|{fmt(f['total_yen'])}|{fmt(f['maxdd_yen'])}|{f['max_units']}|{f['avg_units']}|{f['unit_changes']}|{r['note']}|")
    md.append("")
    md.append("## 2) Fixed vs profit add-on timing (selected)")
    md.append("|policy|plan|train total|train DD|test total|test DD|test MAR|full total|full DD|max u|note|")
    md.append("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|")
    selected_names = {
        "fixed_1u",
        "fixed_3u",
        "profit_rebalanced_step10万_cap3",
        "new_high_sticky_step10万_cap3",
        "dd_recovered_step10万_cap3",
        "monthly_profit_step10万_cap3",
        "monthly_new_high_step10万_cap3",
        "new_high_sticky_step20万_cap5",
    }
    for pol in policies:
        rows = [r for r in all_results if r["policy"] == pol and r["plan"] in selected_names]
        rows = sorted(rows, key=lambda r: (r["plan"] != "fixed_1u", r["plan"]))
        for r in rows:
            tr = r["train_2011_2020"]
            te = r["test_2021_2026"]
            fu = r["full"]
            md.append(f"|{pol}|{r['plan']}|{fmt(tr['total_yen'])}|{fmt(tr['maxdd_yen'])}|{fmt(te['total_yen'])}|{fmt(te['maxdd_yen'])}|{te['mar']}|{fmt(fu['total_yen'])}|{fmt(fu['maxdd_yen'])}|{fu['max_units']}|{r['note']}|")
    md.append("")
    md.append("## 3) 1-day loss basis vs cumulative-DD basis (units chosen from 2011-2020 train only)")
    md.append("|policy|budget|basis|train 1u day loss|train 1u DD|units|test total|test DD|test max day loss|full DD|")
    md.append("|---|---:|---|---:|---:|---:|---:|---:|---:|---:|")
    for r in risk_rows:
        if r["budget_yen"] in [100_000, 200_000]:
            te = r["test"]
            fu = r["full"]
            md.append(f"|{r['policy']}|{fmt(r['budget_yen'])}|{r['basis']}|{fmt(r['train_1u_max_day_loss'])}|{fmt(r['train_1u_maxdd'])}|{r['units']}|{fmt(te['total_yen'])}|{fmt(te['maxdd_yen'])}|{fmt(te['max_day_loss_yen'])}|{fmt(fu['maxdd_yen'])}|")
    md.append("")
    md.append("## 4) Start-immediately drawdown risk (reset at any historical trade start)")
    md.append("|policy|plan|starts|req cap 95%|req cap 99%|req cap worst|worst start -> trough|")
    md.append("|---|---|---:|---:|---:|---:|---|")
    for r in start_risk_focus:
        md.append(f"|{r['policy']}|{r['plan']}|{r['starts']}|{fmt(r['required_capital_95pct'])}|{fmt(r['required_capital_99pct'])}|{fmt(r['required_capital_100pct'])}|{r['worst_start_date']} -> {r['worst_end_date']}|")
    md.append("")
    md.append("## 5) Rolling 1y / 3y / 5y (selected, calendar-month starts)")
    md.append("|policy|plan|1y profit%|1y worst total|1y worst DD|3y profit%|3y worst total|3y worst DD|5y profit%|5y worst total|5y worst DD|")
    md.append("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in rolling_focus:
        if r["plan"] in ["fixed_1u", "new_high_sticky_step10万_cap3", "monthly_new_high_step10万_cap3"]:
            a, b, c = r["rolling_1y"], r["rolling_3y"], r["rolling_5y"]
            md.append(f"|{r['policy']}|{r['plan']}|{a['profit_pct']}|{fmt(a['worst_total_yen'])}|{fmt(a['worst_maxdd_yen'])}|{b['profit_pct']}|{fmt(b['worst_total_yen'])}|{fmt(b['worst_maxdd_yen'])}|{c['profit_pct']}|{fmt(c['worst_total_yen'])}|{fmt(c['worst_maxdd_yen'])}|")
    md.append("")
    md.append("## Working notes")
    md.append("- Position sizing changes yen P&L and path risk, not entry hit-rate. Accuracy improvement must come from trade filter; size-up is capital efficiency/risk policy.")
    md.append("- 1-day-loss sizing generally allows more units than cumulative-DD sizing; if consecutive losses cluster, 1-day basis is under-capitalized.")
    md.append("- gap_pr>=0.8 remains the strongest filter in both train/test; but it cuts trades sharply, so execution slippage and missed signals need separate validation.")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")

    print("\n".join(md[:90]))
    print(f"\nwrote: {json_path}\nwrote: {md_path}")


if __name__ == "__main__":
    main()
