# LinkedIn/GitHub enrichment scraper — all-in-one image.
# Bundles: logged-in Chromium (CDP) + Xvfb + x11vnc + noVNC + the scraper HTTP API,
# fronted by nginx on a single public port (path-routed). Persists the Chrome
# profile (your LinkedIn session) to a /data volume.
#
# NOTE: Node 22 — the CDP scripts use the global WebSocket, which is only stable on 22+.
#
# Build (context MUST be the repo root):
#   docker build -f zo-deploy/Dockerfile -t enrich-scraper .
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb x11vnc novnc websockify nginx gettext-base supervisor \
      dumb-init fonts-liberation libnss3 ca-certificates curl procps \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only what the standalone scripts need (mongoose etc.). If you ever hit a
# "module not found" at runtime, drop --omit=dev.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Standalone scrapers + the scraper service. (src/ Astro app is NOT needed.)
COPY scripts/ ./scripts/
COPY zo-deploy/ ./zo-deploy/

# Runtime wiring
COPY zo-deploy/docker/supervisord.conf /etc/supervisor/zo.conf
COPY zo-deploy/docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY zo-deploy/docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV CHROME_CDP_URL=http://127.0.0.1:9222 \
    CHROME_USER_DATA_DIR=/data/chrome-profile \
    DISPLAY=:99 \
    PORT=8080

# Single public port (nginx). 6080/6090/9222 stay internal.
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD curl -sf http://127.0.0.1:6090/health || exit 1

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
