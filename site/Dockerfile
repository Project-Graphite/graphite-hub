FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

FROM deps AS build
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production DATA_DIR=/data
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/* \
  && mkdir /data && chown node:node /data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/server ./server
COPY --from=build /app/app ./app
COPY --from=build /app/scripts/rules.mjs ./scripts/
USER node
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.ts"]
