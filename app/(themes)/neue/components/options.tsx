"use client";

/**
 * @file options.tsx
 * @description Time display options panel.
 *
 * Exports two components:
 * - {@link Options}              — laptop popover trigger (used in header nav)
 * - {@link OptionsDrawerContent} — drawer sheet body (used in mobile menu)
 *
 * Both share the same settings UI, avoiding duplication.
 */

import { useState } from "react";
import {
  Popover,
  PopoverGlassContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import {
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/app/components/ui/drawer";
import { Button } from "@/app/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/app/components/ui/field";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/app/(themes)/neue/components/shared-ui";
import { Separator } from "@/app/components/ui/separator";
import { useNeue } from "@/app/(themes)/neue/contexts/ui-context";
import { fonts } from "@/app/(themes)/neue/fonts";
import { useGlobal } from "@/app/contexts/global-provider";

// ---------------------------------------------------------------------------
// Shared settings body
// ---------------------------------------------------------------------------

/**
 * The settings form — solar mode toggle and 12/24h switch.
 * Rendered inside both the laptop popover and the mobile drawer.
 */
function SettingsBody({ compact = false }: { compact?: boolean }) {
  const {
    store: {
      data: { solarMode, hourFormat },
      update,
    },
  } = useGlobal();
  const { prefs } = useNeue();

  return (
    <FieldGroup className={cn("w-full", compact ? "gap-3" : "gap-4")}>
      {/* Solar mode */}
      <FieldSet className="gap-2">
        <SectionLabel>Time mode</SectionLabel>
        <RadioGroup
          value={solarMode}
          onValueChange={(v) => update({ solarMode: v as SolarTimeMode })}
          className={cn(
            compact &&
              "flex flex-col gap-1 rounded-sm border border-border/40 overflow-hidden bg-muted",
          )}
        >
          {(
            [
              { value: "TST", label: "True Solar Time" },
              { value: "MST", label: "Mean Solar Time" },
            ] as const
          ).map(({ value, label }, i) => (
            <div
              key={value}
              className={cn(
                "flex  items-center gap-2 px-4 py-3 cursor-pointer w-full",
                "max-tablet:justify-between tablet:gap-3 tablet:p-0",
                i === 0 && "border-b border-border/60 tablet:border-0",
              )}
            >
              <Label
                htmlFor={`mode-${value}`}
                className="w-full cursor-pointer tablet:order-2"
              >
                {label}
              </Label>
              <RadioGroupItem value={value} id={`mode-${value}`} />
            </div>
          ))}
        </RadioGroup>
      </FieldSet>

      <Separator />

      {/* Hour format */}
      <FieldSet className="gap-2">
        <SectionLabel>Format</SectionLabel>
        <Field
          orientation="horizontal"
          className={cn(
            "flex items-center gap-2 text-sm w-full",
            compact &&
              "rounded-sm border border-border/40 bg-muted justify-between px-4 py-3",
          )}
        >
          <FieldLabel
            htmlFor="hour-format-switch"
            className="w-full cursor-pointer tablet:order-2"
          >
            Use 12-hour format
          </FieldLabel>
          <Switch
            id="hour-format-switch"
            size="sm"
            onCheckedChange={(v) => update({ hourFormat: v ? "12" : "24" })}
            defaultChecked={hourFormat === "12"}
          />
        </Field>
      </FieldSet>

      {/* Fonts */}
      <FieldSet className="gap-2">
        <SectionLabel>Fonts</SectionLabel>
        <RadioGroup
          value={prefs.data.font.class}
          onValueChange={(v) =>
            prefs.update({
              font: {
                class: v,
                styles: {
                  default: "",
                  focus: undefined,
                  expanded: undefined,
                },
              },
            })
          }
          className={cn(
            compact &&
              "flex flex-col gap-1 rounded-sm border border-border/40 overflow-hidden bg-muted",
          )}
        >
          {Object.entries(fonts).map(([k, v], i) => (
            <div
              key={k}
              className={cn(
                "flex  items-center gap-2 px-4 py-3 cursor-pointer w-full",
                "max-tablet:justify-between tablet:gap-3 tablet:p-0",
                i === 0 && "border-b border-border/60 tablet:border-0",
              )}
            >
              <Label
                htmlFor={`mode-${v}`}
                className={cn(
                  "w-full cursor-pointer tablet:order-2",
                  // `font-(family-name:${v})`,
                )}
                style={{
                  fontFamily: `var(${v})`,
                }}
              >
                {k}
              </Label>
              <RadioGroupItem value={v} id={`mode-${v}`} />
            </div>
          ))}
        </RadioGroup>
      </FieldSet>
    </FieldGroup>
  );
}

// ---------------------------------------------------------------------------
// Options (laptop popover)
// ---------------------------------------------------------------------------

/**
 * laptop options trigger — renders as a text link that opens a popover.
 * Used in the laptop header nav bar.
 */
export function Options() {
  const [open, setOpen] = useState(false);
  const { skyPhase } = useNeue();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span className="hover:underline cursor-pointer">Options</span>
      </PopoverTrigger>
      <PopoverGlassContent
        className="w-64 flex flex-col gap-3"
        align="start"
        data-sky={skyPhase}
      >
        <SettingsBody />
      </PopoverGlassContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// OptionsDrawerContent (mobile nested drawer)
// ---------------------------------------------------------------------------

/**
 * Mobile options panel rendered as a nested drawer sheet.
 * Imported by `mobile-header.tsx` and opened from the menu list.
 *
 * Uses `DrawerContent` directly — the parent `NestedDrawer` wrapper
 * is provided by the caller.
 */
export function OptionsDrawerContent() {
  return (
    <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[45vh]">
      <DrawerHeader className="border-b border-border/40 py-2 pt-0 items-end gap-2">
        <div className="grid grid-cols-[1fr_3fr_1fr] gap-1 w-full content-center justify-items-start">
          <DrawerClose asChild>
            <Button variant="link" className="p-0 hit-area-2 text-sm">
              Close
            </Button>
          </DrawerClose>
          <DrawerTitle className="justify-self-center">Options</DrawerTitle>
          {/* Spacer to keep title centred */}
          <span />
        </div>
      </DrawerHeader>
      <div className="flex flex-col max-w-md mx-auto w-full p-4 gap-5 pb-10 overflow-auto no-scrollbar">
        <SettingsBody compact />
      </div>
    </DrawerContent>
  );
}
