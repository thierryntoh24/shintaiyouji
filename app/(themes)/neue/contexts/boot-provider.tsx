"use client";

/**
 * @file boot-provider.tsx
 * @description Global boot provider that runs the app initialisation sequence
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
 * Pages that need location data simply read from {@link AppUIContext}.
 * The `status` flag lets pages know whether to show a loading state.
 */

import { useEffect } from "react";
import { getUserLocation, mapGeolocationError } from "@/lib/geolocation";
import { geocode } from "@/server/geocode";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import { makeFallbackResult } from "@/utils";
import { getTimezone, syncClock } from "@/server/timezone";
import logger from "@/utils/logger";
import { useSearchParams } from "next/navigation";

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
// Component
// ---------------------------------------------------------------------------

/**
 * Invisible provider component that owns the boot sequence.
 * Renders its children immediately — the boot runs in the background.
 * Pages read `booted` from {@link useAppUI} to decide whether to show
 * a loading state.
 */
export function BootProvider({ children }: { children: React.ReactNode }) {
  const { setActive, setHome, setClockOffsetMs, active, status, setStatus } =
    useAppUI();
  const searchParams = useSearchParams();

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
        setActive(seedLocation);
        setStatus("ready");
      } else logger.info("[BOOT]", "Deferring to useActiveSync...");

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

  return <>{children}</>;
}
