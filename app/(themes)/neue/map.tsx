"use client";

/**
 * @file map/page.tsx
 * @description Interactive 3D globe for coordinate picking.
 *
 * Interaction model:
 * - **Desktop**: double-click anywhere on the globe to drop a pin.
 * - **Mobile**: long-press (≥ 300 ms, < 10 px movement) to drop a pin.
 *
 * Features:
 * - Globe/Mercator projection toggle
 * - Space/atmosphere background (dark = stars, light = sky)
 * - Double-click (desktop) or long-press (mobile) to drop a pin
 * - Pin card with live TST, place name, civil offset, set-as-active action
 * - Deselect pin via card × button
 * - "Go to home" toolbar button — flies to home and shows its card
 * - Fly-to on pin drop and on initial load if active/home exists
 * - Header rendered fixed over the map
 * - Active location pinned on initial load
 * - URL sync via useActiveUrlSync — pin coords reflected in route params
 *
 * On pin drop:
 * 1. Coordinates are extracted from the MapLibre event.
 * 2. The `geocode` server action resolves a place name + timezone.
 *    Falls back to `getTimezone` for ocean/unknown coordinates.
 * 3. A floating card shows the resolved name, coordinates, civil offset,
 *    and live TST for that location.
 * 4. "Set as active" pushes the location to {@link AppUIContext} and
 *    navigates back to the main page.
 *
 * Search params:
 * - `?lat=<n>&lon=<n>` — flies to and pins that location on load
 * - `?zoom=<n>`        — sets initial zoom level
 * - `?projection=globe|mercator` — sets initial projection
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { X, ChevronDownIcon } from "lucide-react";
import {
  computeTrueSolarTime,
  getSolarTimes,
  TrueSolarTimeResult,
} from "@/lib/astronomy";
import { nowDate } from "@/lib/ntp";
import { geocode } from "@/server/geocode";
import { getTimezone } from "@/server/timezone";
import {
  formatCoordinates,
  formatDate,
  formatDuration,
  formatTime,
  getWeatherIcon,
  gmtLabel,
  makeFallbackResult,
  precipSummary,
  secsToMins,
} from "@/utils";
import type { GeocodingResult } from "@/lib/geocoding";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import { useTimeFormat } from "@/app/(themes)/neue/contexts/time-format-context";
import Header, { MapHeader } from "@/app/(themes)/neue/components/header";
import { useActiveUrlSync } from "@/app/(themes)/neue/hooks/use-active-url-sync";
import { BOOT_STATUS_MESSAGES, DIST_THRESHOLD } from "@/types/consts";
import { LoadingUI } from "@/app/(themes)/neue/components/loading";
import logger from "@/utils/logger";
import { HomeControl } from "@/app/(themes)/neue/components/home-control";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner-2";
import { HourlyWeather, WeatherOptions } from "@/lib/weather";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/app/components/ui/collapsible";
import { Field } from "@/app/components/ui/field";
import { useWeather } from "@/app/hooks/use-weather";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
// Can replace map source by chaning `streets` to `openstreet`|`base`|`dataviz`|etc (per MapTiler maps)
// @see https://cloud.maptiler.com/maps
const MAPTILER_STYLE = `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`;

/** Long-press duration threshold in milliseconds. */
const LONG_PRESS_MS = 300;
/** Maximum pixel movement allowed during a long-press before it's treated as a drag. */
const LONG_PRESS_MOVE_THRESHOLD = 10;
const FLY_DURATION_MS = 1_800;

/**
 * NASA SVS public domain starfield image (4k, ~37KB JPEG).
 * @see https://svs.gsfc.nasa.gov/4856/
 */
const STARFIELD_URL =
  "https://i.pinimg.com/1200x/4f/b2/fd/4fb2fdb07c6b1d26ac49bb20a1ad3374.jpg";
// "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004856/starmap_random_2020_4k_print.jpg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectionType = "globe" | "mercator";

/**
 * A pinned location — either a full geocoding result or a coordinate-only
 * fallback when geocoding fails (ocean, unknown area).
 */
