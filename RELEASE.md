# Releasing `@groeponline/pi-wishcraft`

`@groeponline/pi-wishcraft` is GroepOnline's powerline status bar and
interaction layer for the pi coding agent (forked from
`nicobailon/pi-powerline-footer`, now independently maintained). It ships to
npm as the scoped package `@groeponline/pi-wishcraft` and installs locally
from the repo path. This doc records the end-to-end release flow and how to
verify it.

## Identity

- **GitHub repo:** `GroepOnline/pi-wishcraft` (forked from `nicobailon/pi-powerline-footer`, independently maintained)
- **npm package:** `@groeponline/pi-wishcraft` (scoped, `--access public`)
- **Default branch:** `main`
- **Local checkout:** `/home/joep/Code/GroepOnline/pi-wishcraft/repo`
- **Pi settings (`~/.pi/agent/settings.json`):** packages entry `npm:@groeponline/pi-wishcraft` and `"powerline": "chef"`. For active development, temporarily swap the entry to the local checkout path so edits are picked up on `/reload` — no reinstall needed; switch back to the npm name for the installed release.

## The release flow

**Default:** every merge to `main` is a release, but no version is cut on the
merge commit itself — `main` stays protected and the bump lands through a
verified candidate.

1. `verify` runs the same lanes as a PR (`.github/workflows/test.yml`).
2. `prepare` confirms verified `main` is still the head of `main` (otherwise a
   newer push owns the next candidate) and cuts an idempotent candidate branch
   `release-candidate/v<next>-<base-sha12>` holding only the
   `chore: release <next>` bump of `package.json` and `CHANGELOG.md`
   (`bun.lock` stores no root version, so it never changes).
3. `prepare` dispatches Verify on that exact candidate ref.
4. The final step of that Verify run dispatches
   `.github/workflows/promote-release-candidate.yml`, which re-validates the
   candidate from GitHub metadata only (branch name, parent == `main`, commit
   subject, exactly those two files, both versions, and the
   `## [<version>] - <date>` heading), fast-forwards `main` to the candidate
   SHA, and creates tag `v<version>` via the API.
5. A tag created with `GITHUB_TOKEN` emits no `push` event, so Promote
   explicitly dispatches `release.yml` on the tag ref. That run's `publish` job
   is what publishes to npm and creates the GitHub Release.

`auto` reads commit subjects since the last `v*` tag: `feat:` → minor,
`feat!:` / `BREAKING CHANGE` → major, otherwise patch.

Put `[skip release]` in the merge-commit subject to opt out; the follow-up
`chore: release X.Y.Z` commit is skipped the same way. When `CHANGELOG.md` has
no `## [Unreleased]` notes, `prepare` reports "nothing to release" and cuts no
candidate.

Manual still works when you want an explicit version before pushing tags:

```bash
# 1. Make sure the working tree is clean and the full chain passes (see Verification)
bun run check            # typecheck + oxlint + tests

# 2. Release (patch | minor | major | auto | explicit 1.2.3)
bun run release minor    # = bun scripts/release.mjs minor
```

`scripts/release.mjs` (zero deps, node built-ins only) does:

1. Bumps `version` in `package.json`.
2. Replaces the top `## [Unreleased]` heading in `CHANGELOG.md` with `## [<version>] - <YYYY-MM-DD>`.
3. `git add package.json CHANGELOG.md`
4. `git commit -m "chore: release <version>"`
5. `git tag -a v<version> -m "Release <version>"`

Locally it does **not** push unless you pass `--push` (CI does not use `--push`
anymore: `prepare` pushes only the candidate branch). Manual push uses the
GroepOnline SSH identity (the laptop default SSH key is denied):

```bash
GIT_SSH_COMMAND='ssh -F ~/.ssh/config-groeponline -o IdentityFile=~/.ssh/sheesh' \
  git push origin HEAD refs/tags/vX.Y.Z
```

