"use client";

import {
  type PresetConfig,
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_FONTS,
  PRESET_FONT_HEADINGS,
  PRESET_ICON_LIBRARIES,
  PRESET_MENU_ACCENTS,
  PRESET_MENU_COLORS,
  PRESET_RADII,
  PRESET_STYLES,
} from "@better-t-stack/types";

import { FieldGroup, PresetSelect } from "./field-controls";

type ThemePickerGroupsProps = {
  config: PresetConfig;
  onPatch: (patch: Partial<PresetConfig>) => void;
};

// Grouped codec pickers. Each one updates exactly one preset field and lets
// the parent re-encode the preset code.
export function ThemePickerGroups({ config, onPatch }: ThemePickerGroupsProps) {
  return (
    <>
      <FieldGroup title="Style & shape">
        <PresetSelect
          label="Style"
          value={config.style}
          options={PRESET_STYLES}
          onChange={(value) => onPatch({ style: value })}
        />
        <PresetSelect
          label="Radius"
          value={config.radius}
          options={PRESET_RADII}
          onChange={(value) => onPatch({ radius: value })}
        />
      </FieldGroup>

      <FieldGroup title="Colors">
        <PresetSelect
          label="Base color"
          value={config.baseColor}
          options={PRESET_BASE_COLORS}
          onChange={(value) => onPatch({ baseColor: value })}
        />
        <PresetSelect
          label="Theme"
          value={config.theme}
          options={PRESET_CHART_COLORS}
          onChange={(value) => onPatch({ theme: value })}
        />
        <PresetSelect
          label="Chart color"
          value={config.chartColor ?? config.theme}
          options={PRESET_CHART_COLORS}
          onChange={(value) => onPatch({ chartColor: value })}
        />
      </FieldGroup>

      <FieldGroup title="Typography">
        <PresetSelect
          label="Font"
          value={config.font}
          options={PRESET_FONTS}
          onChange={(value) => onPatch({ font: value })}
        />
        <PresetSelect
          label="Heading font"
          value={config.fontHeading}
          options={PRESET_FONT_HEADINGS}
          onChange={(value) => onPatch({ fontHeading: value })}
        />
        <PresetSelect
          label="Icon library"
          value={config.iconLibrary}
          options={PRESET_ICON_LIBRARIES}
          onChange={(value) => onPatch({ iconLibrary: value })}
        />
      </FieldGroup>

      <FieldGroup title="Menus">
        <PresetSelect
          label="Menu color"
          value={config.menuColor}
          options={PRESET_MENU_COLORS}
          onChange={(value) => onPatch({ menuColor: value })}
        />
        <PresetSelect
          label="Menu accent"
          value={config.menuAccent}
          options={PRESET_MENU_ACCENTS}
          onChange={(value) => onPatch({ menuAccent: value })}
        />
      </FieldGroup>
    </>
  );
}
