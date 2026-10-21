import { Result } from "better-result";

import type { JsonValue } from "../core/json-types";
import {
  ShadcnRegistryError,
  isRegistryBase,
  isRegistryItem,
  type RegistryBase,
  type RegistryItem,
  type ResolveBaseInput,
  type ShadcnRegistryClient,
} from "./types";
import { buildInitUrl, buildStyleItemUrl } from "./url";

/** The versioned content negotiation header the shadcn registry expects. */
export const SHADCN_ACCEPT_HEADER = "application/vnd.shadcn.v1+json, application/json;q=0.9";

const DEFAULT_BASE_URL = "https://ui.shadcn.com";

/** Minimal fetch surface the client depends on (keeps Bun/Node global fetch assignable). */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface CreateHttpShadcnRegistryClientOptions {
  /** Registry origin; defaults to `BTS_SHADCN_REGISTRY_URL` or `https://ui.shadcn.com`. */
  baseUrl?: string;
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
}

type CachedItem = JsonValue;

/**
 * Creates an HTTP-backed shadcn registry client with a per-instance URL cache.
 * All failures are returned as typed `ShadcnRegistryError` values; nothing is
 * thrown for recoverable network/HTTP/parse failures.
 */
export function createHttpShadcnRegistryClient(
  options: CreateHttpShadcnRegistryClientOptions = {},
): ShadcnRegistryClient {
  const baseUrl = options.baseUrl ?? process.env.BTS_SHADCN_REGISTRY_URL ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = new Map<string, CachedItem>();

  async function fetchJson(url: string): Promise<Result<JsonValue, ShadcnRegistryError>> {
    const response = await Result.tryPromise({
      try: () =>
        fetchImpl(url, {
          headers: { accept: SHADCN_ACCEPT_HEADER },
        }),
      catch: (cause) =>
        new ShadcnRegistryError({
          message: "Registry request failed before a response was received",
          url,
          status: null,
          cause,
        }),
    });

    if (!response.isOk()) return Result.err(response.error);
    const httpResponse = response.value;

    if (!httpResponse.ok) {
      return Result.err(
        new ShadcnRegistryError({
          message: `Registry request failed with status ${httpResponse.status}`,
          url,
          status: httpResponse.status,
        }),
      );
    }

    return Result.tryPromise({
      try: async (): Promise<JsonValue> => {
        const data = (await httpResponse.json()) as JsonValue;
        return data;
      },
      catch: (cause) =>
        new ShadcnRegistryError({
          message: "Registry response was not valid JSON",
          url,
          status: httpResponse.status,
          cause,
        }),
    });
  }

  async function resolveBase(
    input: ResolveBaseInput,
  ): Promise<Result<RegistryBase, ShadcnRegistryError>> {
    const url = buildInitUrl(input, baseUrl);
    const cached = cache.get(url);
    if (cached !== undefined && isRegistryBase(cached)) return Result.ok(cached);

    const body = await fetchJson(url);
    if (!body.isOk()) return Result.err(body.error);
    if (!isRegistryBase(body.value)) {
      return Result.err(
        new ShadcnRegistryError({
          message: "Registry /init response was not a registry:base item",
          url,
          status: 200,
        }),
      );
    }
    cache.set(url, body.value);
    return Result.ok(body.value);
  }

  async function getItem(
    style: string,
    name: string,
  ): Promise<Result<RegistryItem, ShadcnRegistryError>> {
    const url = buildStyleItemUrl(style, name, baseUrl);
    const cached = cache.get(url);
    if (cached !== undefined && isRegistryItem(cached)) return Result.ok(cached);

    const body = await fetchJson(url);
    if (!body.isOk()) return Result.err(body.error);
    if (!isRegistryItem(body.value)) {
      return Result.err(
        new ShadcnRegistryError({
          message: "Registry item response was not a valid registry item",
          url,
          status: 200,
        }),
      );
    }
    cache.set(url, body.value);
    return Result.ok(body.value);
  }

  return { resolveBase, getItem };
}
