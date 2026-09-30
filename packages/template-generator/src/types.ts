import type { ProjectConfig } from "@better-t-stack/types";
import { TaggedError } from "better-result";

import type { TemplateData } from "./core/template-spec";
import type { ResolvedShadcnTheme } from "./shadcn/resolve";
import type { ShadcnRegistryClient } from "./shadcn/types";

export interface VirtualFile {
  type: "file";
  path: string;
  name: string;
  content: string;
  extension: string;
  sourcePath?: string; // Original template path for binary files
}

export interface VirtualDirectory {
  type: "directory";
  path: string;
  name: string;
  children: VirtualNode[];
}

export type VirtualNode = VirtualFile | VirtualDirectory;

export interface VirtualFileTree {
  root: VirtualDirectory;
  fileCount: number;
  directoryCount: number;
  config: ProjectConfig;
}

export interface GeneratorOptions {
  config: ProjectConfig;
  templateBasePath?: string;
  templates?: TemplateData;
  /** CLI version string for bts.jsonc */
  version?: string;
  /** Injectable registry client; defaults to the HTTP client when omitted. */
  registry?: ShadcnRegistryClient;
  /** Pre-resolved shadcn theme; skips registry resolution when provided. */
  shadcn?: ResolvedShadcnTheme;
}

/**
 * Error class for template generation failures
 */
export class GeneratorError extends TaggedError("GeneratorError")<{
  message: string;
  phase?: string;
  cause?: unknown;
}> {}
