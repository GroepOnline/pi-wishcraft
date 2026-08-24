import type { Theme } from "@earendil-works/pi-coding-agent";
import { effectiveAppearanceMix, resolveAppearanceMix } from "../../../config/appearance.ts";
import { config } from "../../core/state.ts";
import type { RuntimeState } from "../../core/types.ts";
import { buildSegmentContext } from "../../core/segment-context.ts";
import { getQueueContext } from "../../queue/queue-context.ts";
import { loadSkillCatalog } from "../../skills/skill-registry.ts";
import { collectSkillDoctorInputs, diagnoseSkills } from "../../skills/skill-doctor.ts";
import { parsePolicySettings } from "../../hooks/policy-config.ts";
import { readSettings } from "../../settings/settings-io.ts";
import { describePolicy } from "../../../motion/accessibility.ts";
import type { DeckSessionSnapshot } from "./types.ts";

export function buildDeckSessionSnapshot(rt: RuntimeState, ctx: any): DeckSessionSnapshot {
  const theme = { fg: (_color: string, text: string) => text } as Theme;
  let segmentCtx;
  try {
    segmentCtx = buildSegmentContext(rt, ctx, theme);
  } catch {
    segmentCtx = null;
  }

  const queue = rt.queueStore.summarize(
    getQueueContext(ctx),
    rt.powerlineCompacting,
  );
  const cwd = ctx.cwd ?? process.cwd();
  const skills = loadSkillCatalog(cwd);
  const doctorInputs = collectSkillDoctorInputs(cwd);
  const doctor = diagnoseSkills(
    doctorInputs.entries,
    doctorInputs.usage,
    doctorInputs.contents,
  );
  const warnings = doctor.filter((row) => row.status !== "ok").length;
  const settings = readSettings(cwd);
  const policy = parsePolicySettings(settings.wishcraft);
  const appearance = resolveAppearanceMix(
    effectiveAppearanceMix(config.appearance, config.preset),
  );

  const model = segmentCtx?.model;
  const modelLabel = model?.name ?? model?.id ?? "no model";
  const branch = segmentCtx?.git.branch;
  const branchLabel = branch ?? "no branch";

  const recentActivity: string[] = [];
  if (rt.signal.activity && rt.signal.activity !== "ready") {
    recentActivity.push(rt.signal.activity);
  }
  if (queue.leadingText) {
    recentActivity.push(queue.leadingText);
  }
  if (rt.lastUserPrompt) {
    recentActivity.push(rt.lastUserPrompt.slice(0, 48));
  }

  return {
    modelLabel,
    branchLabel,
    contextPercent: Math.round(segmentCtx?.contextPercent ?? 0),
    contextTokens: segmentCtx?.contextTokens ?? 0,
    contextWindow: segmentCtx?.contextWindow ?? 0,
    signalActivity: rt.signal.activity,
    signalMotion: rt.signal.motionId,
    queueCount: queue.queueCount,
    ideaCount: queue.ideaCount,
    skillsTotal: skills.length,
    skillsWarnings: warnings,
    policyEnabled: policy.enabled,
    policyRuleCount: policy.rules.length,
    shellName: rt.shellSession?.state.shellName ?? null,
    bashModeActive: rt.bashModeActive,
    appearanceBase: appearance.base,
    recentActivity: recentActivity.slice(0, 5),
    nextIntent: queue.leadingText,
    motionLevel: config.motionLevel,
    policySummary: describePolicy(rt.motionPolicy),
    skills: skills.slice(0, 24).map((skill) => {
      const row = doctor.find((entry) => entry.skill === skill.name);
      const usage = doctorInputs.usage.get(skill.name);
      return {
        name: skill.name,
        category: skill.category,
        status: row?.status ?? (skill.warning ? "warn" : "ok"),
        description: skill.description.slice(0, 72),
        usage: usage?.count ?? 0,
      };
    }),
    ideas: rt.queueStore
      .list()
      .filter((item) => item.intent === "idea")
      .slice(0, 12)
      .map((item) => ({
        text: item.text.slice(0, 64),
        reviewStatus: item.reviewStatus ?? "idea",
      })),
    guardrailRules: policy.rules.slice(0, 8).map((rule) => ({
      action: rule.action,
      tool: rule.tool,
      reason: rule.action === "deny" ? rule.reason : rule.context.slice(0, 48),
    })),
  };
}
