# Build context is the REPO ROOT, not this directory — the API depends on
# packages/shared, which lives outside apps/api:
#
#   docker build -f apps/api/Dockerfile -t agent-api .

FROM node:22-alpine AS build
WORKDIR /repo

# Manifests first, so `npm ci` is cached until a dependency actually changes.
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install --workspaces --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @agent/shared \
 && npm run build -w @agent/api \
 && npm prune --omit=dev --workspaces --include-workspace-root

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist

USER node
EXPOSE 4100
CMD ["node", "apps/api/dist/main.js"]
