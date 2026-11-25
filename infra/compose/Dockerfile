FROM node:24.22.1-bookworm@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a AS backend
# pnpm lives in the image so containers start without downloading it.
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable
WORKDIR /app
# Copy the server workspace manifests before their source so source edits reuse the
# dependency layer. The self-host target adds the full workspace below.
COPY --chmod=755 package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack install && chmod -R a+rX "${COREPACK_HOME}"
COPY --chmod=755 patches patches
COPY --chmod=755 apps/api/package.json apps/api/
COPY --chmod=755 apps/worker/package.json apps/worker/
COPY --chmod=755 packages/adapter-kit/package.json packages/adapter-kit/
COPY --chmod=755 packages/adapters/package.json packages/adapters/
COPY --chmod=755 packages/auth/package.json packages/auth/
COPY --chmod=755 packages/contracts/package.json packages/contracts/
COPY --chmod=755 packages/core/package.json packages/core/
COPY --chmod=755 packages/db/package.json packages/db/
COPY --chmod=755 packages/logging/package.json packages/logging/
COPY --chmod=755 packages/memory/package.json packages/memory/
COPY --chmod=755 packages/ui-tokens/package.json packages/ui-tokens/
COPY --chmod=755 infra/sandboxes/supervisor/package.json infra/sandboxes/supervisor/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY --chmod=755 LICENSE tsconfig.base.json ./
COPY --chmod=755 scripts scripts/
COPY --chmod=755 apps/api apps/api/
COPY --chmod=755 apps/worker apps/worker/
COPY --chmod=755 packages/adapter-kit packages/adapter-kit/
COPY --chmod=755 packages/adapters packages/adapters/
COPY --chmod=755 packages/auth packages/auth/
COPY --chmod=755 packages/contracts packages/contracts/
COPY --chmod=755 packages/core packages/core/
COPY --chmod=755 packages/db packages/db/
COPY --chmod=755 packages/logging packages/logging/
COPY --chmod=755 packages/memory packages/memory/
COPY --chmod=755 packages/ui-tokens packages/ui-tokens/
COPY --chmod=755 infra/sandboxes infra/sandboxes/
ARG SYDNEY_PREPARE_WUYING_ASSETS=false
RUN case "$SYDNEY_PREPARE_WUYING_ASSETS" in true) node scripts/wuying-web-sdk.mjs --target=api ;; false) : ;; *) exit 1 ;; esac
RUN pnpm --filter @rakazo/db generate
RUN pnpm --filter @rakazo/api --filter @rakazo/worker build
RUN install -d -m 750 -o node -g node /data
ARG GIT_SHA
ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
EXPOSE 3100 7091
USER node
CMD ["pnpm", "--filter", "@rakazo/api", "start"]

FROM backend AS self-host
USER root
COPY --chmod=755 . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --prod=false --frozen-lockfile --store-dir=/pnpm/store
RUN if [ "$SYDNEY_PREPARE_WUYING_ASSETS" = true ]; then node scripts/wuying-web-sdk.mjs --target=web; fi
RUN RAKAZO_ALLOW_DEV_SECRETS=1 pnpm --filter @rakazo/web build
RUN install -d -m 750 -o node -g node /app/apps/web/node_modules/.vite-temp /app/apps/web/asset-archive
EXPOSE 5173
USER node

FROM backend AS server