- SSH host alias: `github.com-groeponline` (defined in `~/.ssh/config-groeponline` with `IdentityFile ~/.ssh/sheesh`, `IdentitiesOnly yes`).
- Push actor: `chefadmin-netizen` (GroepOnline SSH). API/`gh` actor: `MisterWanted` (FG) via `chef-gh`.

## CI publish (tag ref only)

`release.yml`'s `publish` job runs only when `github.ref` is a `v*` tag: the
dispatch Promote fires, or a manual SSH/PAT tag push. It never runs on `main`.

1. `actions/checkout` at the tag (`fetch-depth: 0`)
2. `actions/setup-node` (node 24)
3. Stamp `PI_WISHCRAFT_BUILD_SHA` and `build-stamp.json` from the tag commit only
4. `bun scripts/verify-release-tag.mjs --tag <tag>` (tag == `package.json`, on `origin/main`)
5. `bun install --frozen-lockfile --ignore-scripts` (devDependencies incl. `typescript`)
6. `sh scripts/npm-publish.sh` (fail-closed `npm view`, idempotent skip, `npm publish --access public`)
7. `sh scripts/github-release.sh` with `GITHUB_TOKEN` (idempotent: skip if that tag already has a Release; notes from `CHANGELOG.md`)
8. `npm pack` + `SHA256SUMS`, uploaded as a run artifact and attached to the GitHub Release

The lanes that need to prove the tree (typecheck, lint, tests, package contract)
live in `test.yml` and run in `verify` — the tag commit already passed them as a
candidate, so `publish` does not repeat them.

## npm authentication: trusted publishing, no stored token

There is **no npm token in this repository**. The `publish` job grants
`id-token: write` and the npm CLI exchanges that GitHub OIDC identity for a
short-lived publish token (npm CLI ≥ 11.5.1, Node ≥ 22.14; the runner image
satisfies both). Nothing expires, so nothing has to be rotated — the org
`NPM_TOKEN` secret is not read by `release.yml` any more.

The trust relationship lives on npmjs.com, one time per package:

1. Sign in as the maintainer of `@groeponline/pi-wishcraft` (`chefgroeponline
   <joep@chefgroep.online>` — `npm view @groeponline/pi-wishcraft maintainers`).
2. Package → Settings → **Trusted publishing** → add a **GitHub Actions**
   publisher with exactly these values (all fields case-sensitive):
   - Organization or user: `GroepOnline`
   - Repository: `pi-wishcraft`
   - Workflow filename: `release.yml` (with `.yml`)
   - Environment name: empty
   - Allowed actions: **`npm publish`** (dist-tags are not used)
3. Nothing else: provenance attestations are generated automatically.

Rules that follow from that configuration:

- Publishing must stay in the `release.yml` job that has `id-token: write`.
  Moving `npm publish` into a reusable workflow (`workflow_call`) breaks the
  match, because npm validates the *calling* workflow's filename.
- Only GitHub-hosted runners are supported; self-hosted runners cannot use OIDC.
- `npm-publish.sh` publishes with the default `latest` dist-tag. `npm dist-tag`
  over OIDC needs npm ≥ 11.21 **and** an explicit permission on the trusted
  publisher, so it is deliberately not used: versions only ever increase here.
  Republishing an older version below the current `latest` needs a manual
  token publish, which is the one case this setup does not cover.

### When publish fails: `E404 Not Found - PUT .../@groeponline%2fpi-wishcraft`

For a scoped package npm answers a PUT with **404, not 403**, when the caller
may not publish. Under trusted publishing that means the relationship is
missing, or it points at another repository/workflow filename, or the runner is
not GitHub-hosted. It is not "package not found", and it is not a retryable
transient.

`scripts/npm-publish.sh` prints that diagnosis instead of the raw 404. Recovery:

1. Compare the trusted publisher on npmjs.com with the four values above
   (existing connections cannot be edited — delete and re-create if a field is
   wrong).
