"use client";

/**
 * @file options.tsx
 * @description Quick options/settings.
 */

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import {
  SolarTimeMode,
  useTimeFormat,
} from "@/app/(themes)/neue/contexts/time-format-context";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldSet,
  FieldSeparator,
} from "@/app/components/ui/field";
import { Switch } from "@/app/components/ui/switch";

/**
 * Location search popover.
 */
export function Options() {
  const { solarMode, setSolarMode, hourFormat, setHourFormat } =
    useTimeFormat();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span className="underline underline-offset-4 cursor-pointer">
          Options
        </span>
      </PopoverTrigger>

      <PopoverContent
        className="w-60 shadow-sm gap-3 flex flex-col"
        align="start"
      >
        <FieldGroup className="w-full gap-4">
          <FieldSet className="gap-2">
            <FieldLabel className="opacity-80">Time</FieldLabel>
            {/* <FieldDescription>
              Get notified when ChatGPT responds to requests that take time,
              like research or image generation.
            </FieldDescription> */}
            <RadioGroup
              value={solarMode}
              onValueChange={(v) => setSolarMode(v as SolarTimeMode)}
            >
              <div className="flex items-center gap-3 cursor-pointer">
                <RadioGroupItem value="TST" id="tst" />
                <Label htmlFor="tst">True Solar Time</Label>
              </div>
              <div className="flex items-center gap-3 cursor-pointer">
                <RadioGroupItem value="MST" id="mst" />
                <Label htmlFor="mst">Mean Solar Time</Label>
              </div>
            </RadioGroup>
          </FieldSet>

          <FieldSeparator />

          <FieldSet className="gap-2">
            <FieldLabel className="opacity-80">Format</FieldLabel>
            <FieldGroup className="w-full max-w-40">
              <Field orientation="horizontal">
                <Switch
                  id="switch-size-sm"
                  size="sm"
                  onCheckedChange={(v) => setHourFormat(v ? "12" : "24")}
                  defaultChecked={hourFormat === "12"}
                />
                <FieldLabel htmlFor="switch-size-sm">
                  Use 12 hour format
                </FieldLabel>
              </Field>
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
