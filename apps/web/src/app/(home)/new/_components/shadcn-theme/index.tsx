"use client";

import { Palette } from "lucide-react";

import type { StackState } from "@/lib/constant";
import { cn } from "@/lib/utils";

import { getShadcnSummary, hasReactWebFrontend, type ShadcnFields } from "./helpers";
import { ThemeEditorDialog } from "./theme-editor-dialog";

type ShadcnThemeSectionProps = {
  stack: StackState;
  onChange: (update: Partial<StackState>) => void;
};

function SummaryItem({
  label,
  value,
  active = false,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="font-mono text-[10px] text-fd-muted-foreground uppercase tracking-[0.10em]">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 truncate font-mono text-[11px]",
          active ? "text-primary" : "text-fd-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// Option-section card that mirrors the tech categories: only rendered when a
// React web frontend is selected, since the shadcn theme only applies there.
export function ShadcnThemeSection({ stack, onChange }: ShadcnThemeSectionProps) {
  if (!hasReactWebFrontend(stack)) {
    return null;
  }

  const summary = getShadcnSummary(stack);
  const fields: ShadcnFields = {
    shadcnPreset: stack.shadcnPreset,
    shadcnBase: stack.shadcnBase,
    shadcnRtl: stack.shadcnRtl,
    shadcnPointer: stack.shadcnPointer,
  };

  return (
    <section className="mb-6 scroll-mt-4 sm:mb-8" aria-label="shadcn theme">
      <div className="mb-3 flex items-center gap-2 text-fd-muted-foreground">
        <Palette aria-hidden="true" className="h-3 w-3 shrink-0 text-primary" />
        <h2 className="font-mono text-[11px] text-fd-muted-foreground uppercase tracking-[0.08em]">
          SHADCN THEME
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-fd-border" />
      </div>

      <div className="rounded-[4px] border p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <SummaryItem label="Preset" value={summary.presetLabel} active={summary.isCustom} />
          <SummaryItem label="Base" value={summary.baseLabel} />
          <SummaryItem label="RTL" value={summary.rtl ? "on" : "off"} active={summary.rtl} />
          <SummaryItem
            label="Pointer"
            value={summary.pointer ? "on" : "off"}
            active={summary.pointer}
          />
        </div>
        <div className="mt-3">
          <ThemeEditorDialog fields={fields} onChange={onChange} />
        </div>
      </div>
    </section>
  );
}
