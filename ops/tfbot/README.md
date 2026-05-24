# TF Bot DRY_RUN/PAPER実行基盤

API接続前でも動く自動売買bot本体。Vercel画面ではなく、Xserver VPS/Linux上で動かす。

## できること

- Yahoo日足から今日のS1シグナル算出
- ロジック選択: `s1_all` / `gap_abs_100` / `gap_abs_300` / `gap_abs_400` / `gap_pr_80` / `gap_pr_90`
- DRY_RUNの寄り建て・引け決済ログ保存
- 二重発注防止
- LIVE発注ガード
- IBKR接続ヘルスチェック用adapter
- 日本市場の祝日/土日/SQ日ガード
- 古い日足での誤発注防止（signal日付とJST今日の一致確認）
- 日次損失・月次損失・連敗停止
- 次の四半期限月ヒント表示

## DRY_RUN

```bash
python -m ops.tfbot.cli health
python -m ops.tfbot.cli calendar
python -m ops.tfbot.cli signal
python -m ops.tfbot.cli open
python -m ops.tfbot.cli close
```

DRY_RUNは実注文しない。`ops/tfbot/state/orders.json` に記録するだけ。

土日・祝日・SQ日・古い日足の場合、`open` は停止する。手動検証だけは `--force` を付ける。

```bash
python -m ops.tfbot.cli open --range 1y --force
```

## PAPER/IBKR接続準備

VPSの `.env` に以下を設定する。実値はGit/Vercelに置かない。

```env
TF_MODE=paper
TF_BROKER=ibkr
TF_LIVE_ENABLED=false
TF_POLICY=gap_pr_80
TF_CONTRACT=micro
TF_MAX_BASE_PIECES=1
TF_MAX_DAILY_LOSS_YEN=30000
TF_MAX_MONTHLY_LOSS_YEN=100000
TF_MAX_CONSECUTIVE_LOSSES=3
TF_AVOID_SQ_DAY=true
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
50 8 * * 1-5  cd /path/to/tf-trading-next && ops/tfbot/run_cron.sh open
25 15 * * 1-5 cd /path/to/tf-trading-next && ops/tfbot/run_cron.sh close
```

`run_cron.sh` は `ops/tfbot/logs/YYYYMMDD-open.log` に結果を残す。

実運用ではIBKR contractをPaperで確認し、`health` の `contract_hint` とIBKR側の実contract詳細が一致してから有効化する。
