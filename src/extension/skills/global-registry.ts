import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface GlobalRegistrySkill {
  name: string;
  description: string;
  category: string;
  family: string;
  metaSkill: string | null;
  role: string | null;
  routerParent: string | null;
  mounts: string[];
  drift: boolean;
  filePath: string;
}

interface RegistryPayload {
  schema?: string;
  skills?: unknown[];
}

export function globalRegistryPath(): string {
  return process.env.CHEFGROEP_SKILL_REGISTRY?.trim() || join(homedir(), ".config", "chefgroep", "skill-registry", "skills.json");
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

export function loadGlobalSkillRegistry(path = globalRegistryPath()): GlobalRegistrySkill[] {
  if (!existsSync(path)) return [];
  let payload: RegistryPayload;
  try {
    payload = JSON.parse(readFileSync(path, "utf8")) as RegistryPayload;
  } catch {
    return [];
  }
  if (payload.schema !== "chefgroep-global-skill-registry/v1" || !Array.isArray(payload.skills)) return [];
  const out: GlobalRegistrySkill[] = [];
  for (const raw of payload.skills) {
    if (!raw || typeof raw !== "object") continue;
    const skill = raw as Record<string, any>;
    if (typeof skill.name !== "string" || typeof skill.description !== "string") continue;
    const canonical = skill.canonical && typeof skill.canonical === "object" ? skill.canonical : {};
    const canonicalPath = typeof canonical.path === "string" ? canonical.path : "";
    out.push({
      name: skill.name,
      description: skill.description,
      category: typeof skill.category === "string" ? skill.category : "general",
      family: typeof skill.family === "string" ? skill.family : "general",
      metaSkill: typeof skill.meta_skill === "string" ? skill.meta_skill : null,
      role: typeof skill.role === "string" ? skill.role : null,
      routerParent: typeof skill.router_parent === "string" ? skill.router_parent : null,
      mounts: Array.isArray(skill.mounts) ? skill.mounts.filter((x: unknown): x is string => typeof x === "string") : [],
      drift: skill.drift === true,
      filePath: expandHome(canonicalPath),
    });
  }
  return out;
}
