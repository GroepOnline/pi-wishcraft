<p align="center">
  <img src="https://raw.githubusercontent.com/GroepOnline/pi-wishcraft/main/banner.png" alt="Pi Wishcraft — operator cockpit for the Pi coding agent" width="100%">
</p>

<h1 align="center">Pi Wishcraft</h1>

<p align="center"><strong>Your operator cockpit for Pi.</strong><br>A live powerline status bar, idea queue, skill search, sticky Bash, hooks, policy controls and session UX — one keypress away, without leaving the terminal.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@groeponline/pi-wishcraft"><img src="https://img.shields.io/npm/v/@groeponline/pi-wishcraft.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@groeponline/pi-wishcraft"><img src="https://img.shields.io/npm/dm/@groeponline/pi-wishcraft.svg?label=downloads" alt="npm downloads"></a>
  <a href="https://pi.dev/packages/@groeponline/pi-wishcraft"><img src="https://img.shields.io/badge/Pi-package-9b59b6.svg" alt="Pi package"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-555.svg" alt="MIT license"></a>
</p>

<p align="center"><img src="https://raw.githubusercontent.com/GroepOnline/pi-wishcraft/main/docs/images/wishcraft-cockpit-map.svg" alt="Wishcraft cockpit map showing Signal, Deck, idea capture, skills, managed shell and local guardrails around Pi" width="100%"><br><sub>The shipped operator surfaces. Pi remains the agent runtime.</sub></p>

## Start in 10 seconds

```bash
pi install npm:@groeponline/pi-wishcraft
```

Reload Pi, then press `alt+p` to open the Deck. Two flows make Wishcraft click fastest:

```text
# remember to benchmark the new provider path
/ideas
```

The `#` line is captured as an idea instead of being sent as a prompt — your active run keeps going. Then `/skills` opens the picker: search, inspect and insert a skill without leaving the session.

## Why Wishcraft

Pi stays the engine. Wishcraft adds the operator layer around it: live status, overlays, idea capture, skill search, sticky Bash, hooks, policy controls and session UX.

Kongming lanterns started as battlefield signals and later carried wishes. Wishcraft keeps both ideas in one place: telemetry while the work is moving, and thoughts you can park until you are ready for them.

