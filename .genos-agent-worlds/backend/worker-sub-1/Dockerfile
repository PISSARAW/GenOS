FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS dependencies

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm_config_build_from_source=true npm ci --omit=dev \
    && npm cache clean --force

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436

ENV NODE_ENV=production \
    PORT=4000 \
    GENOS_DB_PATH=/data/genos.db \
    GENOS_IDE_CONTRACT_PATH=/app/integrations/ide/genos-extension-contract.json

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules

COPY --chown=node:node backend/bin ./bin
COPY --chown=node:node backend/proto ./proto
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/server.js ./server.js
COPY --chown=node:node integrations/ide/genos-extension-contract.json ./integrations/ide/genos-extension-contract.json

RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/readyz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
