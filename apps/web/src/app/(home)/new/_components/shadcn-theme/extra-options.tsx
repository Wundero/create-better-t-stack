"use client";

import { type ShadcnBase } from "@better-t-stack/types";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { FieldGroup, fieldLabelClasses, SwitchRow } from "./field-controls";
import { getShadcnBaseLabel, SHADCN_BASE_OPTIONS, type ShadcnFields } from "./helpers";

type ShadcnExtraOptionsProps = {
  fields: ShadcnFields;
  onBaseChange: (base: ShadcnBase) => void;
  onToggle: (key: "rtl" | "pointer", value: boolean) => void;
};

// Headless base plus RTL/pointer switches. These are not part of the preset
// codec, so they write their own stack state fields.
export function ShadcnExtraOptions({ fields, onBaseChange, onToggle }: ShadcnExtraOptionsProps) {
  return (
    <FieldGroup title="Component base & behavior">
      <div className="flex min-w-0 flex-col gap-1">
        <span className={fieldLabelClasses}>Headless base</span>
        <Select<ShadcnBase>
          value={fields.shadcnBase}
          onValueChange={(next) => {
            if (next !== null) {
              onBaseChange(next);
            }
          }}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Headless base">
            <SelectValue>{(current) => getShadcnBaseLabel(current)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SHADCN_BASE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SwitchRow
        label="RTL support"
        description="Mirror the layout for right-to-left languages"
        checked={fields.shadcnRtl}
        onCheckedChange={(checked) => onToggle("rtl", checked)}
      />
      <SwitchRow
        label="Pointer cursor"
        description="Use a pointer cursor on interactive elements"
        checked={fields.shadcnPointer}
        onCheckedChange={(checked) => onToggle("pointer", checked)}
      />
    </FieldGroup>
  );
}
