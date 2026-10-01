# Configuration

## Custom items from extension statuses

You can promote any extension status key into its own dedicated powerline item. This gives you a general way to register your own status items without changing this extension.

1. Any extension can publish status text through `ctx.ui.setStatus("my-key", "...value...")`.
2. Configure `powerline.customItems` to place those keys on the left, right, or secondary row.

```json
{
  "powerline": {
    "preset": "default",
    "customItems": [
      {
        "id": "ci",
        "statusKey": "ci-status",
        "position": "right",
        "prefix": "CI",
        "color": "warning"
      },
      {
        "id": "review",
        "position": "secondary",
        "hideWhenMissing": false,
        "prefix": "review"
      }
    ]
  }
}
```

`customItems` fields:

- `id` (required): unique item id (`a-z`, `A-Z`, `0-9`, `_`, `-`)
- `statusKey` (optional): extension status key to read, defaults to `id`
- `position` (optional): `left`, `right`, or `secondary` (default `right`)
- `prefix` (optional): text shown before the live status value
- `color` (optional): any Pi theme color (`warning`, `accent`, etc.) or hex (`#RRGGBB`)
- `hideWhenMissing` (optional): hide item when no status is present (default `true`)
- `excludeFromExtensionStatuses` (optional): omit this key from the aggregate `extension_statuses` segment (default `true`)

### Auto-promote every status key (`customItems.auto`)

Instead of listing each status key explicitly, set `powerline.customItems.auto: true` to turn every live extension status key into its own right-aligned segment. This is the ChefBar status bridge: any extension that calls `ctx.ui.setStatus("some-key", "value")` gets a matching segment automatically, without edits to this extension.

```json
{
  "powerline": {
    "customItems": {
      "auto": true
    }
  }
}
```

Auto items follow the same rules as explicit items: notification-style statuses, internal/excluded keys, and keys already claimed by an explicit item are skipped, and each auto item is excluded from the aggregate `extension_statuses` segment so a status renders exactly once. Mix `auto` with explicit entries by using the object form of `customItems`:

```json
{
  "powerline": {
    "customItems": {
      "auto": true,
      "ci": { "statusKey": "ci-status", "prefix": "CI", "color": "warning" }
    }
  }
}
```

If you still prefer the older string preset config shape, `"powerline": "default"` continues to work. String preset shorthand keeps `welcome` enabled and uses the default shortcut/cost/model display settings.

## Custom segments (computed, no code)

Define your own segments directly in settings: run a command, read an env var, or show static text. No TypeScript needed.

```json
{
  "powerline": {
    "preset": "chef",
    "segments": {
      "battery": { "type": "command", "command": "cat /sys/class/power_supply/BAT0/capacity", "prefix": "batt", "cacheMs": 30000 },
      "who":     { "type": "env", "env": "USER", "prefix": "u", "color": "#888888" },
      "chef":    { "type": "static", "text": "CHEF", "color": "accent" }
    }
  }
}
```

Each segment becomes usable in a preset as `custom:<id>` (e.g. `custom:battery`).

Segment fields:

- `type` (required): `command` | `env` | `static`
- `command` (command type): shell command to run; output is trimmed
- `cacheMs` (command type, optional): how long to reuse the previous output before re-running. Defaults to `1000`ms; clamped to `100`–`300000`ms
- `env` (env type): environment variable to read
- `fallback` (env type, optional): text shown when the variable is unset (omit to hide the segment)
- `text` (static type): fixed text
- `prefix` (optional): text shown before the value
- `color` (optional): Pi theme color (`warning`, `accent`, ...) or hex (`#RRGGBB`)

Command segments run **in the background**, never inside a paint: the status line shows the previous output (or nothing on the very first frame) and repaints when the command finishes. A hung command is capped at 5s and its output at 512 characters.

If a command fails or an env var is unset without a fallback, the segment renders nothing. A failed command is reported as a fault marker (`!custom:<id>`) on the next paint rather than being silently hidden.

## Custom presets

Define your own preset in settings; it merges over built-ins and is selectable via `powerline.preset` (or `/powerline <name>`).

