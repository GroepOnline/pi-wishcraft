# Roadmap — what to improve & how to integrate better

Status after 0.18.0. Package is `@groeponline/pi-wishcraft` (renamed from `@groeponline/pi-powerline-footer` in 0.17.x; `src/` restructured by domain; `madge --circular` runs in CI). Concrete, prioritized. Not commitments — pick what Joep wants.

## Next release (0.19.0)

- `npm deprecate @groeponline/pi-powerline-footer "Renamed to @groeponline/pi-wishcraft"` — the old package name still resolves on npm at 0.17.2 and is not deprecated yet. Needs the `@groeponline` scope owner's npm login (no publish auth on the laptop).
- Generalize `segmentLabels` to every segment (today only tps/open_ports honor it; apply in `renderSegment`).
- Per-segment `format`/`template` override (`segmentOptions.tps.template: "{value} tok/s"`).
- Visibility toggle per segment from the `alt+p` menu (writes `powerline.disabledSegments` live).
- `segmentOptions.tps.windowMs` — expose the 1s window length for fast models (Groq).

## Already shipped

- 0.18.0 (wishcraft v2, #7): tab token completion, preset rework, git commit/ahead-behind extras, TPS in/out, `/skills` TUI, `src/extension` split into domain subfolders.
- 0.17.x: package renamed to `@groeponline/pi-wishcraft`; `src/` restructure committed; `madge --circular` is a CI step in `test.yml`; inline skill/command invocation (`/` skills, `$` commands) landed in 0.17.3.

## Correctness (done, keep honest)

- TPS = 1s sliding window over a 5s sample ring. **Verify it stays this way** if anyone touches `tpsSegment`. Do not regress to session-average or per-render EMA (both spike: `tps:12775`, `tps:1118`).
- Open-ports = unique TCP by default; `openPorts.includeUdp` opts in. Column parsing is column-agnostic (ss + netstat).
- Context segment hides on `contextWindow <= 0` (no more `NaN`/`??`).

## Configurability improvements (next, low effort)

1. **Labels for every segment, not just tps/open_ports.** Today `segmentLabels` is applied inside the two custom segments. Generalize: apply in `renderSegment` so `model`, `git`, `cost`, `context_pct`, `time`, … all honor a label. Small diff, big consistency win.
2. **Per-segment `format`/`template` override.** Let users set e.g. `segmentOptions.tps.template: "{value} tok/s"` or `time.format: "HH:mm"`. Template > label for full control.
3. **Visibility toggle per segment from the menu.** `Configure…` already changes preset/TPS/UDP/labels; add "disable segment" / "enable segment" that writes `powerline.disabledSegments` live (no edit-the-JSON round-trip).
4. **Preset editor in the menu.** Build a custom preset interactively (pick left/right segments) and save it to settings — today custom presets are JSON-only.
5. **`segmentOptions.tps.windowMs`** — expose the 1s window length so fast models (Groq) can widen it for a smoother read.

## Interaction improvements (the "levendig + klikbaar" thread)

1. **Sub-menus via stacked overlays.** `ctx.ui.custom()` closes on `done()`; a sub-menu opens a new `custom()`. Today the menu uses `ctx.ui.select` (flat). Upgrade the navigator + configure to overlay `SelectList` for arrow nav + descriptions, matching the segment-navigator chrome.
2. **Per-segment "more info" on a second key.** In the navigator, `enter` activates, `→`/`tab` opens a detail view for that segment (full ports list, git diff summary, cost breakdown, context window math). This is the "soort gelijk menu maar anders waar je bijv alle open ports kan zien" Joep asked for.
3. **Live refresh while the overlay is open.** Overlays re-render on `tui.requestRender()`; wire a light timer so the ports list / TPS detail tick while open.
4. **Mouse support** — not available; Pi core owns the footer. Keep documenting that overlay nav is the equivalent.

## Integration with ChefGroep surfaces

1. **ChefBar / command center.** Expose powerline state (preset, TPS, ports, cost) via `ctx.ui.setStatus("powerline-tps", …)` so ChefBar/other extensions can read it. Already partly there (extension statuses); formalize a stable key set (`powerline.tps`, `powerline.ports`, `powerline.preset`).
2. **joep-ops / Vault dashboard.** The same `ss`/token data could feed a fleet dashboard. Factor `countListeningPorts` + a token-rate sampler into a tiny shared module both can import (keep it in this repo, export it).
3. **PostHog.** Capture preset/menu usage events (`powerline.preset_changed`, `powerline.menu_opened`) per the org instrumentation rule — only if Joep opts in; the bar itself stays telemetry-free.
4. **Fleet (sofie/bc-scan-2).** `open_ports` is laptop-local. A fleet variant could SSH-probe a named host's ports; gate behind a `segmentOptions.openPorts.host` setting.

## Release/quality

1. **Dependabot vulns** — GitHub flagged 7 (3 high, 4 moderate) on default branch. Triage; most are devDep transitive. Add `npm audit` to CI as non-blocking info, or pin.
2. **Test the menu.** The overlay/menu functions aren't unit-tested (hard to test `ctx.ui.custom` headless). Add a thin `SelectList`-based pure function for "build segment items" and test that, leaving the overlay shell untested.
3. **Typecheck in pre-push.** `prepublishOnly` already runs `tsc` so a bad type never ships even if CI is skipped.

## Not doing (YAGNI)

- No mouse/click on the live footer (Pi core limitation; overlay nav is the path).
- No custom "embed/component" registration for footer segments — segments are data (text), and `customItems` + `command/env/static` segments already cover user-defined content. `setWidget`/`registerEntryRenderer` are for chat, not the footer.
- No third control surface — keep interactivity in this extension's overlays + commands.
