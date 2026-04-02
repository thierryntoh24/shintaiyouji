"use client";

import { HourlyWeather } from "@/lib/weather";
import { useMemo } from "react";

/**
 * Named phases of the sky keyed by sun altitude thresholds.
 */
type SkyPhase =
  | "deep-night"
  | "astronomical"
  | "nautical"
  | "civil-dawn"
  | "golden-morning"
  | "morning"
  | "midday"
  | "afternoon"
  | "golden-evening"
  | "civil-dusk"
  | "evening"
  | "night";

/**
 * Output of the sky system.
 */
export interface SkyGradient {
  background: string;
  foregroundClass: "text-white" | "text-black" | "text-white/90";
  mutedClass: "text-white/60" | "text-black/50";
  phase: SkyPhase;
}

/**
 * Internal atmospheric model derived from weather inputs.
 */
interface Atmosphere {
  cloudFactor: number;
  fogFactor: number;
  rainFactor: number;
  stormFactor: number;
  solarIntensity: number;
}

/**
 * Gradient stop tuple.
 */
type Stop = [number, string];

type Palette = { stops: Stop[] };

/**
 * Core sky palettes (zenith → horizon).
 */
const PALETTES: Record<SkyPhase, Palette> = {
  "deep-night": {
    stops: [
      [0, "oklch(0.08 0.02 260)"],
      [1, "oklch(0.12 0.03 250)"],
    ],
  },
  astronomical: {
    stops: [
      [0, "oklch(0.10 0.03 260)"],
      [1, "oklch(0.18 0.05 245)"],
    ],
  },
  nautical: {
    stops: [
      [0, "oklch(0.13 0.04 255)"],
      [1, "oklch(0.24 0.07 240)"],
    ],
  },
  "civil-dawn": {
    stops: [
      [0, "oklch(0.25 0.06 255)"],
      [1, "oklch(0.78 0.14 60)"],
    ],
  },
  "golden-morning": {
    stops: [
      [0, "oklch(0.42 0.09 240)"],
      [1, "oklch(0.88 0.12 80)"],
    ],
  },
  morning: {
    stops: [
      [0, "oklch(0.55 0.10 235)"],
      [1, "oklch(0.90 0.05 215)"],
    ],
  },
  midday: {
    stops: [
      [0, "oklch(0.60 0.14 240)"],
      [1, "oklch(0.88 0.06 220)"],
    ],
  },
  afternoon: {
    stops: [
      [0, "oklch(0.58 0.13 238)"],
      [1, "oklch(0.87 0.07 218)"],
    ],
  },
  "golden-evening": {
    stops: [
      [0, "oklch(0.40 0.09 238)"],
      [1, "oklch(0.84 0.14 45)"],
    ],
  },
  "civil-dusk": {
    stops: [
      [0, "oklch(0.22 0.06 258)"],
      [1, "oklch(0.70 0.15 38)"],
    ],
  },
  evening: {
    stops: [
      [0, "oklch(0.14 0.05 260)"],
      [1, "oklch(0.30 0.08 250)"],
    ],
  },
  night: {
    stops: [
      [0, "oklch(0.10 0.03 258)"],
      [1, "oklch(0.17 0.05 250)"],
    ],
  },
};

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

/**
 * Resolve sky phase.
 */
function resolvePhase(alt: number, isPastNoon: boolean): SkyPhase {
  if (alt < -18) return "deep-night";
  if (alt < -12) return isPastNoon ? "night" : "astronomical";
  if (alt < -6) return isPastNoon ? "evening" : "nautical";
  if (alt < 0) return isPastNoon ? "civil-dusk" : "civil-dawn";
  if (alt < 6) return isPastNoon ? "golden-evening" : "golden-morning";
  if (alt < 20) return isPastNoon ? "afternoon" : "morning";
  return isPastNoon ? "afternoon" : "midday";
}

/**
 * Derive atmospheric state from weather.
 */
