# Preview image for @groeponline/pi-wishcraft.
# Packs the npm artifact and smoke-tests the exact files pi loads,
# inside a clean container.
#
#   docker build -f preview/Dockerfile -t ghcr.io/groeponline/pi-wishcraft-preview:local .
#   docker run --rm ghcr.io/groeponline/pi-wishcraft-preview:local
#
# Bun installs the tree (its binary is copied into the node image); `npm pack`
# builds the artifact on purpose — the release pipeline publishes with the npm
# CLI, so the smoke test must validate the same packer that ships.
FROM node:22 AS build
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN mkdir -p /out && npm pack --pack-destination /out

FROM node:22-slim AS preview
WORKDIR /preview
COPY --from=build /out/*.tgz ./pkg.tgz
COPY preview/smoke.sh ./smoke.sh
RUN npm install ./pkg.tgz --prefix ./pkg --no-audit --no-fund && sh ./smoke.sh ./pkg
CMD ["sh", "./smoke.sh", "./pkg"]
