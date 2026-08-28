#!/bin/sh
# Publish the current package.json version. Fail closed without NODE_AUTH_TOKEN.
# Idempotent: skip if that version is already on the registry.
# Only an exact npm not-found (E404) is treated as "absent"; other view
# failures (auth, network, 5xx) abort without publishing.
set -eu

if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "NPM_TOKEN is missing (expected GroepOnline org secret)." >&2
  exit 1
fi

PACKAGE="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"
SPEC="${PACKAGE}@${VERSION}"

view_out="$(mktemp)"
view_err="$(mktemp)"
publish_err="$(mktemp)"
trap 'rm -f "$view_out" "$view_err" "$publish_err"' EXIT

set +e
npm view "$SPEC" version >"$view_out" 2>"$view_err"
view_status=$?
set -e

# npm 11 returns exit 0 with EMPTY output for a missing @version on some
# registry configs, so exit status alone is not a reliable presence test.
# Presence = non-empty stdout ("1.4.3"). Absence = E404 anywhere.
if [ -s "$view_out" ]; then
  echo "${VERSION} is already on npm; skip publish"
else
  if grep -Eqi 'E404|404 Not Found|code E404|is not in this registry' "$view_err" "$view_out"; then
    set +e
    # --tag <VERSION> sidesteps npm's implicit-latest check, which refuses
    # to publish a version lower than the current latest ("Cannot implicitly
    # apply the latest tag because previously published version X is higher").
    # We repoint `latest` ourselves after publish.
    npm publish --access public --tag "$VERSION" 2>"$publish_err"
    publish_status=$?
    set -e
    cat "$publish_err" >&2
    if [ "$publish_status" -ne 0 ]; then
      if npm view "$SPEC" version 2>/dev/null | grep -q .; then
        echo "${VERSION} appeared on npm during publish; skip"
      elif grep -Eqi 'cannot publish over|previously published' "$publish_err"; then
        echo "${VERSION} is already on npm; skip publish"
      else
        exit "$publish_status"
      fi
    fi
  else
    echo "npm view ${SPEC} failed (status ${view_status}); not publishing." >&2
    cat "$view_err" >&2
    exit "$view_status"
  fi
fi

echo "npm: https://www.npmjs.com/package/${PACKAGE}"
echo "pi.dev: https://pi.dev/packages/${PACKAGE}"
echo "search: https://pi.dev/packages?name=wishcraft"
echo "groeponline: https://pi.dev/packages?name=groeponline"
