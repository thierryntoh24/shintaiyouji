/**
 * @file timezone.ts
 * @description Pure library for resolving IANA timezone data and UTC offsets
 * from geographic coordinates. Tries TimeAPI first with TimeZoneDB as fallback.
 *
 * This module contains no server directives and can be used anywhere
 * (browser, server, edge). For server-action wrappers, see `@/server/timezone`.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEAPI_BASE = "https://timeapi.io/api/v1/timezone/coordinate";
const TIMEZONEDB_BASE = "https://api.timezonedb.com/v2.1/get-time-zone";

/**
 * Optional TimeZoneDB API key.
 * Only required if fallback is used.
 */
const TIMEZONEDB_KEY = process.env.NEXT_PUBLIC_TIMEZONEDB_KEY;

// ---------------------------------------------------------------------------
// Internal API shapes  (not exported — callers use CoordinateTimeData)
// ---------------------------------------------------------------------------

interface TimeApiResponse {
  timezone?: string;
  current_utc_offset_seconds: number;
  standard_utc_offset_seconds: number;
  dst_utc_offset_seconds: number;
  has_dst: boolean;
  dst_offset_seconds: number;
  dst_active: boolean;
  dst_from?: string;
  dst_until?: string;
  local_time?: string;
  day_of_week:
    | "None"
    | "Monday"
    | "Tuesday"
    | "Wednesday"
    | "Thursday"
    | "Friday"
    | "Saturday"
    | "Sunday";
  utc_time?: string;
  unix_timestamp: number;
}

interface TimezoneDbResponse {
  status: string;
  message?: string;
  countryCode: string;
  countryName: string;
  regionName: string;
  cityName: string;
  zoneName: string;
  abbreviation: string;
  gmtOffset: number;
  dst: string;
  zoneStart: number;
  zoneEnd: number;
  nextAbbreviation: string;
  timestamp: number;
  formatted: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Timezone and UTC offset data derived from a coordinate lookup.
 */
export interface CoordinateTimeData {
  /** IANA timezone identifier, e.g. `"Asia/Tokyo"`. */
  timeZone?: string;
  /**
   * Standard (non-DST) offset from UTC in seconds.
   * e.g. `32400` for UTC+9 (Japan).
   */
  gmtOffset: number;
  /**
   * DST adjustment in seconds when DST is active.
   * `0` when DST is inactive or not observed.
   */
  dstOffset: number;
  /**
   * Total current offset from UTC in seconds, i.e. `gmtOffset + dstOffset`.
   * Use this for display and time arithmetic.
   */
  totalOffset: number;
  /**
   * Local time string as returned by the API, or a UNIX timestamp in seconds.
   * Format varies by source.
   */
  localTime?: string | number;
  /** Timezone abbreviation, e.g. `"JST"`, `"CET"`. */
  abbreviation?: string;
  /** Whether DST is currently active at this location. */
  dstActive?: boolean;
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

/**
 * Resolves timezone and UTC offset information for a geographic coordinate pair.
 *
 * Tries **TimeAPI** first; on failure falls back to **TimeZoneDB** (requires
 * `NEXT_PUBLIC_TIMEZONEDB_KEY` environment variable).
 *
 * Returns `undefined` if both sources fail or no API key is available for
 * the fallback.
 *
 * @param latitude  - Latitude in decimal degrees.
 * @param longitude - Longitude in decimal degrees.
 * @param timezoneDbKey - Optional TimeZoneDB API key. Falls back to the
 *   `NEXT_PUBLIC_TIMEZONEDB_KEY` environment variable when omitted.
 * @returns A {@link CoordinateTimeData} object, or `undefined` on failure.
 *
 * @example
 * ```ts
 * const tz = await getTimezoneByCoordinates(35.6895, 139.6917);
 * console.log(tz?.timeZone);    // "Asia/Tokyo"
 * console.log(tz?.totalOffset); // 32400
 * ```
 */
export async function getTimezoneByCoordinates(
  latitude: number,
  longitude: number,
  timezoneDbKey?: string,
): Promise<CoordinateTimeData | undefined> {
  // --- Primary: TimeAPI ---
  try {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
    });

    const res = await fetch(`${TIMEAPI_BASE}?${params}`);

    if (res.ok) {
      const data = (await res.json()) as TimeApiResponse;

      const totalOffset = data.current_utc_offset_seconds ?? 0;
      const gmtOffset = data.standard_utc_offset_seconds ?? totalOffset;
      const dstOffset = data.dst_offset_seconds ?? 0;

      return {
        timeZone: data.timezone,
        gmtOffset,
        dstOffset,
        totalOffset,
        localTime: data.local_time,
        dstActive: data.dst_active,
      };
    }
  } catch {
    // fall through to TimeZoneDB
  }

  // --- Fallback: TimeZoneDB ---

  if (!TIMEZONEDB_KEY) return undefined;

  try {
    const params = new URLSearchParams({
      key: TIMEZONEDB_KEY,
      format: "json",
      by: "position",
      lat: latitude.toString(),
      lng: longitude.toString(),
    });

    const res = await fetch(`${TIMEZONEDB_BASE}?${params}`);
    if (!res.ok) return undefined;

    const data = (await res.json()) as TimezoneDbResponse;
    if (data.status !== "OK") return undefined;

    const dstActive = data.dst === "1";
    const gmtOffset = data.gmtOffset - (dstActive ? 3_600 : 0);
    const dstOffset = dstActive ? 3_600 : 0;

    return {
      timeZone: data.zoneName,
      gmtOffset,
      dstOffset,
      totalOffset: data.gmtOffset,
      localTime: data.timestamp,
      abbreviation: data.abbreviation,
      dstActive,
    };
  } catch {
    return undefined;
  }
}