2. Republish the tags that failed, without cutting new versions. A bare
   dispatch on a `v*` tag ref runs verify + publish for that tag:

   ```bash
   gh workflow run release.yml --ref v1.19.0   # repeats for each failed tag
   ```

   Or re-run the failed job directly: `gh run rerun <run-id> --failed`.
   A tag stranded this way keeps its GitHub Release missing until the publish
   run succeeds; `workflow_dispatch` with `inputs.tag` only backfills the
   release assets and never publishes to npm.

The idempotent skip in `npm-publish.sh` makes a retry safe: a version that is
already on the registry is skipped, so a partially successful run cannot
double-publish.

The package has no build step — `*.ts` files are shipped directly (`pi.extensions:
["./index.ts"]`), and Pi loads them with TypeScript stripping at runtime.

## Verification (the "status" line)

After a release, confirm each layer. Example for `0.15.0`:

```bash
# 1. Local: typecheck + tests green BEFORE tagging
bun run typecheck        # exit 0
bun run test             # "ℹ pass 170", "ℹ fail 0"

# 2. Tag pushed
git ls-remote --tags origin | grep v0.15.0   # shows v0.15.0 on origin

# 3. CI Release workflow
gh run list --repo GroepOnline/pi-wishcraft --workflow release.yml \
  --limit 5 --json databaseId,status,conclusion,headBranch,url
gh run view <databaseId> --repo GroepOnline/pi-wishcraft \
  --log-failed   # or --log for full transcript

# 4. npm registry (published + propagated)
npm view @groeponline/pi-wishcraft version        # 0.15.0
npm view @groeponline/pi-wishcraft dist-tags      # { latest: '0.15.0' }

# 5. GitHub Release Latest matches npm
gh release list --repo GroepOnline/pi-wishcraft --limit 5
```

A release is "done" when all five hold: local green, tag on origin, CI
`success`, `npm view` returns the new version, and GitHub Releases Latest
is that same tag.

## Known gotchas

- **npm propagation delay.** Right after `npm publish` the public registry can
  404 on `npm view` for a short window (seconds to ~1 minute) even though the
  publish succeeded. The CI log line `+ @groeponline/pi-wishcraft@<v>`
  and HTTP `200` from `https://registry.npmjs.org/@groeponline%2fpi-wishcraft`
  are the real success signals; retry `npm view` if you see an early 404.
- **Wrong SSH key = `Permission denied (publickey)`.**
  Always push with `GIT_SSH_COMMAND='ssh -F ~/.ssh/config-groeponline -o IdentityFile=~/.ssh/sheesh'` (chefadmin-netizen / `~/.ssh/sheesh`).
- **TPS used to show absurd values** (e.g. `tps:12775`) because `sessionStartTime`
  resets on extension reload while output is cumulative. Fixed in 0.15.0 with a
  rolling token-rate. If TPS ever looks wrong again, check that `tpsSegment` still
  uses the rolling/EMA path, not `output / elapsed`.
- **Open-ports used to count raw `ss` lines** (IPv4+IPv6 double counting).
  Fixed in 0.15.0 to dedupe by port number; column parsing is column-agnostic for
  both `ss` and `netstat`.
- The footer is rendered by Pi core (`FooterComponent.render` returns `string[]`),
  so the live status bar cannot be clicked. Interactivity is delivered via
  `alt+p` (navigable segment overlay), `/tps`, and `/open-ports`.

## Versioning

Feature PRs **do not bump** `package.json`. They inherit whatever version
`main` already carries and append under `## [Unreleased]` in `CHANGELOG.md`.
The bump happens on `main` in the release workflow, not in the feature PR.

Never bump in the same PR as the feature work. Never tag from a stacked
feature branch. `v<version>` exists only after Promote tags the verified
candidate (or a manual `bun run release` on `main`). `main` can be ahead of npm
when a publish fails — compare `npm view @groeponline/pi-wishcraft version`
with `bun scripts/release.mjs next auto` before assuming they agree.

- **patch** (`0.18.0 → 0.18.1`): bug fixes, doc only; escape hatch if 0.19 slips.
- **minor** (`0.18.x → 0.19.0`): new segments/presets, features, additive changes.
- **major**: breaking changes to settings shape or exported API.
