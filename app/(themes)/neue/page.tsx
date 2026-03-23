"use client";

/**
 * @file page.tsx
 * @description Main Solar Time page.
 *
 * Boot is handled globally by {@link BootProvider} in the root layout.
 * This page reads `active`, `status`, and `clockOffsetMs` from context
 * and immediately starts the TST/MST ticker once `active` is available.
 *
 * Layout modes (driven by {@link AppUIContext}):
 * - **Normal**: compact — location row, large clock, data panel.
 * - **Expanded** (`isExpanded`): clock shrinks to one row, data panel grows
 *   to reveal twilight times, moon position, phase, distance, and more.
 *   Transitions are smooth via `transition-*` Tailwind utilities.
 *
 * Search params:
 * URL sync is handled by {@link useActiveUrlSync} — the URL always reflects
 * the active location and can be used as a deep link.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  computeTrueSolarTime,
  getSolarTimes,
  getSunPosition,
  getMoonPosition,
  getMoonIllumination,
  getMoonTimes,
  type SunPosition,
  type SolarTimes,
  type MoonPosition,
  type MoonIllumination,
  type MoonTimes,
} from "@/lib/astronomy";
import { nowDate } from "@/lib/ntp";
import {
  formatCoordinates,
  gmtLabel,
  formatTime,
  formatDuration,
  getWeatherIcon,
  precipSummary,
} from "@/utils";
import { useTimeFormat } from "@/app/(themes)/neue/contexts/time-format-context";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import Header from "@/app/(themes)/neue/components/header";
import Footer from "@/app/(themes)/neue/components/footer";
import { LoadingUI } from "@/app/(themes)/neue/components/loading";
import { useWeather } from "@/app/hooks/use-weather";
import type { HourlyWeather, WeatherOptions } from "@/lib/weather";
import { Spinner } from "@/app/components/ui/spinner-2";
import { useActiveUrlSync } from "@/app/(themes)/neue/hooks/use-active-url-sync";
import logger from "@/utils/logger";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single formatted solar (or lunar) event entry, holding both its
 * solar-time and civil-time representations for flexible display.
 */
