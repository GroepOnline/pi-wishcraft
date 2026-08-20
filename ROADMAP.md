# Roadmap — pi-wishcraft

Herschreven 2026-08-18. Zesde pass 2026-08-20: 0.19.0–0.22.2 staan
op npm. 0.20–0.22 harness is Done (CHE-40/41/42, GRO-1414, README
landing). Open werk is 1.0 cockpit: GRO-1415 en children GRO-1416–1421.

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
- Geen fleet-SSH `open_ports` zonder expliciete opt-in (`segmentOptions.openPorts.host`; sanitized, geen shell-injectie).
- Geen versie-reset naar 1.0.0. We blijven op 0.19 → 0.20 → 1.0 wanneer
  de cockpit stabiel is.

---

## Mijlpalen

- **0.19.0–0.19.2 — "Correctheid"** (geland). Bugs, hygiëne, catalogus,
  auto-release, `/powerline` tab. Hooks, repairs-subset en skills
  manager v2 UI gingen mee in #12, eerder dan deze sectie beloofde.
  Done = npm 0.19.2 live, `/skills` filtert, `$test` expandeert geen
  debris, verify-trio groen op de tag.
- **0.20.0–0.22 — "Harness"** (0.20.0–0.22.2 op npm). Overlay-chrome,
  CHE-42, Configure SelectList, token-overlays, rest-repairs, README-hooks,
  CHE-41 snapshot-detail, test-determinism. Done = drie hookvoorbeelden,
  repair-teller, `alt+p` overlay-boom, `/tps` deelt de ring met het segment.
- **1.0 — "Cockpit"** (open: GRO-1415). Skills-doctor, templates, policy,
  idee-review, `powerline.skills.count`, read-hints. Preset-editor en
  CHE-41 zijn al op `main`. Done = README dekt alles wat we shipten,
  `npm view` = 1.0.0, geen kapotte footer-belofte.

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

