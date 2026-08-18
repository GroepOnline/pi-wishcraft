# Roadmap — pi-wishcraft

Herschreven 2026-08-18. Vervangt de 0.18.0-editie. Tweede pass dezelfde dag:
onderscheid aangescherpt, 0.19.0 teruggebracht tot wat we écht kunnen
shippen, harness en skills-UI doorgeschoven naar 0.20.

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

### PR A — runtime-bugs (in flight)

Branch `fix/skill-hygiene-and-runtime-bugs`. Isolated worktree. Scope:

1. `ook.md` / `test.md` weg; `EXTENSION_DIR` uit discovery;
   `src/**/*.md` / `src/**/*.txt` uit `package.json` files.
2. `/skills` filter: printable toetsen → `SelectList.setFilter`
   (prefix op `value`; v2 krijgt substring).
3. `availableSkills` resetten op `session_start` en `session_shutdown`.
4. Inline-triggers: woordgrens vóór `/` of `$`; `/naam` niet expanderen
   als `naam` een geregistreerd slash-command is (`pi.getCommands()` +
   statische fallback). Unclosed ` ``` ` telt als exclude-tot-EOF.
5. Bash-session: `dispose()` ruimt `tempDir` op; sentinel-parse breekt
   niet op `:` in cwd.
6. `permissions: contents: read` op `test.yml`.

Done: tests in `tests/inline-invocation.test.ts`,
`tests/skill-manager.test.ts`, `tests/bash-mode.test.ts` dekken de
gevallen hierboven. Geen debris meer in `npm pack --dry-run`.

### PR B — config-afmakers

Bestanden: `src/config/`, `src/segments/`, `src/extension/ui/`.

1. `segmentLabels` toepassen in `renderSegment` voor **alle** segments
   (nu alleen tps/open_ports).
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

1. `npm run release minor` → 0.19.0 (bump + changelog + commit + tag).
2. Push GroepOnline SSH (`chefadmin-netizen`):
   `GIT_SSH_COMMAND='ssh -F ~/.ssh/config-groeponline -o IdentityFile=~/.ssh/sheesh' git push origin HEAD --tags`.
3. Verify: tag op origin, publish-job groen, `npm view @groeponline/pi-wishcraft version` = 0.19.0.
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

### PR E — hooks

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

### PR F — tool-input repairs

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
unit-testen. Sluit CHE-42. CHE-40 is shipped in 0.18.0 (Linear:
Canceled / Duplicate). CHE-41 wordt de per-segment detail view in
1.0, geen tweede `alt+i`-pad.

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
| CHE-40 tab-completion | Shipped 0.18.0. Linear: Canceled (Duplicate van wishcraft v2). |
| CHE-41 alt+i info | Wordt 1.0 detail-view. Ticket hernoemen of GRO-child. |
| CHE-42 drill-down | = 0.20 PR G. Hernoemen naar wishcraft / GRO. |

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

- [ ] PR A gemerged: filter, debris, cache, triggers, bash-leaks,
      CodeQL. Verify-trio groen.
- [ ] `npm pack --dry-run` bevat geen `ook.md` / `test.md`.
- [ ] PR B gemerged: labels, template, TPS-opties, visibility.
      Verify-trio groen.
- [ ] PR C: `npm run release minor` → 0.19.0 (of 0.18.1 als alleen
      A klaar is). Tag + publish + `npm view` klopt.
- [ ] README skills-sectie waar; deze ROADMAP in sync.
- [ ] CHE-40 Canceled in Linear. CHE-41/42 comment + hernoemen.