interface PinnedLocation {
  result: GeocodingResult;
  /** Whether geocoding is still in progress for this pin. */
  resolving: boolean;
  /** Live-ticking TST for this location, updated every second. */
  time: TrueSolarTimeResult;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-viewport 3D globe map page.
 *
 * MapLibre is mounted imperatively in a `useEffect` against a `div` ref.
 * All map state (marker, popup) is managed via refs rather than React state
 * to avoid re-renders interfering with the WebGL canvas.
 */
export default function MapPage() {
  // URL ↔ active sync (deep links, share URLs, search form updates)
  useActiveUrlSync();

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const { status, setActive, setHome, home, active } = useAppUI();
  const { hourFormat } = useTimeFormat();

  const weatherOptions: WeatherOptions = {
    timezone: active?.time?.timeZone,
    forecastDays: 1,
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const tstTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pinned, setPinned] = useState<PinnedLocation | null>(null);
  const projection =
    (searchParams.get("projection") as ProjectionType) ?? "globe";

  const { current: currentWeather, loading: weatherLoading } = useWeather(
    pinned?.result.latitude,
    pinned?.result.longitude,
    weatherOptions,
  );

  // -------------------------------------------------------------------------
  // Projection toggle — kept in sync with map instance
  // -------------------------------------------------------------------------

  const applyProjection = useCallback(
    (map: maplibregl.Map, type: ProjectionType) => {
      map.setProjection({ type } as maplibregl.ProjectionSpecification);
    },
    [],
  );

  useEffect(() => {
    if (!mapRef.current) return;
    applyProjection(mapRef.current, projection);
  }, [mapRef, projection]);

  // -------------------------------------------------------------------------
  // TST ticker for pinned location
  // -------------------------------------------------------------------------

  function startPinTicker(longitude: number) {
    if (tstTickerRef.current) clearInterval(tstTickerRef.current);
    tstTickerRef.current = setInterval(() => {
      const tst = computeTrueSolarTime(nowDate(), longitude);
      setPinned((prev) => (prev ? { ...prev, time: tst } : prev));
    }, 1_000);
  }

  // -------------------------------------------------------------------------
  // Place / reposition marker on map
  // -------------------------------------------------------------------------

  function placeMarker(map: maplibregl.Map, lng: number, lat: number) {
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current = new maplibregl.Marker({ color: "currentColor" })
        .setLngLat([lng, lat])
        .addTo(map);
    }

    // Build new params, preserving any non-location params (zoom, projection)
    const next = new URLSearchParams(searchParams.toString());
    next.set("lat", lat.toFixed(6));
    next.set("lon", lng.toFixed(6));

    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  /**
   * Smoothly cancels any ongoing map animation before starting a new one.
   *
   * @param center - Target [lng, lat]
   * @param zoom - Target zoom level
   */
  function safeFlyTo(
    map: maplibregl.Map,
    center: [number, number],
    zoom: number = 12,
  ) {
    // Stops current fly/zoom/pan animation
    map.stop();

    map.flyTo({
      center,
      zoom,
      duration: FLY_DURATION_MS,
      essential: true, // this animation is considered essential with respect to prefers-reduced-motion
    });
  }

  // -------------------------------------------------------------------------
  // Pin from full GeocodingResult (no geocode call needed)
  // Used for: home button, active location on load
  // -------------------------------------------------------------------------

  const pinFromResult = useCallback((result: GeocodingResult, fly = true) => {
    const map = mapRef.current;
    if (!map) return;
    logger.info("[from result - fly]", result.latitude, result.longitude);

    placeMarker(map, result.longitude, result.latitude);

    if (fly) {
      requestAnimationFrame(() => {
        safeFlyTo(map, [result.longitude, result.latitude]);
      });
    }

    if (tstTickerRef.current) clearInterval(tstTickerRef.current);

    const time = computeTrueSolarTime(nowDate(), result.longitude);
    setPinned({ result, resolving: false, time });
    startPinTicker(result.longitude);
  }, []);

  // -------------------------------------------------------------------------
  // Pin from coordinates (geocode required)
  // Used for: user double-click / long-press
  // -------------------------------------------------------------------------

  const pinFromCoords = useCallback(async (lngLat: maplibregl.LngLat) => {
    const { lat, lng } = lngLat;
    const map = mapRef.current;
    if (!map) return;

    placeMarker(map, lng, lat);

    requestAnimationFrame(() => {
      safeFlyTo(map, [lng, lat]);
    });

    if (tstTickerRef.current) clearInterval(tstTickerRef.current);

    // Show resolving state with a temp result so the card appears right away
    const tempResult = makeFallbackResult(lat, lng, undefined);
    const time = computeTrueSolarTime(nowDate(), lng);
    setPinned({ result: tempResult, resolving: true, time });
    startPinTicker(lng);

    // Geocode in background
    const geocodeResult = await geocode({ lat, lon: lng });
    let result: GeocodingResult;

    if ("success" in geocodeResult) {
      const time = await getTimezone(lat, lng);
      result = makeFallbackResult(lat, lng, time);
    } else {
      result = geocodeResult;
    }

    // Only update if this pin is still the current one
    setPinned((prev) =>
      prev && prev.result.latitude === lat && prev.result.longitude === lng
        ? { ...prev, result, resolving: false }
        : prev,
    );
  }, []);

  // -------------------------------------------------------------------------
  // Clear pin
  // -------------------------------------------------------------------------

  const clearPin = useCallback(() => {
    if (tstTickerRef.current) clearInterval(tstTickerRef.current);
    markerRef.current?.remove();
    markerRef.current = null;
    setPinned(null);

    // Reset params, preserving any non-location params (zoom, projection)
    const next = new URLSearchParams(searchParams.toString());
    next.delete("lat");
    next.delete("lon");

    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, []);

  // -------------------------------------------------------------------------
  // Go to home — uses full GeocodingResult, no refetch
  // -------------------------------------------------------------------------

  const handleGoHome = useCallback(() => {
    if (!home) return;
    if (
      pinned &&
      Math.abs(pinned.result.latitude - home.latitude) < DIST_THRESHOLD &&
      Math.abs(pinned.result.longitude - home.longitude) < DIST_THRESHOLD
    )
      return;
    pinFromResult(home, true);
  }, [home, pinFromResult]);

  // -------------------------------------------------------------------------
  // Map initialisation. Reacts to external active changes too (search form, URL params)
  // -------------------------------------------------------------------------

  const lastExternalActive = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    if (mapRef.current) return;
    if (!containerRef.current || mapRef.current) return;

    logger.info("[MAP Page - active]", active.name);

    const paramZoom = parseFloat(searchParams.get("zoom") ?? "");

    // Initial camera: prefer active location, then home, then world view
    // Coordinates from search params will be handles by `useActiveUrlSync`
    // The initialsed `active` location will become the seed
    const initialCenter: [number, number] = [active.longitude, active.latitude];

    const initialZoom = !isNaN(paramZoom) ? paramZoom : 1.5;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAPTILER_STYLE,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    // Built-in globe/mercator toggle — replaces custom toolbar button
    map.addControl(new maplibregl.GlobeControl(), "bottom-right");

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showZoom: true,
        showCompass: true,
      }),
      "bottom-right",
    );

    /**
     * Adds the custom Home control to the map.
     */
    const control = new HomeControl({
      onClick: handleGoHome,
      isActive: () => {
        if (!home) return false;

        const center = map.getCenter();

        return (
          Math.abs(center.lat - home.latitude) < DIST_THRESHOLD &&
          Math.abs(center.lng - home.longitude) < DIST_THRESHOLD
        );
      },
    });

    map.addControl(control, "bottom-right");

    map.doubleClickZoom.disable(); // Disables the "double click to zoom" interaction.

    map.on("style.load", () => {
      // Set projection after style loads
      applyProjection(map, projection);

      // Atmosphere — dark mode: deep space; light mode: sky blue
      const isDark = document.documentElement.classList.contains("dark");
      // Dark mode: deep space with visible atmosphere glow
      // Light mode: blue sky atmosphere that fades out as you zoom in
      map.setSky(
        isDark
          ? {
              "sky-color": "#010b19",
              "sky-horizon-blend": 0.5,
              "horizon-color": "#0a1a3a",
              "horizon-fog-blend": 0.8,
              "fog-color": "#0a1a3a",
              "atmosphere-blend": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0,
                1,
                5,
                1,
                7,
                0,
              ],
            }
          : {
              "sky-color": "#88C6FC",
              "sky-horizon-blend": 0.5,
              "horizon-color": "#d4eaf7",
              "horizon-fog-blend": 0.5,
              "fog-color": "#d4eaf7",
              "atmosphere-blend": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0,
                1,
                5,
                1,
                7,
                0,
              ],
            },
      );

      // Also set the container background so the space outside the globe matches
      // if (isDark) {
      //   map.getContainer().style.background = "#010b19";
      // }

      // Pin active location on initial load (no fly — we're already centered)

      // Skip if this is the pin we just dropped ourselves
      if (
        pinned &&
        !pinned.resolving &&
        Math.abs(pinned.result.latitude - active.latitude) < DIST_THRESHOLD &&
        Math.abs(pinned.result.longitude - active.longitude) < DIST_THRESHOLD
      )
        return;

      // Skip if we already reacted to this active value
      if (
        lastExternalActive.current &&
        Math.abs(lastExternalActive.current.lat - active.latitude) <
          DIST_THRESHOLD &&
        Math.abs(lastExternalActive.current.lon - active.longitude) <
          DIST_THRESHOLD
      )
        return;

      lastExternalActive.current = {
        lat: active.latitude,
        lon: active.longitude,
      };

      // Pin active location on initial load (no fly — we're already centered)
      pinFromResult(active, true);
    });

    // Desktop: double-click
    map.on("dblclick", (e) => {
      e.preventDefault(); // prevent default zoom-in on dblclick
      pinFromCoords(e.lngLat);
    });

    // Mobile: long-press to pin
    let touchStart: { x: number; y: number } | null = null;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    map.on("touchstart", (e) => {
      if (e.originalEvent.touches.length !== 1) return;
      const touch = e.originalEvent.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
      longPressTimer = setTimeout(() => {
        if (touchStart) pinFromCoords(e.lngLat);
      }, LONG_PRESS_MS);
    });

    map.on("touchmove", (e) => {
      if (!touchStart || !longPressTimer) return;
      const touch = e.originalEvent.touches[0];
      if (
        Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) >
        LONG_PRESS_MOVE_THRESHOLD
      ) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    map.on("touchend", () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      touchStart = null;
    });

    mapRef.current = map;
    logger.info("[MAP Page - END]");

    return () => {
      if (tstTickerRef.current) clearInterval(tstTickerRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // -------------------------------------------------------------------------
  // "Set as active" handler + navigate;
  // -------------------------------------------------------------------------

  function handleSetActive() {
    if (!pinned) return;
    setActive(pinned.result);
    router.push("/");
  }

  function handleSetHome() {
    if (!pinned) return;
    if (!home) return;
    // Skip if we already reacted to this active value
    if (
      pinned.result &&
      Math.abs(pinned.result.latitude - home.latitude) < DIST_THRESHOLD &&
      Math.abs(pinned.result.longitude - home.longitude) < DIST_THRESHOLD
    )
      return;
    setHome(pinned.result);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const notifications: string[] = useMemo(() => {
    const _msg: string[] = [];
    // 2 · Active location: civil time vs solar time (EoT at active location)
    if (pinned?.time && pinned.result?.time?.totalOffset != null) {
      const civilOffsetMin = secsToMins(pinned.result.time.totalOffset);
      const solarOffsetMin = pinned.time.totalOffsetMinutes;
      const diffMin = civilOffsetMin - solarOffsetMin;
      if (Math.abs(diffMin) >= 0.5) {
        const dir = diffMin > 0 ? "ahead of" : "behind";
        _msg.push(
          `The local time in ${pinned.result.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`,
        );
      }
    }

    return _msg;
  }, [pinned]);

  const parts = pinned?.time
    ? formatTime(pinned.time.trueSolarTime, 0, hourFormat)
    : null;

  /**Solar events for the active location */
  const times = pinned?.result
    ? getSolarTimes(nowDate(), pinned.result.latitude, pinned.result.longitude)
    : null;

  /**
   * Formats a solar event time in both solar and civil representations.
   * Returns `undefined` if the date is null (polar day/night).
   */
  const makeSolarEntry = (date?: Date | null) => {
    if (!date) return undefined;
    if (!pinned?.result) return undefined;
    const computed = computeTrueSolarTime(date, pinned.result.longitude);
    return {
      solar: formatTime(computed.trueSolarTime, 0, hourFormat),
      local: formatTime(date, pinned.result.time?.totalOffset, hourFormat),
      offset: gmtLabel(pinned.result.time?.totalOffset),
    };
  };

  const sunrise = makeSolarEntry(times?.sunrise);
  const sunset = makeSolarEntry(times?.sunset);
  const daytime = formatDuration(times?.daylightMinutes ?? 0, "minutes");

  const isDark = true;
  // typeof document !== "undefined" &&
  // document.documentElement.classList.contains("dark");

  if (status !== "ready" || !active)
    return <LoadingUI message={BOOT_STATUS_MESSAGES[status]} />;

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={
        isDark
          ? {
              backgroundImage: `url(${STARFIELD_URL})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : {}
      }
    >
      {/* Header floats over the map */}
      <div className="absolute top-0 left-0 right-0 z-10 ">
        <MapHeader />
      </div>

      {/* MapLibre canvas — transparent bg so starfield shows through */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Toolbar */}
      <div className="absolute top-[calc(var(--header-height)+--spacing(2))] left-4 z-10 flex flex-col gap-1">
        {/* {home && (
          <button
            onClick={handleGoHome}
            className="w-8 h-8 bg-background/90 border border-border flex items-center justify-center hover:bg-muted"
            title={`Fly to ${home.label.title}`}
          >
            <Home size={14} />
          </button>
        )} */}
        {/* <PinnedDrawer {...{ pinned }} /> */}
      </div>

      {/* Pin card */}
      {pinned && (
        <div className="flex flex-col gap-4 absolute top-[calc(var(--header-height)+--spacing(2))] left-5 z-10">
          <Card size="sm" className="mx-auto w-xs rounded-sm">
            <CardHeader className="border-b gap-0">
              <CardTitle
                className="group-data-[size=sm]/card:text-md"
                title={pinned.result.displayName}
              >
                {pinned.resolving ? (
                  <div className="flex items-center gap-1 opacity-60">
                    <Spinner size={14} />
                    <span>Resolving...</span>
                  </div>
                ) : (
                  pinned.result.label.title
                )}
              </CardTitle>
              <CardDescription>
                {!pinned.resolving && pinned.result.label.subtitle && (
                  <div>{pinned.result.label.subtitle}</div>
                )}
                <div className="text-xs opacity-80">
                  {formatCoordinates(
                    pinned.result.longitude,
                    pinned.result.latitude,
                  )}
                </div>
              </CardDescription>
              <CardAction className="relative">
                <Button
                  onClick={clearPin}
                  size={"icon-sm"}
                  variant={"ghost"}
                  title="Deselect"
                  aria-label="Deselect pin"
                  className="rounded-full absolute -top-0.5 -right-0.5 "
                >
                  <X />
                </Button>{" "}
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-col gap-1 pb-2">
                <div className="neue-grid-mini items-baseline tabular-nums font-serif italic text-3xl font-medium">
                  <div className="col-span-3 flex items-center justify-between w-full gap-1">
                    <span>( {parts?.hh ?? "··"}</span>
                    <span className="not-italic animate-pulse">:</span>
                    <span>{parts?.mm ?? "··"}</span>
                    <span className="not-italic animate-pulse">:</span>
                    <span>{parts?.ss ?? "··"} )</span>
                  </div>
                  {hourFormat === "12" && parts?.period && (
                    <span className="flex items-start font-sans text-sm font-medium not-italic text-nowrap ">
                      [ {parts.period} ]
                    </span>
                  )}
                </div>

                {/* Civil offset */}
                {!pinned.resolving && pinned.result.time && (
                  <div className="neue-grid-mini opacity-60 text-xs">
                    <LocationTimeDisplay
                      utcOffset={pinned.result.time.totalOffset}
                    />
                  </div>
                )}
              </div>

              <WeatherDisplay
                weather={currentWeather}
                loading={weatherLoading}
                options={weatherOptions}
              />

              <div className="flex flex-col gap-1 text-xs">
                <div className="neue-grid-mini">
                  <div className="opacity-60">Date</div>
                  <div className="col-span-3">
                    {formatDate(pinned.time.trueSolarTime)}
                  </div>
                </div>

                {!pinned.resolving && (
                  <>
                    <SolarEventRow
                      label="Sunrise"
                      entry={sunrise}
                      hourFormat={hourFormat}
                    />
                    <SolarEventRow
                      label="Sunset"
                      entry={sunset}
                      hourFormat={hourFormat}
                    />
                    <div className="neue-grid-mini">
                      <div className="opacity-60">Daytime</div>
                      <div className="col-span-3">{daytime}</div>
                    </div>{" "}
                  </>
                )}
              </div>
            </CardContent>
            <CardFooter className="group-data-[size=sm]/card:py-1">
              {/* Action */}
              <div className="flex items-center gap-4">
                <Button
                  onClick={handleSetActive}
                  disabled={pinned.resolving}
                  variant={"link"}
                  size={"sm"}
                  className="p-0 text-xs"
                >
                  View in main
                </Button>
                <Button
                  onClick={handleSetHome}
                  disabled={pinned.resolving}
                  variant={"link"}
                  size={"sm"}
                  className="p-0 text-xs"
                >
                  Set as home
                </Button>
                <Button
                  onClick={() => {
                    if (!mapRef.current) return;
                    safeFlyTo(mapRef.current, [
                      pinned.result.longitude,
                      pinned.result.latitude,
                    ]);
                  }}
                  disabled={pinned.resolving || mapRef.current?.isMoving()}
                  variant={"link"}
                  size={"sm"}
                  className="p-0 text-xs"
                >
                  Fly to location
                </Button>
              </div>
            </CardFooter>
          </Card>

          {notifications.length > 0 && (
            <Card size="sm" className="mx-auto w-xs rounded-sm">
              <CardContent>
                <ul className="flex flex-col gap-1">
                  {notifications.map((msg, i) => (
                    <li key={i} className="flex gap-1">
                      <span className="font-mono">[•]</span>
                      {/* <span className="font-mono">[→]</span> */}
                      <span>{msg}</span>
                    </li>

                    // <span key={i}>[x] {msg}</span>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Pin card */}
    </div>
  );
}

/**
 * Ticking civil-time display for the active location.
 * Advances independently of the TST ticker via a 1-second interval.
 */
function LocationTimeDisplay({
  utcOffset,
}: {
  /**Timezone offset from UTC */
  utcOffset: number;
}) {
  const [, forceRender] = useState(0);
  const { hourFormat } = useTimeFormat();

  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const ct = formatTime(nowDate(), utcOffset, hourFormat);
  const offset = gmtLabel(utcOffset);

  const timeStr = `${ct.hh} : ${ct.mm} : ${ct.ss} ${hourFormat === "12" ? ct.period : ""}`;

  return (
    <>
      <span className="">Local</span>
      <span className="">[ {offset}</span>
      <span className="tabular-nums col-span-2">{timeStr} ]</span>
    </>
  );
}

/**
 * Renders a single solar event row (sunrise or sunset) showing both the
 * solar time and the corresponding civil local time.
 */
function SolarEventRow({
  label,
  entry,
  hourFormat,
}: {
  label: string;
  entry?: SolarEventEntry;
  hourFormat: HourFormat;
}) {
  if (!entry) return null;

  const fmt = (t: FormattedTime) =>
    `${t.hh} : ${t.mm} ${hourFormat === "12" ? t.period : ""} `;

  return (
    <div className="neue-grid-mini">
      <div className="opacity-60">{label}</div>
      <div className="tabular-nums col-span-3">{fmt(entry.solar)} TST</div>
    </div>
  );
}

/**
 * Displays current-hour weather conditions for the active location.
 * Renders inline in the location row — temperature and a short description.
 * Shows nothing while loading or if weather is unavailable.
 */
// WeatherDisplay props
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
      <div className="neue-grid-mini text-xs">
        <div className="opacity-60">Conditions</div>
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
    <div className="neue-grid-mini text-xs">
      <div className="opacity-60">Conditions</div>
      <div className="col-span-3 tabular-nums flex flex-col gap-0.5">
        <span className="flex items-center gap-1">
          <span>{weather.weatherDescription}</span>
          <Icon size={16} />
        </span>
        {precipitation && <span className="opacity-80">{precipitation}</span>}
        <span className="tabular-nums">
          {Math.round(weather.temperature)}
          {unitSymbol}
        </span>
      </div>
    </div>
  );
}
