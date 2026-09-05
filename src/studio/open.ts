/**
 * Studio entrypoint (U5). Non-overlay fullscreen `ctx.ui.custom()`; guards
 * non-TUI modes first. KTD7 boundary: no core/state.ts import — the runtime
 * context arrives via parameters only.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { getAgentPath } from "../paths/agent-dirs.ts";
import type { RuntimeState } from "../extension/core/types.ts";
import {
  getSkillUsage,
  invalidateSkillCache,
  loadSkillStudioCatalog,
  readSkillBody,
  type SkillEntry,
} from "../extension/skills/skill-registry.ts";
import { runStudioAction } from "./actions.ts";
import { createAdvicePane, advicePaneInsert } from "./advice-pane.ts";
import { createStudioComponent } from "./component.ts";
import { extractRepos, type RepoRef } from "./deepwiki/extract.ts";
import { callTool } from "./deepwiki/client.ts";
import { withCache } from "./deepwiki/cache.ts";
import type { AdviseStreamProvider } from "./advise/engine.ts";

/** The fullscreen component is now connected to discovery, actions, and advice. */
export const SKILL_STUDIO_PANES_READY = true;

const DEEPWIKI_TTL_MS = 24 * 60 * 60 * 1000;
const DEEPWIKI_MAX_ENTRIES = 64;
const DEEPWIKI_ENDPOINT = "https://mcp.deepwiki.com/mcp";

type StudioContext = {
  hasUI: boolean;
  mode: string;
  cwd?: string;
  ui: {
    notify(message: string, type?: "info" | "warning" | "error"): void;
    custom<T>(factory: (...args: any[]) => any, options?: { overlay?: boolean }): Promise<T>;
    input?(title: string, placeholder?: string): Promise<string | undefined>;
    select?(title: string, options: string[]): Promise<string | undefined>;
    confirm?(title: string, message: string): Promise<boolean>;
    editor?(title: string, prefill?: string): Promise<string | undefined>;
    getEditorText?(): string;
    setEditorText?(text: string): void;
  };
  model?: {
    id: string;
    contextWindow: number;
    maxTokens: number;
    provider: string;
    baseUrl?: string;
  };
  modelRegistry?: {
    getProvider(provider: string): {
      stream(model: unknown, context: unknown, options: Record<string, unknown>): AsyncIterable<unknown>;
    } | undefined;
    getApiKeyAndHeaders(model: unknown): Promise<{
      ok: boolean;
      apiKey?: string;
      headers?: Record<string, string | null>;
      env?: Record<string, string>;
      baseUrl?: string;
    }>;
  };
};

interface WikiPayload {
  content: string;
}

function referencesFor(entry: SkillEntry): { name: string; content: string }[] {
  const body = readSkillBody(entry.filePath);
  const refs = body.matchAll(/\[[^\]]+\]\((references|scripts)\/[^)\s]+\)/g);
  const sections: { name: string; content: string }[] = [];
  for (const match of refs) {
    const hrefMatch = /\(([^)\s]+)\)/.exec(match[0] ?? "");
    const href = hrefMatch?.[1];
    if (!href) continue;
    try {
      sections.push({ name: href, content: readFileSync(`${entry.baseDir}/${href}`, "utf8") });
    } catch {
      sections.push({ name: href, content: "(missing local reference)" });
    }
  }
  return sections;
}

async function fetchWiki(repo: RepoRef): Promise<WikiPayload> {
  const structure = await callTool<{ content?: { type: string; text?: string }[] }>(
    "read_wiki_structure",
    { repo: `${repo.owner}/${repo.repo}` },
    DEEPWIKI_ENDPOINT,
  );
  const structureText = structure.content?.map((part) => part.text ?? "").join("\n") ?? "";
  const contents = await callTool<{ content?: { type: string; text?: string }[] }>(
    "read_wiki_contents",
    { repo: `${repo.owner}/${repo.repo}` },
    DEEPWIKI_ENDPOINT,
  );
  const contentText = contents.content?.map((part) => part.text ?? "").join("\n") ?? "";
  return { content: `${structureText}\n\n${contentText}`.trim() };
}

async function localWikiContext(entry: SkillEntry, notify: (message: string, type?: "info" | "warning" | "error") => void) {
  const sections: { name: string; content: string }[] = [];
  for (const repo of extractRepos(readSkillBody(entry.filePath))) {
    const cached = await withCache(
      getAgentPath("wishcraft-cache", "deepwiki"),
      repo,
      { ttlMs: DEEPWIKI_TTL_MS, maxEntries: DEEPWIKI_MAX_ENTRIES },
      () => fetchWiki(repo),
    );
    if (cached.entry?.data.content) {
      sections.push({ name: `${repo.owner}/${repo.repo}`, content: cached.entry.data.content });
    }
    if (cached.stale || !cached.entry) {
      notify(`DeepWiki unavailable for ${repo.owner}/${repo}; using local skill context`, "warning");
    }
  }
  return sections;
}

