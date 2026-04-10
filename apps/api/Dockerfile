FROM node:22-alpine AS base

FROM base AS builder
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
RUN NODE_OPTIONS="--max-old-space-size=384" npm ci
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
RUN NODE_OPTIONS="--max-old-space-size=384" npx turbo build --filter=@kookos/api --concurrency=1

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/drizzle ./drizzle
COPY --from=builder /app/apps/api/entrypoint.sh ./entrypoint.sh
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@kookos/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@kookos/shared/package.json
RUN chmod +x ./entrypoint.sh
EXPOSE 3010
CMD ["./entrypoint.sh"]
