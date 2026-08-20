# Segments & theming

## The `chef` preset

`preset: "chef"` is the GroepOnline fork's default look: muted colors (no rainbow), slash separators, and two extra right-side segments:

- `tps`: live tokens/sec over a rolling 1-second window (EMA-free, no spikes), now reporting **output and input** rates separately (`⇡out ⇣in`) so you can see generation speed and incoming prompt tokens at a glance. A rocket/bolt icon lights up while streaming (override with env `POWERLINE_TPS`).
- `open_ports`: count of unique **TCP** listening ports (`ss` → `netstat` → `/proc/net` fallback, dedupes IPv4/IPv6). Set `segmentOptions.openPorts.includeUdp: true` to include noisy UDP (mDNS/DHCP/ephemeral).

### Open-port process owners

Open the segment detail view (`alt+p` → Navigate → `open_ports` → `→`) to see **which process owns each listening port**. It best-effort parses `ss -tulnp` (falling back to `netstat -tulnp`), so the row list shows `tcp:3000 → node (12345)` per port; a port without a visible owner is marked `(unknown)`. The result is cached for 2 seconds so opening detail stays cheap. The full `alt+i` ports list shows the raw `ss -p` process column as well.

### Fleet open-ports (SSH probe)

`open_ports` is laptop-local by default. Set `powerline.segmentOptions.openPorts.host` to probe a named fleet host over SSH instead:

```json
{
  "powerline": {
    "segmentOptions": {
      "openPorts": { "host": "sofie" }
    }
  }
}
```

`host` accepts a hostname, `user@host`, or IPv4 address (validated to prevent shell injection). The probe is best-effort: it runs `ssh` in `BatchMode` with a 3-second connect timeout, so it requires passwordless/agent SSH and the host to already be in `known_hosts`. When the probe can't run (no `ss`/`netstat` remotely, unreachable host, missing key), the segment shows `?` instead of a misleading `0`. The detail view and `alt+i` full list reuse the same remote probe.

## Thinking level display

The thinking segment shows live updates when you change thinking level:

| Level | Display | Color |
|-------|---------|-------|
| off | `think:off` | gray |
| minimal | `think:min` | purple-gray |
| low | `think:low` | blue |
| medium | `think:med` | teal |
| high | `think:high` | rainbow |
| xhigh | `think:xhigh` | rainbow |
| max | `think:max` | rainbow |

## Path display

The path segment supports three modes:

| Mode | Example | Description |
|------|---------|-------------|
| `basename` | `powerline-footer` | Just the directory name (default) |
| `abbreviated` | `…/extensions/powerline-footer` | Full path with home abbreviated and length limit |
| `full` | `~/.pi/agent/extensions/powerline-footer` | Complete path with home abbreviated |

Configure via preset options: `path: { mode: "full" }`

## Git polling

By default the git segment polls both branch and dirty state. If background `git status --porcelain` calls interfere with your workflow, use branch-only polling:

```json
{
  "powerline": {
    "git": { "polling": "branch" }
  }
}
```

Use `"off"` to disable extension-owned git polling entirely and only show the branch reported by Pi when available.

## Git host icon

Set `git.hostIcon` to replace the branch icon with the origin remote's host logo:

```json
{
  "powerline": {
    "git": { "hostIcon": true }
  }
}
```

The origin remote is detected (SSH or HTTPS) and mapped to an icon: GitHub (`nf-fa-github`), GitLab (`nf-fa-gitlab`), Bitbucket (`nf-fa-bitbucket`), or a generic git logo (`nf-fa-git`) for any other remote (self-hosted, Gitea, Codeberg, …). Repositories without an origin remote keep the plain branch icon (`nf-fa-code_fork`), as do ASCII (non–Nerd Font) setups. The remote is read once and cached, so this adds no per-render cost. Default is `false` (branch icon unchanged).

## Git status extras (commits, ahead/behind)

The git segment can also show the last commit on `HEAD` (short hash + subject) and the upstream ahead/behind counts — handy for a quick "where am I relative to main" GitHub signal:

- `git.showCommit` (`true` by default) — appends `#<hash> <subject>` for the latest commit.
- `git.maxCommitSubjectLength` (`24`) — truncates the commit subject shown.
- `git.showAheadBehind` (`true` by default) — appends `↑<n> ↓<n>` for commits ahead/behind the configured upstream (hidden when there is no upstream).

```json
{
  "powerline": {
    "git": { "showCommit": true, "showAheadBehind": true, "maxCommitSubjectLength": 24 }
  }
}
```

The `minimal` and `compact` presets keep these off to stay lean; set `showCommit: true`/`showAheadBehind: true` to enable them.

## Segments

`model` · `shell_mode` · `path` · `git` · `subagents` · `queue` · `token_in` · `token_out` · `token_total` · `cost` · `context_pct` · `context_total` · `time_spent` · `time` · `session` · `hostname` · `cache_read` · `cache_write` · `thinking` · `tps` · `open_ports` · `extension_statuses`

## Separators

`powerline` · `powerline-thin` · `slash` · `pipe` · `dot` · `chevron` · `star` · `block` · `none` · `ascii`

## Theming

Colors are configurable via pi's theme system. Each preset defines its own color scheme, and you can override individual colors and icons with a `theme.json` file in the extension directory.

### Default colors

| Semantic | Theme Color | Description |
|----------|-------------|-------------|
| `model` | `#d787af` | Model name |
| `shellMode` | `accent` | Bash mode segment |
| `path` | `#00afaf` | Directory path |
| `gitClean` | `success` | Git branch (clean) |
| `gitDirty` | `warning` | Git branch (dirty) |
| `thinking` | `thinkingOff` | Thinking level (`off`) |
| `thinkingMinimal` | `thinkingMinimal` | Thinking level (`minimal`) |
| `thinkingLow` | `thinkingLow` | Thinking level (`low`) |
| `thinkingMedium` | `thinkingMedium` | Thinking level (`medium`) |
| `context` | `dim` | Context usage |
| `contextWarn` | `warning` | Context usage >70% |
| `contextError` | `error` | Context usage >90% |
| `cost` | `text` | Cost display |
| `tokens` | `muted` | Token counts |
| `queue` | `accent` | Queue / ideas / blocked counts |
| `separator` | `dim` | Segment separators and ahead/behind counts |
| `border` | `borderMuted` | Panel/border chrome |

### Custom theme override

Create `extensions/powerline-footer/theme.json` in the agent dir (`~/.pi/agent` by default, or `PI_CODING_AGENT_DIR` when set):

```json
{
  "colors": {
    "model": "accent",
    "shellMode": "accent",
    "path": "#00afaf",
    "gitClean": "success",
    "thinking": "thinkingOff",
    "thinkingMinimal": "thinkingMinimal",
    "thinkingLow": "thinkingLow",
    "thinkingMedium": "thinkingMedium"
  },
  "icons": {
    "auto": "↯",
    "warning": ""
  }
}
```

Colors can be:

- **Theme color names**: `accent`, `muted`, `dim`, `text`, `success`, `warning`, `error`, `border`, `borderAccent`, `borderMuted`
- **Hex colors**: `#ff5500`, `#d787af`

Icons can be any string, including `""` when you want to suppress a specific glyph entirely.

For npm package installs, this documented agent-dir file is separate from the package files under `~/.pi/agent/npm/node_modules`. The extension reads the agent-dir override first, then falls back to a `theme.json` colocated with the loaded extension file. Use `/reload` or restart Pi after creating or editing `theme.json`.

See `theme.example.json` for all available options.
