/**
 * @file geocoding.ts
 * @description Pure library for reverse geocoding (coordinates → place name)
 * and forward geocoding (place name → coordinates) using the Nominatim API
 * from OpenStreetMap.
 *
 * **Usage policy**: Nominatim requires a descriptive `User-Agent` header and
 * enforces a maximum of **1 request per second**. Set your app name and contact
 * in the `NOMINATIM_USER_AGENT` constant or pass it via options. Always call this library
 * through the server-side proxy (`@/server/geocode`) — never directly from
 * the browser.
 *
 * @see {@link https://nominatim.org/release-docs/latest/api/Reverse/}
 * @see {@link https://nominatim.org/release-docs/latest/api/Search/}
 */

import type { CoordinateTimeData } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

/**
 * Default User-Agent string sent with every Nominatim request.
 * Replace with your application name and a contact
 * email or URL as required by Nominatim's usage policy.
 * Override via {@link NominatimOptions.userAgent}.
 *
 * @see {@link https://operations.osmfoundation.org/policies/nominatim/}
 */
const DEFAULT_USER_AGENT = "SolarTimeApp/1.0 (thierryntoh24@gmail.com)";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for Nominatim API requests.
 */
export interface NominatimOptions {
  /**
   * User-Agent string identifying your application.
   * Required by Nominatim's usage policy.
   */
  userAgent?: string;
  /**
   * `Accept-Language` header for localised place names (e.g. `"de"`, `"fr"`).
   * @default "en"
   */
  language?: string;
}

/**
 * Structured address as returned by Nominatim's `addressdetails` parameter.
 */
export interface NominatimAddress {
  houseNumber?: string;
  road?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  province?: string;
  postcode?: string;
  /** Country name (localised) */
  country?: string;
  /** ISO 3166-1 alpha-2 country code (uppercased) */
  countryCode?: string;
  /** Other keys */
  [key: string]: string | undefined;
}

/**
 * Structured display label for a geographic location.
 */
export interface LocationLabel {
  /**
   * Primary place name — the most specific resolvable identifier.
   * e.g. `"Shibuya"`, `"Meiji Avenue"`, `"Tokyo"`.
   */
  title: string;
  /**
   * Broader region context.
   * e.g. `"Tokyo, Japan"`, `"Shibuya, Tokyo"`.
   */
  subtitle?: string;
  /**
   * Convenience combined form.
   * e.g. `"Shibuya, Tokyo, Japan"`.
   */
  full: string;
}

/**
 * A single geocoding result from Nominatim, enriched with optional
 * timezone data.
 */
