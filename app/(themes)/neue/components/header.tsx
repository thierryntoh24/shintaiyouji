"use client";

/**
 * @file header.tsx
 * @description Site header for the Neue theme.
 *
 * Renders in three modes:
 * - **Mobile**: delegates entirely to {@link MobileHeader} from `mobile-header.tsx`.
 * - **Desktop normal**: site name, notification popover, date, nav, home clock.
 * - **Desktop focus**: site name and home clock only.
 *
 * Notification sources (in display order):
 * 1. Active location solar time vs home solar time difference.
 * 2. Active location: civil local time vs solar time (Equation of Time effect).
 * 3. Home: civil local time vs solar time.
 * 4. System clock drift vs network time (if > 1 s).
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { SITENAME } from "@/types/consts";
import {
  computeTrueSolarTime,
  type TrueSolarTimeResult,
} from "@/lib/astronomy";
import {
  formatDate,
  formatDuration,
  formatTime,
  gmtLabel,
  secsToMins,
} from "@/utils";
import { nowDate } from "@/lib/ntp";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import { useTimeFormat } from "@/app/(themes)/neue/contexts/time-format-context";
import { SearchForm } from "@/app/(themes)/neue/components/search";
import { Options } from "@/app/(themes)/neue/components/options";
import { MobileHeader } from "@/app/(themes)/neue/components/mobile-header";
import { useMediaQueries } from "@/app/hooks/use-mobile-query";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Hook — home TST/MST ticker
// ---------------------------------------------------------------------------

/**
 * Returns a live-ticking {@link TrueSolarTimeResult} for a fixed longitude.
 * Used to power the header home clock independently of the main page ticker.
 *
 * @param longitude - Home observer longitude, or undefined before geolocation resolves.
 */
