"use client";

/**
 * @file boot-provider.tsx
 * @description Global provider that runs the app initialisation sequence
 * exactly once, regardless of which page the user lands on or navigates to.
 *
 * Boot sequence:
 * 1. Sync system clock against a network time source.
 * 2. Acquire geolocation; fall back to random coordinates if denied.
 * 3. Reverse-geocode coordinates → set both `active` and `home` in context.
 *    If geocoding fails (ocean, unknown area), fetch timezone data directly.
 * 4. Schedule hourly clock resyncs.
 *
 * By living in the root layout, context survives client-side navigation —
 * `active` and `home` are never wiped when the user moves between pages.
 *
 * The `status` flag lets pages know whether to show a loading state.
 *
 * * Preferences
 * Wraps {@link usePreferences} so any component can read or update
 * preferences without prop-drilling. Mount this in the root layout
 * above the theme providers.
 *
 * On mount, the stored preferences are applied to the existing context
 * values — solarMode, hourFormat, etc. — so those contexts stay as the
 * single source of truth for the UI while this context owns persistence.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { getUserLocation, mapGeolocationError } from "@/lib/geolocation";
import { geocode } from "@/server/geocode";
import { makeFallbackResult } from "@/utils";
import { getTimezone, syncClock } from "@/server/timezone";
import logger from "@/utils/logger";
import { useSearchParams } from "next/navigation";
import { GeocodingResult } from "@/lib/geocoding";
import { BootStatus } from "@/types/consts";
import { TrueSolarTimeResult } from "@/lib/astronomy";
import { useSolarTicker } from "@/app/hooks/use-solar-ticker";
import { PathValue, PersistentStore } from "@/lib/store";
import { usePersistentStore } from "@/app/hooks/use-store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** preferences store */
const STORE_KEY = "shin:store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GlobalState {
  /** Boot progress status ("syncing" | "locating" | "geocoding" | "ready") */
  status: BootStatus;
  /** Whether the app is in fullscreen layout mode. */
  active?: GeocodingResult;
  /**
   * The user's home location — set once during boot, never changed by search.
   * Used as the reference point for header notifications and the map toolbar.
   */
  home?: GeocodingResult;
  /**
   * The most-recent TST computation for `active`.
   * Ticks via `requestAnimationFrame` by {@link useSolarTicker}.
   */
  activeRes?: TrueSolarTimeResult;
  /**
   * The most-recent TST computation for `home`.
   * Ticks via `requestAnimationFrame` by {@link useSolarTicker}.
   */
  homeRes?: TrueSolarTimeResult;
  /**
   * System clock offset vs network time in milliseconds.
   * Populated by {@link BootProvider} and refreshed hourly.
   * Positive = system clock is ahead. Negative = behind.
   */
  clockOffsetMs: number;
  /**
   * Global user preferences and data
   * Stuff like home and searched location, TST computation result, recents, etc
   */
  store: {
    readonly data: UserStore;
    readonly update: (partial: Partial<UserStore>) => void;
    readonly patch: <P extends never>(
      path: P,
      value: PathValue<UserStore, P>,
    ) => void;
    readonly reset: () => void;
    readonly clear: () => void;
  };
}

interface GlobalContextValue extends GlobalState {
  setStatus: (status: BootStatus) => void;
  /** Update the active display location (called on boot and on search). */
  setActive: (loc: GeocodingResult) => void;
  /** Set the home anchor location (called once during boot). */
  setHome: (loc: GeocodingResult) => void;
  /** Update the measured clock offset (called by GlobalProvider). */
  setClockOffsetMs: (offsetMs: number) => void;
}

/**
 * Global fallback values for every preference key.
 * Applied when localStorage has no value, or when a new key is added
 * and an existing stored object doesn't contain it yet.
 */
const DEFAULT: UserStore = {
  theme: "default",
  solarMode: "TST",
  hourFormat: "24",
  temperatureUnit: "celsius",
  recents: [],
};