export interface GeocodingResult {
  /** Nominatim internal place ID. */
  placeId: number;
  /** OpenStreetMap element type (`"node"`, `"way"`, `"relation"`). */
  osmType: string;
  /** OpenStreetMap element ID. */
  osmId: number;
  /** Latitude in decimal degrees. */
  latitude: number;
  /** Longitude in decimal degrees. */
  longitude: number;
  /** Full comma-separated display name from Nominatim. */
  displayName: string;
  /** Raw name field from Nominatim (may be empty for unnamed features). */
  name: string;
  /** Derived human-readable label for UI display. */
  label: LocationLabel;
  /** Structured address breakdown. */
  address: NominatimAddress;
  /** Bounding box as `[south, north, west, east]` in decimal degrees. */
  boundingBox: [number, number, number, number];
  /** OSM place category (e.g. `"boundary"`, `"place"`). */
  category?: string;
  /** OSM place type (e.g. `"city"`, `"village"`). */
  type?: string;
  /** Nominatim importance score — higher means more prominent. */
  importance?: number;
  /**
   * Timezone data for this location.
   * Populated by the server action (`@/server/geocode`), not by this library.
   */
  time?: CoordinateTimeData;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds standard request headers for Nominatim, including the required
 * User-Agent and optional Accept-Language.
 *
 * @param options - Request options
 * @returns Headers object
 */
function buildHeaders(options: NominatimOptions): HeadersInit {
  return {
    "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT,
    "Accept-Language": options.language ?? "en",
    Accept: "application/json",
  };
}

/**
 * Parses a raw Nominatim JSON result into a typed {@link GeocodingResult}.
 *
 * @param raw - Raw JSON object from the API
 * @returns Parsed {@link GeocodingResult}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResult(raw: any): GeocodingResult {
  const addr = raw.address ?? {};
  const bb = (raw.boundingbox as string[]) ?? ["0", "0", "0", "0"];

  const address: NominatimAddress = {
    houseNumber: addr.house_number,
    road: addr.road,
    suburb: addr.suburb,
    neighbourhood: addr.neighbourhood,
    quarter: addr.quarter,
    city: addr.city,
    town: addr.town,
    village: addr.village,
    hamlet: addr.hamlet,
    municipality: addr.municipality,
    county: addr.county,
    state: addr.state,
    province: addr.province,
    postcode: addr.postcode,
    country: addr.country,
    countryCode: addr.country_code?.toUpperCase(),
  };

  const partial: Omit<GeocodingResult, "label"> = {
    placeId: raw.place_id,
    osmType: raw.osm_type,
    osmId: raw.osm_id,
    latitude: parseFloat(raw.lat),
    longitude: parseFloat(raw.lon),
    displayName: raw.display_name,
    name: raw.name ?? "",
    address,
    boundingBox: [
      parseFloat(bb[0]),
      parseFloat(bb[1]),
      parseFloat(bb[2]),
      parseFloat(bb[3]),
    ],
    category: raw.category,
    type: raw.type,
    importance: raw.importance,
  };

  return { ...partial, label: buildLocationLabel(partial as GeocodingResult) };
}

// ---------------------------------------------------------------------------
// Label builder (exported for use in UI)
// ---------------------------------------------------------------------------

/**
 * Derives a concise {@link LocationLabel} from a Nominatim result.
 *
 * The `title` is the most specific resolvable name; `subtitle` provides
 * regional context, filtering out parts that duplicate the title.
 *
 * This avoids the overly verbose `display_name` field and produces UI-friendly
 * labels suitable for map pins, search results, and tooltips.
 *
 * @param place - Nominatim place result
 * @returns Structured location label
 *
 * @example
 * ```ts
 * // Shibuya Crossing  →  { title: "Shibuya", subtitle: "Tokyo, Japan" }
 * // Meiji Avenue      →  { title: "Meiji Avenue", subtitle: "Shibuya, Tokyo" }
 * // Tokyo             →  { title: "Tokyo", subtitle: "Japan" }
 * ```
 */
export function buildLocationLabel(place: GeocodingResult): LocationLabel {
  const a = place.address;

  const title =
    place.name ||
    a.neighbourhood ||
    a.suburb ||
    a.quarter ||
    a.hamlet ||
    a.village ||
    a.town ||
    a.city ||
    a.road ||
    place.displayName.split(",")[0];

  // Walk the region hierarchy — take the first candidate that differs from title
  const regionCandidates = [
    a.city,
    a.town,
    a.village,
    // a.municipality,
    a.county,
    a.state,
    a.province,
  ];

  const region = regionCandidates.find((v) => v && v !== title);
  const country = a.country !== title ? a.country : undefined;

  const subtitleParts = [region, country].filter(Boolean) as string[];
  const subtitle = subtitleParts.length ? subtitleParts.join(", ") : undefined;

  return {
    title: title ?? place.displayName,
    subtitle,
    full: subtitle ? `${title}, ${subtitle}` : (title ?? place.displayName),
  };
}

// ---------------------------------------------------------------------------
// Primary exports
// ---------------------------------------------------------------------------

/**
 * Reverse geocodes a set of coordinates into a human-readable place name
 * and structured address using the Nominatim API.
 *
 * Returns `null` if Nominatim has no result for those coordinates
 * (e.g. open ocean).
 *
 * @param latitude  - Latitude in decimal degrees.
 * @param longitude - Longitude in decimal degrees.
 * @param options   - Optional User-Agent and language settings.
 * @returns Promise resolving to a {@link GeocodingResult}, or `null` if no
 *   result was found for those coordinates
 * @throws {Error} On network failure or a non-200 response.
 *
 * @example
 * ```ts
 * const place = await reverseGeocode(50.1109, 8.6821);
 * console.log(place?.label.full); // "Frankfurt am Main, Germany"
 * ```
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  options: NominatimOptions = {},
): Promise<GeocodingResult | null> {
  const params = new URLSearchParams({
    lat: latitude.toString(),
    lon: longitude.toString(),
    format: "jsonv2",
    addressdetails: "1",
  });

  const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
    headers: buildHeaders(options),
  });

  if (!res.ok) {
    throw new Error(
      `Nominatim reverse geocode failed: ${res.status} ${res.statusText}`,
    );
  }

  const data = await res.json();

  // Nominatim returns `{ error: "Unable to geocode" }` for ocean coordinates
  if (data.error) {
    console.warn("[geocoding] reverseGeocode:", data.error);
    return null;
  }

  return parseResult(data);
}

/**
 * Forward geocodes a free-text place name or address string into geographic coordinates
 * using the Nominatim search API
 *
 * Results are sorted by Nominatim's importance score (most prominent first).
 *
 * @param query   - Place name or address string (e.g. `"Eiffel Tower, Paris"`).
 * @param limit   - Maximum number of results to return (default `5`, max `50`).
 * @param options - Optional User-Agent and language settings.
 * @returns Promise resolving to an array of {@link GeocodingResult} objects
, possibly empty.
 * @throws {Error} On network failure or a non-200 response.
 *
 * @example
 * ```ts
 * const [top] = await forwardGeocode("Eiffel Tower, Paris");
 * console.log(top?.latitude);  // 48.8583701
 * console.log(top?.longitude); // 2.2922926
 * ```
 */
export async function forwardGeocode(
  query: string,
  limit = 5,
  options: NominatimOptions = {},
): Promise<GeocodingResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: Math.min(limit, 50).toString(),
  });

  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: buildHeaders(options),
  });

  if (!res.ok) {
    throw new Error(`Nominatim search failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data as unknown[]).map(parseResult);
}

/**
 * Convenience wrapper that reverse geocodes coordinates and returns only the
 * short human-readable place name (e.g. `"Frankfurt am Main, Germany"`).
 *
 * Returns `null` if no place was found (e.g. open ocean).
 *
 * @param latitude  - Latitude in decimal degrees.
 * @param longitude - Longitude in decimal degrees.
 * @param options   - Optional User-Agent and language settings.
 * @returns Promise resolving to a short place name string or `null`
 *
 * @example
 * ```ts
 * const name = await getPlaceName(50.1109, 8.6821);
 * console.log(name); // "Frankfurt am Main"
 * ```
 */
export async function getPlaceName(
  latitude: number,
  longitude: number,
  options: NominatimOptions = {},
): Promise<string | null> {
  const result = await reverseGeocode(latitude, longitude, options);
  return result?.label.title ?? null;
}
