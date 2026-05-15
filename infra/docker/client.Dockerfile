FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm --filter @uno/client build
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/apps/client/.output ./.output
CMD ["node", ".output/server/index.mjs"]
