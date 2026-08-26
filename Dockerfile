FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS build
COPY . .
RUN npx prisma generate --schema=src/database/prisma/schema.prisma
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/database/prisma ./src/database/prisma
COPY --from=build /app/docs ./docs
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/server.js"]
