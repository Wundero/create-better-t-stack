import { describe, expect, test } from "bun:test";

import {
  composeUiPackageJsonDependencies,
  type RegistryBase,
  type ResolvedShadcnTheme,
} from "../src/shadcn";
import { GeneratorError } from "../src/types";

const BASE: RegistryBase = {
  extends: "base",
  name: "base-maia",
  dependencies: [],
  registryDependencies: [],
  cssVars: {},
  type: "registry:base",
  config: {
    style: "base-maia",
    tailwind: { baseColor: "neutral" },
    iconLibrary: "lucide",
    rtl: false,
    menuColor: "default",
    menuAccent: "subtle",
  },
};

const STATIC_DEPS = {
  "@base-ui/react": "^1.8.0",
  "lucide-react": "^1.41.0",
  cn: "^0.2.5",
};

function resolvedTheme(overrides: Partial<ResolvedShadcnTheme> = {}): ResolvedShadcnTheme {
  return {
    base: BASE,
    style: "base-maia",
    iconLibrary: "lucide",
    rtl: false,
    pointer: false,
    fonts: [],
    components: new Map(),
    utilsSource: 'export { cn } from "cn";',
    dependencies: [],
    ...overrides,
  };
}

describe("composeUiPackageJsonDependencies registry dependencies", () => {
  test("adds a pinned registry dependency absent from the static template", () => {
    const result = composeUiPackageJsonDependencies(
      STATIC_DEPS,
      resolvedTheme({ dependencies: ["@tabler/icons-react"] }),
    );

    expect(result.deps["@tabler/icons-react"]).toBe("^3.48.0");
    expect(result.changed).toBe(true);
  });

  test("keeps an existing pin over the registry-declared dependency", () => {
    const result = composeUiPackageJsonDependencies(
      { ...STATIC_DEPS, "@tabler/icons-react": "9.9.9" },
      resolvedTheme({ dependencies: ["@tabler/icons-react"] }),
    );

    expect(result.deps["@tabler/icons-react"]).toBe("9.9.9");
    expect(result.changed).toBe(false);
  });

  test("never adds the registry CLI dist-tag", () => {
    const result = composeUiPackageJsonDependencies(
      STATIC_DEPS,
      resolvedTheme({ dependencies: ["shadcn@latest"] }),
    );

    expect(result.deps["shadcn@latest"]).toBeUndefined();
    expect(result.changed).toBe(false);
  });

  test("fails loudly for a registry dependency with no pinned version", () => {
    let thrown: unknown;
    try {
      composeUiPackageJsonDependencies(
        STATIC_DEPS,
        resolvedTheme({ dependencies: ["totally-unknown-package"] }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(GeneratorError.is(thrown)).toBe(true);
    if (!GeneratorError.is(thrown)) return;
    expect(thrown.message).toContain("totally-unknown-package");
  });
});
