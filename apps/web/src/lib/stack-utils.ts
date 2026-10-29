import { getStackCommandBase } from "@/lib/cli-commands";
import { DEFAULT_STACK, isStackDefault, type StackState, TECH_OPTIONS } from "@/lib/constant";
import { DEFAULT_SHADCN_BASE, DEFAULT_SHADCN_PRESET, getShadcnConfig } from "@/lib/shadcn-config";
import { SITE_URL } from "@/lib/site";
import { flattenI18nOptions } from "@/lib/stack-i18n";
import { stackUrlKeys } from "@/lib/stack-url-keys";

import { getStackBackend, getStackFrontends, isSelfHostedFullstackBackend } from "./stack-model";

const CATEGORY_ORDER: Array<keyof typeof TECH_OPTIONS> = [
  "webFrontend",
  "nativeFrontend",
  "backend",
  "runtime",
  "api",
  "database",
  "orm",
  "dbSetup",
  "webDeploy",
  "serverDeploy",
  "auth",
  "payments",
  "emailRenderer",
  "emailDeploy",
  "packageManager",
  "addons",
  "i18n",
  "examples",
  "git",
  "install",
  "portless",
];

const desktopAddonNames = {
  tauri: "Tauri",
  electrobun: "Electrobun",
} as const;

const staticDesktopFrontendNames = {
  "tanstack-start": "TanStack Start",
  next: "Next.js",
  nuxt: "Nuxt",
  svelte: "SvelteKit",
  astro: "Astro",
} as const;

export function formatProjectName(name: string | null | undefined) {
  return (name || "my-better-t-app").replace(/\s+/g, "-");
}

