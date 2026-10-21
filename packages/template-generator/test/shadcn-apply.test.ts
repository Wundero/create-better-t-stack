import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  type ComponentAliases,
  type RegistryItem,
  type ShadcnBase,
  type ShadcnIconLibrary,
  componentDependencyNames,
  createHttpShadcnRegistryClient,
  getIconLibrary,
  iconLibraryPackages,
  renderIconUsage,
  resolveComponentClosure,
  resolveShadcnDependencyVersion,
  transformComponentSource,
} from "../src/shadcn";

const fixturesDir = fileURLToPath(new URL("./fixtures/shadcn/", import.meta.url));

const ALIASES: ComponentAliases = {
  components: "@acme/ui/components",
  ui: "@acme/ui/components",
  utils: "@acme/ui/lib/utils",
  hooks: "@acme/ui/hooks",
  lib: "@acme/ui/lib",
};

const BASES: readonly ShadcnBase[] = ["base", "radix", "aria"];

const FRAMEWORK_PACKAGE = {
  base: "@base-ui/react",
  radix: "radix-ui",
  aria: "react-aria-components",
} satisfies Record<ShadcnBase, string>;

const COMPONENTS: readonly string[] = ["button", "card", "checkbox", "sonner"];

const ICON_LIBRARIES: readonly ShadcnIconLibrary[] = [
  "lucide",
  "tabler",
  "hugeicons",
  "phosphor",
  "remixicon",
];

/** First element of an IconPlaceholder prop set used as the transform probe. */
interface IconProbe {
  readonly iconName: string;
}

const SONNER_SUCCESS_PROBE = {
  lucide: { iconName: "CircleCheckIcon" },
  tabler: { iconName: "IconCircleCheck" },
  hugeicons: { iconName: "CheckmarkCircle02Icon" },
  phosphor: { iconName: "CheckCircleIcon" },
  remixicon: { iconName: "RiCheckboxCircleLine" },
} satisfies Record<ShadcnIconLibrary, IconProbe>;

function normalizeWhitespace(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

async function serveFixture(relativePath: string): Promise<Response | null> {
  try {
    const body = await readFile(`${fixturesDir}${relativePath}`, "utf8");
    return new Response(body, { headers: { "content-type": "application/json" } });
  } catch {
    return null;
  }
}

interface RecordedRequest {
  path: string;
  remoteHost: string;
}

let server: ReturnType<typeof Bun.serve>;
let origin = "";
let client: ReturnType<typeof createHttpShadcnRegistryClient>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/init") {
        const base = url.searchParams.get("base") ?? "base";
        const style = url.searchParams.get("style") ?? "maia";
        const fixture = await serveFixture(`init/${base}-${style}.json`);
        return fixture ?? new Response("bad request", { status: 400 });
      }
      const match = /^\/r\/styles\/([^/]+)\/([^/]+)\.json$/.exec(url.pathname);
      if (match) {
        const style = match[1] ?? "";
        const name = match[2] ?? "";
        const fixture = await serveFixture(`styles/${style}/${name}.json`);
        return fixture ?? new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  origin = `http://localhost:${server.port}`;
  client = createRecordingClient().client;
});

afterAll(() => {
  server.stop(true);
});

function requestUrl(input: string | URL | Request): string {
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return input;
}

function createRecordingClient() {
  const requests: RecordedRequest[] = [];
  const client = createHttpShadcnRegistryClient({
    baseUrl: origin,
    fetchImpl: (input, init) => {
      const url = requestUrl(input);
      requests.push({ path: new URL(url).pathname, remoteHost: new URL(url).host });
      return fetch(input, init);
    },
  });
  return { client, requests };
}

function firstFileContent(item: RegistryItem): string {
  const file = item.files?.[0];
  if (file === undefined) {
    throw new Error(`Registry item ${item.name} carried no files`);
  }
  return file.content;
}

async function loadComponent(style: string, name: string): Promise<string> {
  const result = await client.getItem(style, name);
  if (!result.isOk()) {
    throw new Error(`Fixture ${style}/${name} unavailable: ${result.error.message}`);
  }
  return firstFileContent(result.value);
}

describe("transformComponentSource across bases", () => {
  for (const base of BASES) {
    test(`${base}: strips IconPlaceholder, registry and create-app imports`, async () => {
      const style = `${base}-maia`;
      const framework = FRAMEWORK_PACKAGE[base];

      for (const name of COMPONENTS) {
        const source = await loadComponent(style, name);
        const output = transformComponentSource(source, {
          aliases: ALIASES,
          iconLibrary: "hugeicons",
        });

        expect(output).not.toContain("IconPlaceholder");
        expect(output).not.toContain("@/registry/");
        expect(output).not.toContain("@/app/(create)/");
        if (source.includes(framework)) {
          expect(output).toContain(`"${framework}`);
        }
      }
    });
  }
});

