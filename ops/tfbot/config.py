from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BotConfig:
    broker: str = "dryrun"
    mode: str = "dryrun"
    live_enabled: bool = False
    policy: str = "gap_pr_80"
    contract: str = "micro"
    max_base_pieces: int = 1
    max_daily_loss_yen: int = 30_000
    max_monthly_loss_yen: int = 100_000
    max_consecutive_losses: int = 3
    trading_date: str | None = None
    avoid_sq_day: bool = True
    force: bool = False
    ibkr_host: str = "127.0.0.1"
    ibkr_port: int = 4002
    ibkr_client_id: int = 101
    data_dir: Path = Path("ops/tfbot/state")
    slack_webhook_url: str | None = None


def load_dotenv(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def bool_env(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def int_env(name: str, default: int) -> int:
    value = os.environ.get(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def load_config() -> BotConfig:
    load_dotenv()
    mode = os.environ.get("TF_MODE", "dryrun").lower()
    broker = os.environ.get("TF_BROKER", "dryrun").lower()
    if mode == "dryrun":
        broker = "dryrun"
    data_dir = Path(os.environ.get("TF_DATA_DIR", "ops/tfbot/state"))
    return BotConfig(
        broker=broker,
        mode=mode,
        live_enabled=bool_env("TF_LIVE_ENABLED", False),
        policy=os.environ.get("TF_POLICY", "gap_pr_80"),
        contract=os.environ.get("TF_CONTRACT", "micro"),
        max_base_pieces=max(1, int_env("TF_MAX_BASE_PIECES", 1)),
        max_daily_loss_yen=max(1, int_env("TF_MAX_DAILY_LOSS_YEN", 30_000)),
        max_monthly_loss_yen=max(1, int_env("TF_MAX_MONTHLY_LOSS_YEN", 100_000)),
        max_consecutive_losses=max(1, int_env("TF_MAX_CONSECUTIVE_LOSSES", 3)),
        trading_date=os.environ.get("TF_TRADING_DATE") or None,
        avoid_sq_day=bool_env("TF_AVOID_SQ_DAY", True),
        force=bool_env("TF_FORCE", False),
        ibkr_host=os.environ.get("IBKR_HOST", "127.0.0.1"),
        ibkr_port=int_env("IBKR_PORT", 4002),
        ibkr_client_id=int_env("IBKR_CLIENT_ID", 101),
        data_dir=data_dir,
        slack_webhook_url=os.environ.get("TF_SLACK_WEBHOOK_URL") or None,
    )
