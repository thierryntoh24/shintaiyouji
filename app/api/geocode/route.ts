import { NextRequest, NextResponse } from "next/server";
import { LRUCache } from "lru-cache";
import {
  forwardGeocode,
  reverseGeocode,
  type GeocodingResult,
} from "@/lib/geocoding";

// ---------------------------------------------------------------------------
// Rate limiter — timestamp-based (safe for 1 req/s minimum-interval APIs)
// ---------------------------------------------------------------------------

/**
 * Single-slot rate limiter enforcing a minimum interval between requests.
 * Safer than window-based counters for APIs like Nominatim that enforce
 * "no more than 1 request per second" rather than a per-window quota.
 */
class MinIntervalRateLimiter {
  private lastRequestAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  /** Returns `true` if a new request may be dispatched right now. */
  canRequest(): boolean {
    return Date.now() - this.lastRequestAt >= this.minIntervalMs;
  }

  /** Record that a request was just dispatched. */
  record(): void {
    this.lastRequestAt = Date.now();
  }

  /** Milliseconds until the next request is permitted (0 if ready). */
  msUntilReady(): number {
    return Math.max(0, this.minIntervalMs - (Date.now() - this.lastRequestAt));
  }
}

// ---------------------------------------------------------------------------
// Module-level singletons — shared across all requests in the same worker
// ---------------------------------------------------------------------------

/** 1.1 s gives a safe margin over Nominatim's 1 req/s hard limit. */
const rateLimiter = new MinIntervalRateLimiter(1_100);

/**
 * LRU cache keyed by a normalised query string.
 * 500 entries × 24 h TTL covers typical usage without unbounded growth.
 */
const geocodeCache = new LRUCache<string, GeocodingResult>({
  max: 500,
  ttl: 1000 * 60 * 60 * 24,
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
 * Returns an empty string if params are invalid (caller should 400).
 */
function buildCacheKey(params: URLSearchParams): string {
  const q = params.get("q");
  const lat = params.get("lat");
  const lon = params.get("lon");
  if (q) return `fwd:${q.trim().toLowerCase()}`;
  if (lat && lon)
    return `rev:${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
  return "";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Geocoding proxy that wraps `geocoding.ts` with server-side rate limiting
 * and LRU caching. Nominatim is never called directly from the browser.
 *
 * **Forward geocoding** — `GET /api/geocode?q=Tokyo`
 * **Reverse geocoding** — `GET /api/geocode?lat=35.68&lon=139.69`
 *
 * On forward geocode, returns the single most important result.
 * Returns a full {@link GeocodingResult} or a JSON error response.
 *
 * @remarks
 * Rate-limited responses include `retryAfterMs` so the client hook
 * can surface a human-readable countdown to the user.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!q && !(lat && lon)) {
    return NextResponse.json(
      { error: "Provide either ?q=<place> or ?lat=<n>&lon=<n>" },
      { status: 400 },
    );
  }

  const cacheKey = buildCacheKey(searchParams);
  if (!cacheKey) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  // Cache hit — skip rate limiter entirely
  const cached = geocodeCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Rate limit check
  if (!rateLimiter.canRequest()) {
    return NextResponse.json(
      {
        error: "Rate limited — try again shortly",
        retryAfterMs: rateLimiter.msUntilReady(),
      },
      { status: 429 },
    );
  }

  rateLimiter.record();

  try {
    let result: GeocodingResult | null = null;

    if (q) {
      // forwardGeocode returns results sorted by importance; take the top one
      const results = await forwardGeocode(q.trim(), 1);
      result = (await results[0]) ?? null;
    } else {
      result = await reverseGeocode(parseFloat(lat!), parseFloat(lon!));
    }

    if (!result) {
      return NextResponse.json({ error: "No results found" }, { status: 404 });
    }

    geocodeCache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[geocode] Nominatim request failed", err);
    return NextResponse.json(
      { error: "Geocoding service unavailable" },
      { status: 503 },
    );
  }
}
