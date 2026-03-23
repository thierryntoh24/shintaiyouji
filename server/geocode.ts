"use server";

/**
 * @file geocode.ts
 * @description Server action for geocoding with rate limiting, LRU caching,
 * and automatic timezone enrichment.
 *
 * Wraps the pure `@/lib/geocoding` library to ensure Nominatim is never
 * called directly from the browser. All geocode requests should go through
 * this server action.
 *
 * @see {@link geocode}
 */

import { LRUCache } from "lru-cache";
import {
  forwardGeocode,
  reverseGeocode,
  type GeocodingResult,
} from "@/lib/geocoding";
import { getTimezoneByCoordinates } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

/**
 * Single-slot rate limiter enforcing a minimum interval between requests.
 *
 * Safer than window-based counters for APIs like Nominatim that enforce
 * "no more than 1 request per second" as a per-request minimum interval
 * rather than a rolling window quota.
 */
class MinIntervalRateLimiter {
  private lastRequestAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  /** Returns `true` if a new request may be dispatched right now. */
  canRequest(): boolean {
    return Date.now() - this.lastRequestAt >= this.minIntervalMs;
  }

  /** Records that a request was dispatched at this moment. */
  record(): void {
    this.lastRequestAt = Date.now();
  }

  /** Milliseconds until the next request is permitted (`0` if ready now). */
  msUntilReady(): number {
    return Math.max(0, this.minIntervalMs - (Date.now() - this.lastRequestAt));
  }
}

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

/** 1.1 s — safe margin over Nominatim's 1 req/s hard limit. */
const rateLimiter = new MinIntervalRateLimiter(1_100);

/**
 * LRU cache keyed by a normalised query string.
 * 1000 entries × 7 day TTL covers typical usage without unbounded growth.
 */
const geocodeCache = new LRUCache<string, GeocodingResult>({
  max: 1000,
  ttl: 1_000 * 60 * 60 * 24 * 7,
});

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

/**
 * Builds a stable, normalised cache key from the incoming search params.
 *
 * - Forward: `fwd:<lowercased-trimmed-query>`
 * - Reverse: `rev:<lat-4dp>,<lon-4dp>`
 *
 * Returns `null` if neither set of params is valid.
 */
function buildCacheKey(params: {
  q?: string;
  lat?: number;
  lon?: number;
}): string | null {
  if (params.q) return `fwd:${params.q.trim().toLowerCase()}`;
  if (params.lat != null && params.lon != null) {
    return `rev:${params.lat.toFixed(4)},${params.lon.toFixed(4)}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for {@link geocode}.
 * Provide either `q` (forward) or `lat` + `lon` (reverse).
 */
export interface GeocodeParams {
  /** Free-text place name for forward geocoding. */
  q?: string;
  /** Latitude for reverse geocoding. */
  lat?: number;
  /** Longitude for reverse geocoding. */
  lon?: number;
}

/**
 * Discriminated result type returned by {@link geocode}.
 */
export type GeocodeResult =
  | GeocodingResult
  | { success: false; message: string; status: number; retryAfterMs?: number };

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

/**
 * Geocoding server action.
 *
 * **Forward geocoding**: provide `{ q: "Tokyo" }` — returns the single
 * most-prominent result.
 *
 * **Reverse geocoding**: provide `{ lat: 35.68, lon: 139.69 }` — returns
 * the place at those coordinates.
 *
 * Results are enriched with timezone data via {@link getTimezoneByCoordinates}
 * and cached in an LRU cache for 7 days. Cache hits bypass rate limiting.
 *
 * @param params - {@link GeocodeParams} with either `q` or `lat`+`lon`.
 * @returns A {@link GeocodingResult} on success, or a typed error object.
 *
 * @example
 * ```ts
 * const result = await geocode({ q: "Tokyo" });
 * if ("success" in result) {
 *   console.error(result.message);
 * } else {
 *   console.log(result.label.full); // "Tokyo, Japan"
 * }
 * ```
 * @remarks
 * Rate-limited responses include `retryAfterMs` so the client hook
 * can surface a human-readable countdown to the user.
 */
export async function geocode(params: GeocodeParams): Promise<GeocodeResult> {
  const { q, lat, lon } = params;

  if (!q && !(lat != null && lon != null)) {
    return {
      success: false,
      message:
        "Provide either { q } for forward or { lat, lon } for reverse geocoding.",
      status: 400,
    };
  }

  const cacheKey = buildCacheKey({ q, lat, lon });
  if (!cacheKey) {
    return { success: false, message: "Invalid parameters.", status: 400 };
  }

  // Cache hit — skip rate limiter
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    console.log("[geocode cahce hit]:", cached.longitude, cached.name);
    return cached;
  }

  // Rate limit check
  if (!rateLimiter.canRequest()) {
    return {
      success: false,
      message: "Rate limited — try again shortly.",
      status: 429,
      retryAfterMs: rateLimiter.msUntilReady(),
    };
  }

  rateLimiter.record();

  try {
    let result: GeocodingResult | null = null;

    if (q) {
      const results = await forwardGeocode(q.trim(), 1);
      result = results[0] ?? null;
    } else {
      result = await reverseGeocode(lat!, lon!);
    }

    if (!result) {
      return { success: false, message: "No results found.", status: 404 };
    }

    // Enrich with timezone data using the result's own coordinates for accuracy
    const time = await getTimezoneByCoordinates(
      result.latitude,
      result.longitude,
    );
    const enriched: GeocodingResult = { ...result, time };

    geocodeCache.set(cacheKey, enriched);
    return enriched;
  } catch (err) {
    console.error("[geocode] Nominatim request failed:", err);
    return {
      success: false,
      message: "Geocoding service unavailable.",
      status: 503,
    };
  }
}
