FROM node:22-alpine AS build
WORKDIR /app/apps/api
COPY apps/api/package.json ./
RUN npm install
COPY apps/api/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY apps/api/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
