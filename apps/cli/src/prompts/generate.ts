import { text } from "@clack/prompts";

import {
  AppNameSchema,
  BACKEND_VALUES,
  FRONTEND_VALUES,
  WorkspacePackageNameSchema,
  type Backend,
  type Frontend,
} from "../types";
import { isFirstPrompt } from "../utils/context";
import { UserCancelledError } from "../utils/errors";
import { isCancel, isGoBack, navigableSelect, setIsFirstPrompt } from "./navigable";

export type GenerateCategory = "frontend" | "backend" | "mobile";

const WEB_FRONTEND_VALUES = FRONTEND_VALUES.filter(
  (value) => value !== "none" && !value.startsWith("native-"),
);
const NATIVE_FRONTEND_VALUES = FRONTEND_VALUES.filter((value) => value.startsWith("native-"));
const GENERATABLE_BACKEND_VALUES = BACKEND_VALUES.filter(
  (value) => value !== "none" && value !== "self" && value !== "convex",
);

const WEB_FRONTEND_SET = new Set<string>(WEB_FRONTEND_VALUES);
const NATIVE_FRONTEND_SET = new Set<string>(NATIVE_FRONTEND_VALUES);
const GENERATABLE_BACKEND_SET = new Set<string>(GENERATABLE_BACKEND_VALUES);

function isWebFrontend(value: string): value is Frontend {
  return WEB_FRONTEND_SET.has(value);
}

function isNativeFrontend(value: string): value is Frontend {
  return NATIVE_FRONTEND_SET.has(value);
}

function isGeneratableBackend(value: string): value is Backend {
  return GENERATABLE_BACKEND_SET.has(value);
}

export interface GenerateSelection {
  category: GenerateCategory;
  framework: string;
}

export interface ResolvedGenerateSelection {
  kind: GenerateCategory;
  frontend?: Frontend;
  backend?: Backend;
}

export function resolveGenerateSelection(selection: GenerateSelection): ResolvedGenerateSelection {
  const { category, framework } = selection;

  switch (category) {
    case "frontend":
      if (isWebFrontend(framework)) return { kind: "frontend", frontend: framework };
      throw new Error(`Invalid frontend framework: ${framework}`);
    case "mobile":
      if (isNativeFrontend(framework)) return { kind: "mobile", frontend: framework };
      throw new Error(`Invalid mobile framework: ${framework}`);
    case "backend":
      if (isGeneratableBackend(framework)) return { kind: "backend", backend: framework };
      throw new Error(`Invalid backend framework: ${framework}`);
  }
}

export function validateAppName(value: string): string | undefined {
  const result = AppNameSchema.safeParse(value);
  if (result.success) return undefined;
  return result.error.issues[0]?.message ?? "Invalid app name";
}

const CATEGORY_OPTIONS: Array<{ value: GenerateCategory; label: string; hint: string }> = [
  { value: "frontend", label: "Web app", hint: "React, Vue, Svelte or Astro web application" },
  { value: "backend", label: "Backend server", hint: "Hono, Express, Fastify or Elysia API" },
  { value: "mobile", label: "Mobile app", hint: "React Native/Expo app" },
];

const FRAMEWORK_MESSAGES = {
  frontend: "Choose a web framework",
  backend: "Choose a backend framework",
  mobile: "Choose a native setup",
} satisfies Record<GenerateCategory, string>;

const FRAMEWORK_LABELS = new Map<string, string>([
  ["tanstack-router", "TanStack Router"],
  ["react-router", "React Router"],
  ["tanstack-start", "TanStack Start"],
  ["next", "Next.js"],
  ["nuxt", "Nuxt"],
  ["svelte", "Svelte"],
  ["solid", "Solid"],
  ["astro", "Astro"],
  ["native-bare", "Bare"],
  ["native-uniwind", "Uniwind"],
  ["native-unistyles", "Unistyles"],
  ["hono", "Hono"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["elysia", "Elysia"],
]);

function frameworkOptions(category: GenerateCategory): Array<{ value: string; label: string }> {
  const values =
    category === "frontend"
      ? WEB_FRONTEND_VALUES
      : category === "mobile"
        ? NATIVE_FRONTEND_VALUES
        : GENERATABLE_BACKEND_VALUES;

  return values.map((value) => ({ value, label: FRAMEWORK_LABELS.get(value) ?? value }));
}

export async function promptPackageName(): Promise<string> {
  const response = await text({
    message: "What should we name the package?",
    placeholder: "shared",
    validate: (value) => {
      const result = WorkspacePackageNameSchema.safeParse(String(value ?? "").trim());
      if (result.success) return undefined;
      return result.error.issues[0]?.message ?? "Invalid package name";
    },
  });

  if (isCancel(response)) throw new UserCancelledError({ message: "Operation cancelled" });

  return WorkspacePackageNameSchema.parse(String(response).trim());
}

export async function promptGenerateSelection(): Promise<
  ResolvedGenerateSelection & { name: string }
> {
  while (true) {
    const wasFirstPrompt = isFirstPrompt();

    const category = await navigableSelect<GenerateCategory>({
      message: "What do you want to generate?",
      options: CATEGORY_OPTIONS,
      initialValue: "frontend",
    });

    if (isCancel(category)) throw new UserCancelledError({ message: "Operation cancelled" });
    if (isGoBack(category)) throw new UserCancelledError({ message: "Operation cancelled" });

    setIsFirstPrompt(false);

    const options = frameworkOptions(category);
    const framework = await navigableSelect<string>({
      message: FRAMEWORK_MESSAGES[category],
      options,
      initialValue: options[0]?.value,
    });

    if (isCancel(framework)) throw new UserCancelledError({ message: "Operation cancelled" });
    if (isGoBack(framework)) {
      setIsFirstPrompt(wasFirstPrompt);
      continue;
    }

    const resolved = resolveGenerateSelection({ category, framework });

    const nameResponse = await text({
      message: "What should we name the app?",
      placeholder: "my-app",
      validate: (value) => validateAppName(String(value ?? "").trim()),
    });

    if (isCancel(nameResponse)) throw new UserCancelledError({ message: "Operation cancelled" });

    return { ...resolved, name: AppNameSchema.parse(String(nameResponse).trim()) };
  }
}
