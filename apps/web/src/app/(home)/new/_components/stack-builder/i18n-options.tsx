"use client";

import {
  getI18nRoutingSupport,
  validateI18nCompatibility,
  type I18nOptions,
  type I18nRoutingStrategy,
} from "@better-t-stack/types";
import { LucideCheck, LucideInfo, LucidePlus, LucideX } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { DEFAULT_I18N_OPTIONS, type StackState } from "@/lib/constant";
import { getI18nConfigFromStack, I18N_ROUTING_STRATEGIES } from "@/lib/stack-i18n";
import { cn } from "@/lib/utils";

type I18nOptionsEditorProps = {
  stack: StackState;
  onChange: (options: I18nOptions) => void;
};

const ROUTING_LABELS = {
  cookie: "Cookie",
  prefix: "URL prefix",
  domain: "Domain",
} satisfies Record<I18nRoutingStrategy, string>;

function canonicalizeLocale(tag: string): string | null {
  try {
    return Intl.getCanonicalLocales(tag.trim())[0] ?? null;
  } catch {
    return null;
  }
}

export function I18nOptionsEditor({ stack, onChange }: I18nOptionsEditorProps) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const library = stack.i18n;
  if (library === "none") return null;

  const config = getI18nConfigFromStack(stack);
  const compatibility = validateI18nCompatibility(library, config);
  const options = stack.i18nOptions ?? DEFAULT_I18N_OPTIONS;
  const routing = options.routing ?? DEFAULT_I18N_OPTIONS.routing;
  const strategy = routing.strategy;
  const routingSupport = getI18nRoutingSupport(strategy, config, library);

  const commit = (next: I18nOptions) => onChange(next);
  const patchRouting = (patch: Partial<NonNullable<I18nOptions["routing"]>>) =>
    commit({ ...options, routing: { ...routing, ...patch } });

  const addLocale = () => {
    const canonical = canonicalizeLocale(draft);
    if (!canonical) {
      setDraftError("Enter a valid BCP-47 tag, e.g. fr-CA");
      return;
    }
    if (options.locales.includes(canonical)) {
      setDraftError("Locale already added");
      return;
    }
    setDraftError(null);
    setDraft("");
    commit({ ...options, locales: [...options.locales, canonical] });
  };

  const removeLocale = (locale: string) => {
    if (options.locales.length <= 1) return;
    const locales = options.locales.filter((value) => value !== locale);
    const sourceLocale = options.sourceLocale === locale ? locales[0] : options.sourceLocale;
    const domains = routing.domains
      ? Object.fromEntries(Object.entries(routing.domains).filter(([key]) => key !== locale))
      : undefined;
    commit({
      ...options,
      locales,
      sourceLocale,
      routing: {
        ...routing,
        ...(domains && Object.keys(domains).length > 0 ? { domains } : { domains: undefined }),
      },
    });
  };

  const setSource = (locale: string) => commit({ ...options, sourceLocale: locale });

  const setDomain = (locale: string, host: string) => {
    const domains = { ...routing.domains };
    if (host) domains[locale] = host;
    else delete domains[locale];
    patchRouting({ domains: Object.keys(domains).length > 0 ? domains : undefined });
  };

  const domainLocales = options.locales.filter((locale) => locale !== options.sourceLocale);

  return (
    <div className="mt-3 space-y-4 rounded-[4px] border border-dashed p-3">
      <div className="space-y-2">
        <span className="font-mono text-[10px] text-fd-muted-foreground uppercase tracking-[0.10em]">
          Locales
        </span>
        <div className="flex flex-wrap gap-1.5">
          {options.locales.map((locale) => {
            const isSource = locale === options.sourceLocale;
            return (
              <span
                key={locale}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[11px]",
                  isSource ? "border-primary text-primary" : "text-fd-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSource(locale)}
                  aria-pressed={isSource}
                  aria-label={`Make ${locale} the source locale`}
                  title={isSource ? "Source locale" : "Make source locale"}
                  className="builder-focus-ring flex items-center gap-1 py-0.5 transition-colors duration-150 hover:text-primary"
                >
                  {isSource && <LucideCheck className="h-2.5 w-2.5" />}
                  {locale}
                </button>
                {options.locales.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLocale(locale)}
                    aria-label={`Remove ${locale}`}
                    className="builder-focus-ring p-0.5 text-fd-muted-foreground transition-colors duration-150 hover:text-destructive"
                  >
                    <LucideX className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            value={draft}
            placeholder="Add a locale, e.g. de"
            aria-label="Add a locale"
            aria-invalid={!!draftError}
            onChange={(event) => {
              setDraft(event.target.value);
              setDraftError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLocale();
              }
            }}
            className="builder-focus-ring h-7 max-w-40 font-mono text-[11px]"
          />
          <button
            type="button"
            onClick={addLocale}
            className="builder-focus-ring flex items-center gap-1 rounded-[4px] border px-2 py-1 font-mono text-[10px] text-fd-muted-foreground uppercase tracking-[0.10em] transition-colors duration-150 hover:text-fd-foreground"
          >
            <LucidePlus className="h-3 w-3" />
            Add
          </button>
        </div>
        {draftError && (
          <p className="font-mono text-[10px] text-destructive/90 leading-tight">{draftError}</p>
        )}
        <p className="font-mono text-[10px] text-fd-muted-foreground leading-tight">
          The checked locale is the source; all locales must include it.
        </p>
      </div>

      <div className="space-y-2">
        <span className="font-mono text-[10px] text-fd-muted-foreground uppercase tracking-[0.10em]">
          Routing
        </span>
        <div className="flex flex-wrap gap-1.5">
          {I18N_ROUTING_STRATEGIES.map((candidate) => {
            const support = getI18nRoutingSupport(candidate, config, library);
            const isActive = strategy === candidate;
            return (
              <button
                key={candidate}
                type="button"
                disabled={!support.isSupported}
                aria-disabled={!support.isSupported}
                aria-pressed={isActive}
                title={support.isSupported ? undefined : support.reason}
                onClick={() => patchRouting({ strategy: candidate })}
                className={cn(
                  "builder-focus-ring rounded-[4px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] transition-colors duration-150",
                  isActive ? "border-primary text-primary" : "text-fd-muted-foreground",
                  !support.isSupported
                    ? "cursor-not-allowed border-dashed opacity-60"
                    : "hover:text-fd-foreground",
                )}
              >
                {ROUTING_LABELS[candidate]}
              </button>
            );
          })}
        </div>
        {strategy === "domain" && routingSupport.isSupported && domainLocales.length > 0 && (
          <div className="space-y-1.5">
            {domainLocales.map((locale) => (
              <label key={locale} className="flex items-center gap-2">
                <span className="w-14 shrink-0 font-mono text-[10px] text-fd-muted-foreground uppercase tracking-[0.08em]">
                  {locale}
                </span>
                <Input
                  type="text"
                  value={routing.domains?.[locale] ?? ""}
                  placeholder={`${locale}.example.com`}
                  aria-label={`Domain host for ${locale}`}
                  onChange={(event) => setDomain(locale, event.target.value.trim())}
                  className="builder-focus-ring h-7 font-mono text-[11px]"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {compatibility.isCompatible && compatibility.warnings.length > 0 && (
        <ul className="space-y-1">
          {compatibility.warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-1.5 font-mono text-[10px] text-fd-muted-foreground leading-tight"
            >
              <LucideInfo className="mt-px h-3 w-3 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
