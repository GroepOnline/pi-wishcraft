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
- **Local checkout:** `~/Documents/Github/GroepOnline/pi-wishcraft`
- **Pi settings (`~/.pi/agent/settings.json`):** packages entry `npm:@groeponline/pi-wishcraft` and `"powerline": "chef"`. For active development, temporarily swap the entry to the local checkout path so edits are picked up on `/reload` — no reinstall needed; switch back to the npm name for the installed release.

## The release flow

**Default:** every merge to `main` is a release. `.github/workflows/release.yml`
runs `node scripts/release.mjs auto --push` on `main` and publishes in that
same job (`scripts/npm-publish.sh`) with the GroepOnline org secret
`NPM_TOKEN`. A tag pushed with `GITHUB_TOKEN` does **not** start another
workflow, so publish cannot wait for the tag event. Manual SSH/PAT tag
pushes still run the tag job. `auto` reads commit subjects since the last
`v*` tag: `feat:` → minor, `feat!:` / `BREAKING CHANGE` → major, otherwise
patch.

The first merge after `v0.18.0` therefore becomes **0.19.0** (the 0.19
`feat:` commits are already on `main`). Later docs/fix merges become
`0.19.1`, `0.19.2`, …

Put `[skip release]` in the merge-commit subject to opt out. The follow-up
`chore: release X.Y.Z` commit does not tag again.

Manual still works when you want an explicit version before pushing tags:

```bash
# 1. Make sure the working tree is clean and tests/typecheck pass (see Verification)
npm run typecheck        # tsc --noEmit
npm test                 # node --experimental-strip-types --test tests/**/*.test.ts

# 2. Release (patch | minor | major | auto | explicit 1.2.3)
npm run release minor    # = node scripts/release.mjs minor
```

`scripts/release.mjs` (zero deps, node built-ins only) does:

1. Bumps `version` in `package.json`.
2. Replaces the top `## [Unreleased]` heading in `CHANGELOG.md` with `## [<version>] - <YYYY-MM-DD>`.
3. `git add package.json CHANGELOG.md`
4. `git commit -m "chore: release <version>"`
5. `git tag -a v<version> -m "Release <version>"`

Locally it does **not** push unless you pass `--push` (CI does). Manual push
uses the GroepOnline SSH identity (the laptop default SSH key is denied):

```bash
GIT_SSH_COMMAND='ssh -F ~/.ssh/config-groeponline -o IdentityFile=~/.ssh/sheesh' \
  git push origin HEAD refs/tags/vX.Y.Z
```

- SSH host alias: `github.com-groeponline` (defined in `~/.ssh/config-groeponline` with `IdentityFile ~/.ssh/sheesh`, `IdentitiesOnly yes`).
- Push actor: `chefadmin-netizen` (GroepOnline SSH). API/`gh` actor: `MisterWanted` (FG) via `chef-gh`.

## CI publish

`.github/workflows/release.yml` publishes from the **bump job** after tagging,
and also from a tag push (manual SSH/PAT). `GITHUB_TOKEN` tag pushes do not
start a second run.

1. `actions/checkout@v4` (`fetch-depth: 0`, `fetch-tags: true`)
2. `actions/setup-node@v4` (node 24, `registry-url: https://registry.npmjs.org`)
3. Fetch and `git reset --hard origin/main` (bump job only; tests the tree that will be tagged)
4. `npm ci --ignore-scripts` (installs devDependencies incl. `typescript`)
5. `npm run typecheck` (tsc)
6. `npm test` (node test runner)
7. `npm run verify:package` (catalog contract gate — see `scripts/verify-package.mjs`)
8. `node scripts/release.mjs auto --push` (main only)
9. `sh scripts/npm-publish.sh` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (fail-closed `npm view`, idempotent skip, then the Pi catalog URLs)

`NPM_TOKEN` is the GroepOnline **org** Actions secret (publish rights to the
`@groeponline` scope). This repo has no override; Actions inherits the org
value. It is **not** readable after being set; verify it works by checking
that the publish step on a real release succeeds and `npm view` resolves the
new version (see below). The publish step fails closed if the secret is empty.

The package has no build step — `*.ts` files are shipped directly (`pi.extensions:
["./index.ts"]`), and Pi loads them with TypeScript stripping at runtime.

## Verification (the "status" line)

After a release, confirm each layer. Example for `0.15.0`:

```bash
# 1. Local: typecheck + tests green BEFORE tagging
npm run typecheck        # exit 0
npm test                 # "ℹ pass 170", "ℹ fail 0"

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
```

A release is "done" when all four hold: local green, tag on origin, CI
`success`, and `npm view` returns the new version.

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

Feature PRs **do not bump** `package.json`. They stay on the last published npm
version (today: `0.19.0`) and append under `## [Unreleased]` in `CHANGELOG.md`.
The bump happens on `main` in the release workflow, not in the feature PR.

Never bump in the same PR as the feature work. Never tag from a stacked
feature branch. `0.19.0` exists only after `main` auto-tags (or a manual
`npm run release` on `main`).

- **patch** (`0.18.0 → 0.18.1`): bug fixes, doc only; escape hatch if 0.19 slips.
- **minor** (`0.18.x → 0.19.0`): new segments/presets, features, additive changes.
- **major**: breaking changes to settings shape or exported API.