function useHomeTicker({
  longitude,
}: {
  longitude?: number;
}): TrueSolarTimeResult | undefined {
  const [tst, setTST] = useState<TrueSolarTimeResult>();
  const rafRef = useRef<number | null>(null);
  const lastSecRef = useRef(-1);
  const anchorTSTMsRef = useRef(0);
  const anchorMSTMsRef = useRef(0);
  const anchorPerfMsRef = useRef(0);
  const lonRef = useRef(longitude);

  useEffect(() => {
    lonRef.current = longitude;
  }, [longitude]);

  useEffect(() => {
    if (longitude == null) return;

    const initial = computeTrueSolarTime(nowDate(), longitude);
    anchorTSTMsRef.current = initial.trueSolarTime.getTime();
    anchorMSTMsRef.current = initial.meanSolarTime.getTime();
    anchorPerfMsRef.current = performance.now();
    setTST(initial);

    function tick() {
      const elapsed = performance.now() - anchorPerfMsRef.current;
      const currentTSTMs = anchorTSTMsRef.current + elapsed;
      const currentMSTMs = anchorMSTMsRef.current + elapsed;
      const second = Math.floor(currentTSTMs / 1_000);

      if (second !== lastSecRef.current) {
        lastSecRef.current = second;
        if (second % 60 === 0) {
          const fresh = computeTrueSolarTime(nowDate(), lonRef.current!);
          anchorTSTMsRef.current = fresh.trueSolarTime.getTime();
          anchorMSTMsRef.current = fresh.meanSolarTime.getTime();
          anchorPerfMsRef.current = performance.now();
          setTST(fresh);
        } else {
          setTST((prev) =>
            prev
              ? {
                  ...prev,
                  trueSolarTime: new Date(currentTSTMs),
                  meanSolarTime: new Date(currentMSTMs),
                }
              : prev,
          );
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [longitude]);

  return tst;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * Site header component.
 * On mobile viewports delegates to {@link MobileHeader}.
 * On desktop renders the full notification + search + clock bar.
 *
 * @see {@link AppUIContext} for `isFocus`, `active`, `home`, `activeRes`.
 */
export default function Header() {
  const { isFocus, active, activeRes, home, clockOffsetMs } = useAppUI();
  const { solarMode } = useTimeFormat();
  const homeTST = useHomeTicker({ longitude: home?.longitude });
  const { isMobile } = useMediaQueries();

  // ── Delegate to mobile header ──────────────────────────────────────────────
  if (isMobile) return <MobileHeader />;

  // ── Notifications ──────────────────────────────────────────────────────────

  const notifications: string[] = [];

  const isViewingHome =
    Math.abs((active?.longitude ?? 0) - (home?.longitude ?? 0)) < 0.01;

  if (!isViewingHome && homeTST && activeRes && active && !!home?.longitude) {
    const diffMin = activeRes.totalOffsetMinutes - homeTST.totalOffsetMinutes;
    const dir = diffMin > 0 ? "ahead of" : "behind";
    notifications.push(
      `${active.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} ${home.label.title}`,
    );
  }

  if (activeRes && active?.time?.totalOffset != null) {
    const civilOffsetMin = secsToMins(active.time.totalOffset);
    const solarOffsetMin = activeRes.totalOffsetMinutes;
    const diffMin = civilOffsetMin - solarOffsetMin;
    if (Math.abs(diffMin) >= 0.5) {
      const dir = diffMin > 0 ? "ahead of" : "behind";
      notifications.push(
        `The local time in ${active.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`,
      );
    }
  }

  if (!isViewingHome && homeTST && home?.time?.totalOffset != null) {
    const civilOffsetMin = secsToMins(home.time.totalOffset);
    const solarOffsetMin = homeTST.totalOffsetMinutes;
    const diffMin = civilOffsetMin - solarOffsetMin;
    if (Math.abs(diffMin) >= 0.5) {
      const dir = diffMin > 0 ? "ahead of" : "behind";
      notifications.push(
        `${home.label.title}'s local time is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`,
      );
    }
  }

  if (Math.abs(clockOffsetMs) > 1_000) {
    const dir = clockOffsetMs > 0 ? "ahead of" : "behind";
    notifications.push(
      `Your system clock is ${formatDuration(Math.abs(clockOffsetMs), "ms")} ${dir} network time`,
    );
  }

  // ── Focus variant ──────────────────────────────────────────────────────────

  if (isFocus) {
    return (
      <header className="neue-grid py-2 h-(--header-height)">
        <div>{SITENAME}</div>
        <div className="-col-start-2 flex flex-col items-end leading-tight">
          <HomeClockDisplay tst={homeTST} local={false} />
        </div>
      </header>
    );
  }

  // ── Normal desktop variant ─────────────────────────────────────────────────

  return (
    <header className="neue-grid pt-3 h-(--header-height) items-center">
      <Link href="/">{SITENAME}</Link>

      <div className="col-span-2">
        <NotificationPopover items={notifications} />
      </div>

      <div
        className="col-span-2 justify-self-end"
        title={`Current date in ${active?.label.title}`}
      >
        {activeRes
          ? formatDate(
              solarMode === "TST"
                ? activeRes.trueSolarTime
                : activeRes.meanSolarTime,
            )
          : formatDate(nowDate())}
      </div>

      <div className="col-span-2">
        <div className="flex items-center gap-2">
          <SearchForm />
          <Options />
          <Link href="/map">Map</Link>
          <Link href="#">About</Link>
        </div>
      </div>

      <HomeClockDisplay tst={homeTST} local={!isFocus} />
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Expandable notification popover (desktop only).
 * The first notification is shown inline; clicking reveals the rest.
 *
 * @param items - Notification strings to display.
 */
function NotificationPopover({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const hasMore = items.length > 1;

  if (items.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="cursor-pointer gap-1 flex items-center justify-start">
          <span className={cn("truncate max-w-full", !!open && "opacity-60")}>
            {items[0]}
          </span>
          <span className="shrink-0">
            {hasMore && <> [ {open ? "close" : "open"} ]</>}
          </span>
        </div>
      </PopoverTrigger>
      {hasMore && (
        <PopoverContent
          align="start"
          className="w-80 shadow-sm gap-1 flex flex-col text-xs font-medium rounded-sm"
        >
          <ul className="flex flex-col gap-1">
            {items.map((msg, i) => (
              <li key={i} className="flex gap-1">
                <span className="font-mono">[•]</span>
                <span>{msg}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------------------------

/**
 * Desktop home-location clock.
 * Shows solar time (TST/MST) and optionally the civil time + GMT offset below.
 *
 * @param tst       - Live TST result from {@link useHomeTicker}.
 * @param local     - Whether to show the civil time row.
 * @param className - Additional class overrides.
 */
function HomeClockDisplay({
  tst,
  local = true,
  className = "h-(--header-height) pt-2",
}: {
  tst?: TrueSolarTimeResult;
  local?: boolean;
  className?: string;
}) {
  const [, forceRender] = useState(0);
  const { solarMode, hourFormat } = useTimeFormat();
  const { home, setActive, isFocus } = useAppUI();

  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const solarDate = tst
    ? solarMode === "TST"
      ? tst.trueSolarTime
      : tst.meanSolarTime
    : null;

  const parts = solarDate ? formatTime(solarDate, 0, hourFormat) : null;
  const timeLabel = parts
    ? `${parts.hh} : ${parts.mm}${hourFormat === "12" ? ` ${parts.period}` : ""}`
    : "·· : ··";

  const ct = formatTime(nowDate(), home?.time?.totalOffset, hourFormat);
  const offset = gmtLabel(home?.time?.totalOffset ?? 0);
  const timeStr = `${ct.hh} : ${ct.mm}${hourFormat === "12" ? ` ${ct.period}` : ""}`;

  return (
    <div className={cn("flex flex-col overflow-visible items-end", className)}>
      <span
        className="px-0.5 w-full flex items-center justify-end cursor-pointer"
        onClick={() => home && setActive(home)}
        title={home?.label.full}
      >
        <span className="truncate w-full text-right">{home?.label.title}</span>
        <span className="shrink-0">→ {timeLabel}</span>
      </span>
      {local && (
        <span
          className={cn(
            "opacity-60 transition-smooth",
            !isFocus
              ? "max-h-none opacity-60"
              : "max-h-0 opacity-0 overflow-clip pointer-events-none select-none",
          )}
        >
          {offset} → {timeStr}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Map page header — a slim bar with site name, search, and home clock.
 * Used on `/map` instead of the main header.
 */
export function MapHeader() {
  const { home } = useAppUI();
  const homeTST = useHomeTicker({ longitude: home?.longitude });

  return (
    <header className="neue-grid py-2 items-center">
      <Link
        href="/"
        className="bg-primary-foreground py-1 px-2.5 rounded-sm w-fit"
      >
        <span className="relative text-foreground">{SITENAME}</span>
      </Link>

      <div className="col-start-6 col-span-2 bg-primary-foreground py-1 px-2.5 rounded-sm w-fit">
        <div className="flex items-center gap-2 relative">
          <SearchForm />
          <Link href="/map">Map</Link>
          <Link href="#">Options</Link>
          <Link href="#">Options</Link>
        </div>
      </div>

      <div className="bg-primary-foreground py-1 px-2 rounded-sm w-fit justify-self-end">
        <HomeClockDisplay tst={homeTST} local={false} className="" />
      </div>
    </header>
  );
}
