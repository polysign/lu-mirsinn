#!/usr/bin/env bash

set -euo pipefail

FUNCTION_URL="https://us-central1-lu-mirsinn.cloudfunctions.net/publishQuestionReelAndStoryOnDemand"

show_usage() {
  cat <<'EOF'
Usage: scripts/publish-instagram-reel-story.sh [MM-DD-YYYY] [--force]

Publishes the Instagram reel and story for the Mir Sinn question using the new Cloud Function.
Optionally pass a date (e.g. 10-20-2025) to target a specific question.
Pass --force to re-publish even if already marked as published.
EOF
}

DATE_VALUE=""
FORCE_FLAG=0

while (($#)); do
  case "$1" in
    -h|--help)
      show_usage
      exit 0
      ;;
    --force)
      FORCE_FLAG=1
      shift
      ;;
    *)
      if [[ -n "$DATE_VALUE" ]]; then
        echo "Error: multiple date values provided" >&2
        exit 1
      fi
      DATE_VALUE="$1"
      shift
      ;;
  esac
done

if [[ -n "$DATE_VALUE" && ! "$DATE_VALUE" =~ ^[0-1][0-9]-[0-3][0-9]-[0-9]{4}$ ]]; then
  echo "Error: date must match MM-DD-YYYY (e.g. 10-20-2025)" >&2
  exit 1
fi

if [[ -n "$DATE_VALUE" ]]; then
  PAYLOAD=$(printf '{"date":"%s","force":%s}' "$DATE_VALUE" "$FORCE_FLAG")
else
  PAYLOAD=$(printf '{"force":%s}' "$FORCE_FLAG")
fi

curl \
  -sS \
  -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"

echo
