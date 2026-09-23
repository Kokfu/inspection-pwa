FROM node:22-alpine AS build
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci
COPY apps/api/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
ENV REPORT_CHROMIUM_PATH=/usr/bin/chromium
RUN apk add --no-cache chromium
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/src/reports/assets ./dist/reports/assets
COPY --from=build /app/apps/api/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
