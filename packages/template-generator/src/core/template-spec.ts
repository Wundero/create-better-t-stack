/**
 * Template data embedded into the built package.
 *
 * Handlebars refuses to run `new Function` on runtimes such as Cloudflare workerd, so templates
 * are compiled ahead of time (in Node, at build time) and embedded as specification objects.
 * Rendering a spec through `handlebars/runtime` never generates code at runtime.
 */

/**
 * A function emitted by the Handlebars compiler. The VM container and handler arguments are
 * internal Handlebars machinery; they are not part of this project's domain and stay untyped.
 */
export type CompiledTemplateFunction = (...args: any[]) => unknown;

/** A serialized Handlebars specification produced by `Handlebars.precompile`. */
export interface CompiledTemplate {
  readonly kind: "template";
  readonly compiler?: readonly (number | string)[];
  readonly main: CompiledTemplateFunction;
  readonly useData?: boolean;
  readonly useDepths?: boolean;
  readonly usePartial?: boolean;
  readonly useBlockParams?: boolean;
  readonly compat?: boolean;
  readonly [program: string]:
    | CompiledTemplateFunction
    | readonly (number | string)[]
    | boolean
    | undefined
    | "template";
}

/** A file copied verbatim: static assets, binary placeholders, and non-Handlebars files. */
export interface RawTemplateFile {
  readonly kind: "raw";
  readonly content: string;
}

export type TemplateEntry = CompiledTemplate | RawTemplateFile;

/** Template path to either a precompiled spec or verbatim content. */
export type TemplateData = Map<string, TemplateEntry>;
