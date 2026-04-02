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
  fmtEntry,
} from "@/utils";
import { useNeue } from "@/app/(themes)/neue/contexts/ui-context";
import Header from "@/app/(themes)/neue/components/header";
import Footer from "@/app/(themes)/neue/components/footer";
import { LoadingUI } from "@/app/(themes)/neue/components/loading";
import { useWeather } from "@/app/hooks/use-weather";
import type { WeatherOptions } from "@/lib/weather";
import { useActiveUrlSync } from "@/app/(themes)/neue/hooks/use-active-url-sync";
import { cn } from "@/lib/utils";
import {
  PeriodBadge,
  DataRow,
  WeatherDisplay,
} from "@/app/(themes)/neue/components/shared-ui";
import {
  SkyCanvas,
  useSkyGradient as useSkyGradientv2,
} from "@/app/(themes)/neue/hooks/use-sky-gradient-v2";
import { useGlobal } from "@/app/contexts/global-provider";

/**
 * Main page component. Manages the boot sequence and the live TST/MST ticker.
 *
 * The ticker advances `activeRes` once per second via `requestAnimationFrame`,
 * recomputing the full Equation of Time every 60 seconds for accuracy.
 * Both TST and MST are kept in sync — the displayed value is chosen via
 * `solarMode` from {@link TimeFormatContext}.
 */
