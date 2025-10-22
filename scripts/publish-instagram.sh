#!/usr/bin/env bash

set -euo pipefail

FUNCTION_URL="https://us-central1-lu-mirsinn.cloudfunctions.net/publishQuestionToInstagramOnDemand"

show_usage() {
  cat <<'EOF'
Usage: scripts/publish-instagram.sh [MM-DD-YYYY]

Posts the daily Mir Sinn question to Instagram via the Cloud Function.
Optionally pass a date (e.g. 10-20-2025) to target a specific question.
EOF
}

if [[ "${1-}" =~ ^(-h|--help)$ ]]; then
  show_usage
  exit 0
fi

DATE_VALUE="${1-}"
if [[ -n "$DATE_VALUE" && ! "$DATE_VALUE" =~ ^[0-1][0-9]-[0-3][0-9]-[0-9]{4}$ ]]; then
  echo "Error: date must match MM-DD-YYYY (e.g. 10-20-2025)" >&2
  exit 1
fi

if [[ -n "$DATE_VALUE" ]]; then
  PAYLOAD=$(printf '{"date":"%s"}' "$DATE_VALUE")
else
  PAYLOAD='{}'
fi

curl \
  -sS \
  -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"

echo
