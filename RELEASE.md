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

A release is: bump version → roll CHANGELOG → commit → tag → push. The tag
triggers CI which tests and publishes to npm.

```bash
# 1. Make sure the working tree is clean and tests/typecheck pass (see Verification)
npm run typecheck        # tsc --noEmit
npm test                 # node --experimental-strip-types --test tests/**/*.test.ts

# 2. Release (patch | minor | major | explicit 1.2.3)
npm run release minor    # = node scripts/release.mjs minor
```

`scripts/release.mjs` (zero deps, node built-ins only) does:

1. Bumps `version` in `package.json`.
2. Replaces the top `## [Unreleased]` heading in `CHANGELOG.md` with `## [<version>] - <YYYY-MM-DD>`.
3. `git add package.json CHANGELOG.md`
4. `git commit -m "chore: release <version>"`
5. `git tag -a v<version> -m "Release <version>"`

It does **not** push — it prints the push command. Push with the GroepOnline SSH
identity (the laptop default SSH key is denied for this org):

```bash
GIT_SSH_COMMAND='ssh -F ~/.ssh/config-groeponline -o IdentityFile=~/.ssh/sheesh' \
  git push origin HEAD --tags
```

- SSH host alias: `github.com-groeponline` (defined in `~/.ssh/config-groeponline` with `IdentityFile ~/.ssh/sheesh`, `IdentitiesOnly yes`).
- Push actor: `chefadmin-netizen` (GroepOnline SSH). API/`gh` actor: `MisterWanted` (FG) via `chef-gh`.

## CI publish (on tag)

`.github/workflows/release.yml` triggers on `push: tags: ['v*']`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node 24, `registry-url: https://registry.npmjs.org`)
3. `npm ci --ignore-scripts` (installs devDependencies incl. `typescript`)
4. `npm run typecheck` (tsc)
5. `npm test` (node test runner)
6. `npm publish --access public` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`

`NPM_TOKEN` is a GitHub Actions secret on the repo (publish rights to the
`@groeponline` scope). It is **not** readable after being set; verify it works by
checking that the publish step on a real release succeeds and `npm view` resolves
the new version (see below).

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

- **patch** (`0.15.0 → 0.15.1`): bug fixes, doc only.
- **minor** (`0.15.x → 0.16.0`): new segments/presets, features, additive changes.
- **major**: breaking changes to settings shape or exported API.
