# Release route

Declared version source: `package.json` `version`. Product tag `vX.Y.Z` must equal that value at the tagged commit, and the commit must be an ancestor of `origin/main`.

Existing flow is unchanged: main pushes with `[Unreleased]` notes still prepare a candidate; promotion still tags protected main and dispatches publish. `scripts/npm-publish.sh` remains the npm publish target.

This route adds GitHub Release evidence on top of that:

1. `.github/workflows/release.yml` re-checks tag == `package.json` and ancestry on `origin/main`.
2. It writes `build-stamp.json` / `PI_WISHCRAFT_BUILD_SHA` from the tag commit only (never a fake such as `0.0.0`).
3. It runs `npm pack`, writes `SHA256SUMS`, and attaches those assets to the GitHub Release.
4. Visible identity: `node --experimental-strip-types src/product-identity.ts --version` prints `{ version, source_sha }`. `/signal version` and `/signal doctor` (`package.identity`) show the same values. Missing stamp/env is `null`, never invented.

`workflow_dispatch` input `tag` backfills the same checks at an existing tag (for example `v1.10.0`) and uploads artifacts. It does not publish to npm. Do not run the backfill from a contract PR.

This document does not create a tag or GitHub Release.
