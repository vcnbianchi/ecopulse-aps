FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

COPY package*.json ./
COPY shared ./shared
COPY services/ingestion-service ./services/ingestion-service

RUN npm install --workspace=shared --workspace=services/ingestion-service --include-workspace-root

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["dumb-init", "npx", "tsx", "services/ingestion-service/src/index.ts"]
