FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

COPY package*.json ./
COPY shared ./shared

RUN npm install --workspace=shared --include-workspace-root

ENV NODE_ENV=production

USER node

CMD ["dumb-init", "npx", "tsx", "shared/src/db/migrate.ts"]
