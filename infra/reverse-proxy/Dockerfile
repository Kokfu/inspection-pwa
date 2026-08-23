FROM node:22-alpine AS web-build
WORKDIR /app/apps/web
COPY apps/web/package.json ./
RUN npm install
COPY apps/web/ ./
RUN VITE_APP_BUILD_ID="build-$(date -u +%Y%m%dT%H%M%SZ)" npm run build

FROM caddy:2-alpine
COPY infra/reverse-proxy/Caddyfile /etc/caddy/Caddyfile
COPY infra/reverse-proxy/publish-web-release.sh /usr/local/bin/publish-web-release
COPY --from=web-build /app/apps/web/dist /srv/image-release
RUN chmod 755 /usr/local/bin/publish-web-release

ENTRYPOINT ["/usr/local/bin/publish-web-release"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