```json
{
  "powerline": {
    "preset": "mine",
    "segments": { "battery": { "type": "command", "command": "cat /sys/class/power_supply/BAT0/capacity", "prefix": "batt" } },
    "presets": {
      "mine": {
        "left": ["hostname", "model", "custom:battery", "git"],
        "right": ["tps", "open_ports", "cost", "time"],
        "separator": "slash",
        "colors": { "model": "text" },
        "segmentOptions": { "path": { "mode": "basename" } }
      }
    }
  }
}
```

### Build a preset from the menu

You don't have to edit JSON: `alt+p` → `Configure…` → `Build custom preset…` walks you through naming a preset, choosing a base preset (for its colors + segment options), picking left/right/secondary segments, and choosing a separator. It saves the result under `powerline.presets.<name>`, sets it as the active preset, and applies it immediately.

## Segment labels (custom text)

Rename the text shown for **any** segment via `powerline.segmentLabels` (a map of segment id → label). The label appears between the icon and the value. Works for built-in segments, custom segments, and custom items alike.

```json
{
  "powerline": {
    "segmentLabels": {
      "tps": "speed",
      "open_ports": "ports",
      "time": "clock",
      "git": "branch"
    }
  }
}
```

## Segment templates (custom value format)

Full control over the rendered value with `powerline.segmentOptions.<id>.template`. The placeholder `{value}` is replaced with the segment's value text (the icon and label, if any, stay in place).

```json
{
  "powerline": {
    "segmentOptions": {
      "tps": { "template": "{value} tok/s" },
      "open_ports": { "template": "{value} listeners" }
    }
  }
}
```

## Disabling segments

Set `powerline.disabledSegments` to hide built-in or configured custom segments from the active preset. You can also toggle segments live from the `alt+p` menu (`Configure…` → `Toggle segment visibility…`), which persists to `powerline.disabledSegments`:

```json
{
  "powerline": {
    "preset": "default",
    "disabledSegments": ["cost", "extension_statuses", "custom:ci"]
  }
}
```

Built-in names are listed under Segments in [Segments & theming](./segments.md). Custom items use `custom:<id>`. Unknown names are ignored with a startup warning.

## Open-ports host (fleet)

Make `open_ports` probe a named SSH host instead of the laptop:

```json
{
  "powerline": {
    "segmentOptions": {
      "openPorts": { "host": "sofie", "includeUdp": false }
    }
  }
}
```

See [Segments & theming](./segments.md) for the probe's best-effort behavior and requirements.

## Bash Mode performance and workflow

Bash Mode keeps a project-scoped command history, supports Bash/Zsh/Fish history recall, Git-aware completion, path completion, file drops, ghost suggestions, and safe `!`/`!!` commands. Ghost suggestions are coalesced during rapid typing and cancelled when the editor context changes, so completion never blocks command entry.

Use `ctrl+shift+b` to toggle Bash Mode. `Escape` exits the mode, `Tab` accepts one completion token, `Right Arrow` accepts the full ghost suggestion, and the configured editor-boundary shortcuts jump to the start/end of the input. Commands are not submitted while another shell command is running.

## Working indicator

The agent's working indicator can use a compact animated frame style. Each style has a distinct visual grammar: `dots` is a quiet three-dot cadence, `pulse` is a centered heartbeat, `bar` is a travelling progress sweep, and `ascii` is a terminal-safe bracketed spinner. Accessibility settings can collapse all four to a static frame.

The indicator is intentionally separate from the structural appearance motion: it describes immediate agent activity, while appearance motion describes Signal/deck transitions and ambient state. Choose one of the following depending on the desired feel:

| Style | Character | Best for |
|---|---|---|
| `dots` | gentle sequential dots | unobtrusive everyday use |
| `pulse` | expanding/contracting center | clear activity at a glance |
| `bar` | travelling block across a track | high-information dashboards |
| `ascii` | portable `[=]`, `[-]`, `[.]` frames | SSH, basic terminals, and logs |

 Configure it under `wishcraft.workingIndicatorStyle`; supported values are `dots` (default), `pulse`, `bar`, and `ascii`. Motion accessibility settings still apply: reduced/off motion uses a static frame.