async function runAdviceFor(
  ctx: StudioContext,
  entry: SkillEntry,
  mode: "explain" | "integrate" | "examples" | "improve",
  pane: ReturnType<typeof createAdvicePane>,
): Promise<void> {
  const model = ctx.model;
  const registry = ctx.modelRegistry;
  const provider = model && registry ? registry.getProvider(model.provider) : undefined;
  if (!model || !registry || !provider) {
    await pane.run({ mode, skillName: entry.name, body: readSkillBody(entry.filePath), references: referencesFor(entry), wiki: [], provider: null, signal: new AbortController().signal });
    return;
  }
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    await pane.run({ mode, skillName: entry.name, body: readSkillBody(entry.filePath), references: referencesFor(entry), wiki: [], provider: null, signal: new AbortController().signal });
    return;
  }
  const requestModel = auth.baseUrl ? { ...model, baseUrl: auth.baseUrl } : model;
  const streamProvider: AdviseStreamProvider = {
    stream: (_advisorModel, context, options) => provider.stream(requestModel, {
      systemPrompt: context.prompt?.system,
      messages: [{ role: "user", content: [{ type: "text", text: context.prompt?.user ?? "" }], timestamp: Date.now() }],
    }, {
      apiKey: auth.apiKey,
      headers: auth.headers,
      env: auth.env,
      signal: options.signal,
      maxTokens: options.maxTokens,
    }),
  };
  const references = referencesFor(entry);
  const wiki = await localWikiContext(entry, (message, type) => ctx.ui.notify(message, type));
  await pane.run({
    mode,
    skillName: entry.name,
    body: readSkillBody(entry.filePath),
    references,
    wiki,
    provider: streamProvider,
    model: { id: model.id, contextWindow: model.contextWindow, maxTokens: model.maxTokens },
    signal: new AbortController().signal,
  });
}

async function editSkill(ctx: StudioContext, entry: SkillEntry): Promise<void> {
  if (!ctx.ui.editor) return;
  const next = await ctx.ui.editor(`Edit skill: ${entry.name}`, readFileSync(entry.filePath, "utf8"));
  if (next === undefined) return;
  writeFileSync(entry.filePath, next, "utf8");
  invalidateSkillCache();
  ctx.ui.notify(`Updated ${entry.name}`, "info");
}

export async function openSkillStudio(
  rt: RuntimeState,
  ctx: StudioContext,
): Promise<void> {
  if (!rt.enabled) {
    if (ctx.hasUI) ctx.ui.notify("Skill Studio requires the Signal UI to be enabled", "info");
    return;
  }
  if (!ctx.hasUI) {
    // print/json modes: no interactive surface exists.
    return;
  }
  if (ctx.mode === "rpc") {
    ctx.ui.notify("Skill Studio is not available in RPC mode", "warning");
    return;
  }
  rt.currentCtx = ctx;
  invalidateSkillCache();
  const cwd = ctx.cwd ?? process.cwd();
  const pane = createAdvicePane();
  let entries = loadSkillStudioCatalog(cwd);
  await ctx.ui.custom(
    (_tui: unknown, theme: any, _keybindings: unknown, done: (value: string | null) => void) =>
      createStudioComponent(theme, done, undefined, {
        entries,
        usage: getSkillUsage(),
        advicePane: pane,
        onRefresh: () => {
          entries = loadSkillStudioCatalog(cwd);
          return entries;
        },
        onCreate: async () => {
          const name = await ctx.ui.input?.("New skill", "skill-name");
          if (!name) return;
          const template = await ctx.ui.select?.("Template", ["standard", "browser-workflow", "cli-workflow", "review-checklist"]);
          const result = await runStudioAction({ type: "create", name, template: (template ?? "standard") as "standard" | "browser-workflow" | "cli-workflow" | "review-checklist", skillsRoot: getAgentPath("skills") }, {
            confirm: (message) => ctx.ui.confirm?.("Confirm", message) ?? Promise.resolve(false),
          });
          ctx.ui.notify(result.message, result.kind === "error" ? "error" : "info");
        },
        onEdit: (entry) => editSkill(ctx, entry),
        onDoctor: async () => {
          const result = await runStudioAction({ type: "doctor", cwd }, { confirm: async () => false });
          ctx.ui.notify(result.message, result.kind === "error" ? "error" : "info");
        },
        onAdvice: (entry, mode, targetPane) => runAdviceFor(ctx, entry, mode, targetPane),
        onInsert: (targetPane) => {
          if (!ctx.ui.getEditorText || !ctx.ui.setEditorText) return;
          advicePaneInsert(targetPane, {
            appendUserMessage(text) {
              const current = ctx.ui.getEditorText!();
              ctx.ui.setEditorText!(`${current}${current ? "\n\n" : ""}${text}\n`);
            },
          });
          ctx.ui.notify("Advice inserted into the editor", "info");
        },
        onError: (error) => ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"),
      }),
  );
}
