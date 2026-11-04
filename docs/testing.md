# Testing & tooling

Bun owns installation and script execution. The test **runner** stays Node's
`node:test`, and that split is deliberate.

## Why Bun installs but Node runs the tests

`bun test` runs this suite, but not identically: measured on 1.4.2 with 1037
tests, it reports **1035 pass / 2 fail** where `node --test` reports 1037/0.

| Failing under `bun test` | Cause |
|---|---|
| `ports.test.ts` — "serves stale rows past the TTL instead of blanking the number" | Bun's fake-timer semantics differ from `node:test`'s `mock.timers`; the TTL never advances as the test expects. |
| `ptyshell-managed.test.ts` — "carries cwd between commands via the sentinel" | Bun's PTY/child-process timing diverges; the sentinel is read before the shell writes it. |

Both suites assert real behaviour that Node's runner exercises correctly, so
the choice is "keep the runner that proves the behaviour" rather than
"rewrite two suites to fit a faster runner". The coverage thresholds
(`--test-coverage-lines=70 --test-coverage-functions=60`) are `node:test` flags
as well. Everything else — install, script invocation, lint, typecheck — is Bun.

Re-evaluate when Bun's runner gains `node:test` timer parity; the gate is a
single command change in `package.json`, not a rewrite.

## Commands

```bash
bun install --frozen-lockfile   # install exactly what bun.lock pins
bun run typecheck               # tsc --noEmit
bun run lint                    # oxlint --deny-warnings
bun run test                    # node:test + coverage thresholds
bun run check                   # typecheck + lint + test
bun run circular                # madge --circular
bun run verify:package          # package + Pi contract gates
bun run audit                   # dependency audit gate
```

## Pre-commit hook

```bash
bun run hooks:install   # git config core.hooksPath .githooks
```

`.githooks/pre-commit` runs `typecheck`, `lint` and only the test files the
commit touches. It is fast by design; the full suite is CI's job (or
`bun run check` before pushing).

## Lint

`oxlint` (config in `.oxlintrc.json`) is the lint gate: correctness rules are
errors, and CI runs with `--deny-warnings`, so a warning fails the build the
same way an error does. `no-control-regex` is off repo-wide because matching
ANSI SGR sequences is the product, not an accident.

## CI shape

`.github/workflows/test.yml` runs seven independent lanes in parallel —
`whitespace`, `typecheck`, `lint`, `test`, `circular`, `package-contract`,
`audit` — each installing from the frozen lockfile through the
`.github/actions/bun-setup` composite action. A final `verify` job aggregates
them and keeps that name as the single required status check; it also carries
the release-candidate promotion dispatch, so the Verify → Promote chain is
unchanged.

## Dependency audit

`scripts/audit-gate.mjs` reads `bun audit --json` plus `bun pm ls --all`.
Because `bun.lock` carries no `package-lock.json` for npm to read, the npm
audit schema is gone; the gate keeps the same guarantees in bun's terms:

- a new high/critical advisory fails, matched by GHSA id **and** package name;
- a baselined advisory whose vulnerable range moved fails (the exemption is
  pinned to the range a human reviewed);
- an installed version the baseline does not list fails, so a second
  vulnerable copy of an accepted package cannot inherit the exemption;
- a baselined advisory that stops reporting as high/critical fails, so the
  baseline cannot rot into a blanket exemption;
- an audit that cannot run exits 2 instead of reading as "zero findings".

`audit-baseline.json` and `.oxlintrc.json` are excluded from the published
tarball; `bun.lock` never ships because `files` does not match it.
