FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
RUN npm ci
COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/
RUN npx turbo build --filter=@kookos/web

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