Vier stacked PRs. 0.20.0 (#19) en 0.21.0 (#13) staan op npm. CHE-42
Configure-overlay, doctor/export, queue-archive en `docs/` zijn geland.
GRO-1414 sluit README-hooks, rest-repairs, `/tps`+`/usage`, substring-filter.

Overlay-chrome kit, één keer, daarna hergebruiken: box + ronde hoeken,
accent-kop, dim metadata, rechts uitgelijnde counts, `→` detail /
`←` terug / `esc` weg, consistente footer-hints. Eerste consument =
skills v2; tweede = `/usage`; derde = queue/idea. Pure render-
functies, geen `ctx.ui`-mock.

### PR E — hooks — ✅ geland in `feat/wishcraft-0.19`; README-voorbeelden in GRO-1414

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

### PR F — tool-input repairs — ✅ schema-loze subset in 0.19; rest (JSON-array, `{}`, bare-wrap, path aliases) in GRO-1414. Core tools blijven met rust.

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

### PR G — overlay-submenus (CHE-42) — ✅ #19 + expansion (#13 reopen)

Het `alt+p`-menu krijgt gestapelde `SelectList`-overlays (pijltjes +
descriptions) in plaats van platte `ctx.ui.select`. Max drie
top-level ingangen. #19 landt de top-level boom (Navigate / Configure /
Status). Configure gebruikt nu `showSelectOverlay` (CHE-42 rest). CHE-40
is Done (#18). CHE-41 is Done: `→` in Navigate, snapshot bij openen, geen tweede `alt+i`-pad.

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

Same chrome as the segment navigator. English, direct.

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

0.20–0.22 zijn geland. Geen parallelle 1.0-tak naast harness-werk;
deze campagne is de 1.0-tak. Elke product-PR: verify-trio groen,
onafhankelijke review, squash op exact-head. `feat:` = 0.23+.
`feat!:` alleen op PR N = 1.0.0. Docs-only: `[skip release]`.

Locked defaults (no human gate): operator UI, overlays, notify
strings, and ROADMAP are **English** (no Dutch copy); description
budget 240 characters; policy from global settings only; idea
`reviewStatus` is a separate field (not `QueueStatus`); welcome
widget shows `/ideas next` (welcome dismisses on any key);
ChefGroep keys stay off the public README; read-hints only when
core omits range/offset.

### PR I — `/skills doctor` (GRO-1416) → 0.23.0

Tabel: kapot frontmatter, description > 240, duplicate naam
global/project, unused (ledger count 0). Geen essay. Pure
`diagnoseSkills` + overlay. `/powerline doctor` blijft settings/git.

### PR J — `/skills new` templates (GRO-1417) → 0.24.0

Na I (zelfde `skill-manager.ts`). Templates: standard,
browser-workflow, CLI-workflow, review-checklist. Schrijft
`~/.pi/agent/skills/<naam>/SKILL.md`. Vervangt de `ctrl+n`-stub.
Install-van-GitHub/npm is post-1.0.

### PR K — policy engine (GRO-1418) → 0.25.0

Hooks zonder spawn. `deny` bash matching `sudo\s+rm`; `inject`
wanneer `read` een `.env`-pad raakt. Command-hooks blijven voor
de rest. Eerste deny wint. `wishcraft.policyEnabled`. Parallel
met I (andere mappen).

### PR L — idee-review (GRO-1419) → 0.26.0

`/ideas` in dezelfde overlay-taal. `reviewStatus`: idea /
in-progress / done; `tags`; "verwerk met skill X". Welcome
queue-widget: volgende idee + `/ideas next`. Parallel met I/K.

### PR M — keys, read-hints, Status-trim (GRO-1420) → 0.27.0

`powerline.skills.count` naast bestaande preset/tps/ports.
Read-hints op `tool_result` na meten. Dode Status-rijen
(cpu/memory/network/uptime/version/logs/diagnostics) eruit;
ports / TPS / toggle blijven. Read-hints in
`session-lifecycle.ts` zodat K `hooks/index.ts` houdt.

### PR N — 1.0.0 cut (GRO-1421)

README dekt doctor, templates, policy, idee-review. ROADMAP
checklist af. `feat!: ship wishcraft 1.0 cockpit`.

Al geland, niet opnieuw bouwen:

4. **Preset editor** ✅ `runPresetEditor` in Configure (`alt+p`).
5. **Per-segment detail** (CHE-41) ✅ `→` in Navigate, snapshot
   bij openen, `alt+i` blijft ports.

---

## Linear

| Ticket | Actie |
|---|---|
| GRO-1060 fork cleanup | Done. Release-pad bewezen. CHANGELOG niet inkorten. Versie niet resetten. `banner.png` blijft. |
| GRO-1061 CI queue | Ops, niet deze roadmap. |
| CHE-40 `/powerline` tab | Done (#18 / 0.19.2). |
| CHE-41 per-segment detail | Done. `→` in Navigate; snapshot on open; `alt+i` stays ports. |
| CHE-42 drill-down | Done (#19 + Configure in #13). |
| GRO-1414 0.20 leftovers | Done (#20 / 0.22.0). |
| GRO-1415 1.0 parent | In Progress. Cockpit-campagne. |
| GRO-1416 `/skills doctor` | PR I. |
| GRO-1417 `/skills new` | PR J, blocked on 1416. |
| GRO-1418 policy | PR K. |
| GRO-1419 idee-review | PR L. |
| GRO-1420 keys + hints + Status | PR M. |
| GRO-1421 1.0.0 cut | PR N, blocked on 1416–1420. |
| GRO-1422 English-only UI | PR EN. Operator overlays and ROADMAP in English. |

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

- `SelectList.setFilter` matcht alleen prefix op `value`. Overlay-chrome
  filtert zelf op substring (GRO-1414). Skills-manager had dat al.
- `npm deprecate` van de oude naam faalt tot de scope-owner het
  token verruimt. Gebruikers die `pi-powerline-footer` installeren
  blijven op 0.17.2.
- Hooks spawnen processen. Default timeout 30s; kill-switch
  `wishcraft.hooksEnabled` bestaat al op `main`.
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
- [x] PR C: merge to `main` tagged `v0.19.0` then `v0.19.1` then
      `v0.19.2` and published (`npm view` = `0.19.2`). Same-job bump
      publish via #16. CHE-40 tab-complete via #18.
- [x] README skills-sectie waar; deze ROADMAP in sync met 0.19.2.
- [x] CHE-40: `/powerline` subcommand-tab geland (#18). CHE-41/42
      hernoemd naar wishcraft.

## Checklist (1.0)

- [ ] PR EN gemerged: operator UI/overlays/ROADMAP English. (GRO-1422)
- [ ] PR J gemerged: vier templates, geen markt. (GRO-1417)
- [ ] PR K gemerged: deny `sudo rm` + inject `.env` zonder spawn. (GRO-1418)
- [ ] PR L gemerged: idee-review overlay. (GRO-1419)
- [ ] PR M gemerged: `skills.count`, read-hints-of-skip, Status-trim. (GRO-1420)
- [ ] PR N: README waar, `npm view` = 1.0.0. (GRO-1421)
