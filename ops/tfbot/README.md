# TF Bot DRY_RUN/PAPER実行基盤

API接続前でも動く自動売買bot本体。Vercel画面ではなく、Xserver VPS/Linux上で動かす。

## できること

- Yahoo日足から今日のS1シグナル算出
- ロジック選択: `s1_all` / `gap_abs_100` / `gap_abs_300` / `gap_abs_400` / `gap_pr_80` / `gap_pr_90`
- DRY_RUNの寄り建て・引け決済ログ保存
- 二重発注防止
- LIVE発注ガード
- IBKR接続ヘルスチェック用adapter

## DRY_RUN

```bash
python -m ops.tfbot.cli health
python -m ops.tfbot.cli signal
python -m ops.tfbot.cli open
python -m ops.tfbot.cli close
```

DRY_RUNは実注文しない。`ops/tfbot/state/orders.json` に記録するだけ。

## PAPER/IBKR接続準備

VPSの `.env` に以下を設定する。実値はGit/Vercelに置かない。

```env
TF_MODE=paper
TF_BROKER=ibkr
TF_LIVE_ENABLED=false
TF_POLICY=gap_pr_80
TF_CONTRACT=micro
TF_MAX_BASE_PIECES=1
IBKR_HOST=127.0.0.1
IBKR_PORT=4002
IBKR_CLIENT_ID=101
```

接続確認:

```bash
python -m ops.tfbot.cli health
```

`ib_insync` と IB Gateway が必要。

## LIVEガード

`TF_MODE=live` でも `TF_LIVE_ENABLED=true` がない限り発注しない。初期LIVEは `TF_MAX_BASE_PIECES=1` のみ許可。

## cron例

```cron
50 8 * * 1-5  cd /path/to/tf-trading-next && python -m ops.tfbot.cli open
25 15 * * 1-5 cd /path/to/tf-trading-next && python -m ops.tfbot.cli close
```

実運用では祝日判定、SQ/限月切替、IBKR contract確認を入れてから有効化する。
