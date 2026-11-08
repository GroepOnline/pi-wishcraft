#!/bin/sh
# Publish the current package.json version.
#
# Authentication is the org NPM_TOKEN secret, written into .npmrc as
# NODE_AUTH_TOKEN by setup-node. The npm CLI would prefer an OIDC identity, but
# npm answers the exchange for this package with 401 (no trusted publisher on
# npmjs.com), so the token is the credential that actually publishes. See
# RELEASE.md for the measured state and how to switch to OIDC later.
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
        if grep -Eqi 'EOTP' "$publish_err"; then
          echo "npm wants a one-time password for this publish: the credential authenticates" >&2
          echo "but the account requires 2FA for writes, which CI cannot answer. Replace the" >&2
          echo "token with one that bypasses 2FA (granular with 'Bypass 2FA', or a classic" >&2
          echo "Automation token). See RELEASE.md." >&2
        elif grep -Eqi 'E404|404 Not Found|ENEEDAUTH|E401' "$publish_err"; then
          echo "npm rejected the publish as unauthenticated. For a scoped package npm answers" >&2
          echo "404 (not 403) when the caller may not publish, so this is the credential," >&2
          echo "not a missing package: a revoked/read-only NPM_TOKEN, or no trusted publisher" >&2
          echo "for ${PACKAGE} (org GroepOnline, repo pi-wishcraft, workflow release.yml," >&2
          echo "'npm publish' allowed). See RELEASE.md." >&2
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
