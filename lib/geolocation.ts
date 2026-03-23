/**
 * @file geolocation.ts
 * @description Browser Geolocation API wrapper with typed error handling.
 *
 * This module is browser-only (`navigator.geolocation`) and has no
 * server-side equivalent. Import only from client components.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all possible geolocation failure reasons.
 */
export type LocationError =
  | "permission"
  | "unavailable"
  | "timeout"
  | "unknown";

/**
 * User-facing copy for each {@link LocationError} variant.
 * Suitable for display in an error UI.
 */
export const LOCATION_ERROR_MESSAGES: Record<
  LocationError,
  { title: string; description: string; instruction: string }
> = {
  permission: {
    title: "Location access denied",
    description:
      "Location permission was denied. Solar time cannot be calculated without coordinates.",
    instruction:
      "Enable location access in your browser settings and reload the page.",
  },
  unavailable: {
    title: "Location unavailable",
    description: "Your device could not determine your location.",
    instruction: "Check your GPS / network connection and try again.",
  },
  timeout: {
    title: "Location request timed out",
    description: "Your location took too long to resolve.",
    instruction: "Try again or ensure location services are enabled.",
  },
  unknown: {
    title: "Location failed",
    description: "Unable to determine your location.",
    instruction: "Check permissions and try again.",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a native {@link GeolocationPositionError} to a typed
 * {@link LocationError} discriminant.
 *
 * @param err - The error thrown by the Geolocation API.
 * @returns A {@link LocationError} string.
 */
export function mapGeolocationError(
  err: GeolocationPositionError,
): LocationError {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "permission";
    case err.POSITION_UNAVAILABLE:
      return "unavailable";
    case err.TIMEOUT:
      return "timeout";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

/**
 * Requests the user's current geographic position via the browser
 * Geolocation API.
 *
 * Uses high-accuracy mode with a 60-second timeout. The returned
 * `GeolocationCoordinates` object contains `latitude`, `longitude`,
 * and `accuracy` among other fields.
 *
 * @returns A Promise resolving to {@link GeolocationCoordinates}.
 * @throws {GeolocationPositionError} If the user denies permission,
 *   the position is unavailable, or the request times out.
 * @throws {Error} If the browser does not support geolocation.
 *
 * @example
 * ```ts
 * try {
 *   const coords = await getUserLocation();
 *   console.log(coords.latitude, coords.longitude);
 * } catch (err) {
 *   const code = mapGeolocationError(err as GeolocationPositionError);
 *   console.error(LOCATION_ERROR_MESSAGES[code].title);
 * }
 * ```
 */
export function getUserLocation(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 60_000, maximumAge: 0 },
    );
  });
}
