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
 *
 * **Mobile architecture**
 * - `MapMobileHeader` removed from `mobile-header.tsx` — the map page owns
 *   its own UI. On mobile, `MapHeader` renders logo-only (map controls
 *   are placed top-right by MapLibre). A persistent bottom `Drawer`
 *   (`MapSearchDrawer`) handles search, recently accessed, and home navigation.
 * - Pin info rendered in a `NestedDrawer` (`PinDrawer`) that sits above the
 *   persistent drawer. Opening the pin drawer collapses the search drawer to
 *   its smallest snap point. Closing it clears the pin.
 * - The nested drawer always starts at the half snap point.
 * - `z-index` fix: `PinDrawer` uses `style={{ zIndex: 60 }}` on the content
 *   so it reliably renders above the persistent drawer.
 *
 * **Recently accessed (mobile)**
 * - Last 5 locations stored in `localStorage` under `"neue:data"`.
 * - Shown in the persistent search drawer between search and home.
 * - Tapping an entry pins that location immediately (no geocode needed).
 *
 * **Sky gradient**
 * - The time block in the pin drawer uses the same `useSkyGradient` logic
 *   as the main page.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { X } from "lucide-react";
import {
  computeTrueSolarTime,
  getMoonIllumination,
  getMoonPosition,
  getSolarTimes,
  getSunPosition,
  MoonIllumination,
  MoonPosition,
  SunPosition,
  type TrueSolarTimeResult,
} from "@/lib/astronomy";
import { nowDate } from "@/lib/ntp";
import { geocode } from "@/server/geocode";
import { getTimezone } from "@/server/timezone";
import {
  fmtEntry,
  formatCoordinates,
  formatDate,
  formatDuration,
  FormattedEntry,
  formatTime,
  gmtLabel,
  makeFallbackResult,
  secsToMins,
} from "@/utils";
import type { GeocodingResult } from "@/lib/geocoding";
import { MapHeader } from "@/app/(themes)/neue/components/header";
import { useActiveUrlSync } from "@/app/(themes)/neue/hooks/use-active-url-sync";
import { DIST_THRESHOLD, MAX_RECENT, SOCIALS } from "@/types/consts";
import {
  LoadingContained,
  LoadingUI,
} from "@/app/(themes)/neue/components/loading";
import logger from "@/utils/logger";
import { HomeControl } from "@/app/(themes)/neue/utils/home-control";
import { Button } from "@/app/components/ui/button";
import { Spinner } from "@/app/components/ui/spinner-2";
import type { HourlyWeather, WeatherOptions } from "@/lib/weather";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { useWeather } from "@/app/hooks/use-weather";
import { useMediaQueries } from "@/app/hooks/use-mobile-query";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  NestedDrawer,
} from "@/app/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  PeriodBadge,
  WeatherDisplayCompact,
  SectionLabel,
  DrawerListItem,
  NotificationList,
  WeatherDisplay,
  DataRow,
} from "@/app/(themes)/neue/components/shared-ui";
import { Separator } from "@/app/components/ui/separator";
import Link from "next/link";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/app/components/ui/input-group";
import { SearchIcon, ChevronsUpDown } from "lucide-react";
import { FieldGroup, Field, FieldLabel } from "@/app/components/ui/field";
import { Input } from "@/app/components/ui/input";
import { useGeocode } from "@/app/hooks/use-geocode";
import {
  SkyCanvas,
  useSkyGradient as useSkyGradientv2,
} from "@/app/(themes)/neue/hooks/use-sky-gradient-v2";
import { OptionsDrawerContent } from "@/app/(themes)/neue/components/options";
import { useGlobal } from "@/app/contexts/global-provider";
import { useNeue } from "@/app/(themes)/neue/contexts/ui-context";

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
const STARFIELD_URL =
  "https://i.pinimg.com/1200x/4f/b2/fd/4fb2fdb07c6b1d26ac49bb20a1ad3374.jpg";

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

// Snap points for the persistent search drawer
const SEARCH_SNAPS = [0.25, 0.55, 1] as const;
type SearchSnap = (typeof SEARCH_SNAPS)[number] | number | string | null;

