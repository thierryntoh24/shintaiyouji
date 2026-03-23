/**
 * @file timezone.ts
 * @description Server proxy for timezone lookup by coordinates and clock syncing.
 * Prevents CORS issues when calling external time APIs from the browser.
 */

"use server";

import { compareClockViaHttp } from "@/lib/ntp";
import { getTimezoneByCoordinates } from "@/lib/timezone";

/**
 * Resolves timezone data for coordinates when geocoding is unavailable
 * (e.g. open ocean). A lightweight alternative to {@link geocode} when
 * only timezone information is needed.
 *
 * @param lat - Latitude in decimal degrees.
 * @param lon - Longitude in decimal degrees.
 * @returns A {@link CoordinateTimeData} object or `undefined`.
 */
export { getTimezoneByCoordinates as getTimezone };
/**
 * Compares the local system clock against a public HTTP time source
 * and stores the measured offset for use by now and nowDate.
 *
 * Uses the NTP round-trip timing principle
 */
export { compareClockViaHttp as syncClock };
