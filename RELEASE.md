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

## npm authentication: the org `NPM_TOKEN`, with trusted publishing prepared

`release.yml` publishes with the organisation secret **`NPM_TOKEN`** (a classic
token for the `chefgroeponline` account). `setup-node` writes it into `~/.npmrc`
through `NODE_AUTH_TOKEN`, so the value lives only in the org secret store: not
in the repo, not in a dispatch input, never printed by a run.

Trusted publishing (OIDC) is wired but **not active**. The `publish` job still
grants `id-token: write`, but npm answers the OIDC exchange for
`@groeponline/pi-wishcraft` with **HTTP 401**, so npmjs.com carries no matching
GitHub Actions publisher for this repo. With no publisher and no token, npm
reports `ENEEDAUTH` — that is what kept v1.18.0–v1.22.0 off the registry.
Measured from this repository on 2026-11-08:

| probe | result |
|---|---|
| `npm whoami` with `secrets.NPM_TOKEN` | `chefgroeponline` — valid |
| `ACTIONS_ID_TOKEN_REQUEST_URL` in a job with `id-token: write` | present |
| `POST /-/npm/v1/oidc/token/exchange/package/@groeponline%2fpi-wishcraft` | **401** |
| `npm publish` with that token (v1.23.0, run 42464125440) | **EOTP** — one-time password required |

**The token authenticates but cannot write.** It is a *Publish* token on an
account with 2FA enabled, so npm demands an OTP for `npm publish` and a CI
runner can never answer one.

**Resolved 2026-11-09 03:58 UTC.** The org `NPM_TOKEN` secret was replaced with a
granular token that has *Bypass 2FA*; run 42559311821 (dispatch on `v1.23.0`)
then published `1.23.0` and created its GitHub Release. No workflow change was
needed — `NODE_AUTH_TOKEN` still publishes. `v1.18.0`–`v1.22.0` stay unpublished:
their tag refs carry unpinned `uses: actions/...@v7` and the org policy rejects
them, so they cannot be replayed without rewriting tags. `1.23.0` supersedes them.

The two routes that were available, for the record:

- **Token route (unblocks v1.23.0 as tagged):** Access Tokens → Generate New
  Token → **Granular**, read+write on `@groeponline` (or a classic
  **Automation** token), with **Bypass 2FA** enabled; store it as the org
  `NPM_TOKEN` secret. Then replay the tag:
  `gh workflow run release.yml --ref v1.23.0` — that same job also creates the
  missing GitHub Release.
- **OIDC route (no credential at all):** configure the trusted publisher below
  and drop the `NODE_AUTH_TOKEN` env from the `publish` job. A tag cut *before*
  that change still carries the token env and cannot be replayed, so this route
  publishes the next version and leaves the hole.

Switching to trusted publishing is a one-time npmjs.com change, after which the
`NODE_AUTH_TOKEN` env comes out of the job:

1. Sign in as the maintainer of `@groeponline/pi-wishcraft` (`chefgroeponline
   <joep@chefgroep.online>` — `npm view @groeponline/pi-wishcraft maintainers`).
2. Package → Settings → **Trusted publishing** → add a **GitHub Actions**
   publisher with exactly these values (all fields case-sensitive):
   - Organization or user: `GroepOnline`
   - Repository: `pi-wishcraft`
   - Workflow filename: `release.yml` (with `.yml`)
   - Environment name: empty
   - Allowed actions: **tick `npm publish`** — it is *not* on by default. A
     configuration created after 2026-09-03 starts with staged publishing only,
     so without this tick every `npm publish` is refused. Leave `npm dist-tag`
     off; this repo does not use it.
3. Verify before trusting it: the exchange line in the table above must answer
   `200`, not `401`. Only then remove `NODE_AUTH_TOKEN` from the job and let OIDC
   publish.

Rules that follow from the current (token) configuration:

- The credential must stay in the `publish` job of `release.yml`. Moving
  `npm publish` into a reusable workflow (`workflow_call`) would break the OIDC
  match if trusted publishing is switched on later, because npm validates the
  *calling* workflow's filename.
- Only GitHub-hosted runners can use OIDC; the token path works anywhere.
- `npm-publish.sh` publishes with the default `latest` dist-tag, and versions
  only ever increase here, so `npm dist-tag` is deliberately never used.

### When publish fails: `E404 Not Found - PUT .../@groeponline%2fpi-wishcraft`

For a scoped package npm answers a PUT with **404, not 403**, when the caller
may not publish. That means the credential is missing, revoked, read-only or
does not own the scope. It is not "package not found", and it is not a
retryable transient. Two neighbours are distinct and have their own fix:

- `ENEEDAUTH` — npm had no credential at all: `NODE_AUTH_TOKEN` was empty and
  the OIDC exchange refused.
- `EOTP` — the credential authenticates but the account requires a one-time
  password for writes, which CI cannot supply. This is what v1.23.0 hit. The
  token needs 2FA bypass (granular token with *Bypass 2FA*, or a classic
  Automation token); retrying with the same token only burns another run.

`scripts/npm-publish.sh` prints that diagnosis instead of the raw 404. Recovery:

1. Check the credential before the workflow: `npm whoami` against the registry
   with the same token, or rerun the exchange probe from the table above.
2. Republish the tags that failed, without cutting new versions. A bare
   dispatch on a `v*` tag ref runs verify + publish for that tag:

   ```bash
   gh workflow run release.yml --ref v1.19.0   # repeats for each failed tag
   ```

   Or re-run the failed job directly: `gh run rerun <run-id> --failed`.
   A tag stranded this way keeps its GitHub Release missing until the publish
   run succeeds; `workflow_dispatch` with `inputs.tag` only backfills the
   release assets and never publishes to npm.
3. A dispatch runs the workflow file **at that tag**, so a tag whose publish job
   is broken by construction cannot be replayed at all: publish the newer tag
   that carries the fix and leave the version hole, since npm versions need not
   be contiguous. v1.20.0 is such a hole — it was tagged by a publish job that
   called `bun` before installing it.

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
