/**
 * @file utils/index.ts
 * @description Shared formatting and arithmetic utilities for the app.
 *
 * All functions here are pure — no side effects, no server/browser APIs.
 * Safe to import from any context.
 */

import { GeocodingResult, LocationLabel } from "@/lib/geocoding";
import { CoordinateTimeData } from "@/lib/timezone";
import { HourlyWeather } from "@/lib/weather";
import { FICTIONAL_LOCATIONS } from "@/types/consts";
import type { LucideIcon } from "lucide-react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudHail,
  Snowflake,
  Moon,
  CloudMoon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Zero-pads a non-negative integer to at least two characters. */
const pad = (n: number): string => String(n).padStart(2, "0");

/** Converts minutes to milliseconds. */
export const minsToMs = (mins: number): number => mins * 60_000;

/** Converts milliseconds to minutes. */
export const msToMins = (ms: number): number => ms / 60_000;

/** Converts seconds to minutes. */
export const secsToMins = (secs: number): number => secs / 60;

/** Converts seconds to milliseconds. */
export const secsToMs = (secs: number): number => secs * 1_000;

/**
 * Returns a UTC `Date` corrected for a measured system clock offset.
 *
 * @param offsetMs - Signed clock offset in milliseconds (from {@link syncClock}).
 */
export const correctedUtcNow = (offsetMs: number): Date =>
  new Date(Date.now() - offsetMs);

// ---------------------------------------------------------------------------
// Duration formatter
// ---------------------------------------------------------------------------

/**
 * Formats a duration into a compact human-readable string.
 *
 * Accepts either minutes or milliseconds via the `unit` parameter.
 * Negative values and decimals are handled correctly.
 *
 * @param value   - Duration value.
 * @param unit    - `"minutes"` or `"ms"`.
 * @param opts    - Optional formatting flags.
 * @returns A string such as `"1h 2m 3s"`, `"45m"`, or `"12s"`.
 *
 * @example
 * ```ts
 * formatDuration(62.05, "minutes")              // "1h 2m 3s"
 * formatDuration(3_723_000, "ms")               // "1h 2m 3s"
 * formatDuration(12.5, "minutes", { seconds: false }) // "12m"
 * ```
 */
export function formatDuration(
  value: number,
  unit: "minutes" | "ms",
  opts: { seconds?: boolean } = {},
): string {
  const { seconds = true } = opts;
  const totalMs = unit === "ms" ? Math.abs(value) : minsToMs(Math.abs(value));
  const totalSec = Math.round(totalMs / 1_000);

  const h = Math.floor(totalSec / 3_600);
  const m = Math.floor((totalSec % 3_600) / 60);
  const s = totalSec % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (seconds && (s > 0 || parts.length === 0)) parts.push(`${s}s`);

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Time formatter
// ---------------------------------------------------------------------------

/**
 * Formats a UTC `Date` into decomposed time parts, applying a UTC offset
 * before extraction so the result reflects local (or solar) time.
 *
 * Works for both True Solar Time and civil local time:
 * - **TST**: pass `utcOffsetSecs = 0` (TST dates already encode the offset).
 * - **Civil time**: pass `utcOffsetSecs` from your timezone API result
 *   (`CoordinateTimeData.totalOffset`).
 *
 * @param date          - A UTC `Date` to format.
 * @param utcOffsetSecs - Offset in seconds to apply before extracting parts.
 * @param hourFormat    - `"12"` for AM/PM, `"24"` for 24-hour (default).
 * @returns A {@link FormattedTime} object with zero-padded string parts.
 *
 * @example
 * ```ts
 * // Civil local time at UTC+2
 * formatTime(new Date(), 7200, "24"); // { hh: "15", mm: "30", ss: "00" }
 *
 * // 12-hour format
 * formatTime(tst.trueSolarTime, 0, "12"); // { hh: "03", mm: "30", ss: "00", period: "PM" }
 * ```
 */
export function formatTime(
  date: Date,
  utcOffsetSecs: number = 0,
  hourFormat: HourFormat = "24",
): FormattedTime {
  const shifted = new Date(date.getTime() + secsToMs(utcOffsetSecs));
  let hours = shifted.getUTCHours();
  const mins = shifted.getUTCMinutes();
  const secs = shifted.getUTCSeconds();

  if (hourFormat === "12") {
    const period: "AM" | "PM" = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return { hh: pad(hours), mm: pad(mins), ss: pad(secs), period };
  }

  return { hh: pad(hours), mm: pad(mins), ss: pad(secs) };
}

// ---------------------------------------------------------------------------
// GMT label
// ---------------------------------------------------------------------------

/**
 * Builds a `GMT±H` or `GMT±H:MM` offset label from a UTC offset in seconds.
 *
 * @param utcOffsetSecs - Offset in seconds (e.g. `7200` → `"GMT+2"`,
 *   `-19800` → `"GMT-5:30"`).
 * @param timezoneName  - Optional IANA timezone name appended after the offset.
 * @returns A formatted offset string, or an empty string if the offset is `0`
 *   or `undefined`.
 *
 * @example
 * ```ts
 * gmtLabel(7200)               // "GMT+2"
 * gmtLabel(-19800)             // "GMT-5:30"
 * gmtLabel(32400, "Asia/Tokyo") // "GMT+9 Asia/Tokyo"
 * ```
 */
export function gmtLabel(
  utcOffsetSecs?: number,
  timezoneName?: string,
): string {
  // if (!utcOffsetSecs && utcOffsetSecs !== 0) return "";
  if (!utcOffsetSecs) return "";
  const sign = utcOffsetSecs >= 0 ? "+" : "-";
  const totalMins = Math.abs(Math.round(utcOffsetSecs / 60));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;

  const offset = m > 0 ? `GMT${sign}${h}:${pad(m)}` : `GMT${sign}${h}`;
  return timezoneName ? `${offset} ${timezoneName}` : offset;
}

// ---------------------------------------------------------------------------
// Date formatter
// ---------------------------------------------------------------------------

/**
 * Formats a `Date` as `"Weekday, Mon DD, YYYY"`.
 *
 * @example
 * ```ts
 * formatDate(new Date("2023-12-30")); // "Saturday, Dec 30, 2023"
 * ```
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Coordinate formatter
// ---------------------------------------------------------------------------

/**
 * Formats geographic coordinates as a human-readable string.
 *
 * @param longitude - Longitude in decimal degrees (required).
 * @param latitude  - Latitude in decimal degrees (optional).
 * @param precision - Decimal places (default `4`).
 * @returns e.g. `"37.9838° N, 23.7274° E"` or `"23.7274° E"`.
 * @throws {RangeError} If coordinates are out of valid range.
 *
 * @example
 * ```ts
 * formatCoordinates(23.7274, 37.9838); // "37.9838° N, 23.7274° E"
 * formatCoordinates(-73.9857);          // "73.9857° W"
 * ```
 */
export function formatCoordinates(
  longitude: number,
  latitude?: number,
  precision = 4,
): string {
  if (longitude < -180 || longitude > 180) {
    throw new RangeError(`Invalid longitude: ${longitude}`);
  }
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    throw new RangeError(`Invalid latitude: ${latitude}`);
  }

  const lonStr = `${Math.abs(longitude).toFixed(precision)}° ${longitude >= 0 ? "E" : "W"}`;
  if (latitude === undefined) return lonStr;

  const latStr = `${Math.abs(latitude).toFixed(precision)}° ${latitude >= 0 ? "N" : "S"}`;
  return `${latStr}, ${lonStr}`;
}

