#!/usr/bin/env bash
# Prepares per-boot state, then hands off to supervisord which runs everything.
set -euo pipefail

: "${VNC_PASSWORD:?VNC_PASSWORD env is required (the noVNC viewer password)}"
: "${PORT:=8080}"
export PORT

# Persistent volume: Chrome profile (the logged-in LinkedIn session) + VNC password.
mkdir -p /data/chrome-profile

# (Re)write the VNC password file from the env var on every boot.
x11vnc -storepasswd "$VNC_PASSWORD" /data/vnc.passwd >/dev/null

# Render nginx config with the platform-provided public PORT (only $PORT is substituted,
# so nginx's own $variables are left intact).
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "[entrypoint] starting supervisord (public port=$PORT)"
exec supervisord -c /etc/supervisor/zo.conf
