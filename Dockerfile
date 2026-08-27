FROM node:20-slim AS base
WORKDIR /app
# Prisma's query/schema engine binaries link against libssl at runtime — node:20-slim has none.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
COPY src/database/prisma ./src/database/prisma
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/database/prisma ./src/database/prisma
COPY --from=build /app/docs ./docs
COPY package.json ./

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=src/database/prisma/schema.prisma && node dist/server.js"]
