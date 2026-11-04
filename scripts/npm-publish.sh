#!/bin/sh
# Publish the current package.json version.
#
# Authentication is npm trusted publishing: the release workflow grants
# `id-token: write` and the npm CLI exchanges that OIDC identity for a
# short-lived publish token, so there is no long-lived credential to expire or
# rotate. The trusted publisher is configured once on npmjs.com (see RELEASE.md).
# If a NODE_AUTH_TOKEN happens to be set, npm falls back to it.
#
# Idempotent: skip if that version is already on the registry.
# Only an exact npm not-found (E404) is treated as "absent"; other view
# failures (auth, network, 5xx) abort without publishing.
set -eu

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
    # Plain `npm publish`: the default dist-tag is `latest`. Versions only ever
    # increase here, so the marker-tag + `npm dist-tag add` dance that a
    # lower-version republish needs is gone — OIDC covers publish only.
    set +e
    npm publish --access public 2>"$publish_err"
    publish_status=$?
    set -e
    cat "$publish_err" >&2
    if [ "$publish_status" -ne 0 ]; then
      if npm view "$SPEC" version 2>/dev/null | grep -q .; then
        echo "${VERSION} appeared on npm during publish; skip"
      elif grep -Eqi 'cannot publish over|previously published' "$publish_err"; then
        echo "${VERSION} is already on npm; skip publish"
      else
        if grep -Eqi 'E404|404 Not Found|ENEEDAUTH|E401' "$publish_err"; then
          echo "npm rejected the publish as unauthenticated. For a scoped package npm answers" >&2
          echo "404 (not 403) when the caller may not publish, so this is the trusted-publisher" >&2
          echo "relationship, not a missing package: check that npmjs.com has a GitHub Actions" >&2
          echo "trusted publisher for ${PACKAGE} with org GroepOnline, repo pi-wishcraft," >&2
          echo "workflow release.yml and 'npm publish' allowed. See RELEASE.md." >&2
        fi
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
