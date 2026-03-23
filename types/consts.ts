/**
 * @file consts.ts
 * @description Application-wide constants — site metadata, social links,
 * and UI copy.
 *
 * Import from here rather than scattering magic strings throughout the app.
 */

import type { LocationLabel } from "@/lib/geocoding";

// ---------------------------------------------------------------------------
// Site metadata
// ---------------------------------------------------------------------------

/** Display name shown in the site header and page title. */
export const SITENAME = "真の時間"; // true time

/** Short copyright line shown in the footer. */
export const COPYRIGHT = `© 2026`;
export const COPYRIGHT_TITLE = `© 2026 Thierry Ntoh — Open Source Project (MIT License)`;

// ---------------------------------------------------------------------------
// Social / external links
// ---------------------------------------------------------------------------

/**
 * Social links displayed in the footer.
 * Add or remove entries as needed.
 */
export const SOCIALS: Record<string, { label: string; link: string }> = {
  github: {
    link: "https://github.com/thierryntoh24/shin-no-jikan/commit/0baa9ea38b333736fa6778a2d13e6c70c738c1d5",
    label: "Github ↗",
  },
  twitter: { link: "x.com/thierryntoh23", label: "@thierryntoh23 ↗" },
};

// ---------------------------------------------------------------------------
// Boot status messages
// ---------------------------------------------------------------------------

/**
 * User-facing loading messages shown during the application boot sequence.
 */
export const BOOT_STATUS_MESSAGES = {
  syncing: { title: "Syncing clock…", description: "Checking network time." },
  locating: {
    title: "Finding your location…",
    description: "Requesting geolocation.",
  },
  geocoding: {
    title: "Resolving location…",
    description: "Looking up your coordinates.",
  },
  ready: { title: "Ready", description: "" },
  error: {
    title: "Something went wrong",
    description: "Using fallback location.",
  },
} as const;

/** Union of all possible boot statuses. */
export type BootStatus = keyof typeof BOOT_STATUS_MESSAGES;

// ---------------------------------------------------------------------------
// Fallback coordinates
// (used when geolocation permission is denied)
// ---------------------------------------------------------------------------

/**
 * Fallback coordinates used when the user denies location permission.
 * Currently set to São Paulo, Brazil as a temperate, mid-longitude default.
 */
export const FALLBACK_COORDINATES = {
  latitude: -23.5558,
  longitude: -46.6396,
} as const;

/**
 * Fictional anime-inspired location labels used as display placeholders
 * when reverse geocoding fails (e.g. open ocean or unknown coordinates).
 *
 * Each entry conforms to {@link LocationLabel} — `title` is the district or
 * landmark, `subtitle` is the city/region, and `full` is the combined form.
 */
export const FICTIONAL_LOCATIONS: LocationLabel[] = [
  {
    title: "Shujin Academy",
    subtitle: "Yongen-Jaya, Tokyo-to",
    full: "Shujin Academy, Yongen-Jaya, Tokyo-to",
  },
  { title: "Magnolia", subtitle: "Fiore", full: "Magnolia, Fiore" },
  {
    title: "Trost District",
    subtitle: "Wall Rose, Paradis",
    full: "Trost District, Wall Rose, Paradis",
  },
  {
    title: "Konohagakure",
    subtitle: "Land of Fire",
    full: "Konohagakure, Land of Fire",
  },
  {
    title: "Yorknew City",
    subtitle: "Republic of Padokea",
    full: "Yorknew City, Republic of Padokea",
  },
  {
    title: "Alubarna",
    subtitle: "Arabasta Kingdom",
    full: "Alubarna, Arabasta Kingdom",
  },
  {
    title: "Resembool",
    subtitle: "Eastern Region, Amestris",
    full: "Resembool, Eastern Region, Amestris",
  },
  {
    title: "Hueco Mundo",
    subtitle: "Menos Forest",
    full: "Hueco Mundo, Menos Forest",
  },
  {
    title: "Zephyr Town",
    subtitle: "Unova Region",
    full: "Zephyr Town, Unova Region",
  },
  {
    title: "Seireitei",
    subtitle: "Soul Society",
    full: "Seireitei, Soul Society",
  },
  {
    title: "Liore",
    subtitle: "Eastern Amestris",
    full: "Liore, Eastern Amestris",
  },
  { title: "Dressrosa", subtitle: "Grand Line", full: "Dressrosa, Grand Line" },
  {
    title: "Britannian Capital",
    subtitle: "Holy Britannian Empire",
    full: "Britannian Capital, Holy Britannian Empire",
  },
  {
    title: "Eldia District",
    subtitle: "Fort Salta, Liberio",
    full: "Eldia District, Fort Salta, Liberio",
  },
  {
    title: "Laagna City",
    subtitle: "Gjallarhorn Territory",
    full: "Laagna City, Gjallarhorn Territory",
  },
  {
    title: "Westalis",
    subtitle: "Eastern Europe",
    full: "Westalis, Eastern Europe",
  },
  {
    title: "Piltover",
    subtitle: "Progress Day Quarter",
    full: "Piltover, Progress Day Quarter",
  },
  { title: "Namek", subtitle: "North Galaxy", full: "Namek, North Galaxy" },
  {
    title: "Sabbaody Archipelago",
    subtitle: "Sabaody, Grand Line",
    full: "Sabbaody Archipelago, Sabaody, Grand Line",
  },
  {
    title: "Republic of Ishval",
    subtitle: "Eastern Amestris",
    full: "Republic of Ishval, Eastern Amestris",
  },
];

// Drift distance threshold
export const DIST_THRESHOLD = 0.01; // ~1km
