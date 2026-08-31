# CLIMB - runs unchanged on any always-on host (Railway / Fly.io / Render / VPS).
# Chromium + CJK fonts are included so the self-capture feature works in the cloud.
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

ENV CLIMB_CHROME_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
# mount a persistent volume at /data - it holds the SQLite DB and all images
ENV CLIMB_DATA_DIR=/data

EXPOSE 3000
# Run next directly (not via npm) so SIGTERM from the platform reaches the
# server and it shuts down cleanly on redeploys - npm as PID 1 does not
# forward signals, which makes every redeploy look like a crash.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
