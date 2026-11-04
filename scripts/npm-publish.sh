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
whoami_err="$(mktemp)"
trap 'rm -f "$view_out" "$view_err" "$publish_err" "$whoami_err"' EXIT

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
    # Preflight the credential itself. npm answers a PUT for a scoped package
    # with 404 (not 403) when the token is dead or lacks publish rights for the
    # scope, which reads like "package not found" in CI logs. A whoami that
    # fails is unambiguous, so say what is actually wrong before publishing.
    if ! npm whoami >/dev/null 2>"$whoami_err"; then
      echo "NPM_TOKEN is not accepted by the registry (expired, revoked, or for a different account)." >&2
      cat "$whoami_err" >&2
      echo "Create a granular access token for the publishing account with read+write on the package scope," >&2
      echo "update the org NPM_TOKEN secret, then re-run this workflow on the tag (see docs/release.md)." >&2
      exit 1
    fi
    set +e
    # --tag must be an arbitrary dist-tag NAME, not a version number:
    # "npm publish --tag 1.4.3" still trips npm's implicit-latest check
    # ("Cannot implicitly apply the latest tag because previously published
    # version X is higher than the new version"). Publishing under a marker
    # tag first, then repointing `latest` explicitly, is the only way to
    # publish a lower version.
    npm publish --access public --tag "release-${VERSION}" 2>"$publish_err"
    publish_status=$?
    set -e
    cat "$publish_err" >&2
    if [ "$publish_status" -eq 0 ]; then
      # Publish succeeded under the marker tag; promote it to `latest` when
      # this is the intended line. (npm refuses to auto-assign latest to a
      # version lower than the current one, hence the explicit repoint.)
      if ! npm dist-tag add "$PACKAGE@$VERSION" latest 2>/dev/null; then
        echo "warning: published ${VERSION} but could not set latest; dist-tag 'release-${VERSION}' remains." >&2
      fi
    else
      if npm view "$SPEC" version 2>/dev/null | grep -q .; then
        echo "${VERSION} appeared on npm during publish; skip"
      elif grep -Eqi 'cannot publish over|previously published' "$publish_err"; then
        echo "${VERSION} is already on npm; skip publish"
      else
        if grep -Eqi 'E404|404 Not Found' "$publish_err"; then
          echo "npm rejected the publish with 404. For a scoped package that means the token has no" >&2
          echo "publish rights for ${PACKAGE} (expired/revoked token or missing scope permission), not that" >&2
          echo "the package is missing. Rotate NPM_TOKEN and re-run this workflow on the tag." >&2
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
