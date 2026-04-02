"use client";

/**
 * @file header.tsx
 * @description Site header for the Neue theme.
 *
 * Renders in three modes:
 * - **Mobile / mini**: delegates entirely to {@link MobileHeader}.
 * - **Desktop focus**: site name + home clock only (everything else hidden).
 * - **Desktop normal**: site name, notification popover, date, nav, home clock.
 *
 * The `useHomeTicker` copy that previously lived here is replaced by the
 * shared {@link useSolarTicker} hook. Notification logic is handled by
 * {@link useNotifications}.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Popover,
  PopoverGlassContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { SITENAME } from "@/types/consts";
import { fmtEntry, formatDate, formatTime, gmtLabel } from "@/utils";
import { nowDate } from "@/lib/ntp";
import { useNeue } from "@/app/(themes)/neue/contexts/ui-context";
import { SearchForm } from "@/app/(themes)/neue/components/search";
import { Options } from "@/app/(themes)/neue/components/options";
import { MobileHeader } from "@/app/(themes)/neue/components/mobile-header";
import { useMediaQueries } from "@/app/hooks/use-mobile-query";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/app/(themes)/neue/hooks/use-notifications";
import { PeriodBadge } from "@/app/(themes)/neue/components/shared-ui";
import { useGlobal } from "@/app/contexts/global-provider";

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * Site header component.
 *
 * Delegates to {@link MobileHeader} on small viewports.
 * On desktop, renders in normal or focus mode based on `isFocus` from context.
 */
export default function Header() {
  const { isFocus } = useNeue();
  const {
    active,
    activeRes,
    store: {
      data: { solarMode },
    },
  } = useGlobal();
  // const [homeTST, setHomeTST] = useState<TrueSolarTimeResult>();

  // useSolarTicker(setHomeTST, home?.longitude);
  const notifications = useNotifications();
  const { isMini, isMobile } = useMediaQueries();

  if (isMobile || isMini) return <MobileHeader />;

  const activeDate = activeRes
    ? solarMode === "TST"
      ? activeRes.trueSolarTime
      : activeRes.meanSolarTime
    : nowDate();

  return (
    <header className="neue-grid pt-3 h-(--header-height) items-center">
      {/* Site name */}
      <Link href="/">{SITENAME}</Link>

      {/* Notifications — hidden in focus mode */}
      <div
        className={cn(
          "desktop:col-span-2 transition-smooth",
          isFocus
            ? "opacity-0 pointer-events-none overflow-clip select-none"
            : "opacity-100",
        )}
      >
        <NotificationPopover items={notifications} />
      </div>

      {/* Active date */}
      <div
        className="desktop:col-span-2 justify-self-end"
        title={`Current date in ${active?.label.title}`}
      >
        {formatDate(activeDate)}
      </div>

      {/* Nav — hidden in focus mode */}
      <div
        className={cn(
          "col-span-2 transition-smooth",
          isFocus
            ? "opacity-0 pointer-events-none overflow-clip select-none"
            : "opacity-100",
        )}
      >
        <div className="flex items-center gap-2">
          <SearchForm />
          <Options />
          <Link href="/map">Map</Link>
          <Link href="/about">About</Link>
        </div>
      </div>

      {/* Home clock */}
      <HomeClockDisplay showCivil={!isFocus} isFocus={isFocus} />
    </header>
  );
}

// ---------------------------------------------------------------------------
// MapHeader
// ---------------------------------------------------------------------------

/**
 * Slim header for the `/map` route.
 * Floated absolutely over the map canvas; uses frosted glass pills.
 * Delegates to {@link MobileHeader} on mobile (map controls go top-right).
 */