```json
{
  "wishcraft": {
    "workingIndicatorStyle": "pulse"
  }
}
```

The Skills route in the Deck and `/skills` manager share one catalog. Use `/skills doctor` to inspect frontmatter, descriptions, duplicate names, warnings, and usage; `/skills new [template]` creates a safe starter skill. Skill deletion is restricted to canonical skill roots.

## Appearance

`powerline.appearance` is independent of the information layout (`powerline.preset`). The structural base paints Signal colors and motion. Layout presets (`default`, `minimal`, `compact`, `full`, `nerd`, `ascii`, `chef`) keep their segment lists until you change `preset`.

```json
{
  "powerline": {
    "preset": "chef",
    "appearance": {
      "base": "lanternwake"
    }
  }
}
```

Bases: `lanternwake`, `threadbound`, `scryglass`, `runebloom`, `moonwell`, `hexforge`, `vellum`, `wisp`, `starweave`, `crucible`. They are deliberately different rather than aliases: each has its own palette, chrome geometry, Signal lane layout, glyph vocabulary, welcome treatment, and signature motion event. Apply from Deck → Appearance → Enter, `/wishcraft settings`, or `/signal hexforge` (a structural layout name also writes `appearance.base`). Optional mix keys: `palette`, `signalLayout`, `chrome`, `glyphs`, `deck`, `welcome`, `motion`.

Quick personality guide:

- `lanternwake`: warm ember glow and relay motion; welcoming and expressive.
- `threadbound`: woven separators and linked transitions; structured and calm.
- `scryglass`: cool observatory palette; sparse, analytical readout.
- `runebloom`: ornamented glyphs and bloom transitions; mystical and decorative.
- `moonwell`: blue night palette with slow tidal motion; quiet long sessions.
- `hexforge`: hard-edged blocks and tool-centric motion; dense engineering mode.
- `vellum`: restrained paper-like contrast; documentation and review work.
- `wisp`: lightweight, airy signal; lowest visual weight while remaining animated.
- `starweave`: constellation accents and travelling signal; exploratory sessions.
- `crucible`: high-contrast heat and decisive transitions; incident/debug mode.

Until `appearance` is set, Signal keeps the layout preset colors. If `preset` itself is a structural name and `appearance` is empty, that name is treated as the base.

`powerline.motionLevel` is `full`, `reduced`, `functional`, or `off`. Host flags still win: `NO_COLOR`, `WISHCRAFT_MOTION`, `WISHCRAFT_SCREEN_READER`, and `PREFER_REDUCED_MOTION`. Deck Motion → Enter writes `powerline.appearance.motion.<event>`.

## Status bridge for other extensions

Powerline publishes its own state under a stable key set so ChefBar and other extensions can read it without depending on powerline internals:

| Status key | Value |
|------------|-------|
| `powerline.preset` | Active preset name (e.g. `chef`) |
| `powerline.tps` | `POWERLINE_TPS` override, cleared when live rate is used |
| `powerline.ports` | Open-port count (`?` when a fleet host probe fails) |

The keys update on preset change, `/tps`, the open-ports list, and the UDP toggle. They are intentionally hidden from powerline's own `extension_statuses` segment (they exist for other extensions to consume).

## Cost alert

Set `powerline.costAlert` to a USD threshold to get a single warning notification per session when the running session spend (assistant + subagent cost) reaches it. Omit it or set `0` to disable.

```json
{
  "powerline": {
    "costAlert": 5
  }
}
```

## Hooks and repairs

Command hooks live under `wishcraft.hooks` in the **global** agent settings file. `wishcraft.hooksEnabled: false` is the kill-switch. A hook is any command that reads JSON on stdin; exit code 2 denies the tool call, stdout may return a `hookSpecificOutput` payload. Definitions come from the global file only — project `.pi/settings.json` cannot install new hook commands.

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

**Example hook** (exit 2 = deny):

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