export default function TrueSolarTimePage() {
  // URL ↔ active sync (deep links, share URLs, search form updates)
  useActiveUrlSync();

  const {
    status,
    active,
    activeRes: res,
    store: {
      data: { hourFormat, solarMode },
    },
  } = useGlobal();

  const {
    isExpanded,
    isFocus,
    prefs: {
      data: { font },
    },
  } = useNeue();

  const weatherOptions: WeatherOptions = {
    timezone: active?.time?.timeZone,
    forecastDays: 1,
  };

  const {
    current: currentWeather,
    loading: weatherLoading,
    error: weatherError,
    refresh: retryWeather,
  } = useWeather(active?.latitude, active?.longitude, weatherOptions);

  // -------------------------------------------------------------------------
  // Ticker — fixed to active.longitude, restarts on location change
  // -------------------------------------------------------------------------

  /**
   * Starts (or restarts) the rAF ticker for a given longitude.
   * Both `trueSolarTime` and `meanSolarTime` advance together so switching
   * TST/MST is seamless without re-anchoring.
   */
  // useSolarTicker(setActiveRes, active?.longitude);

  // -------------------------------------------------------------------------
  // Derived display values. Calculating here since unPos is needed to calc the gradient,
  // and since it is a hook, needs to be above the conditional render
  // -------------------------------------------------------------------------

  const now = nowDate();

  /** The active solar time Date (TST or MST per user preference). */
  const activeST = res
    ? solarMode === "TST"
      ? res.trueSolarTime
      : res.meanSolarTime
    : null;

  const parts = activeST ? formatTime(activeST, 0, hourFormat) : null;

  /** Current sun position (altitude, azimuth, distance, etc.). */
  const sunPos: SunPosition = getSunPosition(
    now,
    active?.latitude ?? 0,
    active?.longitude ?? 0,
  );

  /** Current moon position (altitude, azimuth, distance). */
  const moonPos: MoonPosition = getMoonPosition(
    now,
    active?.latitude ?? 0,
    active?.longitude ?? 0,
  );

  /** Moon illumination, phase fraction, and phase name. */
  const moonIllum: MoonIllumination = getMoonIllumination(now);

  // /**Sky gradient (v1) */
  // const sky = useSkyGradient(
  //   sunPos.altitudeDeg,
  //   res?.isPastSolarNoon ?? false,
  //   currentWeather?.cloudCover ?? 0,
  // );

  /**Sky gradient (v2) */
  const sky = useSkyGradientv2({
    sunPos,
    moonPos,
    moonIllum,
    isPastSolarNoon: res?.isPastSolarNoon ?? false,
    cloudCover: currentWeather?.cloudCover ?? 0,
    weatherCode: currentWeather?.weatherCode ?? 0,
    uvIndex: currentWeather?.uvIndex,
  });

  /**Sky gradient (v3) */
  // const sky = useSkyGradientv3(
  //   sunPos.altitudeDeg,
  //   sunPos.azimuthDeg,
  //   res?.isPastSolarNoon ?? false,
  //   currentWeather ?? undefined,
  // );

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

  /** All solar event times for today at the active location. */
  const solarTimes: SolarTimes = getSolarTimes(
    now,
    active?.latitude ?? 0,
    active?.longitude ?? 0,
  );

  /** Moonrise/moonset times for today at the active location. */
  const moonTimes: MoonTimes = getMoonTimes(
    now,
    active?.latitude ?? 0,
    active?.longitude ?? 0,
  );

  /**
   * Formats a UTC Date into a {@link SolarEventEntry} — both the solar-mode
   * time and the civil local time. Returns `undefined` for null (polar events).
   *
   * @param date - UTC Date of the event, or null/undefined.
   */
  const makeSolarEntry = (date?: Date | null): SolarEventEntry | undefined => {
    if (!date || !active) return undefined;
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
    <div
      data-sky={sky.phase}
      data-sky-dark={sky.isDark || undefined}
      className={cn(
        "w-full h-dvh overflow-clip transition-smooth-short",
        // sky?.foregroundClass,
      )}
      // style={{ background: sky?.background }}
    >
      {/* Sky renderer */}
      <SkyCanvas sky={sky} />

      {/* Grain texture overlay */}
      <span
        aria-hidden="true"
        className="frosted-grain pointer-events-none z-6"
      />

      <div
        className={cn(
          "relative z-10 flex flex-col h-full text-(--sky-fg) ",
          // sky.foregroundClass,
        )}
      >
        <Header />

        <main
          className={cn(
            "flex-1 grid grid-rows-[1fr_1fr_2fr] w-full gap-5 tablet:gap-10 transition-smooth overflow-y-auto no-scrollbar",
            "h-[calc(100dvh-(var(--header-height)*2))]",
            isFocus && "grid-rows-[1fr_1fr_1fr]",
            isExpanded && "grid-rows-[1fr_1fr_4fr]",
          )}
        >
          {/* ── Row 1: Location + civil time ──────────────────────────── */}
          <div
            className={cn(
              "w-full transition-smooth self-end neue-grid max-tablet:gap-5",
              isFocus && "max-tablet:gap-8",
              isExpanded && "max-tablet:gap-2",
            )}
          >
            <LocationTimeDisplay utcOffset={active.time?.totalOffset ?? 0} />

            {/* Mobile: location name under civil time */}
            {/* laptop: location name right-aligned */}
            <div
              className={cn(
                "neue-grid-small max-tablet:gap-1 col-span-3",
                "tablet:neue-grid-mini",
                "laptop:col-start-4 tablet:col-span-4",
              )}
            >
              <div
                className={cn(
                  "col-span-2 w-full flex items-center truncate",
                  "max-tablet:col-start-2 tablet:justify-self-end tablet:justify-end",
                )}
                title={active.displayName}
              >
                <span className="truncate text-right">
                  {active.label.title}
                </span>
                {active.label.subtitle && (
                  <span className="shrink-0">, {active.label.subtitle}</span>
                )}
              </div>
              <div className="col-span-2 max-tablet:col-start-2">
                {formatCoordinates(active.longitude, active.latitude)}
              </div>
            </div>
          </div>

          {/* ── Row 2: Main solar clock ────────────────────────────────── */}
          <div
            className={cn(
              "w-full neue-grid relative tabular-nums tracking-tight justify-items-stretch",
              "tablet:max-laptop:px-16",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 justify-between font-semibold text-6xl w-full transition-smooth col-span-3",
                "tablet:col-span-6 tablet:gap-4 tablet:text-9xl ",
                "laptop:col-start-2",
                isExpanded && "text-6xl tablet:text-6xl",
              )}
              style={{
                fontFamily: `var(${font.class})`,
              }}
            >
              <span className="flex items-start gap-0.5">
                {/* Redundant. Makes sure the time display is always centered, even when in 12hr mode */}
                {hourFormat === "12" && (
                  <span
                    className={cn(
                      "max-tablet:hidden font-sans  not-italic text-nowrap transition-smooth-short pointer-events-none select-none opacity-0",
                      isExpanded ? "text-xs" : "text-sm",
                    )}
                  >
                    [ {parts?.period ?? "AM"} ]
                  </span>
                )}
                (
              </span>

              <div className="flex items-center justify-between w-full gap-1 tabular-nums">
                <span>{parts?.hh ?? "··"}</span>
                <span className="not-italic animate-pulse animation-duration-[1s]">
                  :
                </span>
                <span>{parts?.mm ?? "··"}</span>
                <span className="not-italic animate-pulse animation-duration-[1s]">
                  :
                </span>
                <span>{parts?.ss ?? "··"}</span>
              </div>

              <span className="flex items-start gap-0.5">
                <span>)</span>
                {hourFormat === "12" && (
                  <span
                    className={cn(
                      "max-tablet:absolute left-5 mini:left-8 font-sans  not-italic text-nowrap transition-smooth-short",
                      isExpanded ? "text-xs -top-1" : "text-sm top-5",
                      parts?.period
                        ? "opacity-100 translate-x-0"
                        : "opacity-0 -translate-x-1 pointer-events-none select-none w-0 overflow-hidden",
                    )}
                  >
                    [ {parts?.period ?? "AM"} ]
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* ── Row 3: Data panel ─────────────────────────────────────── */}
          <div
            className={cn(
              "w-full self-start no-scrollbar neue-grid overflow-y-auto transition-smooth",
              isFocus
                ? "opacity-0 pointer-events-none overflow-hidden"
                : "opacity-100",
              "max-tablet:gap-5 max-tablet:pb-4",
            )}
          >
            {/* Left col: EoT + sun position + moon (expanded) */}
            <div className="col-span-3 laptop:col-start-2 flex flex-col gap-1 max-tablet:order-2">
              {res?.equationOfTimeMinutes != null && (
                <DataRow
                  label="Equation of time"
                  value={`${res.equationOfTimeMinutes < 0 ? "−" : "+"}${formatDuration(Math.abs(res.equationOfTimeMinutes), "minutes")}`}
                />
              )}
              <div className="h-4" aria-hidden />
              <DataRow
                label="Azimuth"
                value={`${sunPos.azimuthDeg.toFixed(2)}°  ${sunPos.compassDirection}`}
              />
              <DataRow
                label="Altitude"
                value={`${sunPos.altitudeDeg >= 0 ? "↑" : "↓"} ${Math.abs(sunPos.altitudeDeg).toFixed(2)}°`}
              />
              <DataRow label="Sun phase" value={sunPhase} />
              {solarNoon && (
                <DataRow
                  label="Solar noon"
                  value={fmtEntry(solarNoon, hourFormat)}
                />
              )}

              {/* Expanded extras */}
              <div
                className={cn(
                  "flex flex-col gap-1 overflow-hidden transition-smooth",
                  isExpanded
                    ? "max-h-150 opacity-100 mt-1"
                    : "max-h-0 opacity-0",
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
                <div className="h-4" aria-hidden />
                <DataRow
                  label="Moon phase"
                  value={`${moonIllum.phaseName}  ${moonIllum.isWaxing ? "↑" : "↓"}  ${(moonIllum.fraction * 100).toFixed(0)}% lit`}
                />
                <DataRow
                  label="Moon azimuth"
                  value={`${moonPos.azimuthDeg.toFixed(2)}°  ${moonPos.compassDirection}`}
                />
                <DataRow
                  label="Moon altitude"
                  value={`${moonPos.isAboveHorizon ? "↑" : "↓"} ${Math.abs(moonPos.altitudeDeg).toFixed(2)}°`}
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

            {/* Right col: weather + solar events + twilight (expanded) */}
            <div className="col-span-3 flex flex-col gap-1">
              <WeatherDisplay
                weather={currentWeather}
                loading={weatherLoading}
                error={weatherError}
                onRetry={retryWeather}
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

              {/* Expanded twilight extras */}
              <div
                className={cn(
                  "flex flex-col gap-1 overflow-hidden transition-smooth",
                  isExpanded
                    ? "max-h-150 opacity-100 mt-1"
                    : "max-h-0 opacity-0",
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
                <div className="h-2" aria-hidden />
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// LocationTimeDisplay
// ---------------------------------------------------------------------------

/**
 * Ticking civil-time display for the active location.
 * Advances independently of the TST ticker via a 1-second `setInterval`.
 *
 * @param utcOffset - Timezone offset from UTC in seconds.
 */
function LocationTimeDisplay({ utcOffset }: { utcOffset: number }) {
  // const [, forceRender] = useState(0);
  // const {
  //   data: { hourFormat },
  // } = useUserPreferences();

  // useEffect(() => {
  //   const id = setInterval(() => forceRender((n) => n + 1), 1_000);
  //   return () => clearInterval(id);
  // }, []);

  // const ct = formatTime(nowDate(), utcOffset, hourFormat);
  // const offset = gmtLabel(utcOffset);
  // const timeStr = `${ct.hh} : ${ct.mm} : ${ct.ss}`;

  const {
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
          local: formatTime(nowDate(), utcOffset, hourFormat),
          offset: gmtLabel(utcOffset ?? 0),
        },
        hourFormat,
        true,
      )
    : null;

  return (
    <div
      className={cn(
        "neue-grid-small col-span-3",
        "tablet:col-span-2 tablet:grid-cols-2",
        "laptop:col-start-2",
      )}
    >
      <div className="tablet:justify-self-end">[ {time?.offset}</div>
      <span
        className={cn(
          "flex items-center gap-1 tabular-nums",
          "max-tablet:col-span-2",
        )}
        title="Local time"
      >
        <span className="mr-1">{time?.localTime}</span>
        <PeriodBadge period={time?.period} />
        <span>]</span>
      </span>
    </div>
  );
}
