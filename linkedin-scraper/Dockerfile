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

# System packages: headless browser stack + viewer + proxy + supervisor.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb x11vnc novnc websockify nginx gettext-base supervisor \
      dumb-init fonts-liberation libnss3 ca-certificates curl gnupg procps \
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