// Snap points for the pin info drawer
const PIN_SNAPS = [0.3, 0.55, 1] as const;
type PinSnap = (typeof PIN_SNAPS)[number] | number | string | null;

// ---------------------------------------------------------------------------
// MapPage
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

  const {
    status,
    setActive,
    setHome,
    home,
    active,
    store: {
      data: { recents, hourFormat, solarMode },
      update,
    },
  } = useGlobal();

  const { isMini, isMobile } = useMediaQueries();

  // Search drawer state (mobile only)
  const [searchSnap, setSearchSnap] = useState<SearchSnap>(SEARCH_SNAPS[0]);

  // Pin drawer state (mobile only)
  const [pinSnap, setPinSnap] = useState<PinSnap>(PIN_SNAPS[0]);

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

  const {
    current: currentWeather,
    loading: weatherLoading,
    error: weatherError,
    refresh: retryWeather,
  } = useWeather(
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
      setPinned((prev) =>
        prev
          ? { ...prev, time: computeTrueSolarTime(nowDate(), longitude) }
          : prev,
      );
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
  function safeFlyTo(map: maplibregl.Map, center: [number, number], zoom = 12) {
    map.stop();
    map.flyTo({ center, zoom, duration: FLY_DURATION_MS, essential: true });
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

    // Collapse search drawer, open pin drawer at half snap
    setSearchSnap(SEARCH_SNAPS[0]);
    setPinSnap(PIN_SNAPS[1]);

    // Save to recent (only fully resolved results)
    if (!("success" in result)) {
      const prev = recents.filter(
        (r) =>
          !(
            Math.abs(r.latitude - result.latitude) < 0.01 &&
            Math.abs(r.longitude - result.longitude) < 0.01
          ),
      );
      update({ recents: [result, ...prev].slice(0, MAX_RECENT) });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Collapse search drawer, open pin drawer at half snap
    setSearchSnap(SEARCH_SNAPS[0]);
    setPinSnap(PIN_SNAPS[1]);

    // Geocode in background
    const geocodeResult = await geocode({ lat, lon: lng });
    let result: GeocodingResult;

    if ("success" in geocodeResult) {
      const time = await getTimezone(lat, lng);
      result = makeFallbackResult(lat, lng, time);
    } else {
      result = geocodeResult;

      const prev = recents.filter(
        (r) =>
          !(
            Math.abs(r.latitude - result.latitude) < 0.01 &&
            Math.abs(r.longitude - result.longitude) < 0.01
          ),
      );
      update({ recents: [result, ...prev].slice(0, MAX_RECENT) });
    }

    // Only update if this pin is still the current one
    setPinned((prev) =>
      prev && prev.result.latitude === lat && prev.result.longitude === lng
        ? { ...prev, result, resolving: false }
        : prev,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [home, pinFromResult, pinned]);

  // -------------------------------------------------------------------------
  // Map initialisation. Reacts to external active changes too (search form, URL params)
  // -------------------------------------------------------------------------

  const lastExternalActive = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!active || mapRef.current || !containerRef.current) return;

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
    map.addControl(
      new maplibregl.GlobeControl(),
      isMobile ? "top-right" : "bottom-right",
    );

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showZoom: true,
        showCompass: true,
      }),
      isMobile ? "top-right" : "bottom-right",
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

    map.addControl(control, isMobile ? "top-right" : "bottom-right");

    map.doubleClickZoom.disable(); // Disables the "double click to zoom" interaction.

    map.on("style.load", () => {
      // Set projection after style loads
      applyProjection(map, projection);
      // Sky atmosphere
      map.setSky({
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
      });

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

    return () => {
      if (tstTickerRef.current) clearInterval(tstTickerRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [active, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (status !== "ready" || !active)
    return (
      <LoadingUI message={{ description: "Getting everything ready..." }} />
    );

  return (
    <div
      className="relative w-full h-screen overflow-clip"
      style={{
        backgroundImage: `url(${STARFIELD_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Header — absolute top */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <MapHeader />
      </div>

      {/* Map canvas */}
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Desktop: pin card ──────────────────────────────────────────── */}
      {pinned && !isMobile && !isMini && (
        <DesktopPinCard
          pinned={pinned}
          currentWeather={currentWeather}
          weatherLoading={weatherLoading}
          weatherError={weatherError}
          retryWeather={retryWeather}
          weatherOptions={weatherOptions}
          hourFormat={hourFormat}
          solarMode={solarMode}
          clearPin={clearPin}
          handleSetActive={handleSetActive}
          handleSetHome={handleSetHome}
          mapRef={mapRef}
          safeFlyTo={safeFlyTo}
        />
      )}

      {/* Toolbar */}
      <div className="absolute">
        {/* ── Mobile: persistent search drawer ──────────────────────────── */}
        {(isMobile || isMini) && (
          <Drawer
            open
            snapPoints={[...SEARCH_SNAPS]}
            activeSnapPoint={searchSnap}
            setActiveSnapPoint={setSearchSnap}
            direction="bottom"
            modal={false}
            dismissible={false}
          >
            <MapSearchDrawer
              recent={recents}
              onSelectRecent={(loc) => pinFromResult(loc, true)}
              home={home ?? null}
              onSelectHome={handleGoHome}
            />
          </Drawer>
        )}

        {/* ── Mobile: pin info drawer (nested above search) ──────────────── */}
        {(isMobile || isMini) && pinned && (
          <NestedDrawer
            open
            snapPoints={[...PIN_SNAPS]}
            activeSnapPoint={pinSnap}
            setActiveSnapPoint={setPinSnap}
            direction="bottom"
            modal={false}
          >
            <MobilePinDrawer
              pinned={pinned}
              hourFormat={hourFormat}
              solarMode={solarMode}
              currentWeather={currentWeather}
              weatherLoading={weatherLoading}
              weatherError={weatherError}
              retryWeather={retryWeather}
              weatherOptions={weatherOptions}
              clearPin={clearPin}
              handleSetActive={handleSetActive}
              handleSetHome={handleSetHome}
              mapRef={mapRef}
              safeFlyTo={safeFlyTo}
            />
          </NestedDrawer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DesktopPinCard
// ---------------------------------------------------------------------------

interface PinCardProps {
  pinned: PinnedLocation;
  currentWeather: HourlyWeather | null;
  weatherLoading: boolean;
  weatherError: string | null;
  retryWeather: () => void;
  weatherOptions: WeatherOptions;
  hourFormat: HourFormat;
  solarMode: string;
  clearPin: () => void;
  handleSetActive: () => void;
  handleSetHome: () => void;
  mapRef: React.RefObject<maplibregl.Map | null>;
  safeFlyTo: (
    map: maplibregl.Map,
    center: [number, number],
    zoom?: number,
  ) => void;
}

function DesktopPinCard({
  pinned,
  currentWeather,
  weatherLoading,
  weatherError,
  retryWeather,
  weatherOptions,
  hourFormat,
  solarMode,
  clearPin,
  handleSetActive,
  handleSetHome,
  mapRef,
  safeFlyTo,
}: PinCardProps) {
  const solarTimes = getSolarTimes(
    nowDate(),
    pinned.result.latitude,
    pinned.result.longitude,
  );


  const makeSolarEntry = (date?: Date | null) => {
    if (!date) return undefined;
    const c = computeTrueSolarTime(date, pinned.result.longitude);
    return {
      solar: formatTime(c.trueSolarTime, 0, hourFormat),
      local: formatTime(date, pinned.result.time?.totalOffset, hourFormat),
      offset: gmtLabel(pinned.result.time?.totalOffset),
    };
  };

  const sunrise = makeSolarEntry(solarTimes.sunrise);
  const sunset = makeSolarEntry(solarTimes.sunset);
  const daytime = formatDuration(solarTimes.daylightMinutes ?? 0, "minutes");

  // Notification: civil vs solar offset for this pin
  const notification = useMemo(() => {
    if (!pinned.time || pinned.result?.time?.totalOffset == null) return null;
    const diffMin =
      secsToMins(pinned.result.time.totalOffset) -
      pinned.time.totalOffsetMinutes;
    if (Math.abs(diffMin) < 0.5) return null;
    const dir = diffMin > 0 ? "ahead of" : "behind";
    return `Local time in ${pinned.result.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`;
  }, [pinned]);

  return (
    <div className="absolute top-[calc(var(--header-height)+1rem)] left-5 z-10 flex flex-col gap-3">
      <Card size="sm" className="w-xs rounded-sm">
        <CardHeader className="border-b gap-0">
          <CardTitle
            className="group-data-[size=sm]/card:text-md"
            title={pinned.result.displayName}
          >
            {pinned.resolving ? (
              <span className="flex items-center gap-1 opacity-60">
                <Spinner size={14} /> Resolving…
              </span>
            ) : (
              pinned.result.label.title
            )}
          </CardTitle>
          <CardDescription>
            {!pinned.resolving && pinned.result.label.subtitle && (
              <div>{pinned.result.label.subtitle}</div>
            )}
            <div className="text-xs opacity-70">
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
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          {/* Time */}
          <TimeBlock {...{ currentWeather, hourFormat, pinned, solarMode }} />

          {/* Weather */}
          <WeatherDisplay
            weather={currentWeather}
            loading={weatherLoading}
            error={weatherError}
            onRetry={retryWeather}
            options={weatherOptions}
          />

          {/* Solar events */}
          {!pinned.resolving && (
            <div className="flex flex-col gap-1 text-xs">
              {sunrise && (
                <DataRow
                  label="Sunrise"
                  value={fmtEntry(sunrise, hourFormat)}
                />
              )}
              {sunset && (
                <DataRow label="Sunset" value={fmtEntry(sunset, hourFormat)} />
              )}
              <DataRow label="Daytime" value={daytime} />
            </div>
          )}
        </CardContent>

        <CardFooter className="group-data-[size=sm]/card:py-1">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={handleSetActive}
              disabled={pinned.resolving}
              variant="link"
              size="sm"
              className="p-0 text-xs"
            >
              View in main
            </Button>
            <Button
              onClick={handleSetHome}
              disabled={pinned.resolving}
              variant="link"
              size="sm"
              className="p-0 text-xs"
            >
              Set as home
            </Button>
            <Button
              onClick={() =>
                mapRef.current &&
                safeFlyTo(mapRef.current, [
                  pinned.result.longitude,
                  pinned.result.latitude,
                ])
              }
              disabled={pinned.resolving}
              variant="link"
              size="sm"
              className="p-0 text-xs"
            >
              Fly to
            </Button>
          </div>
        </CardFooter>
      </Card>

      {notification && (
        <Card size="sm" className="w-xs rounded-sm">
          <CardContent>
            <div className="flex gap-1 text-xs">
              <span className="font-mono opacity-40">[•]</span>
              <span>{notification}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobilePinDrawer
// ---------------------------------------------------------------------------

function MobilePinDrawer({
  pinned,
  hourFormat,
  solarMode,
  currentWeather,
  weatherLoading,
  weatherError,
  retryWeather,
  weatherOptions,
  clearPin,
  handleSetActive,
  handleSetHome,
  mapRef,
  safeFlyTo,
}: PinCardProps) {

  const solarTimes = pinned.resolving
    ? null
    : getSolarTimes(nowDate(), pinned.result.latitude, pinned.result.longitude);

  const makeSolarEntry = (date?: Date | null) => {
    if (!date || !pinned.result) return undefined;
    const c = computeTrueSolarTime(date, pinned.result.longitude);
    return {
      solar: formatTime(c.trueSolarTime, 0, hourFormat),
      local: formatTime(date, pinned.result.time?.totalOffset, hourFormat),
      offset: gmtLabel(pinned.result.time?.totalOffset),
    };
  };

  const sunrise = makeSolarEntry(solarTimes?.sunrise);
  const sunset = makeSolarEntry(solarTimes?.sunset);
  const daytime = formatDuration(solarTimes?.daylightMinutes ?? 0, "minutes");

  // Notification: civil vs solar offset for this pin
  const notification = useMemo(() => {
    if (!pinned.time || pinned.result?.time?.totalOffset == null) return null;
    const diffMin =
      secsToMins(pinned.result.time.totalOffset) -
      pinned.time.totalOffsetMinutes;
    if (Math.abs(diffMin) < 0.5) return null;
    const dir = diffMin > 0 ? "ahead of" : "behind";
    return `Local time in ${pinned.result.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`;
  }, [pinned]);

  return (
    <DrawerContent
      // z-index higher than the persistent search drawer (z-50)
      style={{ zIndex: 60 }}
      className="data-[vaul-drawer-direction=bottom]:max-h-[95%] data-[vaul-drawer-direction=bottom]:h-dvh"
    >
      <DrawerHeader className="border-b border-border/40 py-2 gap-1 items-start w-full px-5">
        <DrawerTitle className="flex gap-2 justify-between w-full text-xl!">
          {pinned.resolving ? (
            <div className="flex items-center gap-1 opacity-60">
              <Spinner size={14} />
              <span>Resolving...</span>
            </div>
          ) : (
            pinned.result.label.title
          )}

          <DrawerClose asChild>
            <Button
              onClick={clearPin}
              size={"icon-sm"}
              variant={"ghost"}
              title="Deselect"
              aria-label="Deselect pin"
              className="rounded-full border bg-muted/40 "
            >
              <X />
            </Button>
          </DrawerClose>
        </DrawerTitle>
        {!pinned.resolving && pinned.result.label.subtitle && (
          <span className="truncate opacity-80">
            {pinned.result.label.subtitle}
          </span>
        )}
        <span className="text-xs opacity-80">
          {formatCoordinates(pinned.result.longitude, pinned.result.latitude)}
        </span>

        <div className="flex items-center w-full justify-between gap-2 py-2">
          <Button
            // size={"sm"}
            onClick={handleSetActive}
            disabled={pinned.resolving}
            className="flex-1"
          >
            View in main
          </Button>
          <Button
            variant={"secondary"}
            // size={"sm"}
            onClick={handleSetHome}
            disabled={pinned.resolving}
            className="flex-1"
          >
            Set as home
          </Button>
          <Button
            variant={"secondary"}
            // size={"sm"}
            onClick={() => {
              if (!mapRef.current) return;
              safeFlyTo(mapRef.current, [
                pinned.result.longitude,
                pinned.result.latitude,
              ]);
            }}
            disabled={pinned.resolving || mapRef.current?.isMoving()}
            className="flex-1"
          >
            Fly to location
          </Button>
        </div>
      </DrawerHeader>

      <div className="overflow-y-auto no-scrollbar px-5 flex flex-col gap-5 py-4 pb-10">
        {/* Time block with sky gradient */}
        <TimeBlock {...{ currentWeather, hourFormat, pinned, solarMode }} />

        {pinned.resolving ? (
          <LoadingContained />
        ) : (
          <>
            {/* Weather */}
            <section className="flex flex-col gap-2">
              <SectionLabel>Conditions</SectionLabel>
              <div className="rounded-sm border border-border/40 bg-muted p-4">
                <WeatherDisplayCompact
                  weather={currentWeather}
                  loading={weatherLoading}
                  error={weatherError}
                  onRetry={retryWeather}
                  options={weatherOptions}
                />
              </div>
            </section>

            {/* Solar events */}
            <section className="flex flex-col gap-2">
              <SectionLabel>Solar Events</SectionLabel>
              <div className="flex flex-col rounded-sm border border-border/40 bg-muted overflow-hidden">
                {sunrise && (
                  <MobileDataRow
                    label="Sunrise"
                    value={fmtEntry(sunrise, hourFormat)}
                  />
                )}
                <Separator />
                {sunset && (
                  <MobileDataRow
                    label="Sunset"
                    value={fmtEntry(sunset, hourFormat)}
                  />
                )}
                <Separator />
                <MobileDataRow label="Daytime" value={daytime} />
              </div>
            </section>

            {/* Notifications — visible at half snap */}
            {notification && (
              <section className={cn("flex flex-col gap-2 transition-smooth")}>
                <SectionLabel>FYI</SectionLabel>
                <NotificationList items={[notification]} />
              </section>
            )}
          </>
        )}
      </div>
    </DrawerContent>
  );
}

// ---------------------------------------------------------------------------
// MapSearchDrawer (persistent mobile bottom drawer)
// ---------------------------------------------------------------------------

function MapSearchDrawer({
  recent,
  onSelectRecent,
  home,
  onSelectHome,
}: {
  recent: GeocodingResult[];
  onSelectRecent: (loc: GeocodingResult) => void;
  home: GeocodingResult | null;
  onSelectHome: () => void;
}) {
  const { setActive } = useGlobal();
  const [searchMode, setSearchMode] = useState<"forward" | "reverse">(
    "forward",
  );
  const [query, setQuery] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const { search, reverse, loading, error, reset } = useGeocode();

  async function handleForwardSearch() {
    if (!query.trim()) return;
    const result = await search(query.trim());
    if (result) {
      setActive(result);
      reset();
      setQuery("");
      onSelectRecent(result);
    }
  }

  async function handleReverseSearch() {
    const latN = parseFloat(lat),
      lonN = parseFloat(lon);
    if (isNaN(latN) || isNaN(lonN)) return;
    const result = await reverse(latN, lonN);
    if (result) {
      setActive(result);
      reset();
      setLat("");
      setLon("");
      onSelectRecent(result);
    }
  }

  function toggleSearchMode() {
    setSearchMode((m) => (m === "forward" ? "reverse" : "forward"));
    reset();
    setQuery("");
    setLat("");
    setLon("");
  }

  return (
    <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[97%] data-[vaul-drawer-direction=bottom]:h-dvh">
      <DrawerHeader className="border-b border-border/40 pt-0 items-start gap-0 px-5">
        <div className="grid grid-cols-[1fr_3fr_1fr] gap-1 w-full py-2.5">
          <span /> {/* no close — this drawer is persistent */}
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

        {/* Forward */}
        <div
          className={cn(
            "w-full overflow-hidden transition-smooth",
            searchMode === "forward"
              ? "max-h-16 opacity-100"
              : "max-h-0 opacity-0 pointer-events-none",
          )}
        >
          <InputGroup className="has-[data-slot=input-group-control]:outline-0 h-11 rounded-lg">
            <InputGroupInput
              type="text"
              placeholder="e.g. Shibuya, Tokyo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleForwardSearch()}
            />
            <InputGroupAddon align="inline-start">
              <SearchIcon className="text-muted-foreground size-4" />
            </InputGroupAddon>
          </InputGroup>
        </div>

        {/* Reverse */}
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
                  id: "lat2",
                  label: "Latitude",
                  value: lat,
                  set: setLat,
                  placeholder: "35.6768…",
                  min: -90,
                  max: 90,
                },
                {
                  id: "lon2",
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
                  onKeyDown={(e) => e.key === "Enter" && handleReverseSearch()}
                  className="h-11 rounded-lg outline-0 focus-visible:ring-0"
                />
              </Field>
            ))}
          </FieldGroup>
        </div>
        {error && (
          <p className="text-destructive text-xs pt-1 opacity-80">{error}</p>
        )}
      </DrawerHeader>

      <div className="overflow-y-auto no-scrollbar px-5 flex flex-col gap-4 py-3 pb-6">
        {/* Recently accessed */}
        {recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionLabel>Recent</SectionLabel>
            <div className="flex flex-col rounded-sm border border-border/40 overflow-hidden">
              {recent.map((loc, i) => (
                <button
                  key={`${loc.latitude}${loc.longitude}`}
                  onClick={() => onSelectRecent(loc)}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 text-sm w-full text-left",
                    "bg-muted hover:bg-muted/60 transition-colors",
                    i < recent.length - 1 && "border-b border-border/60",
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

        {/* Go home */}
        {home && (
          <section className="flex flex-col gap-2">
            <SectionLabel>Home</SectionLabel>
            <button
              onClick={onSelectHome}
              className="flex items-center justify-between px-4 py-3 text-sm rounded-sm bg-muted border border-border/40 w-full text-left"
            >
              <span className="font-medium truncate">{home.label.title}</span>
              <span className="text-xs opacity-50 shrink-0 ml-2">
                {home.label.subtitle}
              </span>
            </button>
          </section>
        )}

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
            <DrawerListItem href="/about" isLast>
              About
            </DrawerListItem>
          </nav>
        </section>

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

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function CivilTimeRow({
  utcOffset,
  hourFormat,
  className,
}: {
  utcOffset: number;
  hourFormat: HourFormat;
  className?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);
  const ct = formatTime(nowDate(), utcOffset, hourFormat);
  const offset = gmtLabel(utcOffset);
  return (
    <div
      className={cn(
        "flex items-center gap-1 tabular-nums opacity-70",
        className,
      )}
    >
      <span>[ {offset} →</span>
      <span>
        {ct.hh} : {ct.mm} : {ct.ss}
      </span>
      <PeriodBadge period={ct.period} />
      <span>]</span>
    </div>
  );
}

export function MobileDataRow({
  label,
  value,
}: {
  label: string;
  value: string | FormattedEntry;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 w-full">
      <div className="text-xs uppercase opacity-50">{label}</div>
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
      </div>{" "}
    </div>
  );
}

function TimeBlock({
  pinned,
  currentWeather,
  hourFormat,
  solarMode,
}: {
  pinned: PinnedLocation;
  currentWeather: HourlyWeather | null;
  hourFormat: HourFormat;
  solarMode: string;
}) {
  const {
    prefs: {
      data: { font },
    },
  } = useNeue();

  const parts = formatTime(
    solarMode === "TST" ? pinned.time.trueSolarTime : pinned.time.meanSolarTime,
    0,
    hourFormat,
  );
  /** Current sun position (altitude, azimuth, distance, etc.). */
  const sunPos: SunPosition = getSunPosition(
    nowDate(),
    pinned.result?.latitude ?? 0,
    pinned.result?.longitude ?? 0,
  );

  /** Current moon position (altitude, azimuth, distance). */
  const moonPos: MoonPosition = getMoonPosition(
    nowDate(),
    pinned.result?.latitude ?? 0,
    pinned.result?.longitude ?? 0,
  );

  /** Moon illumination, phase fraction, and phase name. */
  const moonIllum: MoonIllumination = getMoonIllumination(nowDate());

  /**Sky gradient */
  // const sky = useSkyGradient(
  //   sunPos.altitudeDeg,
  //   pinned.time.isPastSolarNoon,
  //   currentWeather?.cloudCover ?? 0,
  // );

  /**Sky gradient (v2) */
  const sky = useSkyGradientv2({
    sunPos,
    moonPos,
    moonIllum,
    isPastSolarNoon: pinned.time?.isPastSolarNoon ?? false,
    cloudCover: currentWeather?.cloudCover ?? 0,
    weatherCode: currentWeather?.weatherCode ?? 0,
    uvIndex: currentWeather?.uvIndex,
  });

  {
    /* Time block with sky gradient */
  }
  return (
    <div
      className={cn("h-fit min-h-38 p-5 rounded-sm relative overflow-clip")}
      data-sky={sky.phase}
      data-sky-dark={sky.isDark || undefined}
      // style={{ background: sky.background }}
    >
      {/* Sky canvas */}
      <SkyCanvas sky={sky} />

      {/* Grain texture overlay */}
      <span
        aria-hidden="true"
        className="frosted-grain pointer-events-none z-6"
      />

      <div
        className={cn(
          "flex flex-col items-center gap-4 relative z-10 text-(--sky-fg)",
          // sky.foregroundClass,
        )}
      >
        <span className="text-sm">{formatDate(pinned.time.trueSolarTime)}</span>
        <div
          className="flex items-center gap-2 justify-between font-medium w-full text-5xl tablet:text-4xl tabular-nums transition-smooth"
          style={{
            fontFamily: `var(${font.class})`,
          }}
        >
          <span className="flex items-start gap-0.5">
            <PeriodBadge period={parts.period} disable />(
          </span>
          <div className="flex items-center justify-between w-full gap-1">
            <span>{parts.hh ?? "··"}</span>
            <span className="not-italic animate-pulse animation-duration-[1s]">
              :
            </span>
            <span>{parts.mm ?? "··"}</span>
            <span className="not-italic animate-pulse animation-duration-[1s]">
              :
            </span>
            <span>{parts.ss ?? "··"}</span>
          </div>
          <span className="flex items-start gap-0.5">
            ) <PeriodBadge period={parts.period} />
          </span>
        </div>
        <CivilTimeRow
          utcOffset={pinned.result.time?.totalOffset ?? 0}
          hourFormat={hourFormat}
          className="text-sm"
        />
      </div>
    </div>
  );
}