describe("icon library transform", () => {
  for (const library of ICON_LIBRARIES) {
    test(`${library}: emits imports and usage with preserved props`, async () => {
      const source = await loadComponent("base-maia", "sonner");
      const output = transformComponentSource(source, { aliases: ALIASES, iconLibrary: library });

      expect(output).not.toContain("IconPlaceholder");
      for (const packageName of iconLibraryPackages(library)) {
        expect(output).toContain(`"${packageName}"`);
      }

      const { iconName } = SONNER_SUCCESS_PROBE[library];
      expect(output).toContain(renderIconUsage(library, iconName, ['className="size-4"']));
      expect(output).toContain('className="size-4"');
    });
  }

  test("icon table exposes packages, ids and usage templates", () => {
    expect(getIconLibrary("lucide").id).toBe("lucide");
    expect(iconLibraryPackages("lucide")).toEqual(["lucide-react"]);
    expect(iconLibraryPackages("tabler")).toEqual(["@tabler/icons-react"]);
    expect(iconLibraryPackages("remixicon")).toEqual(["@remixicon/react"]);
    expect(iconLibraryPackages("hugeicons")).toEqual([
      "@hugeicons/react",
      "@hugeicons/core-free-icons",
    ]);
    expect(renderIconUsage("lucide", "CheckIcon")).toBe("<CheckIcon />");
    expect(renderIconUsage("tabler", "IconCheck")).toBe("<IconCheck />");
    expect(renderIconUsage("phosphor", "CheckIcon")).toBe("<CheckIcon strokeWidth={2} />");
    expect(renderIconUsage("hugeicons", "Tick02Icon")).toBe(
      "<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />",
    );
    expect(renderIconUsage("hugeicons", "Tick02Icon", ['className="size-4"'])).toBe(
      '<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4" />',
    );
  });
});

describe("alias rewriting", () => {
  test("rewrites registry sibling imports onto project aliases", async () => {
    const source = await loadComponent("base-maia", "input-group");
    const output = transformComponentSource(source, { aliases: ALIASES, iconLibrary: "lucide" });

    expect(output).not.toContain("@/registry/");
    expect(output).toContain("@acme/ui/components/button");
    expect(output).toContain("@acme/ui/components/input");
    expect(output).toContain("@acme/ui/components/textarea");
  });

  test("keeps unmanaged specifiers and the use client directive intact", async () => {
    const source = await loadComponent("base-maia", "checkbox");
    const output = transformComponentSource(source, { aliases: ALIASES, iconLibrary: "lucide" });

    expect(output).toContain('"use client"');
    expect(output).toContain('from "cn"');
    expect(output).toContain('from "@base-ui/react/checkbox"');
  });
});

describe("golden transformed output", () => {
  test("checkbox base-maia with hugeicons matches the frozen snapshot", async () => {
    const source = await loadComponent("base-maia", "checkbox");
    const output = transformComponentSource(source, { aliases: ALIASES, iconLibrary: "hugeicons" });
    const expected = await readFile(
      `${fixturesDir}expected/checkbox.base-maia.hugeicons.snapshot`,
      "utf8",
    );

    expect(normalizeWhitespace(output)).toBe(normalizeWhitespace(expected));
  });
});

describe("component dependency graph", () => {
  test("componentDependencyNames filters utils and font items", async () => {
    const inputGroup = await client.getItem("base-maia", "input-group");
    expect(inputGroup.isOk()).toBe(true);
    if (!inputGroup.isOk()) return;
    expect(componentDependencyNames(inputGroup.value)).toEqual(["button", "input", "textarea"]);

    const font = await client.getItem("base-maia", "font-outfit");
    expect(font.isOk()).toBe(true);
    if (!font.isOk()) return;
    expect(componentDependencyNames(font.value)).toEqual([]);

    const utils = await client.getItem("base-maia", "utils");
    expect(utils.isOk()).toBe(true);
    if (!utils.isOk()) return;
    expect(componentDependencyNames(utils.value)).toEqual([]);
  });

  test("componentDependencyNames dedupes and drops non-component entries", () => {
    const item: RegistryItem = {
      name: "synthetic",
      type: "registry:ui",
      registryDependencies: [
        "utils",
        "font-outfit",
        "font-heading-raleway",
        "button",
        "button",
        "input",
      ],
    };
    expect(componentDependencyNames(item)).toEqual(["button", "input"]);
  });

  test("resolveComponentClosure walks the transitive graph local to the fixture server", async () => {
    const recording = createRecordingClient();
    const result = await resolveComponentClosure(recording.client, "base-maia", ["input-group"]);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect([...result.value.keys()]).toEqual(["input-group", "button", "input", "textarea"]);
    expect(
      recording.requests.every((entry) => entry.remoteHost === `localhost:${server.port}`),
    ).toBe(true);
    const buttonRequests = recording.requests.filter((entry) =>
      entry.path.endsWith("/button.json"),
    );
    expect(buttonRequests).toHaveLength(1);
  });

  test("resolveComponentClosure returns the typed registry error for a missing item", async () => {
    const recording = createRecordingClient();
    const result = await resolveComponentClosure(recording.client, "base-maia", ["does-not-exist"]);
    expect(result.isOk()).toBe(false);
  });
});

describe("dependency versions", () => {
  test("resolves pinned versions and skips the registry CLI package", () => {
    expect(resolveShadcnDependencyVersion("@base-ui/react")).toBe("^1.8.0");
    expect(resolveShadcnDependencyVersion("radix-ui")).toBe("^1.6.7");
    expect(resolveShadcnDependencyVersion("react-aria-components")).toBe("^1.21.1");
    expect(resolveShadcnDependencyVersion("@hugeicons/core-free-icons")).toBe("^4.3.5");
    expect(resolveShadcnDependencyVersion("@fontsource-variable/outfit")).toBe("^5.3.0");
    expect(resolveShadcnDependencyVersion("shadcn@latest")).toBeUndefined();
    expect(resolveShadcnDependencyVersion("cn")).toBeUndefined();
  });
});
