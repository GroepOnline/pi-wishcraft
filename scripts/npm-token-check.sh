#!/bin/sh
# Fail closed when the npm credential is dead, before a version is tagged.
# npm answers a PUT for a scoped package with 404 (not 403) when the token is
# expired or revoked, so a dead token used to surface only after main was
# already bumped and tagged. Shared by the release preflight and npm-publish.sh.
set -eu

if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "NPM_TOKEN is missing (expected the GroepOnline org secret)." >&2
  exit 1
fi

err="$(mktemp)"
trap 'rm -f "$err"' EXIT

if who="$(npm whoami 2>"$err")"; then
  echo "npm credential accepted as: ${who}"
  exit 0
fi

echo "NPM_TOKEN is not accepted by the registry (expired, revoked, or for a different account)." >&2
cat "$err" >&2
echo "Create a granular access token for the publishing account with read+write on the" >&2
echo "@groeponline scope, update the org NPM_TOKEN secret, then re-run this workflow." >&2
echo "No version was tagged. See RELEASE.md, 'When publish fails'." >&2
exit 1
