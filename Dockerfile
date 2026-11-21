# One image for every Node service (api, worker, mock-whatsapp, migrate, tests).
# Services differ only by their command in docker-compose.yml. We run TypeScript with
# tsx instead of a separate compile step: one less moving part for a hackathon build
# (see docs/DECISIONS.md D16).
FROM node:24-bookworm-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so Docker can cache this layer.
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/mock-whatsapp/package.json apps/mock-whatsapp/
COPY apps/web/package.json apps/web/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 3000 4000
CMD ["npx", "tsx", "apps/api/src/index.ts"]
