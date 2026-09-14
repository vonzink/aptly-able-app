FROM node:24.13.0-bookworm-slim AS build
RUN npm install --global pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
COPY scripts/copy-api-migrations.mjs ./scripts/copy-api-migrations.mjs
RUN pnpm install --frozen-lockfile && pnpm --filter @aptly/contracts build && pnpm --filter @aptly/api build
RUN mkdir -p /data/recordings && chown node:node /data/recordings
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
USER node
EXPOSE 4100
CMD ["node", "apps/api/dist/bootstrap/server.js"]
