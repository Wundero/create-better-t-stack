import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  SHADCN_ACCEPT_HEADER,
  ShadcnRegistryError,
  buildInitUrl,
  createHttpShadcnRegistryClient,
  styleSlug,
  type ResolveBaseInput,
} from "../src/shadcn";

const fixturesDir = fileURLToPath(new URL("./fixtures/shadcn/", import.meta.url));

const PRESET_INPUT: ResolveBaseInput = {
  base: "base",
  style: "maia",
  baseColor: "taupe",
  theme: "taupe",
  iconLibrary: "hugeicons",
  font: "outfit",
  radius: "medium",
  menuColor: "default-translucent",
  menuAccent: "subtle",
  fontHeading: "raleway",
  chartColor: "amber",
  preset: "b1x9M8ZeJW",
};

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
  accept: string | null;
  remoteHost: string;
}

let server: ReturnType<typeof Bun.serve>;
let origin = "";

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
        if (name === "bad-request") return new Response("bad", { status: 400 });
        const fixture = await serveFixture(`styles/${style}/${name}.json`);
        return fixture ?? new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  origin = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

function readAccept(headers: HeadersInit | undefined): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get("accept");
  if (Array.isArray(headers)) {
    const entry = headers.find((pair) => pair[0]?.toLowerCase() === "accept");
    return entry?.[1] ?? null;
  }
  return headers["accept"] ?? null;
}

function requestUrl(input: string | URL | Request): string {
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return input;
}

function createRecordingClient() {
  const requests: RecordedRequest[] = [];
  const urls: string[] = [];
  const client = createHttpShadcnRegistryClient({
    baseUrl: origin,
    fetchImpl: (input, init) => {
      const url = requestUrl(input);
      urls.push(url);
      requests.push({
        path: new URL(url).pathname + new URL(url).search,
        accept: readAccept(init?.headers),
        remoteHost: new URL(url).host,
      });
      return fetch(input, init);
    },
  });
  return { client, requests, urls };
}

describe("buildInitUrl", () => {
  test("emits a deterministic query with preset, overrides, chartColor, fontHeading and track", () => {
    const first = buildInitUrl(PRESET_INPUT, "https://ui.shadcn.com");
    const second = buildInitUrl(PRESET_INPUT, "https://ui.shadcn.com");
    expect(first).toBe(second);

    const url = new URL(first);
    expect(url.pathname).toBe("/init");
    expect(url.searchParams.get("base")).toBe("base");
    expect(url.searchParams.get("style")).toBe("maia");
    expect(url.searchParams.get("preset")).toBe("b1x9M8ZeJW");
    expect(url.searchParams.get("chartColor")).toBe("amber");
    expect(url.searchParams.get("fontHeading")).toBe("raleway");
    expect(url.searchParams.get("track")).toBe("1");
    expect(url.searchParams.get("pointer")).toBeNull();
  });

  test("omits neutral chartColor, inherit fontHeading, false pointer and trailing slash", () => {
    const { preset: _preset, ...rest } = PRESET_INPUT;
    const url = new URL(
      buildInitUrl(
        { ...rest, chartColor: "neutral", fontHeading: "inherit", pointer: false },
        "https://ui.shadcn.com/",
      ),
    );
    expect(url.searchParams.get("chartColor")).toBeNull();
    expect(url.searchParams.get("fontHeading")).toBeNull();
    expect(url.searchParams.get("pointer")).toBeNull();
    expect(url.searchParams.get("preset")).toBeNull();
  });

  test("includes pointer when true", () => {
    const url = new URL(buildInitUrl({ ...PRESET_INPUT, pointer: true }, "https://ui.shadcn.com"));
    expect(url.searchParams.get("pointer")).toBe("true");
  });

  test("styleSlug composes base and style", () => {
    expect(styleSlug("radix", "lyra")).toBe("radix-lyra");
  });
});

describe("createHttpShadcnRegistryClient", () => {
  test("sends the shadcn Accept header and parses a registry:base item", async () => {
    const { client, requests } = createRecordingClient();
    const result = await client.resolveBase(PRESET_INPUT);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.type).toBe("registry:base");
    expect(result.value.name).toBe("base-maia");
    expect(result.value.dependencies).toContain("@base-ui/react");
    expect(result.value.config.style).toBe("base-maia");
    expect(requests[0]?.accept).toBe(SHADCN_ACCEPT_HEADER);
  });

  test("honours the base override when resolving", async () => {
    const { client } = createRecordingClient();
    const result = await client.resolveBase({ ...PRESET_INPUT, base: "aria" });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.name).toBe("aria-maia");
    expect(result.value.dependencies).toContain("react-aria-components");
  });

  test("getItem parses a component and a font item", async () => {
    const { client } = createRecordingClient();
    const button = await client.getItem("base-maia", "button");
    expect(button.isOk()).toBe(true);
    if (!button.isOk()) return;
    expect(button.value.type).toBe("registry:ui");
    expect(button.value.files?.[0]?.path).toContain("button.tsx");

    const font = await client.getItem("base-maia", "font-outfit");
    expect(font.isOk()).toBe(true);
    if (!font.isOk()) return;
    expect(font.value.type).toBe("registry:font");
    expect(font.value.font?.dependency).toBe("@fontsource-variable/outfit");
  });

  test("caches per URL so a repeated call fetches once", async () => {
    const { client, urls } = createRecordingClient();
    const first = await client.resolveBase(PRESET_INPUT);
    const second = await client.resolveBase(PRESET_INPUT);
    const third = await client.getItem("base-maia", "button");
    const fourth = await client.getItem("base-maia", "button");

    expect(first.isOk() && second.isOk() && third.isOk() && fourth.isOk()).toBe(true);
    expect(urls).toHaveLength(2);
  });

  test("maps a 404 to a typed error carrying url and status", async () => {
    const { client } = createRecordingClient();
    const result = await client.getItem("base-maia", "does-not-exist");
    expect(result.isOk()).toBe(false);
    if (result.isOk()) return;
    expect(ShadcnRegistryError.is(result.error)).toBe(true);
    expect(result.error.status).toBe(404);
    expect(result.error.url).toContain("/r/styles/base-maia/does-not-exist.json");
  });

  test("maps a 400 to a typed error", async () => {
    const { client } = createRecordingClient();
    const result = await client.getItem("base-maia", "bad-request");
    expect(result.isOk()).toBe(false);
    if (result.isOk()) return;
    expect(result.error.status).toBe(400);
  });

  test("never contacts an external host", async () => {
    const { client, requests, urls } = createRecordingClient();
    await client.resolveBase(PRESET_INPUT);
    await client.getItem("base-maia", "button");

    expect(urls.length).toBeGreaterThan(0);
    expect(requests.every((entry) => entry.remoteHost === `localhost:${server.port}`)).toBe(true);
    expect(urls.every((entry) => entry.startsWith(origin))).toBe(true);
  });
});
