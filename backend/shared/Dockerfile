# Imagem utilitária do pacote compartilhado.
# Usada pelo serviço one-shot `db-migrate` do docker-compose para aplicar as migrações
# Drizzle antes de qualquer microsserviço subir (evita corrida entre réplicas).
# Build context: ./backend
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

COPY package*.json ./
COPY shared ./shared

RUN npm install --workspace=shared --include-workspace-root

ENV NODE_ENV=production

USER node

CMD ["dumb-init", "npx", "tsx", "shared/src/db/migrate.ts"]
