# EcoPulse - alert-service
# Build context: ./backend (necessario para copiar o pacote compartilhado)
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

# Manifests do workspace npm + pacote compartilhado + este servico
COPY package*.json ./
COPY shared ./shared
COPY services/alert-service ./services/alert-service

# Instala apenas as dependencias deste servico (e do pacote compartilhado)
RUN npm install --workspace=shared --workspace=services/alert-service --include-workspace-root

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["dumb-init", "npx", "tsx", "services/alert-service/src/index.ts"]
