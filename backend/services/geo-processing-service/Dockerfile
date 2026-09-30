FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

COPY package*.json ./
COPY shared ./shared
COPY services/geo-processing-service ./services/geo-processing-service

RUN npm install --workspace=shared --workspace=services/geo-processing-service --include-workspace-root

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["dumb-init", "npx", "tsx", "services/geo-processing-service/src/index.ts"]