**Another example** (append-only, never blocks):

```bash
#!/usr/bin/env bash
mkdir -p "$HOME/.pi/agent/logs"
cat >> "$HOME/.pi/agent/logs/write-audit.jsonl"
```

**SessionStart example** (extra context, never blocks):

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

Declarative policy rules (`wishcraft.policy`) live in the same global file. They run in-process before command hooks: **deny** blocks a tool call when input matches a regex; **inject** appends context after a matching read/write path. `wishcraft.policyEnabled: false` disables policy without deleting rules. No shell commands — pure in-process regex.

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

## Token budget

`wishcraft.tokenBudget.daily` is a token count (input + output + cache). At 80% the cost segment turns warning-coloured; at 100% it turns red and welcome notifies. It never blocks a turn.

```json
{
  "wishcraft": {
    "tokenBudget": { "daily": 500000 }
  }
}
```

## Custom layout

Use `powerline.layout` to override segment order and grouping while keeping the selected preset's colors and segment options. Set `powerline.separator` when you want a separator style independent of the preset:

```json
{
  "powerline": {
    "preset": "default",
    "separator": "chevron",
    "layout": {
      "left": ["model", "thinking", "path", "git"],
      "right": ["context_pct", "cost"],
      "secondary": ["custom:ci"]
    },
    "customItems": [
      { "id": "ci", "statusKey": "ci-status" }
    ]
  }
}
```

A present `left`, `right`, or `secondary` array replaces that preset group exactly; an empty array clears it. Omitted groups keep the preset entries and automatically append custom items by their configured `position`. Explicitly listing a segment moves it out of omitted preset groups, and explicitly placed custom items are not auto-appended elsewhere. `disabledSegments` is applied after layout. `separator` accepts any style listed in [Segments & theming](./segments.md); omit it to keep the preset's separator.

Responsive behavior is unchanged: these groups control ordering and overflow priority, not permanently pinned terminal rows. `right` means "later primary segments," not right-edge alignment. On wide terminals secondary entries can fit in the top bar; on narrow terminals primary overflow moves into the secondary line. Some segments are hidden when they have no value, so `thinking` appears only when the active session/model reports a non-`off` thinking level. Unknown entries are ignored with a startup warning. The old fixed `custom` preset has been removed; combine any preset with `layout` instead.

## Demo settings

For a compact current footer setup:

```json
{
  "powerline": {
    "preset": "default",
    "path": { "mode": "basename" },
    "model": { "display": "name" },
    "cost": { "subscriptionDisplay": "subscription", "currency": "USD" }
  }
}
```

Use `"model": { "display": "qualified" }` when two providers expose models with the same display name.

### Cost currency

`cost.currency` accepts `USD`, `CNY`, `EUR`, `GBP`, `JPY`, `CAD`, `AUD`, `CHF`, `INR`, or `KRW`. Pi reports costs in USD; non-USD display uses a keyless USD FX rate fetched in the background and cached for 24 hours under the Pi agent directory. If no cached rate is available yet, the cost segment renders `-- CODE` until a later footer refresh can use the fetched rate.

### Subscription cost display

| Mode | Subscription + reported cost | Subscription + no reported cost |
|------|------------------------------|----------------------------------|
| `subscription` | `(sub)` | `(sub)` |
| `reported-cost` | `$0.12` | `(sub)` |
| `both` | `$0.12 (sub)` | `(sub)` |

### Segment display formats

Opt-in; defaults match the historical rendering.

| Segment option | Values | Default | Effect |
|---|---|---|---|
| `"context": { "format" }` | `"full"` / `"percent"` | `"full"` | `"percent"` shows a bare rounded `83%` (threshold-colored, no icon) instead of `12k/200k (6.2%)` |
| `"cache_read": { "format" }` | `"tokens"` / `"percent"` / `"both"` | `"tokens"` | `"percent"` shows the cache hit rate `cacheRead / (input + cacheRead)` instead of the raw token count; `"both"` shows raw tokens plus the hit rate, e.g. `cache in: 12k (80%)` |
| `"tps": { "windowMs" }` | number, clamped to 500–5000 | `1000` | Length of the sliding rate window; widen it (e.g. `2000`) for a smoother read on very fast models |
| `"<segment>": { "template" }` | string with `{value}` | — | Replaces the segment's value text; see Segment templates above |

