/**
 * Bun preload that applies the Lingui macro transform to Bun-run hosts
 * (server on Bun, the Electrobun Bun main process, OpenTUI apps).
 *
 * Register it from the host's `bunfig.toml`:
 *
 *   preload = ["../../packages/i18n/bun-preload.ts"]
 *
 * Vite and Next transform macros through their own plugins; this preload is
 * the equivalent for hosts that execute TypeScript directly with Bun (no
 * bundler step). It only touches files that import a Lingui macro entrypoint.
 *
 * `@babel/core` and `@lingui/babel-plugin-lingui-macro` are declared on this
 * package, so Bun resolves both from here regardless of the host app.
 */
import { transformAsync } from "@babel/core";
import linguiMacro from "@lingui/babel-plugin-lingui-macro";

declare const Bun: {
  file(filePath: string): { text(): Promise<string> };
  plugin(plugin: {
    name: string;
    setup(build: {
      onLoad(
        options: { filter: RegExp },
        handler: (args: {
          path: string;
        }) => Promise<{ contents: string; loader: "ts" | "tsx" | "js" | "jsx" } | undefined>,
      ): void;
    }): void;
  }): void;
};

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const LINGUI_MACRO = /@lingui\/(?:core|react|solid)\/macro/;

Bun.plugin({
  name: "lingui-macro-preload",
  setup(build) {
    build.onLoad({ filter: SOURCE_FILE }, async ({ path }) => {
      const code = await Bun.file(path).text();
      if (!LINGUI_MACRO.test(code)) return undefined;

      const result = await transformAsync(code, {
        filename: path,
        babelrc: false,
        configFile: false,
        sourceMaps: "inline",
        parserOpts: { plugins: ["typescript", "jsx"] },
        plugins: [[linguiMacro, {}]],
      });
      if (!result?.code) return undefined;

      const loader = path.endsWith("x") ? "tsx" : "ts";
      return { contents: result.code, loader };
    });
  },
});