interface SolarEventEntry {
  /** Time expressed in the active solar mode (TST or MST). */
  solar: FormattedTime;
  /** Civil local time at the active location. */
  local: FormattedTime;
  /** GMT offset label, e.g. "GMT+9". */
  offset: string;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

/**
 * Main page component. Manages the boot sequence and the live TST/MST ticker.
 *
 * The ticker advances `activeRes` once per second via `requestAnimationFrame`,
 * recomputing the full Equation of Time every 60 seconds for accuracy.
 * Both TST and MST are kept in sync — the displayed value is chosen via
 * `solarMode` from {@link TimeFormatContext}.
 */
export default function TrueSolarTimePage() {
  useActiveUrlSync();

  const { solarMode, hourFormat } = useTimeFormat();
  const {
    status,
    active,
    activeRes: res,
    setActiveRes,
    isExpanded,
    isFocus,
  } = useAppUI();

  const weatherOptions: WeatherOptions = {
    timezone: active?.time?.timeZone,
    forecastDays: 1,
  };
  const { current: currentWeather, loading: weatherLoading } = useWeather(
    active?.latitude,
    active?.longitude,
    weatherOptions,
  );

  const tickerRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(
    null,
  );
  const anchorTSTMs = useRef(0);
  const anchorMSTMs = useRef(0);
  const anchorPerfMs = useRef(0);

  // -------------------------------------------------------------------------
  // Ticker — fixed to active.longitude, restarts on location change
  // -------------------------------------------------------------------------

  /**
   * Starts (or restarts) the rAF ticker for a given longitude.
   * Both `trueSolarTime` and `meanSolarTime` advance together so switching
   * TST/MST is seamless without re-anchoring.
   */
  const startTicker = useCallback(
    (longitude: number) => {
      if (tickerRef.current) cancelAnimationFrame(tickerRef.current);

      const initial = computeTrueSolarTime(nowDate(), longitude);
      anchorTSTMs.current = initial.trueSolarTime.getTime();
      anchorMSTMs.current = initial.meanSolarTime.getTime();
      anchorPerfMs.current = performance.now();
      setActiveRes(initial);

      let lastSecond = -1;

      function tick() {
        const elapsed = performance.now() - anchorPerfMs.current;
        const currentTSTMs = anchorTSTMs.current + elapsed;
        const currentMSTMs = anchorMSTMs.current + elapsed;
        const second = Math.floor(currentTSTMs / 1_000);

        if (second !== lastSecond) {
          lastSecond = second;
          if (second % 60 === 0) {
            const fresh = computeTrueSolarTime(nowDate(), longitude);
            anchorTSTMs.current = fresh.trueSolarTime.getTime();
            anchorMSTMs.current = fresh.meanSolarTime.getTime();
            anchorPerfMs.current = performance.now();
            setActiveRes(fresh);
          } else {
            setActiveRes((prev) =>
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
        tickerRef.current = requestAnimationFrame(tick);
      }

      tickerRef.current = requestAnimationFrame(tick);
    },
    [setActiveRes],
  );

  useEffect(() => {
    if (!active) return;
    startTicker(active.longitude);
    logger.info("[TST Page - active]", active.name);
    return () => {
      if (tickerRef.current) cancelAnimationFrame(tickerRef.current);
    };
  }, [active, startTicker]);

  // -------------------------------------------------------------------------
  // Render guard
  // -------------------------------------------------------------------------

  if (status !== "ready" || !active)
    return (
      <LoadingUI message={{ description: "Getting everything ready..." }} />
    );

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  const now = nowDate();

  /** The active solar time Date (TST or MST per user preference). */
  const activeST = res
    ? solarMode === "TST"
      ? res.trueSolarTime
      : res.meanSolarTime
    : null;

  const parts = activeST ? formatTime(activeST, 0, hourFormat) : null;

  /** All solar event times for today at the active location. */
  const solarTimes: SolarTimes = getSolarTimes(
    now,
    active.latitude,
    active.longitude,
  );

  /** Current sun position (altitude, azimuth, distance, etc.). */
  const sunPos: SunPosition = getSunPosition(
    now,
    active.latitude,
    active.longitude,
  );

  /** Current moon position (altitude, azimuth, distance). */
  const moonPos: MoonPosition = getMoonPosition(
    now,
    active.latitude,
    active.longitude,
  );

  /** Moon illumination, phase fraction, and phase name. */
  const moonIllum: MoonIllumination = getMoonIllumination(now);

  /** Moonrise/moonset times for today at the active location. */
  const moonTimes: MoonTimes = getMoonTimes(
    now,
    active.latitude,
    active.longitude,
  );

  /**
   * Formats a UTC Date into a {@link SolarEventEntry} — both the solar-mode
   * time and the civil local time. Returns `undefined` for null (polar events).
   *
   * @param date - UTC Date of the event, or null/undefined.
   */
  const makeSolarEntry = (date?: Date | null): SolarEventEntry | undefined => {
    if (!date) return undefined;
    const computed = computeTrueSolarTime(date, active.longitude);
    const solarDate =
      solarMode === "TST" ? computed.trueSolarTime : computed.meanSolarTime;
    return {
      solar: formatTime(solarDate, 0, hourFormat),
      local: formatTime(date, active.time?.totalOffset, hourFormat),
      offset: gmtLabel(active.time?.totalOffset),
    };
  };

  // Primary solar events
  const sunrise = makeSolarEntry(solarTimes.sunrise);
  const sunset = makeSolarEntry(solarTimes.sunset);
  const solarNoon = makeSolarEntry(solarTimes.solarNoon);
  const daytime = formatDuration(solarTimes.daylightMinutes ?? 0, "minutes");

  // Twilight + golden hour — only shown in expanded mode
  const morningGoldenHourEnd = makeSolarEntry(solarTimes.morningGoldenHourEnd);
  const eveningGoldenHourStart = makeSolarEntry(
    solarTimes.eveningGoldenHourStart,
  );
  const civilDawn = makeSolarEntry(solarTimes.civilDawn);
  const civilDusk = makeSolarEntry(solarTimes.civilDusk);
  const nauticalDawn = makeSolarEntry(solarTimes.nauticalDawn);
  const nauticalDusk = makeSolarEntry(solarTimes.nauticalDusk);
  const astronomicalDawn = makeSolarEntry(solarTimes.astronomicalDawn);
  const astronomicalDusk = makeSolarEntry(solarTimes.astronomicalDusk);

  // Moon rise/set
  const moonrise = makeSolarEntry(moonTimes.moonrise);
  const moonset = makeSolarEntry(moonTimes.moonset);

  /** Human-readable description of the current sun phase. */
  const sunPhase = sunPos.isAboveHorizon
    ? "Above horizon"
    : sunPos.altitudeDeg >= -6
      ? "Civil twilight"
      : sunPos.altitudeDeg >= -12
        ? "Nautical twilight"
        : sunPos.altitudeDeg >= -18
          ? "Astronomical twilight"
          : "Night";

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  return (
    <div className="w-full h-screen overflow-hidden frosted-bg frosted-bg-xl [--frosted-image:url('https://i.pinimg.com/1200x/e2/22/d1/e222d106f4534f2f5c525de73baa4ce4.jpg')]!">
      <span aria-hidden="true" className="frosted-grain" />

      <Header />

      <main
        className={cn(
          "grid w-full gap-5 h-[calc(100svh-(var(--header-height)*2))]! transition-smooth",

          isFocus
            ? "grid-rows-[1fr_1fr_1fr]"
            : isExpanded
              ? "grid-rows-[1fr_1fr_5fr]"
              : "grid-rows-[1fr_1fr_2fr]",
        )}
      >
        {/* ── Row 1: Location + civil time ──────────────────────────────── */}
        <div className="neue-grid w-full self-end">
          <LocationTimeDisplay utcOffset={active.time?.totalOffset ?? 0} />
          <div
            className="col-start-4 col-span-2 justify-self-end w-full flex items-center justify-end truncate"
            title={active.displayName}
          >
            <span className="truncate max-w-full text-right">
              {active.label.title}
            </span>
            <span className="shrink-0">, {active.label.subtitle}</span>
          </div>
          <div className="col-span-2">
            {formatCoordinates(active.longitude, active.latitude)}
          </div>
        </div>

        {/* ── Row 2: Main solar clock ────────────────────────────────────── */}
        <div
          className={
            "neue-grid justify-items-stretch tabular-nums tracking-tight w-full"
          }
        >
          <div
            className={cn(
              "col-span-6 col-start-2 flex items-center gap-4 justify-between font-serif font-normal",
              "transition-smooth",
              isExpanded ? "text-6xl px-10" : "text-9xl px-0",
            )}
          >
            <span className="flex items-start gap-0.5">
              {/* Redundant. Just makes sure the time display is always centered, even when in 12hr mode */}
              {hourFormat === "12" && parts?.period && (
                <span
                  className={cn(
                    "font-sans opacity-0 font-medium not-italic text-nowrap transition-smooth-short pointer-events-none select-none ",
                    isExpanded ? "text-xs" : "text-sm",
                    parts.period
                      ? "translate-x-0"
                      : "-translate-x-1  w-0 overflow-hidden",
                  )}
                >
                  [ {parts.period ?? "AM"} ]
                </span>
              )}
              (
            </span>
            <div className="flex items-center justify-between w-full gap-1">
              <span>{parts?.hh ?? "··"}</span>
              <span className="not-italic animate-pulse">:</span>
              <span>{parts?.mm ?? "··"}</span>
              <span className="not-italic animate-pulse">:</span>
              <span>{parts?.ss ?? "··"}</span>
            </div>
            <span className="flex items-start gap-0.5">
              <span>)</span>
              {hourFormat === "12" && parts?.period && (
                <span
                  className={cn(
                    "font-sans font-medium not-italic text-nowrap transition-smooth-short",
                    isExpanded ? "text-xs" : "text-sm",
                    parts.period
                      ? "opacity-100 translate-x-0"
                      : "opacity-0 -translate-x-1 pointer-events-none select-none w-0 overflow-hidden",
                  )}
                >
                  [ {parts.period ?? "AM"} ]
                </span>
              )}
            </span>
          </div>
        </div>

        {/* ── Row 3: Data panel ─────────────────────────────────────────── */}
        <div className="neue-grid w-full self-start overflow-y-auto">
          {/* Left col: Sun position + EoT (+ Moon in expanded mode) */}
          <div
            className={cn(
              "col-span-3 col-start-2 h-fit flex flex-col gap-1 transition-smooth",
              !isFocus ? "max-h-none opacity-100" : "max-h-0 opacity-0",
            )}
          >
            {res?.equationOfTimeMinutes != null && (
              <DataRow
                label="Equation of time"
                value={`${res.equationOfTimeMinutes < 0 ? "−" : "+"}${formatDuration(
                  Math.abs(res.equationOfTimeMinutes),
                  "minutes",
                )}`}
              />
            )}

            <div className="h-4" aria-hidden="true" />

            <DataRow
              label="Azimuth"
              value={`${sunPos.azimuthDeg.toFixed(2)}°  ${sunPos.compassDirection}`}
            />
            <DataRow
              label="Altitude"
              value={`${sunPos.altitudeDeg >= 0 ? "↑" : "↓"} ${Math.abs(
                sunPos.altitudeDeg,
              ).toFixed(2)}°`}
            />
            <DataRow label="Sun phase" value={sunPhase} />
            {solarNoon && (
              <DataRow
                label="Solar noon"
                value={fmtEntry(solarNoon, hourFormat)}
              />
            )}

            {/* Expanded: extra sun fields + full moon section */}
            <div
              className={cn(
                "flex flex-col gap-1 overflow-hidden transition-all duration-500 ease-in-out",
                isExpanded ? "max-h-150 opacity-100 mt-1" : "max-h-0 opacity-0",
              )}
            >
              <DataRow
                label="Hour angle"
                value={`${sunPos.hourAngle >= 0 ? "+" : ""}${sunPos.hourAngle.toFixed(3)}°`}
              />
              <DataRow
                label="Declination"
                value={`${sunPos.declination >= 0 ? "+" : ""}${sunPos.declination.toFixed(3)}°`}
              />
              <DataRow
                label="Sun distance"
                value={`${(sunPos.distanceKm / 1_000_000).toFixed(3)} M km  (${sunPos.distanceAU.toFixed(5)} AU)`}
              />

              <div className="h-4" aria-hidden="true" />

              <DataRow
                label="Moon phase"
                value={`${moonIllum.phaseName}  ${moonIllum.isWaxing ? "↑" : "↓"}  ${(
                  moonIllum.fraction * 100
                ).toFixed(0)}% lit`}
              />
              <DataRow
                label="Moon azimuth"
                value={`${moonPos.azimuthDeg.toFixed(2)}°  ${moonPos.compassDirection}`}
              />
              <DataRow
                label="Moon altitude"
                value={`${moonPos.isAboveHorizon ? "↑" : "↓"} ${Math.abs(
                  moonPos.altitudeDeg,
                ).toFixed(2)}°`}
              />
              <DataRow
                label="Moon distance"
                value={`${moonPos.distanceKm.toFixed(0)} km`}
              />
              {moonTimes.alwaysUp && (
                <DataRow label="Moon" value="Above horizon all day" />
              )}
              {moonTimes.alwaysDown && (
                <DataRow label="Moon" value="Below horizon all day" />
              )}
              {moonrise && (
                <DataRow
                  label="Moonrise"
                  value={fmtEntry(moonrise, hourFormat)}
                />
              )}
              {moonset && (
                <DataRow
                  label="Moonset"
                  value={fmtEntry(moonset, hourFormat)}
                />
              )}
            </div>
          </div>

          {/* Right col: Weather + solar events (+ twilights in expanded mode) */}
          <div
            className={cn(
              "col-span-3 flex flex-col gap-1 transition-smooth",
              !isFocus ? "max-h-none opacity-100" : "max-h-0 opacity-0",
            )}
          >
            <WeatherDisplay
              weather={currentWeather}
              loading={weatherLoading}
              options={weatherOptions}
            />

            <DataRow
              label="Sunrise"
              value={sunrise ? fmtEntry(sunrise, hourFormat) : "—"}
            />
            <DataRow
              label="Sunset"
              value={sunset ? fmtEntry(sunset, hourFormat) : "—"}
            />
            <DataRow label="Daytime" value={daytime} />

            {/* Expanded: twilight events + golden hour */}
            <div
              className={cn(
                "flex flex-col gap-1 overflow-hidden transition-smooth",
                isExpanded ? "max-h-150 opacity-100 mt-1" : "max-h-0 opacity-0",
              )}
            >
              {morningGoldenHourEnd && (
                <DataRow
                  label="Golden hr end"
                  value={fmtEntry(morningGoldenHourEnd, hourFormat)}
                />
              )}
              {eveningGoldenHourStart && (
                <DataRow
                  label="Golden hour"
                  value={fmtEntry(eveningGoldenHourStart, hourFormat)}
                />
              )}

              <div className="h-2" aria-hidden="true" />

              {civilDawn && (
                <DataRow
                  label="Civil dawn"
                  value={fmtEntry(civilDawn, hourFormat)}
                />
              )}
              {civilDusk && (
                <DataRow
                  label="Civil dusk"
                  value={fmtEntry(civilDusk, hourFormat)}
                />
              )}
              {nauticalDawn && (
                <DataRow
                  label="Nautical dawn"
                  value={fmtEntry(nauticalDawn, hourFormat)}
                />
              )}
              {nauticalDusk && (
                <DataRow
                  label="Nautical dusk"
                  value={fmtEntry(nauticalDusk, hourFormat)}
                />
              )}
              {astronomicalDawn && (
                <DataRow
                  label="Astro. dawn"
                  value={fmtEntry(astronomicalDawn, hourFormat)}
                />
              )}
              {astronomicalDusk && (
                <DataRow
                  label="Astro. dusk"
                  value={fmtEntry(astronomicalDusk, hourFormat)}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FormattedEntry {
  solar: string;
  localTime: string;
  period?: "AM" | "PM";
  offset: string;
}

/**
 * Formats a {@link SolarEventEntry} as a compact display string.
 * Shows solar time followed by the civil local time in parentheses.
 *
 * @example `"06 : 14  (GMT+9 → 06 : 14)"`
 *
 * @param entry - The solar event entry to format.
 * @param hourFormat - "12" or "24".
 */

function fmtEntry(
  entry: SolarEventEntry,
  hourFormat: HourFormat,
): FormattedEntry {
  const fmt = (t: FormattedTime) => `${t.hh} : ${t.mm}`;
  return {
    solar: fmt(entry.solar),
    localTime: fmt(entry.local),
    period: hourFormat === "12" ? entry.local.period : undefined,
    offset: entry.offset,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PeriodBadge({ period }: { period?: "AM" | "PM" }) {
  return (
    <span
      className={cn(
        "transition-smooth-short text-xs",
        period
          ? "opacity-100 translate-x-0"
          : "opacity-0 -translate-x-1 pointer-events-none select-none w-0 overflow-hidden",
      )}
    >
      {period ?? "AM"}
    </span>
  );
}

/**
 * A single label/value data row used throughout the information panels.
 *
 * @param label - Short label, right-aligned in the first column.
 * @param value - Value string spanning the remaining two columns.
 */
function DataRow({
  label,
  value,
}: {
  label: string;
  value: string | FormattedEntry;
}) {
  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="justify-self-end">{label}</div>
      <div className="col-span-2 tabular-nums">
        {typeof value === "string" ? (
          value
        ) : (
          <span className="flex items-center gap-1">
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

/**
 * Ticking civil-time display for the active location.
 * Advances independently of the TST ticker via a 1-second `setInterval`.
 *
 * @param utcOffset - Timezone offset from UTC in seconds.
 */
function LocationTimeDisplay({ utcOffset }: { utcOffset: number }) {
  const [, forceRender] = useState(0);
  const { hourFormat } = useTimeFormat();

  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const ct = formatTime(nowDate(), utcOffset, hourFormat);
  const offset = gmtLabel(utcOffset);
  const timeStr = `${ct.hh} : ${ct.mm} : ${ct.ss}${
    hourFormat === "12" ? ` ${ct.period}` : ""
  }`;

  return (
    <>
      <div className="col-start-2 justify-self-end">[ {offset}</div>
      <div className="tabular-nums" title="Local time">
        {timeStr} ]
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

/**
 * Displays current-hour weather conditions for the active location.
 * Shows a spinner while loading; renders nothing if weather is unavailable.
 *
 * @param weather - Current hourly weather snapshot, or null.
 * @param loading - Whether the weather fetch is in progress.
 * @param options - Weather fetch options (used to determine unit labels).
 */
function WeatherDisplay({
  weather,
  loading,
  options,
}: {
  weather: HourlyWeather | null;
  loading: boolean;
  options?: WeatherOptions;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-5">
        <div className="justify-self-end">Conditions</div>
        <div className="col-span-2 tabular-nums flex items-center gap-1 opacity-60">
          <Spinner size={14} />
          <span>Loading weather</span>
        </div>
      </div>
    );
  }

  if (!weather) return null;

  const Icon = getWeatherIcon(weather.weatherCode, weather.isDay);
  const precipitation = precipSummary(weather);
  const unitSymbol = options?.temperatureUnit === "fahrenheit" ? "°F" : "°C";

  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="justify-self-end">Conditions</div>
      <div className="col-span-2 tabular-nums flex flex-col gap-0.5">
        <span className="flex items-center gap-1">
          <span>{weather.weatherDescription}</span>
          <Icon size={16} />
        </span>
        {precipitation && <span className="opacity-80">{precipitation}</span>}
        <span>
          {Math.round(weather.temperature)}
          {unitSymbol}
        </span>
      </div>
    </div>
  );
}