/**
 * Returns a random entry from {@link FICTIONAL_LOCATIONS}.
 */
export function randomFictionalLabel(): LocationLabel {
  return FICTIONAL_LOCATIONS[
    Math.floor(Math.random() * FICTIONAL_LOCATIONS.length)
  ];
}

/**
 * Maps a WMO weather code and daytime flag to the most appropriate
 * Lucide icon component.
 *
 * @param code  - WMO weather interpretation code.
 * @param isDay - Whether it is currently daytime at the location.
 * @returns A {@link LucideIcon} component reference.
 *
 * @example
 * ```tsx
 * const Icon = getWeatherIcon(weather.weatherCode, weather.isDay);
 * return <Icon size={16} />;
 * ```
 */
export function getWeatherIcon(code: number, isDay: boolean): LucideIcon {
  // Clear
  if (code === 0) return isDay ? Sun : Moon;

  // Mainly clear / partly cloudy
  if (code === 1 || code === 2) return isDay ? CloudSun : CloudMoon;

  // Overcast
  if (code === 3) return Cloud;

  // Fog
  if (code === 45 || code === 48) return CloudFog;

  // Drizzle
  if (code >= 51 && code <= 55) return CloudDrizzle;

  // Rain
  if (code >= 61 && code <= 65) return CloudRain;
  if (code >= 80 && code <= 82) return CloudRain;

  // Snow
  if (code >= 71 && code <= 75) return CloudSnow;
  if (code === 77) return Snowflake;
  if (code === 85 || code === 86) return CloudSnow;

  // Thunderstorm
  if (code === 95) return CloudLightning;

  // Thunderstorm with hail
  if (code === 96 || code === 99) return CloudHail;

  // Fallback
  return Cloud;
}

export function precipSummary(w: HourlyWeather): string | null {
  const parts: string[] = [];

  if (w.snowfall > 0) parts.push(`${w.snowfall.toFixed(1)}cm snow`);
  else if (w.showers > 0) parts.push(`${w.showers.toFixed(1)}mm showers`);
  else if (w.rain > 0) parts.push(`${w.rain.toFixed(1)}mm rain`);

  // If no type breakdown but total precipitation exists
  if (!parts.length && w.precipitation > 0)
    parts.push(`${w.precipitation.toFixed(1)}mm`);

  if (w.precipitationProbability > 0) {
    // Label the probability with the dominant type
    const likelyType =
      w.snowfall > 0
        ? "snow"
        : w.showers > w.rain
          ? "showers"
          : w.rain > 0
            ? "rain"
            : "precip";

    parts.push(`${w.precipitationProbability}% chance of ${likelyType}.`);
  }

  return parts.length ? parts.join(" · ") : null;
}

/**
 * Builds a minimal {@link GeocodingResult} for coordinates that could not
 * be reverse-geocoded (e.g. open ocean).
 */
export function makeFallbackResult(
  lat: number,
  lon: number,
  time?: CoordinateTimeData,
): GeocodingResult {
  const label = randomFictionalLabel();

  return {
    latitude: lat,
    longitude: lon,
    label,
    displayName: label.full,
    address: {},
    placeId: 0,
    osmType: "",
    osmId: 0,
    name: label.title,
    boundingBox: [0, 0, 0, 0],
    time,
  };
}
