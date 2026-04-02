"use client";

/**
 * @file shared-ui.tsx
 * @description Small, widely-reused UI primitives for the Neue theme.
 *
 * Extracted here to break the circular import where `map.tsx` and
 * `mobile-header.tsx` were importing `PeriodBadge` from `page.tsx`.
 *
 * Components:
 * - {@link PeriodBadge}        — animated AM/PM indicator
 * - {@link DataRow}            — label/value grid row
 * - {@link NotificationList}   — styled list of notification strings
 * - {@link WeatherDisplay}     — compact weather row (desktop)
 * - {@link WeatherDisplayCompact} — weather row for drawers/mobile
 * - {@link SectionLabel}       — SCREAMING-CAPS section header
 * - {@link DrawerListItem}     — standard `[→] Label` drawer row
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Spinner } from "@/app/components/ui/spinner-2";
import { getWeatherIcon, precipSummary } from "@/utils";
import type { HourlyWeather, WeatherOptions } from "@/lib/weather";
import type { FormattedEntry } from "@/utils";
import { ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// PeriodBadge
// ---------------------------------------------------------------------------

/**
 * Animated AM/PM badge that fades in/out when `hourFormat` is toggled.
 * Always mounted so the transition is visible; hidden via opacity + width.
 *
 * @param period - "AM" | "PM", or undefined when in 24-hour mode.
 */
