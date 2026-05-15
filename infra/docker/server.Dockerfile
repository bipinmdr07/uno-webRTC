FROM node:20-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @uno/server build
CMD ["node", "apps/server/dist/index.js"]
