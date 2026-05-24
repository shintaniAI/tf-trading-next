from __future__ import annotations

import json
import urllib.request
from .config import BotConfig


def notify(config: BotConfig, message: str) -> None:
    if not config.slack_webhook_url:
        print(message)
        return
    payload = json.dumps({"text": message}).encode("utf-8")
    req = urllib.request.Request(
        config.slack_webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        if res.status >= 300:
            raise RuntimeError(f"Slack webhook failed: {res.status}")
