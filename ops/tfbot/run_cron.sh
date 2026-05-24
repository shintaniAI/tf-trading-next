#!/usr/bin/env bash
set -euo pipefail

# TF bot cron wrapper for VPS/Linux.
# Usage:
#   ops/tfbot/run_cron.sh open
#   ops/tfbot/run_cron.sh close

ACTION="${1:-}"
if [[ "$ACTION" != "open" && "$ACTION" != "close" && "$ACTION" != "health" ]]; then
  echo "usage: $0 open|close|health" >&2
  exit 64
fi

cd "$(dirname "$0")/../.."

mkdir -p ops/tfbot/logs
LOG="ops/tfbot/logs/$(date +%Y%m%d)-${ACTION}.log"

{
  echo "===== $(date -Is) tfbot ${ACTION} ====="
  python -m ops.tfbot.cli "$ACTION"
} 2>&1 | tee -a "$LOG"
