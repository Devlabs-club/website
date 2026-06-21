#!/usr/bin/env bash
# One-time setup on the Zo computer. Run from the repo root after `git clone`.
# Installs: Chromium, a virtual display (Xvfb), a VNC server (x11vnc),
# and the noVNC web bridge (websockify) so you can SEE and drive the
# Chromium that the LinkedIn scrapers attach to over CDP.
set -euo pipefail

echo "==> Installing system packages (chromium, xvfb, x11vnc, novnc/websockify)…"
sudo apt-get update -y
sudo apt-get install -y \
  chromium xvfb x11vnc novnc websockify \
  fonts-liberation libnss3 ca-certificates curl git || \
sudo apt-get install -y \
  chromium-browser xvfb x11vnc novnc websockify \
  fonts-liberation libnss3 ca-certificates curl git

# Resolve a chromium binary name and remember it for the launcher.
CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser || true)"
if [ -z "$CHROMIUM_BIN" ]; then echo "!! chromium not found after install"; exit 1; fi
echo "CHROMIUM_BIN=$CHROMIUM_BIN" > zo-deploy/.chromium-path

echo "==> Checking Node.js (need 20.x)…"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20.* ]]; then
  echo "   Installing Node 20 via nodesource…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==> Setting a VNC password (you'll type this into the noVNC viewer later)…"
mkdir -p "$HOME/.vnc"
if [ ! -f "$HOME/.vnc/passwd" ]; then
  x11vnc -storepasswd "$HOME/.vnc/passwd"   # prompts you for a password
fi

echo "==> Installing repo dependencies…"
npm ci || npm install

echo
echo "==> Done. Next:"
echo "   1) Fill in zo-deploy/.env  (copy from zo-deploy/.env.zo.example)"
echo "   2) Register the three Zo services (see zo-deploy/README.md): "
echo "        - process service  -> bash zo-deploy/start-chrome-cdp.sh   (Chromium + CDP 9222)"
echo "        - http service     -> bash zo-deploy/start-vnc.sh          (viewer URL, port 6080)"
echo "        - http service     -> node zo-deploy/server.mjs            (scraper API, port 6090)"
echo "   3) Open the viewer URL, sign into LinkedIn + 2FA once."
echo "   4) Smoke test:  bash zo-deploy/run-enrichment.sh builder --linkedin-url=https://www.linkedin.com/in/<someone>"
echo "   5) Point the website at the zo-scraper Proxy URL (ZO_SCRAPER_URL + ZO_SCRAPER_SECRET)."
