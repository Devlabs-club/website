#!/usr/bin/env bash
# Run the LinkedIn enrichment scripts against the Chromium that
# start-chrome-cdp.sh keeps alive on 127.0.0.1:9222.
#
# Usage:
#   bash zo-deploy/run-enrichment.sh builder --first
#   bash zo-deploy/run-enrichment.sh builder --all --limit=25 --resume
#   bash zo-deploy/run-enrichment.sh builder --linkedin-url=https://www.linkedin.com/in/foo
#   bash zo-deploy/run-enrichment.sh founder-company --experienceIndex=0   # (script-specific flags)
#   bash zo-deploy/run-enrichment.sh apply --limit=50                       # apply dry-run artifacts to Mongo
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
cd "$ROOT"

# Load secrets (Mongo URI, optional LinkedIn cookies) from zo-deploy/.env
set -a; [ -f zo-deploy/.env ] && . zo-deploy/.env; set +a
export CHROME_CDP_URL="${CHROME_CDP_URL:-http://127.0.0.1:9222}"

# Sanity: is the logged-in Chromium reachable?
if ! curl -sf "$CHROME_CDP_URL/json/version" >/dev/null; then
  echo "!! Chromium CDP not reachable at $CHROME_CDP_URL"
  echo "   Make sure the 'linkedin-chrome' process service is running and you've signed in."
  exit 1
fi

mode="${1:?usage: run-enrichment.sh <builder|founder-company|apply> [flags...]}"; shift || true
case "$mode" in
  builder)         exec node scripts/enrich-builder-linkedin-cdp.mjs "$@" ;;
  founder-company) exec node scripts/enrich-founder-company-linkedin-cdp.mjs "$@" ;;
  apply)           exec node scripts/apply-linkedin-enrichment.mjs "$@" ;;
  *) echo "unknown mode: $mode"; exit 1 ;;
esac