**Portfolio boundary:** Wishcraft owns the operator cockpit and lightweight idea capture. Promote durable work to [`pi-missions`](https://github.com/GroepOnline/pi-missions), then use [`pi-agent-orchestrator`](https://github.com/GroepOnline/pi-agent-orchestrator) when parallel or isolated execution adds value: `idea -> mission -> orchestration run`.

## What you get

| Surface | What it does |
| --- | --- |
| Signal | Motion-aware three-lane operator status: model/Git, live activity/tool state, and context/queue. Default placement is the editor top border; `/signal placement below` moves it. |
| `alt+p` | Wishcraft Deck: session, Signal, skills, ideas, guardrails, shell, **ports**, usage, appearance, motion, shortcuts, diagnostics. `g` + jump key. `/wishcraft settings` is the flat list; `/signal menu` is Navigate / Configure / Status. |
| `# <idea>` | File-backed inbox. Does not send the prompt. `/ideas` reviews status, tags, and skill insert. `/ideas next` feeds the oldest active idea into the session. |
| `alt+s` | Stash the draft, ask something else, get it back when the run finishes. |
| `/skills` | Overlay search on name, description, and path. Enter inserts. `/skills doctor` is the health table. `/skills new` writes a SKILL.md from a template. |
| `!cmd` / bash mode | Managed shell with ghost suggestions from project history. No shell-native completion probes. |
| Hooks + repairs | Command hooks on pi events. Custom-tool input repairs before execution. Kill-switch: `wishcraft.hooksEnabled`. |
| Read hints | Appends a one-line continuation hint after a partial `read`, so the model knows the next offset. Opt-out: `wishcraft.readHints: false`. |
| Policy | In-process deny/inject rules in global settings. No spawn. Kill-switch: `wishcraft.policyEnabled`. |
| Working indicator | Four deterministic styles (`dots`, `pulse`, `bar`, `ascii`) with accessibility-aware static fallbacks. |
| Welcome art | `lantern`, `balloon`, and `normal` opening artwork, each with a different silhouette and narrow-terminal fallback. |

Pi owns the footer chrome, feed scrolling, and input. Wishcraft supplies widgets, overlays, and the bash/stash/editor integrations. The bar is not clickable; actions are commands and overlays.

## Daily commands

Activates on load. `/signal` toggles it. `/signal <preset>` switches the information layout. `/wishcraft` opens the Deck. Tab completes presets, `placement above|below|toggle`, and every `/wishcraft` subcommand and setting path. `/powerline` remains a compatibility alias.

```text
/signal doctor        settings, queue, git, bash, fonts
/signal export        current preset + layout as JSON
/tps                  live in/out overlay (same ring as the segment)
/usage                session / today / week token ledger
/repairs              tool-input repair counters
/skills               skill manager  ·  /skills doctor  ·  /skills new [name]
/ideas                idea review overlay (status, tags, skill insert)
/wishcraft            Deck overlay (operator surface)
/wishcraft get <key>  one setting: stored → source → effective
/wishcraft set <k> <v> validated write (Tab completes paths + values)
/wishcraft unset <k>  remove a stored value, back to default
/wishcraft settings   flat settings TUI  ·  setup  ·  doctor
/open-ports           listening sockets (filter, r refresh, enter copy)
/cd <path>            continue this conversation in another directory
/bash-mode            sticky shell  (also ctrl+shift+b)
/vibe star trek       themed working messages
```

Configuration never needs an editor: `set` validates against the same registry the settings TUI and wizard use, applies immediately, and writes to the file that already owns the key. Structured values (layout, custom segments, policy) stay in `settings.json`. See [Configure from the prompt](docs/configuration.md#configure-from-the-prompt).

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
    "welcome": true,
    "appearance": { "base": "lanternwake" }
  }
}
```

`chef` is muted colors, slash separators, live TPS in/out, and TCP port count. Built-in presets: `default`, `minimal`, `compact`, `full`, `nerd`, `ascii`, `chef`. For every setting at its default, see [`examples/settings.example.json`](examples/settings.example.json).

Daily token budget (never blocks a turn):

```json
{ "wishcraft": { "tokenBudget": { "daily": 500000 } } }
```

At 80% the cost segment warns; at 100% it goes red and welcome notifies. `/usage` shows the ledger.

## Hooks, policy, and guardrails

Hooks are commands that read JSON on stdin; policy is in-process regex evaluated before them. Definitions live in the **global** settings file only, and `wishcraft.hooksEnabled: false` / `wishcraft.policyEnabled: false` are the kill-switches. Full copy-paste examples — a destructive-`rm` deny hook, an append-only audit hook, a SessionStart git-status hook, and two policy rules — are in [docs/configuration.md](docs/configuration.md#hooks-and-repairs).

Privacy/network boundary: ideas, settings, usage ledgers, and normal cockpit state stay local; there is no package-owned telemetry backend. Optional exchange-rate/DeepWiki features and operator-defined hooks cross the network/process boundary only when used.

## Limits

- No mouse on the live footer. Pi core owns that surface.
- No second `alt+i` product. Ports stay on `alt+i`; other detail is `→` in the navigator.
- Compatibility status keys (`powerline.preset`, `powerline.tps`, `powerline.ports`) are available to peer extensions; normal Wishcraft use does not require them.
- The legacy `@groeponline/pi-powerline-footer` package is deprecated in favor of `@groeponline/pi-wishcraft`.
- Tags are not rewritten. 0.19.x through current stay on the timeline.

## vNext direction

Wishcraft is Pi's animated operator layer. See the [release plan](docs/design/vnext-release-plan.md) and [design corpus](docs/index.md#design-system--vnext-specifications).

## Docs

- [Commands](docs/commands.md) — every slash command and keybind
- [Configuration](docs/configuration.md) — settings, hooks, policy, custom segments
- [Segments and theming](docs/segments.md) — presets, colors, separators
- [Bash mode](docs/bash-mode.md) · [Stash and shortcuts](docs/stash-and-shortcuts.md)
- [Skill manager](docs/skill-manager.md) · [Working vibes](docs/working-vibes.md)
- [ROADMAP](ROADMAP.md)

Guides live in [`docs/`](docs/index.md).

MIT. Issues: [GroepOnline/pi-wishcraft](https://github.com/GroepOnline/pi-wishcraft/issues).
