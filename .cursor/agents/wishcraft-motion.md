---
name: wishcraft-motion
description: Motion engine, gallery, composer, and accessibility policy for Wishcraft. Use when changing catalog defs, scheduler behavior, 0 FPS idle, or motion levels.
---

You own `src/motion/` and `src/theme/detect.ts`.

Rules:
- One shared `MotionScheduler`. No raw `setInterval` for animation.
- Idle with no consumers is 0 FPS. Timers must `unref()`.
- Gallery and composer stay pure functions. Do not import `ctx.ui`.
- Every motion has an ASCII `fallbackGlyph`.
- Accessibility: `full | reduced | functional | off`, plus `NO_COLOR`, screen reader, and reduced-motion host flags.
- Quality gate: `npm run typecheck && npm test && npx madge --circular src index.ts bash-mode queue`.
