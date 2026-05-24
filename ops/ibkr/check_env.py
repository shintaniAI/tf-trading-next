#!/usr/bin/env python3
"""IBKR API発行後の.env不足チェック。

これは発注しない。VPSに置いた.envの必須項目が揃っているかだけ確認する。
"""
from __future__ import annotations

import os
from pathlib import Path

REQUIRED = [
    "IBKR_HOST",
    "IBKR_PORT",
    "IBKR_CLIENT_ID",
    "TF_BROKER",
    "TF_MODE",
    "TF_LIVE_ENABLED",
    "TF_POLICY",
    "TF_CONTRACT",
    "TF_MAX_BASE_PIECES",
]


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def main() -> int:
    load_dotenv(Path(".env"))
    missing = [key for key in REQUIRED if not os.environ.get(key)]
    if missing:
        print("NG: .env不足")
        for key in missing:
            print(f"- {key}")
        print("\nops/ibkr/.env.example をコピーしてVPSだけに実値を入れてください。")
        return 1

    live = os.environ.get("TF_LIVE_ENABLED", "false").lower() == "true"
    mode = os.environ.get("TF_MODE", "paper").lower()
    print("OK: 必須.envは揃っています")
    print(f"mode={mode} live_enabled={live} policy={os.environ.get('TF_POLICY')} contract={os.environ.get('TF_CONTRACT')}")

    if live and mode != "live":
        print("WARN: TF_LIVE_ENABLED=true なのに TF_MODE が live ではありません。設定を再確認してください。")
    if live:
        print("WARN: LIVE発注ONです。新谷承認・PAPER往復成功・安全停止確認後だけ許可してください。")
    else:
        print("SAFE: LIVE発注はOFFです。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
