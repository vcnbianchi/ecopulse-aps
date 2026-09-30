FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

ENV NODE_ENV=production

EXPOSE 9000

USER node

CMD ["dumb-init", "npx", "tsx", "src/index.ts"]
