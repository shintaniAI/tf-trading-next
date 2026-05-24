# IBKR API接続メモ

このディレクトリは、API発行後にXserver VPS側で本番/PAPER発注を動かすための準備場所。

## 方針

- Vercel/ブラウザから直接発注しない。
- 発注本体はXserver VPSのPython daemon/cronで実行する。
- APIキー・ログイン情報・口座情報はGit/Vercelに保存しない。
- 初期は必ず `TF_MODE=paper` / `TF_LIVE_ENABLED=false`。

## API発行後の手順

1. IBKR口座でPaper Tradingを有効化。
2. Xserver VPSにIB Gatewayを入れて起動。
3. VPSのみに `.env` を作成。
4. `python ops/ibkr/check_env.py` で設定不足を確認。
5. IB Gateway接続テスト。
6. PAPERで「寄り建て→引け決済」の往復テスト。
7. 1〜2週間ログを確認。
8. 新谷承認後、マイクロ1枚だけLIVE解禁。

## 必要な環境変数

`.env.example` をコピーして `.env` を作る。

```bash
cp ops/ibkr/.env.example .env
python ops/ibkr/check_env.py
```

## 注意

IBKRのTWS APIは「APIキー文字列をHTTPで投げる」方式ではなく、IB Gateway/TWSに接続して発注する方式。なので、API発行後に必要なのは主に以下。

- IB Gatewayのログイン・2FA・セッション維持
- API socket接続許可
- Paper / Live のport分離
- contract指定（日経225 micro/mini/限月）
- 二重発注防止
- 証拠金・余力チェック
- Slack通知
