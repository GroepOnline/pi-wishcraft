# Commands & interactivity

## Usage

Activates automatically. Toggle with `/signal` (alias `/powerline`). Switch layouts with `/signal <name>`. `/signal menu` opens Navigate / Configure / Status. `/wishcraft` opens the Deck; `/wishcraft settings` is the flat list. Move the primary row with `/signal placement above|below|toggle`.

Use `/cd <path>` to continue the current conversation from another working directory. It supports relative paths, absolute paths, `~`, `~/...`, and directory completions. With no argument, `/cd` prints the current Pi session directory. The command switches into a cwd-updated session file so Pi tools and the footer path segment agree after the change.

### Powerline Queue + Inbox

Commands and capture shortcuts:

- `# <text>`: capture an idea for the current project without sending it to the agent
- `# @global <text>`: capture a global idea
- `# @current <text>`: capture an idea targeted to the current session
- `/queue alias <name> [path]`: save a project alias, defaulting to the current cwd when `path` is omitted
- `# @name <text>`: capture an idea for a saved project alias
- `/compact <text>`: compact now and queue `<text>` as the next prompt after successful compaction
- `/idea [@target] <text>`: command form of idea capture, useful for scripts and users who disable the sigil
- `/idea issue [id]`: hand the oldest active idea, or a specific idea, to the current agent for safe GitHub issue triage
- `/ideas`: open the idea-review overlay (status, tags, run with skill)
- `/ideas next`: send the oldest active idea that is not review-done
- `/ideas issue [id]`: ask the current agent to dedupe and file a GitHub issue only when the target repo is clear and owned/controlled
- `/ideas send <id>`: send an idea to the current session
- `/queue`: open the queued-prompt picker
- `/queue send [id]` / `/queue retry [id]`: deliver a queued item now
- `/queue clear <id|all>`: clear queued prompt items
- `/queue target <id> @name|global|current`: retarget a queued item
- `/queue archive [hours]`: move completed items older than the retention window from `inbox.jsonl` into `inbox.archive.jsonl`

The default capture sigil is `#`. When the editor text starts with `#` followed by a space, the prompt glyph changes to `#`; pressing Enter saves the idea, clears the editor, and leaves the original sigil text in editor history for quick recovery. Configure or disable this under `powerline.queue.captureSigil`:

```json
{
  "powerline": {
    "queue": {
      "captureSigil": "#"
    }
  }
}
```

Set `captureSigil` to `false` if you often submit markdown headings and prefer `/idea` instead.

`powerline.queue.retentionHours` (default `24`) controls how long completed (sent) items stay in the inbox before `/queue archive` moves them to `inbox.archive.jsonl` and before the store prunes them on the next write:

```json
{
  "powerline": {
    "queue": {
      "captureSigil": "#",
      "retentionHours": 72
    }
  }
}
```

Captured data is stored under the Pi agent directory in `powerline-footer/inbox.jsonl` and `powerline-footer/projects.json`. `inbox.jsonl` is a stable read surface for orchestrators and helper agents; each line is a queue item with `id`, `text`, `createdAt`, `updatedAt`, `source`, `target`, `intent`, `status`, optional `error`, and for ideas optional `reviewStatus` (`idea` | `in-progress` | `done`) and `tags`. Legacy lines without those fields still parse. Writes should still go through Powerline commands or the store so locking and atomic writes are preserved. Ideas sent with `/ideas next` or `/ideas send <id>` include a small provenance header so the receiving agent can treat them as deferred captured context. `/ideas` opens the review overlay (same chrome as `/skills`): set review status and tags, or **Run with skill X** to insert the skill body plus the idea into the editor. The welcome queue widget shows the next idea and `/ideas next`; welcome dismisses on any key, so that widget does not bind enter-to-send. `/idea issue` and `/ideas issue` do not file issues directly from the extension; they send a guarded handoff prompt that tells the current agent to dedupe open issues first, create a GitHub issue only for a clear owned/controlled repo, and ask before filing when the target is unclear.

### Placement

- `/powerline placement below`: move the primary powerline row below the editor
- `/powerline placement above`: restore the default placement
- `/powerline placement toggle`: switch between above and below

You can also set it in the agent settings file (`~/.pi/agent/settings.json` by default, or under `PI_CODING_AGENT_DIR`) or project-local `.pi/settings.json`:

```json
{
  "showLastPrompt": true,
  "powerline": {
    "preset": "default",
    "placement": "below",
    "welcome": true
  }
}
```

## Presets

| Preset | Description |
|--------|-------------|
| `default` | Balanced daily driver: model, thinking, path (basename), git (branch + dirty + latest commit + ↑/↓ ahead-behind + host icon), session, queue, subagent cost, tokens in/out, cache-hit%, cost, context |
| `minimal` | Just path (basename), git branch and context% (branch-only polling, no indicators/commit) |
| `compact` | Model, git (short commit + ahead/behind), queue, cost, context%, session id |
| `full` | Everything: hostname, model, path (abbreviated), full git incl commit + ↑/↓, totals, context total, elapsed + clock |
| `nerd` | Maximum detail for Nerd Font users: qualified model, full tokens + cache, commit, totals, seconds clock |
| `ascii` | Safe for any terminal: branch + short commit + ↑/↓, tokens, cost, context% (no Nerd glyphs) |
| `chef` | Fork default: muted colors, slash separators, live TPS in/out + open-ports + subagent-cost segments |

**Environment:** `POWERLINE_NERD_FONTS=1` to force Nerd Fonts, `=0` for ASCII.

Preset selection is saved under `powerline` in the agent settings file and restored on startup. Run `/powerline default` to switch back to the default preset.

## Interactivity

Pi core renders the footer as static text, so live click is not possible; actions live in commands and a navigable overlay.

- `/tps`: overlay of the live 1s window (same ring as the segment). `/tps <value>` sets `POWERLINE_TPS`
- `/usage`: session / today / week overlay from `~/.pi/agent/wishcraft-usage.json`
- `/open-ports`: list listening ports and pick one
- `/powerline doctor`: diagnostics overlay — settings file validity, unknown presets, Nerd Font detection, git polling, bash-mode status, and queue file health
- `/powerline export`: export the current preset + effective layout + labels as a JSON snippet (Enter copies it to the clipboard)
- `alt+p`: **Wishcraft Deck** — operator overlay (Home, Signal, Skills, Ideas, Guardrails, Appearance, …). `g` then a jump key (`h` home, `s` signal, `a` appearance). Escape closes. `/signal menu` still opens Navigate / Configure / Status.
- `alt+i`: **powerline info**: full open-ports list
- `/wishcraft [route]`: open the Deck at a named route (`appearance`, `skills`, …)
- `/wishcraft settings`: flat settings TUI, including `powerline.appearance.base` and `powerline.motionLevel`
- Deck **Motion**: gallery + composer. `t` picks the event, Enter applies, `e` opens the composer
- Deck **Skills**: workbench list with health; Enter inserts the skill body

Both `alt+p` and `alt+i` are rebindable (see Keybinds below); changes apply after `/reload`.

## Keybinds

The powerline menu and info shortcuts are configurable via `powerlineShortcuts` (same map as the other powerline shortcuts), with automatic conflict resolution. Set a binding to `null` to disable it.

```json
{
  "powerlineShortcuts": {
    "menu": "alt+p",
    "info": "alt+i"
  }
}
```

Changes apply after `/reload` (the extension re-registers shortcuts on reload).
