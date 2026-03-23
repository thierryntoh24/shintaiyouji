/**
 * @file route.ts
 * @description Server proxy for timezone lookup by coordinates.
 * Prevents CORS issues when calling external time APIs from the browser.
 */

import { NextRequest, NextResponse } from "next/server";

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

// Types
// -----------------------------------------------

interface TIMEAPI_DATA {
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
    | " Monday"
    | " Tuesday"
    | " Wednesday"
    | " Thursday"
    | " Friday"
    | " Saturday"
    | " Sunday";
  utc_time?: string;
  unix_timestamp: number;
}

interface TIMEZONEDB_DATA {
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

/**
 * Retrieves timezone and UTC offset information for coordinates.
 *
 * Uses TimeAPI first, with TimeZoneDB as a fallback.
 *
 * @param latitude - Latitude in decimal degrees
 * @param longitude - Longitude in decimal degrees
 */
export async function getTimeByCoordinates(
  latitude: number,
  longitude: number,
): Promise<CoordinateTimeData | undefined> {
  console.log("[time-api]", "start");
  try {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
    });

    console.log("[time-api]", params);
    const res = await fetch(`${TIMEAPI_BASE}?${params}`);
    console.log("[time-api]", res);

    if (res.ok) {
      const data = (await res.json()) as TIMEAPI_DATA;

      const currentOffset = data.current_utc_offset_seconds ?? 0;
      const gmtOffset = data.standard_utc_offset_seconds ?? 0;
      const dstOffset = data.dst_utc_offset_seconds ?? 0;

      return {
        timeZone: data.timezone,
        gmtOffset,
        dstOffset,
        totalOffset: currentOffset,
        localTime: data.local_time,
      };
    }
  } catch (err) {
    console.log("[time-api-error]", err, TIMEZONEDB_KEY);
    // ignore and fallback
  }

  // fallback → TimeZoneDB
  try {
    console.log("[time-api-2]", "trying again", TIMEZONEDB_KEY);
    if (!TIMEZONEDB_KEY) return;

    const params = new URLSearchParams({
      key: TIMEZONEDB_KEY,
      format: "json",
      by: "position",
      lat: latitude.toString(),
      lng: longitude.toString(),
    });

    const res = await fetch(`${TIMEZONEDB_BASE}?${params}`);

    if (!res.ok) return;

    const data = (await res.json()) as TIMEZONEDB_DATA;

    return {
      timeZone: data.zoneName,
      gmtOffset: data.gmtOffset - (data.dst ? 3600 : 0),
      dstOffset: data.dst ? 3600 : 0,
      totalOffset: data.gmtOffset,
      localTime: data.timestamp,
      abbreviation: data.abbreviation,
    };
  } catch {
    return;
  }
}

/**
 * GET /api/timezone?lat=..&lon=..
 *
 * Proxies the request to TimeAPI and returns timezone data.
 *
 * @param request - Incoming request
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json(
      { error: "Missing lat/lon parameters" },
      { status: 400 },
    );
  }

  try {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
    });

    const res = await fetch(`${TIMEAPI_BASE}?${params}`);

    if (!res.ok) {
      throw new Error(`TimeAPI error ${res.status}`);
    }

    const data = await res.json();

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Timezone lookup failed" },
      { status: 500 },
    );
  }
}
