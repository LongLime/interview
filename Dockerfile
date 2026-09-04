FROM node:20-alpine AS builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/pnpm-lock.yaml ./
COPY frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json ./
COPY frontend/index.html frontend/vite.config.ts frontend/postcss.config.js ./
RUN npm install -g pnpm@9.15.9 && pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

FROM caddy:2-alpine
COPY --from=builder /app/frontend/dist /srv/interview
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
