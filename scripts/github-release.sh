#!/bin/sh
# Create a GitHub Release for the current package.json version (or $1).
# Idempotent: skip if that tag already has a Release.
# Uses the GitHub API so CI does not depend on the gh CLI.
set -eu

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "GITHUB_TOKEN is missing (needed to create the GitHub Release)." >&2
  exit 1
fi

REPO="${GITHUB_REPOSITORY:-GroepOnline/pi-wishcraft}"
PKG_VERSION="$(node -p "require('./package.json').version")"
VERSION="${1:-$PKG_VERSION}"
case "$VERSION" in
  v*) VERSION="${VERSION#v}" ;;
esac
if [ "$VERSION" != "$PKG_VERSION" ]; then
  echo "GitHub Release version ${VERSION} does not match package.json ${PKG_VERSION}." >&2
  exit 1
fi
TAG="v${VERSION}"
MAKE_LATEST="${MAKE_LATEST:-true}"
API="https://api.github.com/repos/${REPO}"

view_body="$(mktemp)"
create_out="$(mktemp)"
payload_file="$(mktemp)"
trap 'rm -f "$view_body" "$create_out" "$payload_file"' EXIT

set +e
view_status="$(curl -sS -o "$view_body" -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "${API}/releases/tags/${TAG}")"
view_curl=$?
set -e
if [ "$view_curl" -ne 0 ]; then
  echo "Failed to query GitHub release ${TAG}" >&2
  exit 1
fi

if [ "$view_status" = "200" ]; then
  echo "GitHub release ${TAG} already exists; skip"
  exit 0
fi

if [ "$view_status" != "404" ]; then
  echo "GitHub release lookup for ${TAG} failed (HTTP ${view_status})" >&2
  cat "$view_body" >&2
  exit 1
fi

NOTES="$(node scripts/release.mjs notes "$VERSION")"
if [ -z "$(printf '%s' "$NOTES" | tr -d '[:space:]')" ]; then
  NOTES="Release ${TAG}"
fi
NOTES="${NOTES}

**npm:** \`@groeponline/pi-wishcraft@${VERSION}\`"

NOTES="$NOTES" TAG="$TAG" MAKE_LATEST="$MAKE_LATEST" node -e '
const payload = {
  tag_name: process.env.TAG,
  name: process.env.TAG,
  body: process.env.NOTES,
  make_latest: process.env.MAKE_LATEST === "false" ? "false" : "true",
  draft: false,
  prerelease: false,
};
process.stdout.write(JSON.stringify(payload));
' > "$payload_file"

set +e
create_status="$(curl -sS -o "$create_out" -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  --data-binary @"$payload_file" \
  "${API}/releases")"
create_curl=$?
set -e
if [ "$create_curl" -ne 0 ]; then
  echo "Failed to create GitHub release ${TAG}" >&2
  exit 1
fi

if [ "$create_status" = "201" ] || [ "$create_status" = "200" ]; then
  echo "Created GitHub release ${TAG}"
  exit 0
fi

if [ "$create_status" = "422" ] && grep -Eqi 'already_exists|already exists' "$create_out"; then
  echo "GitHub release ${TAG} already exists; skip"
  exit 0
fi

echo "GitHub release create for ${TAG} failed (HTTP ${create_status})" >&2
cat "$create_out" >&2
exit 1
