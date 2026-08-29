## Residual Review Findings

Run: ce-code-review 20260828-123634-26d247d6, base f9aa3bf, branch feat/wishcraft-v2-platform (head 6742eb5, PR #69). Reviewers: correctness, project-standards, testing, maintainability, reliability, adversarial (in-process fallback; cross-model peer skipped — host serving family unattestable on this harness).

Applied in `fix(review): apply review findings` (6742eb5): forward Enter/EOF, stdin EPIPE guard, spawn-error honesty + probe flip, fish pipe wrapper, onCommandSuccess isolation, supportsForwardMode seam, factory scriptAvailable seam + warn reset, renderer tail dedup, dead import removal. 9 findings applied, all validator-confirmed.

Deferred (decision-gated; filed as tickets):

- **P2 — bash-mode/pty-session.ts:300 — PTY echo feeds forwarded keystrokes back into the transcript store and the always-on powerline tail (input recorded as output; echoing prompts persist secrets).** Defer filed: https://github.com/GroepOnline/pi-wishcraft/issues/71 — data-retention decision (drop echo bytes vs notice).
- **P3 — bash-mode/editor.ts:127 — Mixed input routing while running: pasted chunks land in the editor buffer and remain as a pending command after exit.** Defer filed: https://github.com/GroepOnline/pi-wishcraft/issues/72 — behavior decision (route paste to stdin vs swallow with notify).
- **P2 — tests/ptyshell-managed.test.ts:39 — Managed-suite tests can green-wash a broken PTY path on script-less hosts (no per-feature mode assertion).** Defer filed: https://github.com/GroepOnline/pi-wishcraft/issues/73 — test-infra hardening (mode assertion / SCRIPT_AVAILABLE gate).

Settled-conflict findings: none (plan carries no session-settled KTDs).

## U12-final cutover — blocker (needs human decision + live verification)

**RESOLVED 2026-08-28 (same day):** Joep chose the direction — "alle motion moet wel beter" — motion stays and improves. Landed in 4ff61ce: single v2 render path (renderStatusLineV2 -> computeLaneLayout -> paintLayout), v1 src/signal/render.ts deleted, motion rail redesigned as a first-class layout segment (fixed ● head, directional ━╾╌ trail, light ─ track, no arc caps), golden re-pinned deliberately. The blockers below are kept for the record.

2026-08-28 run: the v1 powerline deletion cannot complete headless. Blockers, in order:

1. **Async/sync boundary** — `runSegmentPipeline` (U2) is async (per-segment budget + timeout isolation); the always-on `getResponsiveLayout` render path is synchronous. An async pipeline does not drop into the sync render without a prepared-cache architecture change.
2. **Motion-rail loss** — v1 `renderSignal` has a center animated motion rail (`renderActivity`); the v2 layout is primary/secondary priority-based with a static separator. Deleting v1 removes a visible feature, not just an implementation.
3. **Live-golden gate** — plan U12-final requires golden-line snapshots verified in a real terminal before v1 deletion. The headless pre-revert snapshot exists: `tests/signal-golden.test.ts` (84b2e2a) pins v1's exact output (`!path / !git ◇━╾--o------━━━╼━◇ ready !context_pct`). The cutover PR must re-pin v2 output deliberately, with an operator glance-check.

Product decision needed: keep the motion rail in v2 (port `renderActivity` into the v2 pipeline as a center/module segment) or drop it (accept less animated status line). Then: offline-prime the segment cache from an idle scheduler, switch `status-line-renderers` to the pipeline → `computeLaneLayout` → `paintLayout`, delete `src/signal/render.ts` + the getResponsiveLayout v1 internals, and re-pin the golden in a deliberate commit. That is a follow-up PR with real-terminal evidence (plan chapter 3, Deferred).