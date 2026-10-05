# Preview image for @groeponline/pi-wishcraft.
# Packs the npm artifact and smoke-tests the exact files pi loads,
# inside a clean container.
#
#   docker build -f preview/Dockerfile -t ghcr.io/groeponline/pi-wishcraft-preview:local .
#   docker run --rm ghcr.io/groeponline/pi-wishcraft-preview:local
FROM node:22 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN mkdir -p /out && npm pack --pack-destination /out

FROM node:22-slim AS preview
WORKDIR /preview
COPY --from=build /out/*.tgz ./pkg.tgz
COPY preview/smoke.sh ./smoke.sh
RUN npm install ./pkg.tgz --prefix ./pkg --no-audit --no-fund && sh ./smoke.sh ./pkg
CMD ["sh", "./smoke.sh", "./pkg"]