export function MapHeader() {
  // const { home } = useGlobal();
  // const [homeTST, setHomeTST] = useState<TrueSolarTimeResult>();
  // useSolarTicker(setHomeTST, home?.longitude);
  const { isMini, isMobile } = useMediaQueries();

  if (isMobile || isMini) return <MobileHeader mapMode />;

  return (
    <header className="neue-grid py-3 items-center">
      {/* Logo pill */}
      <div className="py-1 px-2.5 rounded-sm w-fit frosted-bg frosted-bg-xl frosted-wash-[0.75]">
        <Link href="/" className="">
          <span className="relative text-foreground">{SITENAME}</span>
        </Link>
      </div>

      {/* Nav pill */}
      <div className="col-start-6  py-1 px-2.5 rounded-sm w-fit frosted-bg frosted-bg-xl frosted-wash-[0.75] frosted-blur-80">
        <div className="flex items-center gap-2">
          <SearchForm />
          <Options />
          <Link href="#">About</Link>
        </div>
      </div>

      {/* Clock pill */}
      <div className="col-span-2 py-1 px-2.5 rounded-sm w-fit frosted-bg frosted-bg-xl frosted-wash-[0.75]  justify-self-end">
        <HomeClockDisplay showCivil={false} className="" />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// NotificationPopover
// ---------------------------------------------------------------------------

/**
 * Inline notification display with an expandable popover for overflow items.
 * The first item is always shown; clicking opens a popover with all items.
 *
 * @param items - Notification strings from {@link useNotifications}.
 */
export function NotificationPopover({ items }: { items: string[] }) {
  const { skyPhase } = useNeue();
  const [open, setOpen] = useState(false);
  const hasMore = items.length > 1;

  if (items.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="cursor-pointer flex items-center gap-1">
          <span className={cn("truncate", open && "opacity-60")}>
            {items[0]}
          </span>
          {hasMore && (
            <span className="shrink-0 opacity-60">
              [{open ? "close" : "open"}]
            </span>
          )}
        </div>
      </PopoverTrigger>
      {hasMore && (
        <PopoverGlassContent
          align="start"
          data-sky={skyPhase}
          className="w-80 flex flex-col gap-1 text-xs font-medium"
        >
          <ul className="flex flex-col gap-1">
            {items.map((msg, i) => (
              <li key={i} className="flex gap-1">
                <span className="font-mono opacity-40">[•]</span>
                <span>{msg}</span>
              </li>
            ))}
          </ul>
        </PopoverGlassContent>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// HomeClockDisplay
// ---------------------------------------------------------------------------

/**
 * Home-location clock for the desktop header.
 * Shows solar time (TST or MST); optionally shows civil time + GMT offset below.
 * Clicking navigates back to the home location.
 *
 * The civil row uses a 1-second `setInterval` separate from the rAF ticker
 * so it can display wall-clock time independently of solar mode.
 *
 * @param showCivil - Whether to render the civil time row (hidden in focus mode).
 * @param className - Additional class overrides.
 */
export function HomeClockDisplay({
  showCivil,
  isFocus,
  className = "h-(--header-height) pt-2",
}: {
  showCivil: boolean;
  isFocus?: boolean;
  className?: string;
}) {
  const {
    home,
    setActive,
    homeRes,
    store: {
      data: { solarMode, hourFormat },
    },
  } = useGlobal();

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

  return (
    <div className={cn("flex flex-col overflow-visible items-end", className)}>
      <span
        className="flex items-center gap-1 tabular-nums px-0.5 w-full justify-end cursor-pointer"
        onClick={() => home && setActive(home)}
        title={home?.label.full}
      >
        <span className="max-tablet:hidden truncate max-w-full">
          {home?.label.title}
        </span>{" "}
        → <span className="shrink-0">{time?.solar}</span>
        <PeriodBadge period={time?.period} />
      </span>

      {/* Civil time row — fades out in focus mode */}
      {showCivil && (
        <span
          className={cn(
            "max-tablet:hidden flex items-center justify-end gap-1 tabular-nums px-0.5 w-full opacity-60 transition-smooth text-xs",
            isFocus
              ? "max-h-0 opacity-0 overflow-clip pointer-events-none select-none"
              : "max-h-10 opacity-60",
          )}
        >
          <span className="truncate max-w-full">{time?.offset}</span> →{" "}
          <span className="shrink-0">{time?.localTime}</span>
          <PeriodBadge period={time?.period} />
        </span>
      )}
    </div>
  );
}
