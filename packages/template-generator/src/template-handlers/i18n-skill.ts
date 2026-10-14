import type { AddonOptions, ProjectConfig } from "@better-t-stack/types";

import type { VirtualFileSystem } from "../core/virtual-fs";
import { processTemplatesFromPrefix, type TemplateData } from "./utils";

/**
 * Skills-addon mirror for `templates/i18n/skill` (lane L9, design D8).
 *
 * The handler emits the agent skills to `.agents/skills/`, the canonical
 * location every universal-family agent reads. When the skills addon is
 * selected, the same skills are mirrored to the project-scope directory of
 * every selected agent that reads a different one (for example
 * `.claude/skills` for Claude Code), so those agents find the skill without a
 * second install.
 */

type SkillsOptions = NonNullable<AddonOptions["skills"]>;
type SkillsAgent = NonNullable<SkillsOptions["agents"]>[number];

/** Canonical, universal location: no mirror needed. */
const UNIVERSAL_SKILLS_DIRECTORY = ".agents/skills";

/** Mirror of `apps/cli`'s default agent set when none is configured. */
const DEFAULT_SKILLS_AGENTS = [
  "universal",
  "claude-code",
] as const satisfies readonly SkillsAgent[];

/**
 * Project-scope skill directories per agent, as published by the `skills` CLI
 * (vercel-labs/skills). Agents absent from this table read `.agents/skills`.
 */
const AGENT_SKILL_DIRECTORIES = new Map<SkillsAgent, string>([
  ["adal", ".adal/skills"],
  ["aider-desk", ".aider-desk/skills"],
  ["astrbot", "data/skills"],
  ["autohand-code", ".autohand/skills"],
  ["augment", ".augment/skills"],
  ["bob", ".bob/skills"],
  ["claude-code", ".claude/skills"],
  ["codearts-agent", ".codeartsdoer/skills"],
  ["codebuddy", ".codebuddy/skills"],
  ["codemaker", ".codemaker/skills"],
  ["codestudio", ".codestudio/skills"],
  ["command-code", ".commandcode/skills"],
  ["continue", ".continue/skills"],
  ["cortex", ".cortex/skills"],
  ["crush", ".crush/skills"],
  ["devin", ".devin/skills"],
  ["eve", "agent/skills"],
  ["forgecode", ".forge/skills"],
  ["goose", ".goose/skills"],
  ["grok", ".grok/skills"],
  ["hermes-agent", ".hermes/skills"],
  ["iflow-cli", ".iflow/skills"],
  ["inference-sh", ".inferencesh/skills"],
  ["jazz", ".jazz/skills"],
  ["junie", ".junie/skills"],
  ["kimchi", ".kimchi/skills"],
  ["kiro-cli", ".kiro/skills"],
  ["kode", ".kode/skills"],
  ["lingma", ".lingma/skills"],
  ["mcpjam", ".mcpjam/skills"],
  ["minimax-code", ".minimax/skills"],
  ["mistral-vibe", ".vibe/skills"],
  ["moxby", ".moxby/skills"],
  ["mux", ".mux/skills"],
  ["neovate", ".neovate/skills"],
  ["ona", ".ona/skills"],
  ["clawdbot", "skills"],
  ["openclaw", "skills"],
  ["openhands", ".openhands/skills"],
  ["pochi", ".pochi/skills"],
  ["posit-assistant", ".posit/assistant/skills"],
  ["qoder", ".qoder/skills"],
  ["qoder-cn", ".qoder/skills"],
  ["qwen-code", ".qwen/skills"],
  ["reasonix", ".reasonix/skills"],
  ["roo", ".roo/skills"],
  ["rovodev", ".rovodev/skills"],
  ["tabnine-cli", ".tabnine/agent/skills"],
  ["terramind", ".terramind/skills"],
  ["tinycloud", ".tinycloud/skills"],
  ["trae", ".trae/skills"],
  ["trae-cn", ".trae/skills"],
  ["windsurf", ".windsurf/skills"],
  ["zcode", ".zcode/skills"],
  ["zencoder", ".zencoder/skills"],
  ["zenflow", ".zencoder/skills"],
] as const satisfies readonly (readonly [SkillsAgent, string])[]);

/** Agent directories that receive a mirrored copy of the i18n skills. */
export function getI18nSkillMirrorDirectories(config: ProjectConfig): string[] {
  if (!config.addons.includes("skills")) return [];

  const agents = config.addonOptions?.skills?.agents ?? DEFAULT_SKILLS_AGENTS;
  const directories = new Set<string>();
  for (const agent of agents) {
    const directory = AGENT_SKILL_DIRECTORIES.get(agent);
    if (directory && directory !== UNIVERSAL_SKILLS_DIRECTORY) directories.add(directory);
  }
  return [...directories];
}

/** Mirrors the emitted `i18n/skill` namespace into the selected agent folders. */
export function processI18nSkillMirror(
  vfs: VirtualFileSystem,
  templates: TemplateData,
  config: ProjectConfig,
): void {
  for (const directory of getI18nSkillMirrorDirectories(config)) {
    processTemplatesFromPrefix(vfs, templates, "i18n/skill", directory, config);
  }
}