```json
{
  "powerline": {
    "context": { "format": "percent" },
    "cache_read": { "format": "both" }
  }
}
```

## Where settings live

Pi merges two files; the **project** file wins on any key it also defines in the global file.

| Scope | Path | Wins over |
|---|---|---|
| Global | `~/.pi/agent/settings.json` | — |
| Project | `<cwd>/.pi/settings.json` | global |

`/wishcraft doctor` shows this on one screen: both files' health, every value shadowed by the other file, near-miss keys with a "did you mean" suggestion, and every stored value that validation discards (with the reason and the default that applies instead). The same report is rendered as a section of the Deck's **Diagnostics** route.

## Configure from the prompt

Every registered setting is readable and writable without leaving pi — no editor, no `settings.json` detour:

```text
/wishcraft get powerline.preset          # stored · global/project/default → effective
/wishcraft set powerline.preset chef     # validated write, applies immediately
/wishcraft set motion.level red          # unique prefix → reduced
/wishcraft set powerline.welcome off     # toggles take on/off
/wishcraft unset powerline.preset        # back to the default (alias: reset)
/wishcraft help                          # the grammar, one line
```

Tab completes subcommands, every registered path, and the values a setting accepts (`choices` for selects, `on · off` for toggles). The same validation runs everywhere — the CLI, `/wishcraft settings`, the setup wizard and the doctor all read one registry, so a value the CLI accepts is a value the overlay accepts.

Deliberate boundaries:

- **Scalars only.** Structured values (`powerline.layout`, `powerline.segments`, `wishcraft.policy`, `powerline.presets`) stay in `settings.json`; the CLI refuses them with a pointer instead of writing a broken shape.
- **Writes land where the key already exists** (project file if it defines the root, otherwise global) — the same precedence `readSettings` uses.
- **`get` works even when Signal is disabled**; configuration never depends on the status line.

Settings the CLI and overlay expose, beyond the presets and segment options: the whole `bashMode.*` group (toggle shortcut, transcript limits, init script), all nine `powerlineShortcuts` bindings, `powerline.costAlert`, `powerline.stashSharpSShortcut`, `powerline.customItemsAuto`, `powerline.queue.retentionHours`, `wishcraft.policyEnabled`, and the git/model/ports segment toggles. `examples/settings.example.json` remains the reference for every key at its default.

## Interface language

```json
{ "wishcraft": { "locale": "nl" } }
```

`en` (default) or `nl`. The setting appears as **Language** under *Interface* in `/wishcraft settings`, and applies immediately — no restart. Anything unknown, malformed, or region-tagged (`nl-NL`, `en_US`) resolves safely, and a message with no translation falls back to its built-in English string, so switching locale can never blank a surface. Set `PI_WISHCRAFT_LOCALE` to pick a language before settings are read.

Localised surfaces: Deck route names and chrome, settings labels/hints/group titles, the configuration overlay, the welcome overlay and its widgets, the setup wizard, and the diagnostics copy. Segment values, model names, branch names and other data are data — they stay as-is.

## First-run setup

```text
/wishcraft setup
```

Four questions — language, status preset, motion level, welcome overlay — then a review screen and one write to `settings.json`. Every step is also editable later from `/wishcraft settings`.

On the very first launch the welcome panel shows three next steps under **Getting started** instead of a changelog wall. Later launches show the usual changelog delta under **What's new**.

## Segment options: two accepted shapes

Segment options may be written either hand-edited at the top level of `powerline`, or nested under `powerline.segmentOptions` (the shape the settings UI writes):

```json
{
  "powerline": {
    "tps": { "windowMs": 2000 },
    "segmentOptions": { "path": { "mode": "abbreviated" } }
  }
}
```

Both are read; when a segment appears in both places the nested `segmentOptions` copy wins for the keys it defines.
