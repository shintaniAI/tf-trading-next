from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from .broker import make_broker
from .calendar import check_market_date, parse_date
from .config import load_config
from .contracts import ibkr_contract_hint
from .market_data import fetch_signal_data
from .notify import notify
from .risk import RiskGuard
from .store import JsonStore
from .strategy import POLICIES, generate_signal


def print_json(obj) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2, default=str))


def build_context(range_: str = "2y"):
    cfg = load_config()
    store = JsonStore(cfg.data_dir / "orders.json")
    broker = make_broker(cfg, store)
    guard = RiskGuard(cfg, store)
    n225, dji = fetch_signal_data(range_)
    signal = generate_signal(n225, dji, cfg.policy)
    return cfg, store, broker, guard, signal


def cmd_health(args) -> int:
    cfg = load_config()
    store = JsonStore(cfg.data_dir / "orders.json")
    broker = make_broker(cfg, store)
    target = parse_date(cfg.trading_date)
    market = check_market_date(target, avoid_sq_day=cfg.avoid_sq_day)
    result = broker.health()
    print_json({
        "ok": result.ok,
        "message": result.message,
        "config": {
            "broker": cfg.broker,
            "mode": cfg.mode,
            "live_enabled": cfg.live_enabled,
            "policy": cfg.policy,
            "contract": cfg.contract,
            "max_base_pieces": cfg.max_base_pieces,
            "max_daily_loss_yen": cfg.max_daily_loss_yen,
            "max_monthly_loss_yen": cfg.max_monthly_loss_yen,
            "max_consecutive_losses": cfg.max_consecutive_losses,
            "trading_date": target.isoformat(),
            "avoid_sq_day": cfg.avoid_sq_day,
            "data_dir": str(cfg.data_dir),
        },
        "market_date": asdict(market),
        "contract_hint": ibkr_contract_hint(cfg.contract, target),
        "open_orders": store.open_orders(),
    })
    return 0 if result.ok or cfg.broker == "dryrun" else 1


def cmd_signal(args) -> int:
    cfg, _, _, _, signal = build_context(args.range)
    print_json({"policy": cfg.policy, "signal": asdict(signal)})
    return 0


def cmd_open(args) -> int:
    cfg, _, broker, guard, signal = build_context(args.range)
    if not signal.policy_allowed:
        msg = f"NO_TRADE {signal.date}: {signal.policy_reason}"
        notify(cfg, msg)
        print_json({"ok": True, "action": "NO_TRADE", "reason": signal.policy_reason, "signal": asdict(signal)})
        return 0
    live_gate = guard.live_gate()
    if not live_gate.ok:
        print_json({"ok": False, "reason": live_gate.reason})
        return 2
    quantity = cfg.max_base_pieces * signal.pieces_logic
    risk = guard.can_open(signal.date, quantity, force=args.force)
    if not risk.ok:
        print_json({"ok": False, "reason": risk.reason, "signal": asdict(signal)})
        return 2
    result = broker.open(
        date=signal.date,
        side=signal.direction,
        quantity=quantity,
        contract=cfg.contract,
        price_ref=signal.open,
    )
    msg = f"TF {cfg.mode.upper()} OPEN {signal.date}: {signal.direction} {quantity}枚 {cfg.contract} policy={cfg.policy} result={result.message}"
    notify(cfg, msg)
    print_json({"ok": result.ok, "order_id": result.order_id, "message": result.message, "signal": asdict(signal)})
    return 0 if result.ok else 1


def cmd_close(args) -> int:
    cfg, _, broker, guard, signal = build_context(args.range)
    live_gate = guard.live_gate()
    if not live_gate.ok:
        print_json({"ok": False, "reason": live_gate.reason})
        return 2
    risk = guard.can_close()
    if not risk.ok:
        print_json({"ok": True, "action": "NO_POSITION", "reason": risk.reason})
        return 0
    result = broker.close_all(price_ref=signal.close)
    msg = f"TF {cfg.mode.upper()} CLOSE {signal.date}: result={result.message} close_ref={signal.close}"
    notify(cfg, msg)
    print_json({"ok": result.ok, "message": result.message, "signal": asdict(signal)})
    return 0 if result.ok else 1


def cmd_policies(args) -> int:
    print_json(POLICIES)
    return 0


def cmd_calendar(args) -> int:
    cfg = load_config()
    target = parse_date(args.date or cfg.trading_date)
    market = check_market_date(target, avoid_sq_day=cfg.avoid_sq_day)
    print_json({
        "market_date": asdict(market),
        "contract_hint": ibkr_contract_hint(cfg.contract, target),
    })
    return 0 if market.ok else 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TF Trading bot runner")
    sub = parser.add_subparsers(required=True)

    p = sub.add_parser("health", help="broker/env/storeの状態確認。発注なし")
    p.set_defaults(func=cmd_health)

    p = sub.add_parser("signal", help="今日のシグナル確認。発注なし")
    p.add_argument("--range", default="2y")
    p.set_defaults(func=cmd_signal)

    p = sub.add_parser("open", help="寄り建て処理。dryrunなら記録のみ")
    p.add_argument("--range", default="2y")
    p.add_argument("--force", action="store_true", help="取引日/シグナル鮮度ガードを手動検証時だけ無視")
    p.set_defaults(func=cmd_open)

    p = sub.add_parser("close", help="引け決済処理。dryrunなら記録のみ")
    p.add_argument("--range", default="2y")
    p.set_defaults(func=cmd_close)

    p = sub.add_parser("policies", help="利用可能ロジック一覧")
    p.set_defaults(func=cmd_policies)

    p = sub.add_parser("calendar", help="取引日/SQ/次限月ヒント確認。発注なし")
    p.add_argument("--date", default=None, help="YYYY-MM-DD。省略時はJST今日またはTF_TRADING_DATE")
    p.set_defaults(func=cmd_calendar)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
