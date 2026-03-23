"use client";

/**
 * @file use-geocode.ts
 * @description React hook for forward and reverse geocoding via the
 * `@/server/geocode` server action.
 *
 * Manages local loading / error / result state. Rate limiting and caching
 * are handled server-side — this hook only concerns itself with UI state.
 */

import { useState, useCallback } from "react";
import { geocode } from "@/server/geocode";
import type { GeocodingResult } from "@/lib/geocoding";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeocodeState {
  /** Most recent successful result. */
  result: GeocodingResult | null;
  loading: boolean;
  error: string | null;
}

export interface UseGeocodeReturn extends GeocodeState {
  /**
   * Forward geocode: resolve a free-text place name to coordinates.
   * Returns the single most-prominent result, or `null` on failure.
   */
  search: (query: string) => Promise<GeocodingResult | null>;
  /**
   * Reverse geocode: resolve coordinates to a place name.
   * Returns the result or `null` on failure.
   */
  reverse: (lat: number, lon: number) => Promise<GeocodingResult | null>;
  /** Clears result and error state. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Client-side hook for forward and reverse geocoding.
 *
 * Wraps the `geocode` server action and tracks loading / error state
 * locally. Successful results are stored in `result`.
 *
 * @returns A {@link UseGeocodeReturn} object with search/reverse/reset
 *   functions and the current loading/error/result state.
 *
 * @example
 * ```tsx
 * const { search, reverse, result, loading, error } = useGeocode();
 *
 * // Forward
 * const place = await search("Tokyo");
 * console.log(place?.label.full); // "Tokyo, Japan"
 *
 * // Reverse
 * const place = await reverse(35.68, 139.69);
 * console.log(place?.address.city); // "Tokyo"
 * ```
 */
export function useGeocode(): UseGeocodeReturn {
  const [state, setState] = useState<GeocodeState>({
    result: null,
    loading: false,
    error: null,
  });

  // ---------------------------------------------------------------------------
  // Internal dispatcher
  // ---------------------------------------------------------------------------

  const dispatch = useCallback(
    async (
      params: Parameters<typeof geocode>[0],
    ): Promise<GeocodingResult | null> => {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const data = await geocode(params);

        if ("success" in data) {
          // Server action returned an error envelope
          const message =
            data.status === 429
              ? `Rate limited — please wait ${Math.ceil((data.retryAfterMs ?? 1_100) / 1_000)}s`
              : (data.message ?? "Geocoding failed.");

          setState((s) => ({ ...s, loading: false, error: message }));
          console.error("[useGeocode]", message);
          return null;
        }

        setState((s) => ({ ...s, result: data, loading: false, error: null }));
        return data;
      } catch (err) {
        const message = "Network error — check your connection.";
        setState((s) => ({ ...s, loading: false, error: message }));
        console.error("[useGeocode]", err);
        return null;
      }
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Forward geocode by name. */
  const search = useCallback(
    (query: string) => {
      if (!query.trim()) return Promise.resolve(null);
      return dispatch({ q: query.trim() });
    },
    [dispatch],
  );

  /** Reverse geocode by coordinates. */
  const reverse = useCallback(
    (lat: number, lon: number) => dispatch({ lat, lon }),
    [dispatch],
  );

  const reset = useCallback(() => {
    setState({ result: null, loading: false, error: null });
  }, []);

  return { ...state, search, reverse, reset };
}
