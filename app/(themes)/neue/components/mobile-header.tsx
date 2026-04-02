"use client";

/**
 * @file mobile-header.tsx
 * @description Mobile header strip and bottom drawer for the Neue theme.
 *
 * Used on both the main page and (in `mapMode`) on the map page.
 *
 * Improvements over previous version:
 * - `useHomeTicker` replaced with shared {@link useSolarTicker}
 * - `useNotifications` logic no longer duplicated here
 * - `MapMobileHeader` removed — the map page renders its own persistent
 *   bottom drawer directly in `map.tsx`
 * - Civil-time tick consolidated into a single `setInterval`
 * - Options sub-drawer extracted to `options.tsx` → imported here
 * - Snap-point state owned here; passed down to the drawer content
 *
 * Snap points (main page):
 * - **Half** (0.55): home clock + notifications visible
 * - **Full** (0.95): menu + socials visible
 *
 * Snap points (map mode):
 * - Persistent open at peek; search only
 */

import { useState } from "react";
import Link from "next/link";
import { SITENAME, SOCIALS } from "@/types/consts";
import { formatDate, formatTime, gmtLabel, fmtEntry } from "@/utils";
import { nowDate } from "@/lib/ntp";
import { useNeue } from "@/app/(themes)/neue/contexts/ui-context";
import { useGeocode } from "@/app/hooks/use-geocode";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  NestedDrawer,
} from "@/app/components/ui/drawer";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner-2";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/app/components/ui/input-group";
import { FieldGroup, Field, FieldLabel } from "@/app/components/ui/field";
import { Input } from "@/app/components/ui/input";
import { SearchIcon, ChevronsUpDown } from "lucide-react";
import {
  NotificationList,
  SectionLabel,
  DrawerListItem,
  PeriodBadge,
} from "@/app/(themes)/neue/components/shared-ui";
import { OptionsDrawerContent } from "@/app/(themes)/neue/components/options";
import { useNotifications } from "@/app/(themes)/neue/hooks/use-notifications";
import { useGlobal } from "@/app/contexts/global-provider";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAP_MAIN = [0.55, 0.95] as const;
type SnapPoint = (typeof SNAP_MAIN)[number] | number | string | null;

// ---------------------------------------------------------------------------
// MobileHeader
// ---------------------------------------------------------------------------

/**
 * Slim header strip for mobile viewports.
 *
 * @param mapMode - When true, renders the map-specific minimal variant
 *   (logo only; map controls are pushed top-right by the map page).
 */
