/**
 * @file types.d.ts
 * @description Global ambient type declarations for the SolarTime app.
 *
 * Types that are library-specific (e.g. `GeocodingResult`, `CoordinateTimeData`)
 * live in their respective library files. This file contains only shared
 * primitives used across multiple layers of the application.
 */

// ---------------------------------------------------------------------------
// Time display primitives
// ---------------------------------------------------------------------------

/**
 * Hour display format — 24-hour clock or 12-hour with AM/PM period.
 */
type HourFormat = "12" | "24";

/** Which solar time variant to display on the main clock. */
type SolarTimeMode = "TST" | "MST";

/**
 * Decomposed time parts for display.
 * All numeric fields are zero-padded to two characters.
 */
interface FormattedTime {
  /** Zero-padded hours string (e.g. `"09"`, `"23"`). */
  hh: string;
  /** Zero-padded minutes string. */
  mm: string;
  /** Zero-padded seconds string. */
  ss: string;
  /**
   * AM/PM indicator.
   * Only present when the time was formatted with `hourFormat: "12"`.
   */
  period?: "AM" | "PM";
}

/**
 * A single formatted solar (or lunar) event entry, holding both its
 * solar-time and civil-time representations for flexible display.
 */
interface SolarEventEntry {
  /** Time expressed in the active solar mode (TST or MST). */
  solar: FormattedTime;
  /** Civil local time at the active location. */
  local: FormattedTime;
  /** GMT offset label, e.g. "GMT+9". */
  offset: string;
}

// ---------------------------------------------------------------------------
// Server action responses
// ---------------------------------------------------------------------------

/**
 * Standard error envelope returned by server actions on failure.
 */
interface ServerActionError {
  success: false;
  message?: string;
  status?: number;
  data?: Record<string, unknown>;
}

/**
 * Global persisted user store for preferences and other global data.
 * Add theme specific keys by creating a themse-specific persistent store
 */
interface UserStore {
  /** Active theme name. Must match a key in the theme registry. */
  theme: Themes;
  /** True Solar Time or Mean Solar Time. */
  solarMode: SolarTimeMode;
  /** 24-hour display or 12-hour with AM/PM. */
  hourFormat: HourFormat;
  /**
   * Temperature unit for weather display.
   * Defaults to celsius; users in the US may prefer fahrenheit.
   */
  temperatureUnit: "celsius" | "fahrenheit";
  /**
   * **Recently accessed (mobile)**
   * - Last 5 locations stored in `localStorage` under `"neue:data"`.
   * - Shown in the persistent search drawer between search and home.
   */
  recents: GeocodingResult[];
}
