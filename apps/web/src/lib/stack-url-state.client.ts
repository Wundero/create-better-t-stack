"use client";
import { SHADCN_BASE_VALUES } from "@better-t-stack/types";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { useCallback, useMemo } from "react";

import { DEFAULT_STACK, type StackState, getStackOptionIds } from "@/lib/constant";

import { sanitizeStackState, type RawStackLists } from "./sanitize-stack-addons";
import { stackUrlKeys } from "./stack-url-keys";

export const stackParsers = {
  projectName: parseAsString.withDefault(DEFAULT_STACK.projectName ?? "my-better-t-app"),
  webFrontend: parseAsArrayOf(parseAsString).withDefault(DEFAULT_STACK.webFrontend),
  nativeFrontend: parseAsArrayOf(parseAsString).withDefault(DEFAULT_STACK.nativeFrontend),
  runtime: parseAsStringEnum<StackState["runtime"]>(getStackOptionIds("runtime")).withDefault(
    DEFAULT_STACK.runtime,
  ),
  backend: parseAsStringEnum<StackState["backend"]>(getStackOptionIds("backend")).withDefault(
    DEFAULT_STACK.backend,
  ),
  api: parseAsStringEnum<StackState["api"]>(getStackOptionIds("api")).withDefault(
    DEFAULT_STACK.api,
  ),
  database: parseAsStringEnum<StackState["database"]>(getStackOptionIds("database")).withDefault(
    DEFAULT_STACK.database,
  ),
  orm: parseAsStringEnum<StackState["orm"]>(getStackOptionIds("orm")).withDefault(
    DEFAULT_STACK.orm,
  ),
  dbSetup: parseAsStringEnum<StackState["dbSetup"]>(getStackOptionIds("dbSetup")).withDefault(
    DEFAULT_STACK.dbSetup,
  ),
  auth: parseAsStringEnum<StackState["auth"]>(getStackOptionIds("auth")).withDefault(
    DEFAULT_STACK.auth,
  ),
  payments: parseAsStringEnum<StackState["payments"]>(getStackOptionIds("payments")).withDefault(
    DEFAULT_STACK.payments,
  ),
  emailRenderer: parseAsStringEnum<StackState["emailRenderer"]>(
    getStackOptionIds("emailRenderer"),
  ).withDefault(DEFAULT_STACK.emailRenderer),
  emailDeploy: parseAsStringEnum<StackState["emailDeploy"]>(
    getStackOptionIds("emailDeploy"),
  ).withDefault(DEFAULT_STACK.emailDeploy),
  packageManager: parseAsStringEnum<StackState["packageManager"]>(
    getStackOptionIds("packageManager"),
  ).withDefault(DEFAULT_STACK.packageManager),
  addons: parseAsArrayOf(parseAsString).withDefault(DEFAULT_STACK.addons),
  examples: parseAsArrayOf(parseAsString).withDefault(DEFAULT_STACK.examples),
  git: parseAsStringEnum<StackState["git"]>(["true", "false"]).withDefault(DEFAULT_STACK.git),
  install: parseAsStringEnum<StackState["install"]>(["true", "false"]).withDefault(
    DEFAULT_STACK.install,
  ),
  portless: parseAsStringEnum<StackState["portless"]>(["true", "false"]).withDefault(
    DEFAULT_STACK.portless,
  ),
  webDeploy: parseAsStringEnum<StackState["webDeploy"]>(getStackOptionIds("webDeploy")).withDefault(
    DEFAULT_STACK.webDeploy,
  ),
  serverDeploy: parseAsStringEnum<StackState["serverDeploy"]>(
    getStackOptionIds("serverDeploy"),
  ).withDefault(DEFAULT_STACK.serverDeploy),
  yolo: parseAsStringEnum<StackState["yolo"]>(["true", "false"]).withDefault(DEFAULT_STACK.yolo),
  shadcnPreset: parseAsString.withDefault(DEFAULT_STACK.shadcnPreset),
  shadcnBase: parseAsStringEnum<StackState["shadcnBase"]>([...SHADCN_BASE_VALUES]).withDefault(
    DEFAULT_STACK.shadcnBase,
  ),
  shadcnRtl: parseAsBoolean.withDefault(DEFAULT_STACK.shadcnRtl),
  shadcnPointer: parseAsBoolean.withDefault(DEFAULT_STACK.shadcnPointer),
  viewMode: parseAsStringEnum<"command" | "preview">(["command", "preview"]).withDefault("command"),
  selectedFile: parseAsString.withDefault(""),
};

export const stackQueryStatesOptions = {
  history: "replace" as const,
  // The stack builder state is fully client-driven on /new, so URL updates
  // should stay shallow instead of forcing a server navigation.
  shallow: true,
  urlKeys: stackUrlKeys,
  clearOnDefault: true,
};

function getStackFromQueryState(queryState: RawStackLists): StackState {
  return sanitizeStackState({
    projectName: queryState.projectName,
    webFrontend: queryState.webFrontend,
    nativeFrontend: queryState.nativeFrontend,
    runtime: queryState.runtime,
    backend: queryState.backend,
    api: queryState.api,
    database: queryState.database,
    orm: queryState.orm,
    dbSetup: queryState.dbSetup,
    auth: queryState.auth,
    payments: queryState.payments,
    emailRenderer: queryState.emailRenderer,
    emailDeploy: queryState.emailDeploy,
    packageManager: queryState.packageManager,
    addons: queryState.addons,
    examples: queryState.examples,
    git: queryState.git,
    install: queryState.install,
    portless: queryState.portless,
    webDeploy: queryState.webDeploy,
    serverDeploy: queryState.serverDeploy,
    yolo: queryState.yolo,
    shadcnPreset: queryState.shadcnPreset,
    shadcnBase: queryState.shadcnBase,
    shadcnRtl: queryState.shadcnRtl,
    shadcnPointer: queryState.shadcnPointer,
  });
}

export function useStackState() {
  const [queryState, setQueryState] = useQueryStates(stackParsers, stackQueryStatesOptions);

  const stack = useMemo(() => getStackFromQueryState(queryState), [queryState]);

  const viewMode = queryState.viewMode;
  const selectedFile = queryState.selectedFile;

  const updateStack = useCallback(
    async (updates: Partial<StackState> | ((prev: StackState) => Partial<StackState>)) => {
      await setQueryState((currentQueryState) => {
        const currentStack = getStackFromQueryState(currentQueryState);
        const newStack = updates instanceof Function ? updates(currentStack) : updates;
        const finalStack = sanitizeStackState({ ...currentStack, ...newStack });

        return finalStack;
      });
    },
    [setQueryState],
  );

  const setViewMode = useCallback(
    async (mode: "command" | "preview") => {
      await setQueryState({ viewMode: mode });
    },
    [setQueryState],
  );

  const setSelectedFile = useCallback(
    async (filePath: string | null) => {
      await setQueryState({ selectedFile: filePath || "" });
    },
    [setQueryState],
  );

  return [stack, updateStack, viewMode, setViewMode, selectedFile, setSelectedFile] as const;
}
