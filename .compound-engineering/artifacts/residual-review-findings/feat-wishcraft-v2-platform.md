## Residual Review Findings

Run: ce-code-review 20260828-123634-26d247d6, base f9aa3bf, branch feat/wishcraft-v2-platform (head 6742eb5, PR #69). Reviewers: correctness, project-standards, testing, maintainability, reliability, adversarial (in-process fallback; cross-model peer skipped — host serving family unattestable on this harness).

Applied in `fix(review): apply review findings` (6742eb5): forward Enter/EOF, stdin EPIPE guard, spawn-error honesty + probe flip, fish pipe wrapper, onCommandSuccess isolation, supportsForwardMode seam, factory scriptAvailable seam + warn reset, renderer tail dedup, dead import removal. 9 findings applied, all validator-confirmed.

Deferred (decision-gated; filed as tickets):

- **P2 — bash-mode/pty-session.ts:300 — PTY echo feeds forwarded keystrokes back into the transcript store and the always-on powerline tail (input recorded as output; echoing prompts persist secrets).** Defer filed: https://github.com/GroepOnline/pi-wishcraft/issues/71 — data-retention decision (drop echo bytes vs notice).
- **P3 — bash-mode/editor.ts:127 — Mixed input routing while running: pasted chunks land in the editor buffer and remain as a pending command after exit.** Defer filed: https://github.com/GroepOnline/pi-wishcraft/issues/72 — behavior decision (route paste to stdin vs swallow with notify).
- **P2 — tests/ptyshell-managed.test.ts:39 — Managed-suite tests can green-wash a broken PTY path on script-less hosts (no per-feature mode assertion).** Defer filed: https://github.com/GroepOnline/pi-wishcraft/issues/73 — test-infra hardening (mode assertion / SCRIPT_AVAILABLE gate).

Settled-conflict findings: none (plan carries no session-settled KTDs).