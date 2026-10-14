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
 * (vercel-labs/skills). Total over `SkillsAgent`, so adding an agent to the
 * schema fails typecheck until it is classified here.
 *
 * `.agents/skills` is the universal location every universal-family agent
 * reads, so those agents need no mirror. Verified against `skills@1.7.2`
 * (`skills@latest`): `droid`, `kilo` and `pi` also read `.agents/skills` —
 * their legacy/global config directories (`~/.factory/skills`,
 * `~/.kilo/skills`, `~/.pi`) are not project-scope mirror targets, and a copy
 * there would make those agents read the same skill twice.
 *
 * `clawdbot` is a legacy alias for `openclaw` in `apps/cli`'s
 * `expandSkillsAgentTargets` and shares its `skills` directory.
 */
const AGENT_SKILL_DIRECTORIES = {
  adal: ".adal/skills",
  "aider-desk": ".aider-desk/skills",
  amp: UNIVERSAL_SKILLS_DIRECTORY,
  antigravity: UNIVERSAL_SKILLS_DIRECTORY,
  "antigravity-cli": UNIVERSAL_SKILLS_DIRECTORY,
  astrbot: "data/skills",
  augment: ".augment/skills",
  "autohand-code": ".autohand/skills",
  bob: ".bob/skills",
  "claude-code": ".claude/skills",
  clawdbot: "skills",
  cline: UNIVERSAL_SKILLS_DIRECTORY,
  "codearts-agent": ".codeartsdoer/skills",
  codebuddy: ".codebuddy/skills",
  codemaker: ".codemaker/skills",
  codestudio: ".codestudio/skills",
  codex: UNIVERSAL_SKILLS_DIRECTORY,
  "command-code": ".commandcode/skills",
  continue: ".continue/skills",
  cortex: ".cortex/skills",
  crush: ".crush/skills",
  cursor: UNIVERSAL_SKILLS_DIRECTORY,
  deepagents: UNIVERSAL_SKILLS_DIRECTORY,
  devin: ".devin/skills",
  dexto: UNIVERSAL_SKILLS_DIRECTORY,
  droid: UNIVERSAL_SKILLS_DIRECTORY,
  eve: "agent/skills",
  firebender: UNIVERSAL_SKILLS_DIRECTORY,
  forgecode: ".forge/skills",
  "gemini-cli": UNIVERSAL_SKILLS_DIRECTORY,
  "github-copilot": UNIVERSAL_SKILLS_DIRECTORY,
  goose: ".goose/skills",
  grok: ".grok/skills",
  "hermes-agent": ".hermes/skills",
  "iflow-cli": ".iflow/skills",
  "inference-sh": ".inferencesh/skills",
  jazz: ".jazz/skills",
  junie: ".junie/skills",
  kilo: UNIVERSAL_SKILLS_DIRECTORY,
  kimchi: ".kimchi/skills",
  "kimi-code-cli": UNIVERSAL_SKILLS_DIRECTORY,
  "kiro-cli": ".kiro/skills",
  kode: ".kode/skills",
  lingma: ".lingma/skills",
  loaf: UNIVERSAL_SKILLS_DIRECTORY,
  mcpjam: ".mcpjam/skills",
  "minimax-code": ".minimax/skills",
  "mistral-vibe": ".vibe/skills",
  moxby: ".moxby/skills",
  mux: ".mux/skills",
  neovate: ".neovate/skills",
  ona: ".ona/skills",
  openclaw: "skills",
  opencode: UNIVERSAL_SKILLS_DIRECTORY,
  openhands: ".openhands/skills",
  pi: UNIVERSAL_SKILLS_DIRECTORY,
  pochi: ".pochi/skills",
  "posit-assistant": ".posit/assistant/skills",
  promptscript: UNIVERSAL_SKILLS_DIRECTORY,
  qoder: ".qoder/skills",
  "qoder-cn": ".qoder/skills",
  "qwen-code": ".qwen/skills",
  reasonix: ".reasonix/skills",
  replit: UNIVERSAL_SKILLS_DIRECTORY,
  roo: ".roo/skills",
  rovodev: ".rovodev/skills",
  "tabnine-cli": ".tabnine/agent/skills",
  terramind: ".terramind/skills",
  tinycloud: ".tinycloud/skills",
  trae: ".trae/skills",
  "trae-cn": ".trae/skills",
  universal: UNIVERSAL_SKILLS_DIRECTORY,
  warp: UNIVERSAL_SKILLS_DIRECTORY,
  windsurf: ".windsurf/skills",
  zcode: ".zcode/skills",
  zed: UNIVERSAL_SKILLS_DIRECTORY,
  zencoder: ".zencoder/skills",
  zenflow: ".zencoder/skills",
} as const satisfies Record<SkillsAgent, string>;

/** The project-scope skills directory the CLI installs this agent's skills to. */
export function getAgentSkillDirectory(agent: SkillsAgent): string {
  return AGENT_SKILL_DIRECTORIES[agent];
}

/** Agent directories that receive a mirrored copy of the i18n skills. */
export function getI18nSkillMirrorDirectories(config: ProjectConfig): string[] {
  if (!config.addons.includes("skills")) return [];

  const agents = config.addonOptions?.skills?.agents ?? DEFAULT_SKILLS_AGENTS;
  const directories = new Set<string>();
  for (const agent of agents) {
    const directory = getAgentSkillDirectory(agent);
    if (directory !== UNIVERSAL_SKILLS_DIRECTORY) directories.add(directory);
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
