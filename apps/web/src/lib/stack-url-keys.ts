import type { UrlKeys } from "nuqs";

import type { StackState } from "@/lib/constant";

type StackUrlState = StackState & {
  viewMode: string;
  selectedFile: string;
  locales: string[];
  sourceLocale: string;
  routing: string;
  domains: string;
};

export const stackUrlKeys: UrlKeys<StackUrlState> = {
  projectName: "name",
  webFrontend: "fe-w",
  nativeFrontend: "fe-n",
  runtime: "rt",
  backend: "be",
  api: "api",
  database: "db",
  orm: "orm",
  dbSetup: "dbs",
  auth: "au",
  payments: "pay",
  emailRenderer: "er",
  emailDeploy: "ed",
  i18n: "i18n",
  locales: "loc",
  sourceLocale: "src",
  // Design D1 names this `rt`, but `rt` is already the runtime key; `irt` avoids the clash.
  routing: "irt",
  domains: "dom",
  packageManager: "pm",
  addons: "add",
  examples: "ex",
  git: "git",
  install: "i",
  portless: "portless",
  webDeploy: "wd",
  serverDeploy: "sd",
  yolo: "yolo",
  shadcnPreset: "th",
  shadcnBase: "th-b",
  shadcnRtl: "th-rtl",
  shadcnPointer: "th-p",
  viewMode: "view",
  selectedFile: "file",
};
