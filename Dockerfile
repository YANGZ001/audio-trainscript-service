FROM node:22-alpine AS builder
WORKDIR /app
# Install native addon build tools (required by better-sqlite3 / node-gyp)
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY public/ ./public/
RUN mkdir -p /data/bilibili-audio /data/snipd-audio /data/xiaoyuzhou-audio /data/db && chown app:app /data/bilibili-audio /data/snipd-audio /data/xiaoyuzhou-audio /data/db
EXPOSE 3001
USER app
CMD ["node", "dist/index.js"]
