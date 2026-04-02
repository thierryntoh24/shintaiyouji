"use client";

/**
 * @file use-sky-gradient.ts
 * @description Dynamic sky gradient driven by sun altitude and weather.
 *
 * Returns a CSS `background` string (one or two layered linear-gradients)
 * that should be applied to the page background. The gradient replaces the
 * static frosted-bg image so the sky responds in real time to:
 *   - Sun altitude (deep night → astronomical / nautical / civil twilight →
 *     golden hour → daytime → afternoon → dusk → evening → night)
 *   - Cloud cover percentage (shifts toward desaturated greys)
 *
 * Also returns a `foregroundClass` ("text-white" | "text-black" | "text-white/90")
 * so text contrast can adapt without hardcoding black everywhere.
 *
 * Architecture: pure derivation — no state, no effects, no subscriptions.
 * Called once per second from the component that already holds sunPos.
 *
 * @see SkyPhase for the named phases and their altitude thresholds.
 */

import { useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Named phases of the sky keyed by sun altitude thresholds. */
type SkyPhase =
  | "deep-night" // alt < -18°
  | "astronomical" // -18° ≤ alt < -12°
  | "nautical" // -12° ≤ alt < -6°
  | "civil-dawn" // -6° ≤ alt < 0°  (AM)
  | "golden-morning" // 0° ≤ alt < 6°   (AM)
  | "morning" // 6° ≤ alt < 20°  (AM)
  | "midday" // 20° ≤ alt ≤ 60°
  | "afternoon" // 20° ≤ alt ≤ 60° (PM)
  | "golden-evening" // 0° ≤ alt < 6°   (PM)
  | "civil-dusk" // -6° ≤ alt < 0°  (PM)
  | "evening" // -12° ≤ alt < -6°
  | "night"; // -18° ≤ alt < -12°

/** A gradient stop: [position 0–1, oklch color string] */
type Stop = [number, string];

/** Output of the sky system. */
export interface SkyGradient {
  /** CSS `background` value — one or two layered gradients. */
  background: string;
  /**
   * Tailwind text color class to use over this background.
   * Dark sky → white text; bright daytime → near-black.
   */
  foregroundClass: "text-white" | "text-black" | "text-white/90";
  /**
   * Opacity-adjusted foreground for muted elements (labels, captions).
   */
  mutedClass: "text-white/60" | "text-black/50";
  /** The resolved sky phase — useful for conditionally rendering decorations. */
  phase: SkyPhase;
}

// ---------------------------------------------------------------------------
// Gradient palettes per phase (zenith → horizon, 3–4 stops)
// ---------------------------------------------------------------------------

type Palette = { stops: Stop[]; horizon?: string };

const PALETTES: Record<SkyPhase, Palette> = {
  "deep-night": {
    stops: [
      [0, "oklch(0.08 0.02 260)"], // deep navy-black zenith
      [0.7, "oklch(0.10 0.025 255)"],
      [1, "oklch(0.12 0.03 250)"], // slightly lighter near "horizon"
    ],
  },
  astronomical: {
    stops: [
      [0, "oklch(0.10 0.03 260)"],
      [0.6, "oklch(0.14 0.04 255)"],
      [1, "oklch(0.18 0.05 245)"],
    ],
  },
  nautical: {
    stops: [
      [0, "oklch(0.13 0.04 255)"],
      [0.5, "oklch(0.18 0.06 250)"],
      [1, "oklch(0.24 0.07 240)"],
    ],
  },
  "civil-dawn": {
    stops: [
      [0, "oklch(0.22 0.06 255)"],
      [0.45, "oklch(0.35 0.08 260)"],
      [0.75, "oklch(0.62 0.10 55)"], // warm amber horizon
      [1, "oklch(0.75 0.13 60)"],
    ],
  },
  "golden-morning": {
    stops: [
      [0, "oklch(0.42 0.09 240)"],
      [0.4, "oklch(0.60 0.10 230)"],
      [0.72, "oklch(0.78 0.14 75)"], // golden
      [1, "oklch(0.88 0.12 80)"], // warm pale horizon
    ],
  },
  morning: {
    stops: [
      [0, "oklch(0.55 0.10 235)"], // medium blue
      [0.5, "oklch(0.72 0.09 225)"],
      [1, "oklch(0.90 0.05 215)"], // pale blue-white horizon
    ],
  },
  midday: {
    stops: [
      [0, "oklch(0.60 0.14 240)"], // rich blue zenith
      [0.5, "oklch(0.72 0.11 230)"],
      [1, "oklch(0.88 0.06 220)"], // soft horizon
    ],
  },
  afternoon: {
    stops: [
      [0, "oklch(0.58 0.13 238)"],
      [0.5, "oklch(0.70 0.10 228)"],
      [1, "oklch(0.87 0.07 218)"],
    ],
  },
  "golden-evening": {
    stops: [
      [0, "oklch(0.40 0.09 238)"],
      [0.38, "oklch(0.58 0.10 228)"],
      [0.7, "oklch(0.75 0.16 55)"], // orange-gold
      [1, "oklch(0.84 0.14 45)"], // deep warm horizon
    ],
  },
  "civil-dusk": {
    stops: [
      [0, "oklch(0.22 0.06 258)"],
      [0.42, "oklch(0.36 0.09 255)"],
      [0.72, "oklch(0.58 0.13 45)"],
      [1, "oklch(0.70 0.15 38)"], // orange-red
    ],
  },
  evening: {
    stops: [
      [0, "oklch(0.14 0.05 260)"],
      [0.5, "oklch(0.22 0.07 255)"],
      [1, "oklch(0.30 0.08 250)"],
    ],
  },
  night: {
    stops: [
      [0, "oklch(0.10 0.03 258)"],
      [0.6, "oklch(0.13 0.04 255)"],
      [1, "oklch(0.17 0.05 250)"],
    ],
  },
};

// ---------------------------------------------------------------------------
// Foreground mapping per phase
// ---------------------------------------------------------------------------

const FOREGROUND: Record<SkyPhase, SkyGradient["foregroundClass"]> = {
  "deep-night": "text-white",
  astronomical: "text-white",
  nautical: "text-white",
  "civil-dawn": "text-white/90",
  "golden-morning": "text-white/90",
  morning: "text-black",
  midday: "text-black",
  afternoon: "text-black",
  "golden-evening": "text-white/90",
  "civil-dusk": "text-white",
  evening: "text-white",
  night: "text-white",
};

const MUTED: Record<SkyPhase, SkyGradient["mutedClass"]> = {
  "deep-night": "text-white/60",
  astronomical: "text-white/60",
  nautical: "text-white/60",
  "civil-dawn": "text-white/60",
  "golden-morning": "text-white/60",
  morning: "text-black/50",
  midday: "text-black/50",
  afternoon: "text-black/50",
  "golden-evening": "text-white/60",
  "civil-dusk": "text-white/60",
  evening: "text-white/60",
  night: "text-white/60",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determines the sky phase from sun altitude and whether it is past solar noon.
 *
 * @param altDeg - Sun altitude in decimal degrees.
 * @param isPastNoon - Whether the sun has passed solar noon (from TST).
 */
function resolvePhase(altDeg: number, isPastNoon: boolean): SkyPhase {
  if (altDeg < -18) return "deep-night";
  if (altDeg < -12) return isPastNoon ? "night" : "astronomical";
  if (altDeg < -6) return isPastNoon ? "evening" : "nautical";
  if (altDeg < 0) return isPastNoon ? "civil-dusk" : "civil-dawn";
  if (altDeg < 6) return isPastNoon ? "golden-evening" : "golden-morning";
  if (altDeg < 20) return isPastNoon ? "afternoon" : "morning";
  return isPastNoon ? "afternoon" : "midday";
}

/**
 * Lerps a single oklch lightness value between two numbers.
 * Used to desaturate the sky toward overcast grey as cloud cover increases.
 *
 * @param value - Original lightness.
 * @param cloudCover - Cloud cover 0–100.
 */
function cloudAdjust(value: number, cloudCover: number): number {
  // Shift lightness toward 0.72 (neutral grey-white) proportionally to cloud cover
  const grey = 0.72;
  const t = cloudCover / 100;
  return value + (grey - value) * t * 0.6;
}

/**
 * Desaturates an oklch color string proportionally to cloud cover.
 * Only adjusts lightness — chroma desaturation would need a full parser.
 * For our palettes this produces a convincing overcast look.
 */
function applyCloud(color: string, cloudCover: number): string {
  if (cloudCover < 5) return color;
  // Replace the lightness value (first numeric arg in oklch)
  return color.replace(/oklch\(([\d.]+)/, (_, l) => {
    return `oklch(${cloudAdjust(parseFloat(l), cloudCover).toFixed(3)}`;
  });
}

/**
 * Builds the `linear-gradient(to bottom, …)` CSS string from a {@link Palette}.
 */
function buildGradient(palette: Palette, cloudCover: number): string {
  const stops = palette.stops
    .map(
      ([pos, color]) =>
        `${applyCloud(color, cloudCover)} ${(pos * 100).toFixed(0)}%`,
    )
    .join(", ");
  return `linear-gradient(to bottom, ${stops})`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Derives a dynamic sky gradient from astronomical and weather data.
 *
 * @param altitudeDeg  - Sun altitude in degrees (from `getSunPosition`).
 * @param isPastNoon   - Whether solar noon has passed (from `TrueSolarTimeResult.isPastSolarNoon`).
 * @param cloudCover   - Cloud cover percentage 0–100 (from `currentWeather.cloudCover`).
 *                       Pass `0` when weather is unavailable.
 *
 * @example
 * ```tsx
 * const sky = useSkyGradient(sunPos.altitudeDeg, res?.isPastSolarNoon ?? false, weather?.cloudCover ?? 0);
 *
 * return (
 *   <div style={{ background: sky.background }} className={sky.foregroundClass}>
 *     …
 *   </div>
 * );
 * ```
 */
export function useSkyGradient(
  altitudeDeg: number,
  isPastNoon: boolean,
  cloudCover: number,
): SkyGradient {
  return useMemo(() => {
    const phase = resolvePhase(altitudeDeg, isPastNoon);
    const palette = PALETTES[phase];
    const background = buildGradient(palette, cloudCover);

    return {
      background,
      foregroundClass: FOREGROUND[phase],
      mutedClass: MUTED[phase],
      phase,
    };
  }, [altitudeDeg, isPastNoon, cloudCover]);
}
