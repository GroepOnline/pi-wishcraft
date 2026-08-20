# Roadmap — pi-wishcraft

Herschreven 2026-08-18. Vierde pass 2026-08-20: conflict-restant uit
`19d6cc0` weg. 0.19-code + catalogus staan op main (#12, #11). Overlay-
submenus en de rest van de repairs blijven 0.20. CHE-40 is follow-up,
geen 0.19-blocker. `v0.19.0` en `v0.19.1` staan op npm.

Pi core is de engine. Wishcraft is de cockpit. Elke feature dient één van
drie doelen: **grip** (skills, tokens, config), **prestatie** (repairs,
hooks, read-hints), of **leven** (overlays, vibes, detail views).

Elke release is één campagne met een done-criterium. P1 = deze release,
P2 = volgende, P3 = richting 1.0. Wat in 0.19 staat, shipt. Wat later
staat, start niet eerder.

---

## Waarom wij bestaan

De pi-extensiewereld heeft statusbalken. Ze heeft geen cockpit.

**Upstream `nicobailon/pi-powerline-footer`** is een goede balk: git,
context, stash, compaction-queue, vibes, welcome, bash-mode. Wij zijn
daaruit gegroeid. Wat zij niet hebben, en wat onze publieke identiteit
is:

| Wij | Zij / de rest |
|---|---|
| Skills als OS: `/skills`, inline `/$`, usage, later doctor | Geen skill-manager |
| Idee → actie: `#`, `/idea`, `/ideas`, `/ideas issue` | Alleen compaction-hold queue |
| Eerlijke TPS: 1s-venster over 5s-ring, in/out gescheiden | Session-average of helemaal niks |
| Tab-token completion + git ahead/behind | Niet of later |
| Harness-laag (0.20): hooks + tool-input repairs op stock pi | Nergens in het extensie-ecosysteem |

**oh-my-pi** is een hele agent-fork (~80k regels Rust-core, eigen tools,
LSP, DAP). Dat is een ander product. Wij forken Mario's pi niet. Alles
wat we willen van oh-my-pi vertalen we naar een extensie of we laten het
liggen. De weddenschap: de beste cockpit op stock pi wint van een
tweede engine.

**Command Code** is een commerciële harness (hooks, tool-call repairs,
read-tool engineering). Hun inzicht klopt: open modellen falen op het
contract, niet op "slimheid". Wij kopiëren hun product niet. We gieten
dezelfde principes in wat Pi al native biedt:

- `pi.on("tool_call")` — `event.input` is mutable; `block` + `reason` +
  `terminate` bestaan (`pi-coding-agent` 0.84.x
  `dist/core/extensions/types.d.ts`).
- `pi.on("tool_result")` — resultaat muteren.
- `pi.on("session_start" | "input" | "turn_end")`.

Geen core-patch. Geen tweede agent. Iedereen die `pi` draait kan de
cockpit + harness installeren.

**ChefGroep** (ChefBar-statuskeys, fleet-ports) is een privé-bonus, niet
de publieke pitch. De npm-pagina moet leesbaar zijn voor iemand die pi
gisteren installeerde.

Kort: **wij zijn de cockpit + harness voor stock pi.** Niet de balk.
Niet de fork. Niet de SaaS-agent.

---

## Wat wij niet worden

- Geen agent-fork. Geen oh-my-pi-lite.
- Geen derde control surface naast ChefBar / Kater. Overlays blijven in
  deze extensie.
- Geen muis op de live footer. Pi core bezit die; overlay-navigatie is
  het pad.
- Geen eigen bulk-read tool. Core's verantwoordelijkheid; wij leveren
  repairs + hints eromheen.
- Geen PostHog in de balk. Events alleen op expliciete Joep-opt-in.
- Geen custom embed/component-registratie voor footer-segments.
  Segments zijn data; `customItems` + `command/env/static` dekken
  gebruikerscontent.
- Geen skills-markt als identiteit vóór 1.0. Eerst discovery die klopt
  en een manager die zoekt.
- Geen fleet-SSH `open_ports` totdat iemand het concreet vraagt.
- Geen versie-reset naar 1.0.0. We blijven op 0.19 → 0.20 → 1.0 wanneer
  de cockpit stabiel is.

---

## Mijlpalen

- **0.19.0 — "Correctheid"** (deze campagne). Bugs en hygiëne eerst.
  Kleine config-afmakers. Geen hooks, geen repairs, geen manager-v2-UI,
  geen overlay-submenus. Done = npm 0.19.0 live, `/skills` filtert,
  `$test` expandeert geen debris, `npm test` + `npm run typecheck` +
  `madge --circular` groen op de tag. Als de config-PR uitloopt:
  tag **0.18.1** met alleen PR A (bugs). Correctheid wacht niet op
  labels.
- **0.20.0 — "Harness"**. Hooks + tool-input repairs + skills-manager
  v2-UI + token-overlays. Done = drie README-hookvoorbeelden werken,
  repair-teller zichtbaar, `/skills` zoekt op naam+beschrijving+pad.
- **1.0 — "Cockpit"**. Skills-doctor/install, declaratieve policy,
  preset-editor, idee-review, stabiele ChefGroep-statuskeys,
  documentatie die waar is. Done = README dekt alles wat we shipten,
  geen kapotte footer-belofte.

---

## 0.19.0 — Correctheid

Eén campagne, drie stacked PRs. Volgorde vast. Elke PR: `npm run
typecheck && npm test && npx madge --circular src index.ts bash-mode
queue` groen vóór review. Overlay-submenus (CHE-42) zitten in 0.20.

### PR A — runtime-bugs — ✅ geland in `feat/wishcraft-0.19` (samen met skills v2, hooks, lantern-welcome, `/wishcraft` config-TUI; supersedeert #10)

Alle zes punten uit het oorspronkelijke plan zitten in de ene 0.19-branch:
debris weg, filter werkend (v2: substring i.p.v. prefix), cache-invalide op
`session_start` + TTL, woordgrens op inline-triggers, unclosed-fence EOF,
bash-session tempdir + sentinel-colon, `permissions: contents: read`.
`npm pack --dry-run` bevat geen debris (113 files, geen `ook.md`/`test.md`).

### PR B — config-afmakers — ✅ geland in `feat/wishcraft-0.19` / #12

Bestanden: `src/config/`, `src/segments/`, `src/extension/ui/`.

1. `segmentLabels` toepassen in `renderSegment` voor **alle** segments
   (nu alleen tps/open_ports/subagents).
2. `segmentOptions.<seg>.template` wint van label
   (`"{value} tok/s"`).
3. `segmentOptions.tps.windowMs` (default 1000), `.mode`
   (`both | out | in | total`), `.hideIdle` (default true).
4. Visibility-toggle in het `alt+p`-menu schrijft live
   `powerline.disabledSegments`.

Done: unit tests op label/template/windowMs-resolutie; handmatige
check: label op `git` + `cost` zichtbaar, TPS hidden bij 0 wanneer
`hideIdle`.

### PR C — release 0.19.0

1. Merge naar `main` triggert `release.yml`: `node scripts/release.mjs auto --push`.
   Commits sinds `v0.18.0` bevatten `feat:` → **0.19.0**. Handmatig blijft
   `npm run release minor` + tag-push mogelijk.
2. Tag-job publiceert met org-secret `NPM_TOKEN` (geen repo-override).
3. Verify: tag op origin, publish-job groen, `npm view @groeponline/pi-wishcraft version` = 0.19.0.
   Catalogus (hard): `npm run verify:package` groen in de release-job;
   `npm view @groeponline/pi-wishcraft keywords` bevat `pi-package`,
   `pi-extension`, `wishcraft`; `pi.image` is de banner-URL.
   Daarna:
   - https://pi.dev/packages/@groeponline/pi-wishcraft toont 0.19.0
   - https://pi.dev/packages?name=wishcraft toont de card
   - https://pi.dev/packages?name=groeponline toont wishcraft naast
     fff en orchestrator
   Detailpagina bestaat al voor 0.18.0; de zoekindex niet. Nieuwe
   publish + discovery-keywords is de refresh. Catalogus-lag tot
   een paar uur is oké; ontbreken na 24u = 0.19.1 met dezelfde
   metadata, geen stille "later wel".
4. README: skills-sectie zegt dat filter werkt; geen `ook`/`test`
   debris. ROADMAP sync (deze file).
5. `npm deprecate @groeponline/pi-powerline-footer` blijft een
   scope-owner actie buiten deze PR (`deprecate-old-name.yml`,
   workflow_dispatch). Blokkeert 0.19 niet.

Hygiëne die al klaar is en niet opnieuw gepland wordt:

- Fork-tags weg (51 upstream-tags, 2026-08-18). Eigen reeks vanaf
  `v0.10.0`.
- `banner.png` blijft (README). `wishcraft-concept.png` gaat weg in
  PR A of een docs-PR, niet in de balk-runtime.
- CHANGELOG inkorten (GRO-1060) doen we **niet** in 0.19. Erfgoed
  is history, geen cruft.
- Versie blijft 0.19, geen reset naar 1.0.0.

GRO-1061 (runner-queue) is ops, geen product-slice.

---

## 0.20.0 — Harness

Vier stacked PRs. Pas starten als 0.19 (of 0.18.1) op npm staat.

Overlay-chrome kit, één keer, daarna hergebruiken: box + ronde hoeken,
accent-kop, dim metadata, rechts uitgelijnde counts, `→` detail /
`←` terug / `esc` weg, consistente footer-hints. Eerste consument =
skills v2; tweede = `/usage`; derde = queue/idea. Pure render-
functies, geen `ctx.ui`-mock.

### PR E — hooks — ✅ geland in `feat/wishcraft-0.19` (`src/extension/hooks/`, `/repairs` stats-command; README-voorbeelden volgen in de release-PR)

Settings: `wishcraft.hooks` met events
`preToolUse | postToolUse | sessionStart | turnEnd`. Per hook
`matcher` (toolName-regex) en `command` (JSON stdin/stdout, timeout
30s, max 600s). PreToolUse: `allow | deny` + reason die het model
ziet. Exit 2 = deny, stderr-eerste-regel = reason. PostToolUse /
SessionStart: `additionalContext`. Kill-switch
`wishcraft.hooksEnabled: false`. PreToolUse sequentieel (eerste deny
stopt); PostToolUse/turnEnd parallel.

Done: `parseHookOutput` unit-testen. README met drie werkende
voorbeelden: bash-guard (`rm -rf /` blokkeren), write-audit
(append-only log), SessionStart git-status injectie.

### PR F — tool-input repairs — ✅ geland in `feat/wishcraft-0.19` (schema-loze subset: null-for-optional + auto-link unwrap; schema-afhankelijke repairs wachten op validator-issues in pi core)

`tool_call`-handler repareert bekende malformaties vóór executie
(mutable input). Volgorde vast: json-parse vóór bare-wrap.

1. `null` voor optioneel weglaten.
2. JSON-string-array → array.
3. `{}`-placeholder → array.
4. bare-string → array-wrap.
5. markdown-auto-link pads (`[x.md](http://x.md)` → `x.md`).
6. pad-alias `filePath` / `absolutePath` / `target_file` → `path`.

Repair-teller per `(tool, repair)` als extension status.
`wishcraft.repairsEnabled` default true. Scope: custom tools +
extensie-tools. Pi core-tools laten we met rust — core valideert
zijn eigen schema's.

Done: pure `repairToolInput(tool, input)` + table-driven tests voor
de zes gevallen + de parse-vóór-wrap invariant.

### PR G — overlay-submenus (CHE-42)

Het `alt+p`-menu krijgt gestapelde `SelectList`-overlays (pijltjes +
descriptions) in plaats van platte `ctx.ui.select`. Max drie
top-level ingangen. Pure functie `buildPowerlineMenuItems`
unit-testen. Sluit CHE-42. CHE-40 (`/powerline <tab>` subcommands)
blijft open — 0.18 shipped alleen bash token-step, niet deze
hiërarchie. Landt in 0.19 PR B of een kleine follow-up. CHE-41
wordt de per-segment detail view in 1.0, geen tweede `alt+i`-pad.

### PR H — skills manager v2 UI + token-overlays

Vervangt `skill-manager.ts` (242 regels). Data-laag bouwt op Pi
core `loadSkills` / `loadSkillsFromDir` / `Skill` /
`SkillFrontmatter` (publiek geëxporteerd in
`@earendil-works/pi-coding-agent`).

UI, niet onderhandelbaar:

- Zoeken die werkt: substring op naam + beschrijving + pad,
  case-insensitive; `ctrl+u` wist; lege match = rij
  `geen skills voor '<q>'`.
- Categorieën met kopregels (bundled / global / project / prompts);
  `tab` wisselt filter; `s` sorteert naam ↔ gebruik.
- `→` detail (frontmatter-tabel, usage, pad, body + scroll);
  `enter` insert; `e` opent `$EDITOR` (default nvim) via extern
  spawn zoals pi's `!`; `n` nieuwe skill in
  `~/.pi/agent/skills/<naam>/SKILL.md`; `d` delete + confirm.
- Usage-ledger `~/.pi/agent/skill-usage.json` (naam, timestamp,
  trigger-type). Best-effort, nooit blokkerend op de input hot path.
- Skill health: core-diagnostics als waarschuwingsicoon; `?` legt
  het uit.

Zelfde chrome als de segment-navigator. Nederlands, direct.

Tegelijk, klein:

- `/tps` overlay: in/out, piek + gemiddelde over de bestaande ring.
  Geen nieuwe sampler.
- `/usage` overlay: vandaag / deze week / deze sessie; per model;
  cache-hit %; ASCII-sparkline. File
  `~/.pi/agent/wishcraft-usage.json` (append-only, compaction bij
  drempel).
- `wishcraft.tokenBudget.daily` kleurt het segment rood en waarschuwt
  in welcome bij 80% / 100%. Nooit blokkerend.

Done: filter-tests op substring; usage-ledger tests; `/tps` leest
dezelfde ring als het segment (geen tweede waarheid).

---

## 1.0 — Cockpit

Pas na 0.20. Geen parallelle 1.0-tak.

1. **`/skills doctor`** — kapot frontmatter, te lange descriptions
   (prompt-budget), duplicates global/project, ongebruikte skills.
   Tabel, geen essay.
2. **`/skills new` templates** — standaard, browser-workflow,
   CLI-workflow, review-checklist. Install-van-GitHub/npm is
   post-1.0; 1.0 is doctor + templates, geen markt.
3. **Policy engine** — hooks zonder spawn: `deny bash matching
   "sudo rm"`, `context inject when reading .env`. Command-hooks
   blijven voor alles wat niet in een regel past.
4. **Preset editor** — links/rechts segmenten kiezen in het menu,
   opslaan in settings. Vandaag is custom JSON-only.
5. **Per-segment detail** (CHE-41): `→` in de navigator opent
   ports-lijst, git-samenvatting, cost-breakdown, context-math.
   Refresh bij openen, geen 500ms-timer.
6. **Idee-review** — `/ideas` in dezelfde overlay-taal; status
   idea / in-progress / done; tags; "verwerk met skill X".
   Welcome queue-widget: item oppakken → prompt.
7. **ChefGroep-keys** — stabiel `powerline.tps`, `powerline.ports`,
   `powerline.preset`, `powerline.skills.count` via
   `ctx.ui.setStatus`.
8. **Read-tool hints** — `tool_result` op `read` verrijken met
   "N regels, M–K getoond, volgende offset" alleen als core dat
   niet zelf al geeft. Eerst meten, dan aanvullen.

---

## Linear

| Ticket | Actie |
|---|---|
| GRO-1060 fork cleanup | Deels gedaan (tags). Rest = PR A debris + concept-png. CHANGELOG niet inkorten. Versie niet resetten. |
| GRO-1061 CI queue | Ops, niet deze roadmap. |
| CHE-40 `/powerline` tab | In Progress. `/powerline` tab completes presets and placement above, below, or toggle. |
| CHE-41 alt+i info | Wordt 1.0 detail-view. Ticket hernoemen of GRO-child. |
| CHE-42 drill-down | In Progress. Three top-level overlay entries plus Status drill-down. |

Oude `pi-powerline-footer`-projecttickets niet laten staan alsof
die package nog leeft.

---

## Kwaliteit (altijd)

- Overlay-logica testbaar via pure functies. Geen headless `ctx.ui`.
- `prepublishOnly` = `tsc --noEmit`. Een slecht type ship't niet.
- `madge --circular` blijft CI. Nieuwe map in `src/` → check mee.
- Dependabot-vulns (devDep-transitief): waiven, track op GRO-603.
  Niet required in CI. Geen stille bump van TypeScript 7 of
  `@types/node` 26 in een bug-PR.
- TPS-core blijft 1s sliding window over 5s-ring. Geen regressie
  naar session-average of per-render EMA (beide spikten:
  `tps:12775`).

---

## Residual risks

- `SelectList.setFilter` matcht alleen prefix op `value`. 0.19
  accepteert dat; 0.20 vervangt het.
- `npm deprecate` van de oude naam faalt tot de scope-owner het
  token verruimt. Gebruikers die `pi-powerline-footer` installeren
  blijven op 0.17.2.
- Hooks spawnen processen. Default timeout 30s; kill-switch moet
  in 0.20 vanaf dag één bestaan.
- Repairs op core-tools raken we niet aan. Als DeepSeek-achtige
  modellen daar alsnog op stuklopen, is dat een gesprek met pi
  core, geen stille override.
- `loadSkills` API-drift: we pinnen `@earendil-works/pi-coding-agent`
  `>=0.81.0 <0.85.0`. 0.20 neemt de publieke export over; bij
  breaking change blijven we op eigen scan tot de pin omhoog kan.
- Usage-ledger corruptie: best-effort write, kapot JSON → leeg
  object, nooit throw op de input-path.
- ChefGroep-keys in 1.0 mogen de publieke README niet gijzelen.

---

## Rollback

- PR A–H: revert-commit op `main`. Geen force-push.
- 0.19-tag te vroeg: laat de tag staan, ship `0.19.1` met de fix.
  Tags niet herschrijven.
- Fork-tags (51 stuks) zijn weg. Recovery = upstream remote
  `nicobailon/pi-powerline-footer` opnieuw fetchen, niet onze
  `v0.10.0+` overschrijven.
- DevDep-bumps (pi-* 0.84.2, TS 7) horen in een eigen PR met
  `npm ci` + de verify-trio. Revert = die PR revert + `npm ci`.

---

## Checklist (1:1 met 0.19)

- [x] PR A gemerged: filter, debris, cache, triggers, bash-leaks,
      CodeQL. Verify-trio groen. (#12)
- [x] `npm pack --dry-run` bevat geen `ook.md` / `test.md`.
- [x] PR B gemerged: labels, template, TPS-opties, visibility.
      Verify-trio groen. (#12)
- [x] Gallery-contract gemerged (`chore/pi-dev-gallery`): keywords,
      `publishConfig.access`, `pi.image`, `npm run verify:package`. (#11)
- [x] PR C: merge to `main` tagged `v0.19.0` then `v0.19.1` and published
      (`npm view` = `0.19.1`). Same-job bump publish via #16.
- [ ] README skills-sectie waar; deze ROADMAP in sync.
- [ ] CHE-40: `/powerline` subcommand-tab landt (deze branch) of blijft een
      open GRO-child. CHE-41/42 hernoemen.
