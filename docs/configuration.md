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
- `cacheMs` (command type, optional): cache output for N ms to avoid re-spawning a shell every paint
- `env` (env type): environment variable to read
- `fallback` (env type, optional): text shown when the variable is unset (omit to hide the segment)
- `text` (static type): fixed text
- `prefix` (optional): text shown before the value
- `color` (optional): Pi theme color (`warning`, `accent`, ...) or hex (`#RRGGBB`)

If a command fails or an env var is unset without a fallback, the segment renders nothing.

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

Command hooks live under `wishcraft.hooks` in the **global** agent settings file. `wishcraft.hooksEnabled: false` is the kill-switch. See the README Hooks section for three copy-paste examples (bash-guard, write-audit, SessionStart git-status).

Tool-input repairs apply to custom/extension tools only (`wishcraft.repairsEnabled`, default on). `/repairs` prints the counters.

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
