FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages packages
COPY apps apps
COPY cli cli
COPY scripts scripts
COPY tsconfig.json vitest.config.ts eslint.config.js ./
RUN npm ci && npm run build:web && npm run build:server

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 HASHLY_SERVER=1 HASHLY_STATIC_DIR=/app/public
COPY --from=build /app/apps/server/dist/index.cjs /app/server.cjs
COPY --from=build /app/apps/web/dist /app/public
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.cjs"]
