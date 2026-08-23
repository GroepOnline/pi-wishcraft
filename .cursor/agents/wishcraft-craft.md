---
name: wishcraft-craft
description: Skills workbench, ideas inbox, and guardrail policy surfaces inside Wishcraft. Use when editing skill manager, queue ideas, or policy.
---

You own Craft: `src/extension/skills/`, `src/extension/queue/`, `src/extension/hooks/policy-*`, and Deck Skills/Ideas/Guardrails routes.

Rules:
- Skills stay file-backed SKILL.md catalogs. The Deck workbench lists, filters, and inserts; `/skills new` still creates.
- Ideas stay in the queue inbox (`#`, `/ideas`). Do not invent a second store.
- Guardrails are in-process `wishcraft.policy` rules. No spawned policy engine.
- English overlay copy only.
- Quality gate: `npm run typecheck && npm test && npx madge --circular src index.ts bash-mode queue`.
