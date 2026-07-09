FROM node:22-alpine AS web-build
WORKDIR /app/apps/web
COPY apps/web/package.json ./
RUN npm install
COPY apps/web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY infra/reverse-proxy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/apps/web/dist /srv/www

