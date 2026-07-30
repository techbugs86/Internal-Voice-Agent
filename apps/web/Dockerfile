# Build context is the REPO ROOT, not this directory:
#
#   docker build -f apps/web/Dockerfile -t agent-web .
#
# NOTE: NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD
# time, not read at runtime. Pass the reCAPTCHA site key as a build arg, or the
# widget will have no key in the built image.

FROM node:22-alpine AS build
WORKDIR /repo

ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm install --workspaces --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @agent/shared && npm run build -w @agent/web

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# `output: "standalone"` in next.config.ts emits a server bundle with only the
# dependencies it actually traced, so there is no node_modules to copy.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

USER node
EXPOSE 3100
ENV PORT=3100 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
