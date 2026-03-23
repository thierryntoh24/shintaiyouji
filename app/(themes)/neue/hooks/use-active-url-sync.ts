"use client";

/**
 * @file use-active-url-sync.ts
 * @description Keeps the current URL in sync with the active location.
 *
 * Call this hook once at the top of any page that displays a location.
 * It does two things:
 *
 * 1. **Active → URL**: whenever `active` changes in context, replaces the
 *    current URL with `?lat=<n>&lon=<n>` so the location is always shareable
 *    and survives a hard refresh.
 *
 * 2. **URL → Active** (on first load only): if the page loads with `?lat&lon`
 *    params and no active location is set yet, geocodes those coordinates and
 *    sets them as `active`. The boot provider skips setting active when params
 *    are present, so this hook owns that responsibility.
 *
 * Additional params preserved through replace:
 * - `?zoom=<n>` on the map page (passed through, not touched)
 * - `?projection=<type>` on the map page (passed through, not touched)
 */

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { geocode } from "@/server/geocode";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import { getTimezone } from "@/server/timezone";
import { makeFallbackResult } from "@/utils";
import logger from "@/utils/logger";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Syncs active location to/from URL search params.
 *
 * @example
 * ```tsx
 * // In page.tsx or map/page.tsx, at the top of the component:
 * useActiveUrlSync();
 * ```
 */
export function useActiveUrlSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status, active, setActive, setStatus } = useAppUI();

  const paramHandled = useRef(false);
  const lastSyncedCoords = useRef<{ lat: number; lon: number } | null>(null);

  // -------------------------------------------------------------------------
  // URL → Active (first load with ?lat&lon params) //loads geocode data
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (paramHandled.current || status !== "geocoding") return;

    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");
    if (!latParam || !lonParam) return;

    const lat = parseFloat(latParam);
    const lon = parseFloat(lonParam);
    if (isNaN(lat) || isNaN(lon)) return;

    // If active is already set to these exact coords (boot set it), skip
    if (
      active &&
      Math.abs(active.latitude - lat) < 0.0001 &&
      Math.abs(active.longitude - lon) < 0.0001
    ) {
      paramHandled.current = true;
      return;
    }

    paramHandled.current = true;
    lastSyncedCoords.current = { lat, lon };

    async function resolveFromParams() {
      // setStatus("geocoding");

      const result = await geocode({ lat, lon });
      if ("success" in result) {
        // Geocoding failed (ocean, unknown area) — still get timezone data
        logger.warn("[boot] geocoding failed:", result.message);
        const time = await getTimezone(lat, lon);
        setActive(makeFallbackResult(lat, lon, time));
      } else {
        setActive(result);
      }

      logger.info("[useActiveUrlSync - RES]", result);

      setStatus("ready");
    }

    resolveFromParams();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Active → URL (whenever active changes) // only updates the url
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!active) return;

    const lat = active.latitude;
    const lon = active.longitude;

    // Skip if we just synced these exact coords from the URL (avoid loop)
    if (
      lastSyncedCoords.current &&
      Math.abs(lastSyncedCoords.current.lat - lat) < 0.0001 &&
      Math.abs(lastSyncedCoords.current.lon - lon) < 0.0001
    ) {
      lastSyncedCoords.current = null;
      return;
    }

    // Build new params, preserving any non-location params (zoom, projection)
    const next = new URLSearchParams(searchParams.toString());
    next.set("lat", lat.toFixed(6));
    next.set("lon", lon.toFixed(6));

    logger.info("[useActiveUrlSync]", next.toString());
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}
