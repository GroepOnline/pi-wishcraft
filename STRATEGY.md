---
name: pi-wishcraft
last_updated: 2026-08-28
---

# pi-wishcraft Strategy

## Target problem

pi-wishcraft today is a bundle of loosely-coupled segments (motion, ports, bash, vibes, skills) — each works on its own, none hangs together. There is no "this is how pi should feel" layer. The crux: wishcraft is not yet a default skin, it is a grab-bag of features.

## Our approach

pi-wishcraft is a customizable, feel-good default skin for pi — vibrant, warm, and tunable down to the last spinner. Where a tool must be finished to ship, a skin evolves, so we ship fast and iterate; perfection is the wrong goal. The bet: **vibe + customization depth** — the difference between wishcraft and any other pi extension is not feature count, it is that the skin lives.

## Who it's for

**Primary:** someone installing pi on day 1, typing `/wishcraft`, and choosing their first preset within five minutes — without reading the manual. They are hiring pi-wishcraft to make pi feel like their terminal, with essentials (bash, /cd, skills, health) already working on day one.

## Key metrics

- **Essentials-reliability** — bash-mode session breaks + ports/health crashes per release, measured via GitHub issues and npm feedback. Regresses the moment the foundation rots.
- **First-touch customization** — % of fresh installs where a settings-file write happens within 7 days (opt-in local usage file). Stand-in for "felt at home" until real telemetry is in place.
- **Customization depth** — average number of active theme / segment / preset tweaks per user after 30 days (settings file). Indicates "made it theirs."

## Tracks

### How we work

Every track runs the same loop: **observe → root-cause → simplify → ship**. Half-finished work is removed, not shipped. Presets are data, not code, so the community can contribute via PR.

### Skin & feel

The v2 cutover landing this week: powerline, welcome, bash, ports, skills, motion as one coherent skin — not a pile of segments. The first preset must work out of the box.

_Loop in this track:_ segment crashes and motion stalls are bugs, not features; we trace and remove them before adding more.

### Customization depth

Every detail tunable — colour, font, animation, spinner, preset. Deck and (soon) Studio are the two entry points. Presets and segments live as data so users and the community can extend without forking.

_Loop in this track:_ presets that no one uses get simplified or removed; a knob nobody touches is dead weight.

### Skill Studio & modes

Studio (in progress, U5+) as the in-process workshop for skills, plus extension modes like creator, PTC, minimal, code, verbose. Joins up with deepseek, codex, claude, and oh-my-pi conventions — wishcraft does not ship its own harness.

_Loop in this track:_ advice that users ignore is a signal; modes that feel "cool" but unused get cut.

## Not working on

- A standalone agents / harness runtime — wishcraft plugs into existing harnesses, never replaces one.
- Tool-product features that don't make the skin more beautiful or more tunable (analytics dashboards, productivity trackers).
- Mobile / web / cloud variants — pi is terminal-native; that stays the case.