export function PeriodBadge({
  period,
  disable,
}: {
  period?: "AM" | "PM";
  disable?: boolean;
}) {
  return (
    <span
      className={cn(
        "transition-smooth-short text-xs font-sans",
        disable && "opacity-0!",
        period
          ? "opacity-100 translate-x-0"
          : "opacity-0 -translate-x-1 pointer-events-none select-none w-0 overflow-hidden",
      )}
    >
      {period ?? "AM"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DataRow
// ---------------------------------------------------------------------------

/**
 * A single label/value row for the information panels.
 * Accepts either a plain string or a {@link FormattedEntry} (solar + civil time).
 *
 * @param label - Short descriptor in the left column.
 * @param value - Display value; a `FormattedEntry` renders with a `PeriodBadge`.
 */
export function DataRow({
  label,
  value,
}: {
  label: string;
  value: string | FormattedEntry;
}) {
  return (
    <div className="neue-grid-small">
      <div className="tablet:justify-self-end opacity-70">{label}</div>
      <div className="col-span-2 tabular-nums">
        {typeof value === "string" ? (
          value
        ) : (
          <span className="flex items-center gap-1 flex-wrap">
            {value.solar}
            <PeriodBadge period={value.period} />
            <span className="opacity-60 mx-1">
              ({value.offset} → {value.localTime}
            </span>
            <PeriodBadge period={value.period} />
            <span className="opacity-60">)</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationList
// ---------------------------------------------------------------------------

/**
 * Renders notification messages in a bordered list.
 * Returns `null` when `items` is empty.
 *
 * @param items - Notification strings.
 * @param className - Additional classes on the wrapper.
 */
export function NotificationList({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ul
      className={cn(
        "flex flex-col gap-1 rounded-sm border border-border/40 overflow-hidden bg-muted",
        className,
      )}
    >
      {items.map((msg, i) => (
        <li
          key={i}
          className={cn(
            "grid grid-cols-[2rem_1fr] gap-2 px-4 py-3 text-sm w-full",
            i < items.length - 1 && "border-b border-border/60",
          )}
        >
          <span className="font-mono opacity-40 mt-px">[•]</span>
          <span className="leading-snug">{msg}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// WeatherDisplay (desktop / card)
// ---------------------------------------------------------------------------

/**
 * Compact weather display for the main page data panel and map card.
 * Shows description, precipitation summary, and temperature.
 * Renders nothing while weather is `null` and not loading.
 *
 * @param weather  - Current hourly weather, or null.
 * @param loading  - Whether a fetch is in progress.
 * @param options  - Used to determine the temperature unit label.
 * @param onRetry  - Optional retry callback shown when in error state.
 * @param error    - Error message to show with the retry button.
 */
export function WeatherDisplay({
  weather,
  loading,
  options,
  error,
  onRetry,
}: {
  weather: HourlyWeather | null;
  loading: boolean;
  options?: WeatherOptions;
  error?: string | null;
  onRetry?: () => void;
}) {
  const unitSymbol = options?.temperatureUnit === "fahrenheit" ? "°F" : "°C";

  if (loading) {
    return (
      <div className="neue-grid-small">
        <div className="tablet:justify-self-end opacity-70">Conditions</div>
        <div className="col-span-2 tabular-nums flex items-center gap-1 opacity-60">
          <Spinner size={14} />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (error && onRetry) {
    return (
      <div className="neue-grid-small">
        <div className="tablet:justify-self-end opacity-70">Conditions</div>
        <div className="col-span-2 flex items-center gap-2 text-xs opacity-70">
          <span>Unavailable</span>
          <button
            onClick={onRetry}
            className="underline underline-offset-2 hover:opacity-100 transition-opacity"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!weather) return null;

  const Icon = getWeatherIcon(weather.weatherCode, weather.isDay);
  const precipitation = precipSummary(weather);

  return (
    <div className="neue-grid-small">
      <div className="tablet:justify-self-end opacity-70">Conditions</div>
      <div className="col-span-2 tabular-nums flex flex-col gap-0.5">
        <span className="flex items-center gap-1">
          <span>{weather.weatherDescription}</span>
          <Icon size={14} />
        </span>
        {precipitation && <span className="opacity-70">{precipitation}</span>}
        <span>
          {Math.round(weather.temperature)}
          {unitSymbol}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeatherDisplayCompact (mobile drawer / map pin)
// ---------------------------------------------------------------------------

/**
 * Compact weather display for drawers and the map pin card.
 * Horizontal layout: description + icon on left, temperature on right.
 */
export function WeatherDisplayCompact({
  weather,
  loading,
  options,
  error,
  onRetry,
}: {
  weather: HourlyWeather | null;
  loading: boolean;
  options?: WeatherOptions;
  error?: string | null;
  onRetry?: () => void;
}) {
  const unitSymbol = options?.temperatureUnit === "fahrenheit" ? "°F" : "°C";

  if (loading) {
    return (
      <div className="flex items-center gap-2 opacity-60 text-sm">
        <Spinner size={13} />
        <span>Loading weather…</span>
      </div>
    );
  }

  if (error && onRetry) {
    return (
      <div className="flex items-center gap-2 text-sm opacity-70">
        <span>Weather unavailable</span>
        <button onClick={onRetry} className="underline underline-offset-2">
          Retry
        </button>
      </div>
    );
  }

  if (!weather) return null;

  const Icon = getWeatherIcon(weather.weatherCode, weather.isDay);
  const precipitation = precipSummary(weather);

  return (
    <div className="flex justify-between items-start gap-4 w-full text-sm">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1">
          {weather.weatherDescription}
          <Icon size={14} />
        </span>
        {precipitation && (
          <span className="text-xs opacity-70">{precipitation}</span>
        )}
      </div>
      <span className="tabular-nums shrink-0">
        {Math.round(weather.temperature)}
        {unitSymbol}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionLabel
// ---------------------------------------------------------------------------

/**
 * Uppercase section label used throughout drawers and panels.
 *
 * @param children - Label text (will be rendered as-is, not uppercased in CSS).
 * @param badge - Optional numeric badge shown to the right (e.g. notification count).
 * @param className - Additional classes.
 */
export function SectionLabel({
  children,
  badge,
  className,
}: {
  children: React.ReactNode;
  badge?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between w-full", className)}>
      <span className="text-xs opacity-40  uppercase">{children}</span>
      {badge != null && badge > 0 && (
        <span className="text-xs opacity-40">[ {badge} ]</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DrawerListItem
// ---------------------------------------------------------------------------

/**
 * Standard `[→] Label` row used in drawer nav lists.
 * Renders as a `<Link>` when `href` is provided, otherwise a `<button>`.
 */
export function DrawerListItem({
  children,
  href,
  onClick,
  className,
  showChevron = true,
  isLast = false,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  showChevron?: boolean;
  isLast?: boolean;
}) {
  const base = cn(
    "grid grid-cols-[2rem_1fr] gap-2 px-4 py-3.5 text-sm w-full text-left",
    "bg-muted hover:bg-muted/60 transition-colors",
    !isLast && "border-b border-border/60",
    className,
  );

  const inner = (
    <>
      <span className="font-mono opacity-40">[→]</span>
      <div className="flex items-center w-full gap-2 justify-between">
        {children}
        {showChevron && <ChevronRight className="opacity-30 size-4" />}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={base}>
      {inner}
    </button>
  );
}
