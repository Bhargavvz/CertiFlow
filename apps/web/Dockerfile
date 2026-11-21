# Build the React app with the whole workspace (it imports @certiflow/shared),
# then serve the static files with nginx, which also proxies /api and /socket.io.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/mock-whatsapp/package.json apps/mock-whatsapp/
COPY apps/web/package.json apps/web/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @certiflow/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
