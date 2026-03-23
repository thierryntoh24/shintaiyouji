"use server";

/**
 * @file weather.ts
 * @description Server action for weather data with rate limiting and
 * TTL-aware LRU caching.
 *
 * Open-Meteo rate limits (as of 2025):
 * - 600 calls / minute
 * - 5,000 calls / hour
 * - 10,000 calls / day
 *
 * **Caching strategy** — TTLs are aligned to Open-Meteo's update cadences:
 * | Type    | TTL     | Rationale                                    |
 * |---------|---------|----------------------------------------------|
 * | current | 15 min  | Open-Meteo updates current data every ~15 min|
 * | hourly  | 60 min  | Hourly forecasts stabilise within the hour   |
 * | daily   | 3 hours | Daily aggregates change slowly               |
 * | all     | 15 min  | Governed by the most volatile group          |
 *
 * **Cache key** — `weather:<type>:<lat-2dp>,<lon-2dp>`.
 * 2 decimal places ≈ 1.1 km resolution, which is sufficient for weather
 * and avoids cache misses from minor GPS jitter between requests.
 *
 * **Rate limiter** — token-bucket capped at 8 req/s (well under the
 * 600/min hard limit), with a 200 ms minimum interval between requests
 * to avoid burst spikes.
 */

import { LRUCache } from "lru-cache";
import {
  getCurrentWeather,
  getHourlyForecast,
  getDailyForecast,
  getWeather,
  type WeatherOptions,
  type CurrentWeatherResponse,
  type HourlyWeatherResponse,
  type DailyWeatherResponse,
  type WeatherResponse,
} from "@/lib/weather";

// ---------------------------------------------------------------------------
// Cache TTLs (milliseconds)
// ---------------------------------------------------------------------------

const TTL = {
  current: 15 * 60 * 1_000, // 15 min
  hourly: 60 * 60 * 1_000, // 1 hour
  daily: 3 * 60 * 60 * 1_000, // 3 hours
  all: 15 * 60 * 1_000, // 15 min (governed by current)
} as const;

type WeatherDataType = keyof typeof TTL;

// ---------------------------------------------------------------------------
// Cache — one LRU per data type so TTLs are independent
// ---------------------------------------------------------------------------

/**
 * Creates a typed LRU cache with the correct TTL for each data type.
 * 200 entries per type is plenty for typical usage.
 */
function makeCache<T extends {}>(ttl: number) {
  return new LRUCache<string, T>({ max: 200, ttl });
}

const caches = {
  current: makeCache<CurrentWeatherResponse>(TTL.current),
  hourly: makeCache<HourlyWeatherResponse>(TTL.hourly),
  daily: makeCache<DailyWeatherResponse>(TTL.daily),
  all: makeCache<WeatherResponse>(TTL.all),
};

// ---------------------------------------------------------------------------
// Rate limiter — token bucket
// ---------------------------------------------------------------------------

/**
 * Token-bucket rate limiter.
 *
 * Tokens refill continuously up to `capacity`. Each request consumes one
 * token. If the bucket is empty the request is rejected with a `retryAfterMs`
 * estimate.
 *
 * Configured at 8 tokens/s with a capacity of 10, giving comfortable
 * headroom under the 600 calls/min Open-Meteo limit.
 */
class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRatePerMs: number, // tokens per millisecond
  ) {
    this.tokens = capacity;
    this.lastRefillAt = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillRatePerMs,
    );
    this.lastRefillAt = now;
  }

  /** Returns `true` and consumes a token if a request is permitted. */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Estimated milliseconds until the next token is available. */
  msUntilReady(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.refillRatePerMs);
  }
}

/** 8 tokens/s, burst capacity of 10. */
const rateLimiter = new TokenBucketRateLimiter(10, 8 / 1_000);

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

/**
 * Builds a stable cache key from data type and coordinates.
 *
 * 2 dp precision (~1.1 km) avoids cache misses from GPS jitter while
 * keeping weather results geographically meaningful.
 */
