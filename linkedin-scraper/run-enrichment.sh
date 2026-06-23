#!/usr/bin/env bash
# Run the LinkedIn enrichment scripts against Chromium on 127.0.0.1:9222.
#
# Usage:
#   bash linkedin-scraper/run-enrichment.sh builder --first
#   bash linkedin-scraper/run-enrichment.sh builder --all --limit=25 --resume
#   bash linkedin-scraper/run-enrichment.sh builder --linkedin-url=https://www.linkedin.com/in/foo
#   bash linkedin-scraper/run-enrichment.sh founder-company --experienceIndex=0
#   bash linkedin-scraper/run-enrichment.sh apply --limit=50
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
cd "$ROOT"

# Load secrets (Mongo URI, optional LinkedIn cookies) from linkedin-scraper/.env
set -a; [ -f linkedin-scraper/.env ] && . linkedin-scraper/.env; set +a
export CHROME_CDP_URL="${CHROME_CDP_URL:-http://127.0.0.1:9222}"

# Sanity: is the logged-in Chromium reachable?
if ! curl -sf "$CHROME_CDP_URL/json/version" >/dev/null; then
  echo "!! Chromium CDP not reachable at $CHROME_CDP_URL"
  echo "   Make sure Chromium is running and you've signed in."
  exit 1
fi

mode="${1:?usage: run-enrichment.sh <builder|founder-company|apply> [flags...]}"; shift || true
case "$mode" in
  builder)         exec node scripts/enrich-builder-linkedin-cdp.mjs "$@" ;;
  founder-company) exec node scripts/enrich-founder-company-linkedin-cdp.mjs "$@" ;;
  apply)           exec node scripts/apply-linkedin-enrichment.mjs "$@" ;;
  *) echo "unknown mode: $mode"; exit 1 ;;
esac
