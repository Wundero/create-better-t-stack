"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { formatPresetFieldValue } from "./helpers";

export const fieldLabelClasses =
  "font-mono text-[10px] text-fd-muted-foreground uppercase tracking-[0.10em]";

export const chipClasses =
  "builder-focus-ring rounded-[4px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.10em] transition-colors duration-150";

type PresetSelectProps<T extends string> = {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
};

export function PresetSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: PresetSelectProps<T>) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={fieldLabelClasses}>{label}</span>
      <Select<T>
        value={value}
        onValueChange={(next) => {
          if (next !== null) {
            onChange(next);
          }
        }}
      >
        <SelectTrigger size="sm" className="w-full" aria-label={label}>
          <SelectValue>{(current) => formatPresetFieldValue(String(current ?? ""))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {formatPresetFieldValue(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-2 rounded-[4px] border p-3">
      <legend className={cn(fieldLabelClasses, "px-1")}>{title}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-[11px] text-fd-foreground">{label}</span>
        <span className="font-mono text-[10px] text-fd-muted-foreground">{description}</span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={`${label}. ${description}`}
      />
    </div>
  );
}
