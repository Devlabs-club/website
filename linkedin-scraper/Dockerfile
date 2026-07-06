# LinkedIn/GitHub enrichment scraper — all-in-one image.
# Bundles: logged-in Chromium (CDP) + Xvfb + x11vnc + noVNC + the scraper HTTP API,
# fronted by nginx on a single public port (path-routed). Persists the Chrome
# profile (your LinkedIn session) to a /data volume.
#
# The standalone scripts use only Node built-ins + the `mongosh` CLI (they shell out
# to mongosh for MongoDB), so NO `npm install` is needed. Node 22 is required because
# the CDP scripts use the global WebSocket (stable only on 22+).
#
# Build (context MUST be the repo root):
#   docker build -f linkedin-scraper/Dockerfile -t enrich-scraper .
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# System packages: browser stack + viewer + proxy + supervisor.
# Use Google Chrome stable instead of Debian chromium — recent bookworm chromium builds SIGTRAP in Railway containers.
RUN apt-get update && apt-get install -y --no-install-recommends \
      wget gnupg xvfb x11vnc novnc websockify nginx gettext-base supervisor \
      dumb-init fonts-liberation libnss3 ca-certificates curl procps \
      libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 libgbm1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgtk-3-0 libpango-1.0-0 \
 && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

# MongoDB Shell (mongosh) — the scripts call it directly.
RUN curl -fsSL https://pgp.mongodb.com/server-7.0.asc \
      | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor \
 && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
      > /etc/apt/sources.list.d/mongodb-org-7.0.list \
 && apt-get update && apt-get install -y --no-install-recommends mongodb-mongosh \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Standalone scrapers + the scraper service. No node_modules required.
COPY scripts/ ./scripts/
COPY linkedin-scraper/ ./linkedin-scraper/

# Runtime wiring
COPY linkedin-scraper/docker/supervisord.conf /etc/supervisor/linkedin-scraper.conf
COPY linkedin-scraper/docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY linkedin-scraper/docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV CHROME_CDP_URL=http://127.0.0.1:9222 \
    CHROME_USER_DATA_DIR=/data/chrome-profile \
    DISPLAY=:99 \
    PORT=8080

# Single public port (nginx). 6080/6090/9222 stay internal.
EXPOSE 8080

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