const _store = new PersistentStore(STORE_KEY, DEFAULT);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a random coordinate pair in temperate latitudes (±60°). */
function randomCoords() {
  return {
    latitude: parseFloat((Math.random() * 120 - 60).toFixed(4)),
    longitude: parseFloat((Math.random() * 360 - 180).toFixed(4)),
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GlobalContext = createContext<GlobalContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Gloabl provider component that owns shared variables and the boot sequence.
 * Renders its children immediately — the boot runs in the background.
 * Pages reads `status` to decide whether to show a loading state.
 */
export function GlobalProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const store = usePersistentStore(_store);

  const [status, setStatus] = useState<BootStatus>("syncing");
  const [active, setActive] = useState<GeocodingResult>();
  const [home, setHome] = useState<GeocodingResult>();
  const [activeRes, setActiveRes] = useState<TrueSolarTimeResult>();
  const [homeRes, setHomeRes] = useState<TrueSolarTimeResult>();
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  useSolarTicker(setHomeRes, home?.longitude);
  useSolarTicker(setActiveRes, active?.longitude);

  useEffect(() => {
    // Only run once, even in React StrictMode's double-invoke
    if (status === "ready") return;
    setStatus("syncing");

    // If context already has an active location (e.g. HMR), skip boot
    if (active) {
      setStatus("ready");
      return;
    }
    logger.info("[BOOT]", "Booting up..");
    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");

    let cancelled = false;

    async function runBoot() {
      // 1 · Network clock sync (non-fatal)
      setStatus("syncing");
      logger.info("[BOOT]", "Syncing");
      try {
        const sync = await syncClock();
        if (cancelled) return;
        setClockOffsetMs(sync.offsetMs);
      } catch {
        /* fall back to system clock */
      }

      // 2 · Geolocation (non-fatal — falls back to random coords)
      setStatus("locating");
      logger.info("[BOOT]", "Locating");

      // Random coords — full longitude range, temperate latitudes for ([-60, 60]))
      const fallbackCoords = randomCoords();
      let latitude = fallbackCoords.latitude;
      let longitude = fallbackCoords.longitude;

      try {
        const coords = await getUserLocation();
        if (cancelled) return;
        latitude = coords.latitude;
        longitude = coords.longitude;
      } catch (err) {
        logger.warn(
          "[BOOT",
          "Geolocation failed:",
          mapGeolocationError(err as GeolocationPositionError),
        );
      }

      // 3 · Geocoding (non-fatal — falls back to fictional label + timezone)
      setStatus("geocoding");
      logger.info("[BOOT]", "Geocoding...");

      const fallbackResult = makeFallbackResult(latitude, longitude);
      let seedLocation = fallbackResult;

      try {
        const result = await geocode({ lat: latitude, lon: longitude });
        if (cancelled) return;

        if ("success" in result) {
          // Geocoding failed (ocean, unknown area) — still get timezone data
          console.warn("[boot] geocoding failed:", result.message);
          const time = await getTimezone(latitude, longitude);
          seedLocation = { ...fallbackResult, time };
        } else {
          seedLocation = result;
        }
      } catch {
        /* use fictional fallback */
      }

      if (cancelled) return;

      setHome(seedLocation);
      // if lng/lat params exist, we let `useActiveSync` handle setting the
      // active location. This prevents a slight jank behaviour where
      // the active gets set from here and there as well
      if (!latParam || !lonParam) {
        setActive(store.data.recents?.[0] ?? seedLocation);
        setStatus("ready");
      } else logger.info("Syncing from params...");

      // 4 · Hourly clock resync
      const resyncHandle = setInterval(async () => {
        try {
          const sync = await syncClock();
          setClockOffsetMs(sync.offsetMs);
        } catch {
          /* silent */
        }
      }, 3_600_000);

      return () => clearInterval(resyncHandle);
    }

    runBoot();
    logger.info("[BOOT]", "Running...");

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GlobalContext.Provider
      value={{
        status,
        store,
        home,
        active,
        homeRes,
        activeRes,
        clockOffsetMs,

        setHome,
        setActive,
        setStatus,
        setClockOffsetMs,
      }}
    >
      {children}{" "}
    </GlobalContext.Provider>
  );
}

/**
 * Returns app-level UI state and setters.
 *
 * @throws {Error} If called outside of an `GlobalProvider`.
 */
export function useGlobal(): GlobalContextValue {
  const ctx = useContext(GlobalContext);
  if (!ctx) throw new Error("useGlobal must be used within an GlobalProvider");
  return ctx;
}
