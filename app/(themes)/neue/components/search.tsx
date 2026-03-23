"use client";

/**
 * @file search.tsx
 * @description Location search popover for the Neue theme header.
 *
 * Supports two lookup modes:
 * - **Place name** (forward geocoding): type a name, get the top result.
 * - **Coordinates** (reverse geocoding): enter lat/lon, resolve to a place.
 *
 * On a successful lookup, updates `active` in {@link AppUIContext}, which
 * causes the main page ticker to re-anchor to the new longitude.
 */

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { Field, FieldGroup, FieldLabel } from "@/app/components/ui/field";
import { Input } from "@/app/components/ui/input";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import { useGeocode } from "@/app/hooks/use-geocode";
import { Button } from "@/app/components/ui/button";
import { SearchIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/app/components/ui/input-group";
import { Separator } from "@/app/components/ui/separator";
import { Spinner } from "@/app/components/ui/spinner-2";

/**
 * Location search popover.
 */
export function SearchForm() {
  const { setActive } = useAppUI();
  const { search, reverse, loading, error, reset } = useGeocode();

  const [query, setQuery] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [open, setOpen] = useState(false);

  async function handleTextSearch() {
    if (!query.trim()) return;
    const result = await search(query.trim());
    if (result) {
      setActive(result);
      setOpen(false);
    }
  }

  async function handleCoordSearch() {
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (isNaN(latN) || isNaN(lonN)) return;
    const result = await reverse(latN, lonN);
    if (result) {
      setActive(result);
      setOpen(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setQuery("");
      setLat("");
      setLon("");
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <span className="underline underline-offset-4 cursor-pointer">
          Search
        </span>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 shadow-none gap-3 flex flex-col"
        align="start"
      >
        {/* <PopoverHeader>
          <PopoverDescription>Search a location</PopoverDescription>
        </PopoverHeader> */}
        <Field className="max-w-sm gap-2">
          <FieldLabel htmlFor="place-search" className="text-sm opacity-80">
            Search a location
          </FieldLabel>
          <InputGroup className="has-[data-slot=input-group-control]:outline-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0 rounded-sm ">
            <InputGroupInput
              id="place-search"
              type="text"
              placeholder="e.g Shibuya, Tokyo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTextSearch()}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                variant="secondary"
                className="text-xs"
                onClick={handleTextSearch}
                disabled={loading || (!!lat && !!lon)}
              >
                {loading ? <Spinner size={14} /> : "Search"}
              </InputGroupButton>
            </InputGroupAddon>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="text-muted-foreground" />
            </InputGroupAddon>
          </InputGroup>
          {/* <FieldDescription>Icon positioned at the start.</FieldDescription> */}
        </Field>

        <div className="flex gap-2 w-full truncate items-center text-xs">
          <span className="w-full">
            <Separator />
          </span>
          <span className="shrink-0 opacity-60">or by coordinates</span>
          <span className="w-full">
            <Separator />
          </span>
        </div>

        <div className="flex flex-col gap-2 items-start">
          <FieldGroup className="grid max-w-sm grid-cols-2 gap-1">
            <Field className="gap-2">
              <FieldLabel htmlFor="lat" className="text-sm opacity-80">
                Latitude
              </FieldLabel>
              <Input
                id="lat"
                type="number"
                min={-90}
                max={90}
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCoordSearch()}
                placeholder="e.g., 35.6768601"
                className="outline-0 focus-visible:ring-0 rounded-sm"
              />
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor="lon" className="text-sm opacity-80">
                Longitude
              </FieldLabel>
              <Input
                id="lon"
                type="number"
                placeholder="e.g., 139.7638947"
                min={-180}
                max={180}
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCoordSearch()}
                className="outline-0 focus-visible:ring-0 rounded-sm"
              />
            </Field>
          </FieldGroup>

          <Button
            variant="link"
            className="p-0"
            aria-label="Search"
            size={"sm"}
            onClick={handleCoordSearch}
            disabled={loading || !lat || !lon}
          >
            {loading ? (
              <>
                <Spinner size={14} />
                Searching...
              </>
            ) : (
              "Lookup coordinates"
            )}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
