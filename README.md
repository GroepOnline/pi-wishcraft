<p>
  <img src="banner.png" alt="pi-wishcraft" width="1100">
</p>

# pi-wishcraft

Cockpit and harness for the [pi](https://github.com/badlogic/pi-mono) coding agent: a live status bar, overlay menus, skills, an idea inbox, sticky bash, hooks, and tool-input repairs. Stock pi stays the engine. This package is the operator layer.

Kongming lanterns started as battlefield signals and later carried wishes. Wishcraft is that split in a coding session: telemetry on the bar, thoughts you can park without interrupting the run.

Install `@groeponline/pi-wishcraft`. It is listed on the [Pi package catalog](https://pi.dev/packages?name=wishcraft). Grew out of [`nicobailon/pi-powerline-footer`](https://github.com/nicobailon/pi-powerline-footer). Maintained by [GroepOnline](https://github.com/GroepOnline).

Guides live in [`docs/`](docs/index.md). This page is the contract: what ships, how to install it, and what can fail.

## Install

Pi package manager (usual path):

```bash
pi install npm:@groeponline/pi-wishcraft
```

Ephemeral VMs / CI:

```bash
curl -fsSL https://raw.githubusercontent.com/GroepOnline/pi-wishcraft/main/scripts/install.sh | bash
```

Then restart pi or `/reload`. Peer range is `@earendil-works/pi-coding-agent` `>=0.81.0 <0.85.0`.

## What you get

| Surface | What it does |
| --- | --- |
| Status bar | Git, TPS (1s window over a 5s ring), context, cost, ports, queue. Default placement is the editor top border; `/powerline placement below` moves it. |
| `alt+p` | Three overlays: Navigate, Configure, Status. In Navigate, `→` / `tab` opens per-segment detail (ports, git, cost, context). `alt+i` is the ports list. |
| `# <idea>` | File-backed inbox. Does not send the prompt. `/ideas` reviews status, tags, and skill insert. `/ideas next` feeds the oldest active idea into the session. |
| `alt+s` | Stash the draft, ask something else, get it back when the run finishes. |
| `/skills` | Overlay search on name, description, and path. Enter inserts. `/skills doctor` is the health table. `/skills new` writes a SKILL.md from a template. |
| `!cmd` / bash mode | Managed shell with ghost suggestions from project history. No shell-native completion probes. |
| Hooks + repairs | Command hooks on pi events. Custom-tool input repairs before execution. Kill-switch: `wishcraft.hooksEnabled`. |
| Policy | In-process deny/inject rules in global settings. No spawn. Kill-switch: `wishcraft.policyEnabled`. |

Pi owns the footer chrome, feed scrolling, and input. Wishcraft supplies widgets, overlays, and the bash/stash/editor integrations. The bar is not clickable; actions are commands and overlays.

## Daily commands

Activates on load. `/powerline` toggles it. `/powerline <preset>` switches look. Tab completes presets and `placement above|below|toggle`.

```text
/powerline doctor     settings, queue, git, bash, fonts
/powerline export     current preset + layout as JSON
/tps                  live in/out overlay (same ring as the segment)
/tps 40               override POWERLINE_TPS
/usage                session / today / week from ~/.pi/agent/wishcraft-usage.json
/repairs              tool-input repair counters
/skills               skill manager
/skills doctor        health table (broken frontmatter, dupes, unused, budget)
/skills new [name]    write a SKILL.md from a template
/ideas                idea review overlay (status, tags, skill insert)
/wishcraft            settings TUI
/open-ports           listening sockets
/cd <path>            continue this conversation in another directory
/bash-mode            sticky shell  (also ctrl+shift+b)
/vibe star trek       themed working messages
```

Queue:

- `# <text>` current project; `# @global`, `# @current`, `# @alias`
- `/idea`, `/ideas`, `/queue` for capture, send, retry, clear, archive
- `/ideas` overlay: `reviewStatus` (`idea` / `in-progress` / `done`), tags, Run with skill X

Keybinds (`powerlineShortcuts`, applied after `/reload`; `null` disables):

```json
{
  "powerlineShortcuts": {
    "menu": "alt+p",
    "info": "alt+i"
  }
}
```

## Minimal config

`~/.pi/agent/settings.json` (or `PI_CODING_AGENT_DIR`):

```json
{
  "powerline": {
    "preset": "chef",
    "placement": "above",
    "welcome": true
  }
}
```

`chef` is muted colors, slash separators, live TPS in/out, and TCP port count. Built-in presets: `default`, `minimal`, `compact`, `full`, `nerd`, `ascii`, `chef`. Custom segments, labels, layout, and presets are documented in [docs/configuration.md](docs/configuration.md). For every setting at its default, see [`examples/settings.example.json`](examples/settings.example.json).

Nerd Fonts auto-detect for iTerm, WezTerm, Kitty, Ghostty, and Alacritty; ASCII otherwise. `POWERLINE_NERD_FONTS=0` forces ASCII.

Context turns warning above 70% and error above 90%. TPS is tokens in the last ~1s, not a session average. `/tps` reads that ring; it does not start a second sampler.

Daily token budget (never blocks a turn):

```json
{
  "wishcraft": {
    "tokenBudget": { "daily": 500000 }
  }
}
```

At 80% the cost segment warns; at 100% it goes red and welcome notifies. `/usage` shows the ledger.

## Hooks

Hooks are commands that read JSON on stdin. Definitions come from the **global** agent settings file only. Project `.pi/settings.json` cannot install new hook commands. `wishcraft.hooksEnabled: false` disables every hook without deleting the config.

```json
{
  "wishcraft": {
    "hooksEnabled": true,
    "hooks": {
      "preToolUse": [
        { "matcher": "bash", "hooks": [{ "command": "~/.pi/agent/hooks/bash-guard.sh", "timeout": 5 }] }
      ],
      "postToolUse": [
        { "matcher": "write", "hooks": [{ "command": "~/.pi/agent/hooks/write-audit.sh", "timeout": 5 }] }
      ],
      "sessionStart": [
        { "hooks": [{ "command": "~/.pi/agent/hooks/session-git-status.sh", "timeout": 10 }] }
      ]
    }
  }
}
```

**bash-guard** (exit 2 = deny):

```bash
#!/usr/bin/env bash
payload=$(cat)
cmd=$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
if printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])rm[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*-r[a-zA-Z]*f|-fr[a-zA-Z]*|[[:space:]]/[[:space:]]*$'; then
  printf '%s\n' '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"blocked destructive rm"}}'
  echo "blocked destructive rm" >&2
  exit 2
fi
exit 0
```

**write-audit** (append-only, never blocks):

```bash
#!/usr/bin/env bash
mkdir -p "$HOME/.pi/agent/logs"
cat >> "$HOME/.pi/agent/logs/write-audit.jsonl"
```

**SessionStart git-status** (extra context, never blocks):

```bash
#!/usr/bin/env bash
status=$(git status --short 2>/dev/null | head -n 40)
CTX="$status" python3 - <<'PY'
import json, os
print(json.dumps({
  "hookSpecificOutput": {
    "additionalContext": "git status:\n" + os.environ.get("CTX", "")
  }
}))
PY
```

Repairs run on custom/extension tools only, before hooks: drop null optionals, parse JSON-string arrays before wrapping, turn `{}` into `[]` on array keys, wrap bare strings, alias `filePath` / `absolutePath` / `target_file` to `path`, unwrap degenerate markdown auto-links. Core tools (`bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`) are never rewritten. `/repairs` prints the counters.

## Policy

Declarative deny/inject rules in the **global** agent settings file. No shell commands — pure in-process regex. Evaluated before command hooks. `wishcraft.policyEnabled: false` disables policy without deleting rules.

```json
{
  "wishcraft": {
    "policy": [
      {
        "action": "deny",
        "tool": "bash",
        "match": "sudo\\s+rm",
        "reason": "destructive sudo rm"
      },
      {
        "action": "inject",
        "tool": "read",
        "pathMatch": "\\.env",
        "context": "Do not leak secrets from .env files into the conversation."
      }
    ]
  }
}
```

**deny** — regex on tool input (`bash` uses `command`; other tools use JSON-serialized input). First match wins; the tool call is blocked with `reason`.

**inject** — regex on file path after a matching tool completes; context is appended to the tool result (same shape as postToolUse hook `additionalContext`).

## Limits

- No mouse on the live footer. Pi core owns that surface.
- No second `alt+i` product. Ports stay on `alt+i`; other detail is `→` in the navigator.
- ChefGroep status keys (`powerline.preset`, `powerline.tps`, `powerline.ports`) exist for other extensions. They are not the public pitch.
- `npm deprecate` of the old `@groeponline/pi-powerline-footer` name is a scope-owner action. That package stays at 0.17.2 until the token allows it.
- Tags are not rewritten. 0.19.x through current stay on the timeline.

## Docs

- [Commands](docs/commands.md)
- [Configuration](docs/configuration.md)
- [Bash mode](docs/bash-mode.md)
- [Stash and shortcuts](docs/stash-and-shortcuts.md)
- [Skill manager](docs/skill-manager.md)
- [Working vibes](docs/working-vibes.md)
- [Segments and theming](docs/segments.md)
- [ROADMAP](ROADMAP.md)

MIT. Issues: [GroepOnline/pi-wishcraft](https://github.com/GroepOnline/pi-wishcraft/issues).