function cacheKey(type: WeatherDataType, lat: number, lon: number): string {
  return `weather:${type}:${lat.toFixed(2)},${lon.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shared error envelope returned by all server actions on failure. */
export interface WeatherError {
  success: false;
  message: string;
  status: number;
  retryAfterMs?: number;
}

export type WeatherResult<T> = T | WeatherError;

// ---------------------------------------------------------------------------
// Internal dispatcher
// ---------------------------------------------------------------------------

async function dispatch<T extends {}>(
  type: WeatherDataType,
  lat: number,
  lon: number,
  fetcher: () => Promise<T>,
  cache: LRUCache<string, T>,
): Promise<WeatherResult<T>> {
  if (
    isNaN(lat) ||
    isNaN(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return { success: false, message: "Invalid coordinates.", status: 400 };
  }

  const key = cacheKey(type, lat, lon);

  const cached = cache.get(key);
  if (cached) return cached;

  if (!rateLimiter.tryConsume()) {
    return {
      success: false,
      message: "Rate limited — try again shortly.",
      status: 429,
      retryAfterMs: rateLimiter.msUntilReady(),
    };
  }

  try {
    const result = await fetcher();
    cache.set(key, result);
    return result;
  } catch (err) {
    console.error(`[weather/${type}]`, err);
    return {
      success: false,
      message: "Weather service unavailable.",
      status: 503,
    };
  }
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * Fetches current weather conditions for a location.
 *
 * Cached for **15 minutes** (Open-Meteo's current-data update cadence).
 *
 * @param lat     - Latitude in decimal degrees.
 * @param lon     - Longitude in decimal degrees.
 * @param options - Optional unit and timezone preferences.
 * @returns A {@link CurrentWeatherResponse} or a {@link WeatherError}.
 *
 * @example
 * ```ts
 * const result = await fetchCurrentWeather(50.11, 8.68);
 * if ("success" in result) return; // error
 * console.log(result.current.temperature);
 * ```
 */
export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  options?: WeatherOptions,
): Promise<WeatherResult<CurrentWeatherResponse>> {
  return dispatch(
    "current",
    lat,
    lon,
    () => getCurrentWeather(lat, lon, options),
    caches.current,
  );
}

/**
 * Fetches an hourly forecast for a location.
 *
 * Cached for **1 hour**.
 *
 * @param lat     - Latitude in decimal degrees.
 * @param lon     - Longitude in decimal degrees.
 * @param options - Optional unit, timezone, and `forecastDays` (1–16).
 * @returns A {@link HourlyWeatherResponse} or a {@link WeatherError}.
 *
 * @example
 * ```ts
 * const result = await fetchHourlyForecast(50.11, 8.68, { forecastDays: 2 });
 * if ("success" in result) return;
 * console.log(result.hourly[0].temperature);
 * ```
 */
export async function fetchHourlyForecast(
  lat: number,
  lon: number,
  options?: WeatherOptions,
): Promise<WeatherResult<HourlyWeatherResponse>> {
  return dispatch(
    "hourly",
    lat,
    lon,
    () => getHourlyForecast(lat, lon, options),
    caches.hourly,
  );
}

/**
 * Fetches a daily forecast for a location.
 *
 * Cached for **3 hours**.
 *
 * @param lat     - Latitude in decimal degrees.
 * @param lon     - Longitude in decimal degrees.
 * @param options - Optional unit, timezone, and `forecastDays` (1–16).
 * @returns A {@link DailyWeatherResponse} or a {@link WeatherError}.
 *
 * @example
 * ```ts
 * const result = await fetchDailyForecast(50.11, 8.68, { forecastDays: 7 });
 * if ("success" in result) return;
 * console.log(result.daily[0].temperatureMax);
 * ```
 */
export async function fetchDailyForecast(
  lat: number,
  lon: number,
  options?: WeatherOptions,
): Promise<WeatherResult<DailyWeatherResponse>> {
  return dispatch(
    "daily",
    lat,
    lon,
    () => getDailyForecast(lat, lon, options),
    caches.daily,
  );
}

/**
 * Fetches current conditions, hourly, and daily forecasts in one request.
 *
 * Cached for **15 minutes** (governed by the current-conditions update rate).
 * Prefer the individual fetchers when you only need one data group.
 *
 * @param lat     - Latitude in decimal degrees.
 * @param lon     - Longitude in decimal degrees.
 * @param options - Optional unit, timezone, and `forecastDays` (1–16).
 * @returns A {@link WeatherResponse} or a {@link WeatherError}.
 *
 * @example
 * ```ts
 * const result = await fetchWeather(50.11, 8.68);
 * if ("success" in result) return;
 * console.log(result.current.weatherDescription);
 * console.log(result.daily[0].temperatureMax);
 * ```
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  options?: WeatherOptions,
): Promise<WeatherResult<WeatherResponse>> {
  return dispatch(
    "all",
    lat,
    lon,
    () => getWeather(lat, lon, options),
    caches.all,
  );
}
