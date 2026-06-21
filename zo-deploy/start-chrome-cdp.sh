#!/usr/bin/env bash
# Zo "process" service entrypoint.
# Runs a virtual display + VNC server + a headed Chromium with CDP on 9222.
# This is the SAME Chromium that:
#   - you log into LinkedIn through (via the noVNC viewer), and
#   - the scrapers attach to at http://127.0.0.1:9222
# Keep this service running. The profile dir persists your LinkedIn session.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/workspace/$(basename "$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel 2>/dev/null || echo devlabs-website)")}"
PROFILE_DIR="${CHROME_USER_DATA_DIR:-/home/workspace/.linkedin-chrome-profile}"
DISPLAY_NUM="${DISPLAY_NUM:-:99}"
VNC_PORT="${VNC_PORT:-5900}"
CDP_PORT="${CDP_PORT:-9222}"

# Find chromium (written by setup.sh, else discover).
if [ -f "$(dirname "$0")/.chromium-path" ]; then . "$(dirname "$0")/.chromium-path"; fi
CHROMIUM_BIN="${CHROMIUM_BIN:-$(command -v chromium || command -v chromium-browser)}"

mkdir -p "$PROFILE_DIR"
export DISPLAY="$DISPLAY_NUM"

echo "==> Starting virtual display $DISPLAY_NUM"
Xvfb "$DISPLAY_NUM" -screen 0 1440x900x24 -ac +extension RANDR >/tmp/xvfb.log 2>&1 &
sleep 2

echo "==> Starting VNC server on :$VNC_PORT (password protected)"
x11vnc -display "$DISPLAY_NUM" -forever -shared -rfbport "$VNC_PORT" \
  -rfbauth "$HOME/.vnc/passwd" -bg -o /tmp/x11vnc.log

echo "==> Launching Chromium with remote debugging on 127.0.0.1:$CDP_PORT"
# CDP bound to loopback only — never expose 9222 publicly.
exec "$CHROMIUM_BIN" \
  --remote-debugging-port="$CDP_PORT" \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$PROFILE_DIR" \
  --profile-directory=Default \
  --no-first-run --no-default-browser-check \
  --disable-dev-shm-usage --disable-gpu \
  --window-size=1440,900 \
  https://www.linkedin.com/feed/
