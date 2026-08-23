#!/usr/bin/env node
/**
 * Live preview of the Wishcraft Deck / Signal / Gallery renderers.
 * This is a harness for the Pi extension UI, not a product site.
 */
import http from "node:http";
import { renderDeckFrame } from "../src/extension/ui/deck/render.ts";
import { DECK_ROUTES } from "../src/extension/ui/deck/types.ts";
import { DEFAULT_SHORTCUTS } from "../src/extension/core/constants.ts";
import { MOTION_CATALOG } from "../src/motion/catalog.ts";
import { previewStrip } from "../src/motion/gallery.ts";
import { draftFromMotion, composerPreview } from "../src/motion/composer.ts";

const PORT = Number(process.env.WISHCRAFT_PREVIEW_PORT ?? 43147);

const snapshot = {
  modelLabel: "GPT-5.6",
  branchLabel: "main",
  contextPercent: 47,
  contextTokens: 94000,
  contextWindow: 200000,
  signalActivity: "streaming",
  signalMotion: "ember-relay",
  queueCount: 1,
  ideaCount: 3,
  skillsTotal: 12,
  skillsWarnings: 1,
  policyEnabled: true,
  policyRuleCount: 2,
  shellName: "bash",
  bashModeActive: false,
  appearanceBase: "lanternwake",
  recentActivity: ["read_file", "ember-relay"],
  nextIntent: "Ship the Motion Gallery",
  motionLevel: "full",
  policySummary: "motion full",
  skills: [
    { name: "wishcraft-tui", category: "project", status: "ok", description: "TUI design skill", usage: 4 },
    { name: "review", category: "global", status: "warn", description: "Review checklist", usage: 0 },
  ],
  ideas: [{ text: "Animated Signal on the existing powerline", reviewStatus: "in-progress" }],
  guardrailRules: [{ action: "deny", tool: "bash", reason: "destructive rm" }],
};

const nav = {
  route: "home",
  selectedNav: 0,
  searchOpen: false,
  searchQuery: "",
  pendingJump: null,
  selectedAppearance: 0,
  selectedMotion: 0,
  selectedSkill: 0,
  selectedIdea: 0,
  composerOpen: false,
  composerField: 0,
  assignEvent: "streaming",
  skillCreate: false,
  skillCreateName: "",
};

const theme = {
  fg: (_color, text) => text,
  bold: (text) => text,
};

function frame(route, extras = {}) {
  const state = {
    ...nav,
    route,
    selectedNav: DECK_ROUTES.indexOf(route),
    ...extras,
  };
  const ember = MOTION_CATALOG.find((motion) => motion.id === "ember-relay");
  const composer = extras.composerOpen && ember ? draftFromMotion(ember, "streaming") : null;
  return renderDeckFrame(theme, 100, snapshot, state, DEFAULT_SHORTCUTS, composer).join("\n");
}

function htmlPage() {
  const routes = DECK_ROUTES.map((route) => {
    const body = escapeHtml(frame(route));
    return `<section id="${route}"><h2>${route}</h2><pre>${body}</pre></section>`;
  }).join("\n");
  const gallery = escapeHtml(previewStrip(MOTION_CATALOG[0], 4, 36));
  const composer = escapeHtml(composerPreview(draftFromMotion(MOTION_CATALOG[0]), 6, 36));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Wishcraft Deck preview</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #0f172a; color: #e2e8f0; }
    header { padding: 20px 24px 8px; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    p, nav { color: #94a3b8; font-size: 13px; }
    nav a { color: #fbbf24; margin-right: 12px; }
    main { padding: 0 24px 48px; display: grid; gap: 24px; }
    pre { background: #020617; border: 1px solid #1e293b; padding: 12px; overflow: auto; line-height: 1.35; }
    .meta { padding: 0 24px 16px; color: #cbd5e1; }
  </style>
</head>
<body>
  <header>
    <h1>Wishcraft operator layer</h1>
    <p>Preview of the Pi extension Deck, Signal gallery, and Composer — not a standalone product.</p>
    <nav>${DECK_ROUTES.map((route) => `<a href="#${route}">${route}</a>`).join("")}</nav>
  </header>
  <div class="meta">
    <div>Catalog: ${MOTION_CATALOG.length} motions</div>
    <div>Gallery strip: ${gallery}</div>
    <div>Composer: ${composer}</div>
  </div>
  <main>
    ${routes}
  </main>
</body>
</html>`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok\n");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(htmlPage());
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Wishcraft Deck preview http://127.0.0.1:${PORT}`);
});