function quoteShellArgument(value: string) {
  if (/^[a-zA-Z0-9_./-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export type SelectedTech = {
  category: keyof typeof TECH_OPTIONS;
  id: string;
  name: string;
  icon: string;
};

export function getSelectedTechs(stack: StackState): SelectedTech[] {
  const selected: SelectedTech[] = [];
  for (const category of CATEGORY_ORDER) {
    const options = TECH_OPTIONS[category];
    const value = stack[category];
    if (!options || value === undefined) continue;

    const ids = Array.isArray(value) ? value : [value];
    for (const id of ids) {
      if (
        id === "none" ||
        id === "false" ||
        (["git", "install", "auth"].includes(category) && id === "true")
      ) {
        continue;
      }
      const tech = options.find((opt) => opt.id === id);
      if (tech) {
        selected.push({ category, id: tech.id, name: tech.name, icon: tech.icon });
      }
    }
  }
  return selected;
}

export function generateStackSummary(stack: StackState) {
  const selectedTechs = CATEGORY_ORDER.flatMap((category) => {
    const options = TECH_OPTIONS[category];
    const selectedValue = stack[category];

    if (!options) return [];

    const getTechNames = (value: string | string[]) => {
      const values = Array.isArray(value) ? value : [value];
      return values
        .filter(
          (id) =>
            id !== "none" &&
            id !== "false" &&
            !(["git", "install", "auth"].includes(category) && id === "true"),
        )
        .map((id) => options.find((opt) => opt.id === id)?.name)
        .filter(Boolean) as string[];
    };

    return selectedValue ? getTechNames(selectedValue) : [];
  });

  return selectedTechs.length > 0 ? selectedTechs.join(" • ") : "Custom stack";
}

export function getDesktopBuildNote(stack: Pick<StackState, "addons" | "backend" | "webFrontend">) {
  const selectedDesktopAddons = stack.addons.filter(
    (addon): addon is keyof typeof desktopAddonNames => addon in desktopAddonNames,
  );

  if (selectedDesktopAddons.length === 0) {
    return null;
  }

  const staticFrontend = stack.webFrontend.find(
    (frontend): frontend is keyof typeof staticDesktopFrontendNames =>
      frontend in staticDesktopFrontendNames,
  );

  if (!staticFrontend) {
    return null;
  }

  const addonLabel =
    selectedDesktopAddons.length === 2
      ? "Tauri and Electrobun desktop builds"
      : `${desktopAddonNames[selectedDesktopAddons[0]]} desktop builds`;

  if (isSelfHostedFullstackBackend(stack.backend)) {
    return `${addonLabel} package static web assets and require a separate backend or no backend. Fullstack self backends emit server routes inside the web app, so they cannot be bundled for desktop packaging.`;
  }

  return `${addonLabel} package static web assets. ${staticDesktopFrontendNames[staticFrontend]} needs a static/export build configuration before desktop packaging will work.`;
}

export function generateStackCommand(stack: StackState) {
  const base = getStackCommandBase(stack.packageManager);
  const projectName = quoteShellArgument(stack.projectName || "my-better-t-app");

  const isStackDefaultExceptProjectName = Object.entries(DEFAULT_STACK).every(
    ([key]) =>
      key === "projectName" ||
      isStackDefault(stack, key as keyof StackState, stack[key as keyof StackState]),
  );

  if (isStackDefaultExceptProjectName) {
    return `${base} ${projectName} --yes`;
  }

  const flags = [
    `--frontend ${getStackFrontends(stack).join(" ")}`,
    `--backend ${getStackBackend(stack.backend)}`,
    `--runtime ${stack.runtime}`,
    `--api ${stack.api}`,
    `--auth ${stack.auth}`,
    `--payments ${stack.payments}`,
    `--email-renderer ${stack.emailRenderer}`,
    `--email-deploy ${stack.emailDeploy}`,
    `--database ${stack.database}`,
    `--orm ${stack.orm}`,
    `--db-setup ${stack.dbSetup}`,
    `--package-manager ${stack.packageManager}`,
    stack.git === "false" ? "--no-git" : "--git",
    `--web-deploy ${stack.webDeploy}`,
    `--server-deploy ${stack.serverDeploy}`,
    stack.install === "false" ? "--no-install" : "--install",
    `--addons ${
      stack.addons.length > 0
        ? stack.addons
            .filter(
              (addon) =>
                addon !== "none" && TECH_OPTIONS.addons.some((option) => option.id === addon),
            )
            .join(" ") || "none"
        : "none"
    }`,
    `--examples ${stack.examples.join(" ") || "none"}`,
  ];

  const shadcn = getShadcnConfig(stack);
  if (shadcn) {
    flags.push(`--shadcn-preset ${shadcn.preset ?? DEFAULT_SHADCN_PRESET}`);
    if (shadcn.base && shadcn.base !== DEFAULT_SHADCN_BASE) {
      flags.push(`--shadcn-base ${shadcn.base}`);
    }
    if (shadcn.rtl) {
      flags.push("--shadcn-rtl");
    }
    if (shadcn.pointer) {
      flags.push("--shadcn-pointer");
    }
  }

  if (stack.i18n !== "none") {
    flags.push(`--i18n ${stack.i18n}`);
    const options = stack.i18nOptions;
    if (options) {
      flags.push(`--i18n-locales ${options.locales.join(",")}`);
      if (options.sourceLocale !== options.locales[0]) {
        flags.push(`--i18n-source-locale ${options.sourceLocale}`);
      }
      const strategy = options.routing?.strategy ?? "cookie";
      flags.push(`--i18n-routing ${strategy}`);
      if (strategy === "domain" && options.routing?.domains) {
        for (const [locale, host] of Object.entries(options.routing.domains)) {
          flags.push(`--i18n-domain ${locale}=${host}`);
        }
      }
      if (options.translateSkill === false) {
        flags.push("--no-i18n-skill");
      }
    }
  }

  if (stack.yolo === "true") {
    flags.push("--yolo");
  }

  if (stack.portless === "true") {
    flags.push("--portless");
  }

  return `${base} ${projectName} ${flags.join(" ")}`;
}

export function formatStackCommandForDisplay(command: string) {
  return command.replaceAll(" --", ` ${"\\"}\n  --`);
}

export function generateStackUrlFromState(stack: StackState, baseUrl?: string) {
  const origin = baseUrl || SITE_URL;
  const searchString = serializeStackToSearchString(stack);
  return `${origin}/new${searchString ? `?${searchString}` : ""}`;
}

type UrlSerializableValue = string | string[] | boolean | number | null;
type UrlSerializable = Partial<Record<keyof typeof stackUrlKeys, UrlSerializableValue>>;

function serializeStackToSearchString(stack: StackState) {
  const stackParams = new URLSearchParams();
  const { i18nOptions, ...stem } = stack;
  const serializable: UrlSerializable =
    stack.i18n === "none" ? stem : { ...stem, ...flattenI18nOptions(i18nOptions) };
  Object.entries(stackUrlKeys).forEach(([stackKey, urlKey]) => {
    const value = serializable[stackKey as keyof typeof stackUrlKeys];
    if (value !== undefined) {
      stackParams.set(urlKey as string, Array.isArray(value) ? value.join(",") : String(value));
    }
  });
  return stackParams.toString();
}

export function generateStackSharingUrl(stack: StackState, baseUrl?: string) {
  const origin = baseUrl || SITE_URL;
  const searchString = serializeStackToSearchString(stack);
  return `${origin}/stack${searchString ? `?${searchString}` : ""}`;
}

export function generateStackOgImageUrl(stack: StackState, baseUrl = "") {
  const searchString = serializeStackToSearchString(stack);
  return `${baseUrl}/og/stack${searchString ? `?${searchString}` : ""}`;
}

export { CATEGORY_ORDER };