function deriveAtmosphere(w?: Partial<HourlyWeather>): Atmosphere {
  if (!w) {
    return {
      cloudFactor: 0,
      fogFactor: 0,
      rainFactor: 0,
      stormFactor: 0,
      solarIntensity: 1,
    };
  }

  return {
    cloudFactor: (w.cloudCover ?? 0) / 100,
    fogFactor: 1 - Math.min((w.visibility ?? 10000) / 10000, 1),
    rainFactor: Math.min((w.precipitation ?? 0) / 5, 1),
    stormFactor: (w.weatherCode ?? 0) >= 95 ? 1 : 0,
    solarIntensity: Math.min((w.uvIndex ?? 5) / 10, 1),
  };
}

/**
 * Apply solar brightness boost.
 */
function applySolar(color: string, intensity: number): string {
  return color.replace(/oklch\(([\d.]+)/, (_, l) => {
    const next = parseFloat(l) + intensity * 0.08;
    return `oklch(${next.toFixed(3)}`;
  });
}

/**
 * Build base sky gradient.
 */
function buildBase(p: Palette, a: Atmosphere): string {
  const stops = p.stops
    .map(
      ([pos, c]) =>
        `${applySolar(c, a.solarIntensity)} ${(pos * 100).toFixed(0)}%`,
    )
    .join(", ");
  return `linear-gradient(to bottom, ${stops})`;
}

/**
 * Sun glow based on azimuth.
 */
function buildSunGlow(azimuthDeg: number, altitudeDeg: number): string | null {
  if (altitudeDeg < -6) return null;

  const x = (azimuthDeg / 360) * 100;
  const y = Math.max(10, 100 - altitudeDeg * 2);

  return `radial-gradient(circle at ${x}% ${y}%, rgba(255,220,150,0.25), transparent 60%)`;
}

/**
 * Stars layer.
 */
function buildStars(alt: number, cloud: number): string | null {
  if (alt > -6) return null;

  const opacity = Math.min(1, (-alt / 18) * (1 - cloud));

  return `radial-gradient(circle, rgba(255,255,255,${opacity}) 1px, transparent 1px)`;
}

/**
 * Cloud overlay.
 */
function buildClouds(a: Atmosphere): string | null {
  if (a.cloudFactor < 0.1) return null;

  return `linear-gradient(to bottom, rgba(255,255,255,${
    a.cloudFactor * 0.3
  }), transparent)`;
}

/**
 * Fog layer.
 */
function buildFog(a: Atmosphere): string | null {
  if (a.fogFactor < 0.1) return null;

  return `linear-gradient(to bottom, rgba(220,220,220,${
    a.fogFactor * 0.5
  }), transparent)`;
}

/**
 * Rain / storm layer.
 */
function buildRain(a: Atmosphere): string | null {
  if (a.rainFactor < 0.05 && a.stormFactor === 0) return null;

  return `linear-gradient(to bottom, rgba(40,50,70,${
    a.rainFactor * 0.5 + a.stormFactor * 0.4
  }), rgba(20,30,50,0.6))`;
}

/**
 * Main hook.
 *
 * @param altitudeDeg  Sun altitude
 * @param azimuthDeg   Sun azimuth (for directional lighting)
 * @param isPastNoon   Solar noon state
 * @param weather      Current weather snapshot
 */
export function useSkyGradient(
  altitudeDeg: number,
  azimuthDeg: number,
  isPastNoon: boolean,
  weather?: Partial<HourlyWeather>,
): SkyGradient {
  return useMemo(() => {
    const phase = resolvePhase(altitudeDeg, isPastNoon);
    const palette = PALETTES[phase];
    const atmosphere = deriveAtmosphere(weather);

    const layers = [
      buildStars(altitudeDeg, atmosphere.cloudFactor),
      buildSunGlow(azimuthDeg, altitudeDeg),
      buildRain(atmosphere),
      buildClouds(atmosphere),
      buildFog(atmosphere),
      buildBase(palette, atmosphere),
    ].filter(Boolean);

    return {
      background: layers.join(", "),
      foregroundClass: FOREGROUND[phase],
      mutedClass: MUTED[phase],
      phase,
    };
  }, [altitudeDeg, azimuthDeg, isPastNoon, weather]);
}
