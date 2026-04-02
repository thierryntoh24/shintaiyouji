"use client";

/**
 * @file use-weather.ts
 * @description React hook for fetching hourly weather data for the active
 * location. Re-fetches automatically when the location changes.
 *
 * Fetches hourly rather than current-only because:
 * - The hourly array includes the next several hours of context.
 * - Open-Meteo's hourly data is cached server-side for 1 hour, so the
 *   per-user call rate stays low even if the component re-mounts.
 * - The current-hour slice is derived client-side from the hourly array,
 *   so there is no need for a separate current fetch.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchHourlyForecast } from "@/server/weather";
import type { HourlyWeather, HourlyWeatherResponse } from "@/lib/weather";
import type { WeatherOptions } from "@/lib/weather";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeatherState {
  /** Full hourly forecast for the active location. */
  hourly: HourlyWeatherResponse | null;
  /**
   * The hourly entry closest to the current UTC time.
   * Derived from `hourly` — `null` while loading or on error.
   */
  current: HourlyWeather | null;
  loading: boolean;
  error: string | null;
}

export interface UseWeatherReturn extends WeatherState {
  /** Manually trigger a re-fetch for the current location. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finds the hourly entry whose timestamp is closest to `now` without
 * exceeding it (i.e. the current hour's slot).
 *
 * Falls back to the first entry if all timestamps are in the future
 * (e.g. timezone edge case near midnight).
 */
function currentHourSlot(hourly: HourlyWeather[]): HourlyWeather | null {
  if (!hourly.length) return null;
  const now = Date.now();
  let best = hourly[0];
  for (const h of hourly) {
    if (h.timestamp.getTime() <= now) best = h;
    else break; // array is chronological — no need to continue
  }
  return best;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches hourly weather for a location and keeps it fresh on location change.
 *
 * Weather is not refreshed on a timer — the server-side LRU cache (1-hour TTL)
 * means repeated calls within the same hour return instantly from cache, so
 * re-fetching on location change is sufficient.
 *
 * The `current` field is cleared to `null` immediately when `lat/lon` changes,
 * eliminating the stale-data flash.
 *
 * @param lat     - Latitude of the active location, or `undefined` during boot.
 * @param lon     - Longitude of the active location, or `undefined` during boot.
 * @param options - Optional unit and timezone preferences forwarded to Open-Meteo.
 * @returns A {@link UseWeatherReturn} with `hourly`, `current`, loading, and error state.
 *
 * @example
 * ```tsx
 * const { current, loading } = useWeather(active?.latitude, active?.longitude, {
 *   temperatureUnit: "celsius",
 *   timezone: active?.time?.timeZone,
 * });
 *
 * if (loading) return <Spinner />;
 * console.log(current?.temperature, current?.weatherDescription);
 * ```
 */
export function useWeather(
  lat: number | undefined,
  lon: number | undefined,
  options?: WeatherOptions,
): UseWeatherReturn {
  const [state, setState] = useState<WeatherState>({
    hourly: null,
    current: null,
    loading: false,
    error: null,
  });

  // Stable serialisation of options to avoid re-fetching on every render
  // when the caller passes an inline object literal.
  const optionsKey = JSON.stringify(options ?? {});

  // Keep options in a ref so the fetch function can always read the latest
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const load = useCallback(async (latitude: number, longitude: number) => {
    setState((s) => ({
      ...s,
      loading: true,
      error: null,
      // ── Stale flash fix: clear current immediately ──────────────────
      current: null,
    }));

    const result = await fetchHourlyForecast(
      latitude,
      longitude,
      optionsRef.current,
    );

    if ("success" in result) {
      setState((s) => ({
        ...s,
        loading: false,
        error: result.message ?? "Weather unavailable.",
      }));
      return;
    }

    setState({
      hourly: result,
      current: currentHourSlot(result.hourly),
      loading: false,
      error: null,
    });
  }, []); // stable — reads options via ref

  // Fetch when coordinates or options change
  useEffect(() => {
    if (lat == null || lon == null) return;
    load(lat, lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, optionsKey]);

  const refresh = useCallback(() => {
    if (lat == null || lon == null) return;
    load(lat, lon);
  }, [lat, lon]);

  return { ...state, refresh };
}
