#!/bin/sh
# Publish the current package.json version. Fail closed without NODE_AUTH_TOKEN.
# Idempotent: skip if that version is already on the registry.
set -eu
if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "NPM_TOKEN is missing (expected GroepOnline org secret)."
  exit 1
fi
VERSION="$(node -p "require('./package.json').version")"
if npm view "@groeponline/pi-wishcraft@${VERSION}" version >/dev/null 2>&1; then
  echo "${VERSION} is already on npm; skip publish"
else
  npm publish --access public
fi
echo "npm: https://www.npmjs.com/package/@groeponline/pi-wishcraft"
echo "pi.dev: https://pi.dev/packages/@groeponline/pi-wishcraft"
echo "search: https://pi.dev/packages?name=wishcraft"
echo "groeponline: https://pi.dev/packages?name=groeponline"
