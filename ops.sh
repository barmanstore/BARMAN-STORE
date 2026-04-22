#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKBENCH="$SCRIPT_DIR/scripts/linux/workbench.sh"

if [[ ! -f "$WORKBENCH" ]]; then
  echo "[ERROR] Missing Linux workbench script: \"$WORKBENCH\""
  exit 1
fi

exec bash "$WORKBENCH" "$@"
