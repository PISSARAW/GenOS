# Dockerfile réparé par le Worker OperonWorker (opéron Docker uniquement)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "dist/main.js"]
