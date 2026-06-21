#!/usr/bin/env bash
# Zo "http" service entrypoint.
# Bridges the VNC server (127.0.0.1:5900) to a web page via noVNC.
# Zo injects $PORT for http services and gives you a public Proxy URL.
# Open that URL -> noVNC viewer -> you'll see the Chromium window.
set -euo pipefail

VNC_PORT="${VNC_PORT:-5900}"
WEB_PORT="${PORT:-6080}"

# noVNC static assets live in one of these on Debian/Ubuntu.
NOVNC_WEB="/usr/share/novnc"
[ -d "$NOVNC_WEB" ] || NOVNC_WEB="/usr/share/webapps/novnc"

echo "==> noVNC bridge on :$WEB_PORT -> VNC 127.0.0.1:$VNC_PORT"
# websockify retries until x11vnc is up.
exec websockify --web="$NOVNC_WEB" "$WEB_PORT" "127.0.0.1:$VNC_PORT"