export function MobileHeader({ mapMode = false }: { mapMode?: boolean }) {
  const {
    activeRes,
    store: {
      data: { solarMode },
    },
  } = useGlobal();
  const { isFocus } = useNeue();
  const notifications = useNotifications();
  const { reset } = useGeocode();

  const [snap, setSnap] = useState<SnapPoint>(SNAP_MAIN[0]);
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  // Map mode: logo only, no drawer trigger (map has its own persistent drawer)
  if (mapMode) {
    return (
      <header className="neue-grid py-2 items-center">
        <div className=" py-1 px-2.5 rounded-sm w-fit bg-frosted-popover">
          <Link href="/">
            <span className="relative text-foreground">{SITENAME}</span>
          </Link>
        </div>
      </header>
    );
  }

  const activeDate = activeRes
    ? solarMode === "TST"
      ? activeRes.trueSolarTime
      : activeRes.meanSolarTime
    : nowDate();

  return (
    <header className="neue-grid-small px-5 mini:px-8 pt-3 h-(--header-height) items-center">
      {/* Logo */}
      <Link href="/" className="tracking-tight">
        {SITENAME}
      </Link>

      {/* Active date */}
      <div className="tabular-nums text-xs opacity-70 text-nowrap">
        {formatDate(activeDate)}
      </div>

      {/* Drawer trigger — hidden in focus mode */}
      <Drawer
        open={open}
        onOpenChange={handleOpenChange}
        snapPoints={[...SNAP_MAIN]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        direction="bottom"
      >
        <DrawerTrigger asChild>
          <button
            className={cn(
              "justify-self-end flex items-center gap-1 transition-smooth",
              isFocus ? "opacity-0 pointer-events-none" : "opacity-100",
            )}
            aria-label="Open menu"
          >
            <span>
              [ Search +{notifications.length > 0 && notifications.length}]
            </span>
          </button>
        </DrawerTrigger>

        <MobileDrawerContent
          snap={snap}
          setSnap={setSnap}
          notifications={notifications}
          onClose={() => handleOpenChange(false)}
        />
      </Drawer>
    </header>
  );
}

// ---------------------------------------------------------------------------
// MobileDrawerContent
// ---------------------------------------------------------------------------

interface DrawerContentProps {
  snap: SnapPoint;
  setSnap: (s: SnapPoint) => void;
  notifications: string[];
  onClose: () => void;
}

/**
 * The drawer sheet body — search, home clock, notifications, menu.
 *
 * Sections use opacity transitions tied to snap thresholds so content
 * reveals progressively as the user drags up.
 */
function MobileDrawerContent({
  notifications,
  onClose,
}: DrawerContentProps) {
  const {
    home,
    homeRes,
    setActive,
    store: {
      data: { recents, hourFormat, solarMode },
    },
  } = useGlobal();

  const [searchMode, setSearchMode] = useState<"forward" | "reverse">(
    "forward",
  );
  const [query, setQuery] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const { search, reverse, loading, error, reset } = useGeocode();

  // Derived home clock values
  const solarDate = homeRes
    ? solarMode === "TST"
      ? homeRes.trueSolarTime
      : homeRes.meanSolarTime
    : null;

  const time = solarDate
    ? fmtEntry(
        {
          solar: formatTime(solarDate, 0, hourFormat),
          local: formatTime(nowDate(), home?.time?.totalOffset, hourFormat),
          offset: gmtLabel(home?.time?.totalOffset ?? 0),
        },
        hourFormat,
      )
    : null;

  // ── Search handlers ─────────────────────────────────────────────────────────

  async function handleForwardSearch() {
    if (!query.trim()) return;
    const result = await search(query.trim());
    if (result) {
      setActive(result);
      reset();
      setQuery("");
      onClose();
    }
  }

  async function handleReverseSearch() {
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (isNaN(latN) || isNaN(lonN)) return;
    const result = await reverse(latN, lonN);
    if (result) {
      setActive(result);
      reset();
      setLat("");
      setLon("");
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (searchMode === "forward") handleForwardSearch();
    else handleReverseSearch();
  }

  function toggleSearchMode() {
    setSearchMode((m) => (m === "forward" ? "reverse" : "forward"));
    reset();
    setQuery("");
    setLat("");
    setLon("");
  }

  return (
    <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[97%] data-[vaul-drawer-direction=bottom]:h-screen">
      {/* ── Header: search ─────────────────────────────────────────────── */}
      <DrawerHeader className="border-b border-border/40 pt-0 items-start gap-0 w-full px-5 mini:px-8">
        {/* Title row: close | mode toggle | search action */}
        <div className="grid grid-cols-[1fr_3fr_1fr] gap-1 content-center w-full py-2.5">
          <Button
            variant="link"
            onClick={() => {
              setQuery("");
              setLat("");
              setLon("");
              onClose();
            }}
            className="p-0 hit-area-2 justify-self-start text-sm"
          >
            Close
          </Button>
          <DrawerTitle
            onClick={toggleSearchMode}
            className="flex items-center justify-center gap-1 hit-area-2 cursor-pointer"
          >
            Search {searchMode === "forward" ? "place" : "coordinates"}
            <ChevronsUpDown className="size-3 opacity-60" />
          </DrawerTitle>
          <Button
            variant="link"
            size="sm"
            onClick={
              searchMode === "forward"
                ? handleForwardSearch
                : handleReverseSearch
            }
            disabled={
              loading ||
              (searchMode === "forward" ? !query.trim() : !lat || !lon)
            }
            className="p-0 hit-area-2 justify-self-end text-sm"
          >
            {loading ? <Spinner size={14} /> : "Search"}
          </Button>
        </div>

        {/* Forward search input */}
        <div
          className={cn(
            "w-full overflow-hidden transition-smooth",
            searchMode === "forward"
              ? "max-h-16 opacity-100"
              : "max-h-0 opacity-0 pointer-events-none",
          )}
        >
          <InputGroup className="has-[data-slot=input-group-control]:outline-0 h-11 has-[[data-slot=input-group-control]:focus-visible]:ring-0 rounded-lg">
            <InputGroupInput
              type="text"
              placeholder="e.g. Shibuya, Tokyo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleForwardSearch()}
              autoComplete="off"
            />
            <InputGroupAddon align="inline-start">
              <SearchIcon className="text-muted-foreground size-4" />
            </InputGroupAddon>
          </InputGroup>
        </div>

        {/* Reverse search inputs */}
        <div
          className={cn(
            "w-full overflow-hidden transition-smooth",
            searchMode === "reverse"
              ? "max-h-44 opacity-100"
              : "max-h-0 opacity-0 pointer-events-none",
          )}
        >
          <FieldGroup className="grid grid-cols-2 gap-3 pt-1">
            {(
              [
                {
                  id: "lat",
                  label: "Latitude",
                  value: lat,
                  set: setLat,
                  placeholder: "35.6768…",
                  min: -90,
                  max: 90,
                },
                {
                  id: "lon",
                  label: "Longitude",
                  value: lon,
                  set: setLon,
                  placeholder: "139.763…",
                  min: -180,
                  max: 180,
                },
              ] as const
            ).map(({ id, label, value, set, placeholder, min, max }) => (
              <Field key={id} className="flex flex-col gap-1">
                <FieldLabel htmlFor={id} className="text-xs opacity-50">
                  {label}
                </FieldLabel>
                <Input
                  id={id}
                  type="number"
                  min={min}
                  max={max}
                  step="any"
                  placeholder={placeholder}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="tabular-nums h-11 rounded-lg outline-0 focus-visible:ring-0"
                />
              </Field>
            ))}
          </FieldGroup>
        </div>

        {error && (
          <p className="text-destructive text-xs pt-2 opacity-80">{error}</p>
        )}
      </DrawerHeader>

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 mini:px-8 flex flex-col gap-5 py-4 pb-10">
        {/* Menu — visible at full snap */}
        <section className={cn("flex flex-col gap-2 transition-smooth")}>
          <SectionLabel>Menu</SectionLabel>
          <nav className="flex flex-col rounded-sm border border-border/40 overflow-hidden">
            {/* Options nested drawer */}
            <NestedDrawer>
              <DrawerTrigger asChild>
                <DrawerListItem>Options</DrawerListItem>
              </DrawerTrigger>
              <OptionsDrawerContent />
            </NestedDrawer>

            <DrawerListItem href="/map" isLast={false}>
              Map
            </DrawerListItem>
            <DrawerListItem href="/about" isLast>
              About
            </DrawerListItem>
          </nav>
        </section>

        {/* Home clock — visible at half snap */}
        <section className={cn("flex flex-col gap-2 transition-smooth")}>
          <SectionLabel>Home</SectionLabel>
          <button
            onClick={() => home && setActive(home)}
            className="flex flex-col gap-1 py-3 px-4 rounded-sm bg-muted border border-border/40 w-full text-left"
          >
            <span className="font-medium truncate">
              {home?.label.full ?? "—"}
            </span>
            <div className="flex justify-between gap-2 w-full text-sm">
              <span className="flex items-center gap-1 tabular-nums">
                {time?.solar}
                <PeriodBadge period={time?.period} />
                <span className="opacity-60 mx-1">
                  ({time?.offset} → {time?.localTime}
                </span>
                <PeriodBadge period={time?.period} />
                <span className="opacity-60">)</span>
              </span>
              <span className="opacity-40 shrink-0">[{solarMode}]</span>
            </div>
          </button>
        </section>

        {/* Notifications — visible at half snap */}
        {notifications.length > 0 && (
          <section className={cn("flex flex-col gap-2 transition-smooth")}>
            <SectionLabel badge={notifications.length}>FYI</SectionLabel>
            <NotificationList items={notifications} />
          </section>
        )}

        {/* Recently accessed */}
        {recents.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionLabel>Recent</SectionLabel>
            <div className="flex flex-col rounded-sm border border-border/40 overflow-hidden">
              {recents.map((loc, i) => (
                <button
                  key={`${loc.latitude}${loc.longitude}`}
                  onClick={() => {
                    setActive(loc);
                    onClose();
                  }}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 text-sm w-full text-left",
                    "bg-muted hover:bg-muted/60 transition-colors",
                    i < recents.length - 1 && "border-b border-border/60",
                  )}
                >
                  <span className="truncate">{loc.label.title}</span>
                  <span className="text-xs opacity-50 shrink-0 ml-2">
                    {loc.label.subtitle}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Socials — visible at full snap */}
        <section className={cn("flex flex-col gap-2 transition-smooth")}>
          <SectionLabel>Connect</SectionLabel>
          <nav className="flex flex-col rounded-sm border border-border/40 overflow-hidden">
            {Object.entries(SOCIALS).map(([key, { label, link }], i, arr) => (
              <Link
                key={key}
                href={link}
                className={cn(
                  "grid grid-cols-[2rem_1fr] gap-2 px-4 py-3.5 text-sm w-full",
                  "bg-muted hover:bg-muted/60 transition-colors",
                  i < arr.length - 1 && "border-b border-border/60",
                )}
              >
                <span className="font-mono opacity-40">[→]</span>
                <div className="flex items-center w-full justify-between">
                  <span className="capitalize">{key}</span>
                  <span className="text-xs opacity-50">{label}</span>
                </div>
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </DrawerContent>
  );
}
