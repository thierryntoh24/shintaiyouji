/**
 * @file sky-system.ts
 * @description Pure atmospheric rendering engine — no React, no side effects.
 *
 * Takes live astronomical and weather data and returns everything needed
 * to render a multi-layer sky: base gradient, horizon glow, sun/moon disc
 * positions and colors, star field opacity, cloud config, and weather overlays.
 *
 * All functions are pure and cheap — safe to call once per second from a
 * React hook without any memoisation concerns.
 *
 * Layer stack (bottom → top, managed by the consumer):
 *   1. Sky gradient          — base atmosphere color
 *   2. Horizon glow          — radial gradient at sun/moon azimuth
 *   3. Stars                 — box-shadow point field
 *   4. Sun disc              — circle with corona glow
 *   5. Moon disc             — circle with phase mask
 *   6. Cloud layer           — animated blurred shapes
 *   7. Weather overlay       — rain streaks / fog wash / storm tint
 *   8. frosted-grain         — a frosted noise layer
 *   9. Content
 */

import type {
  SunPosition,
  MoonPosition,
  MoonIllumination,
} from "@/lib/astronomy";

// =============================================================================
// § 1 · TYPES
// =============================================================================

/**
 * Named sky phase keyed by sun altitude and AM/PM.
 * 12 phases give enough granularity for convincing sky transitions.
 */
export type SkyPhase =
  | "deep-night" // alt < −18°
  | "astronomical" // −18° ≤ alt < −12°  (AM)
  | "nautical" // −12° ≤ alt < −6°   (AM)
  | "civil-dawn" // −6°  ≤ alt < 0°    (AM)
  | "golden-morning" //  0°  ≤ alt < 6°    (AM)
  | "morning" //  6°  ≤ alt < 20°   (AM)
  | "midday" //  20° ≤ alt          (AM/PM, high sun)
  | "afternoon" //  20° ≤ alt          (PM, same brightness, cooling hue)
  | "golden-evening" //  0°  ≤ alt < 6°    (PM)
  | "civil-dusk" // −6°  ≤ alt < 0°    (PM)
  | "evening" // −12° ≤ alt < −6°   (PM)
  | "night"; // −18° ≤ alt < −12°  (PM)

/** Weather condition bucket derived from WMO code. */
export type WeatherCondition =
  | "clear"
  | "hazy" // partly cloudy
  | "overcast" // fully cloudy
  | "fog"
  | "rain"
  | "storm"
  | "snow";

/** Phases considered "dark sky" for data-sky-dark attribute. */
const IS_DARK_PHASE = new Set<SkyPhase>([
  "deep-night",
  "astronomical",
  "nautical",
  "civil-dawn",
  "civil-dusk",
  "evening",
  "night",
]);

/**
 * Complete output of the sky system.
 * Every field is a plain value — CSS strings, numbers, booleans.
 * The consumer turns these into DOM styles.
 */
export interface SkyState {
  // ── Atmosphere ─────────────────────────────────────────────────────────────
  /** CSS `linear-gradient(to bottom, …)` for the base sky. */
  skyGradient: string;
  /** Current sky phase — useful for conditional rendering decisions. */
  phase: SkyPhase;
  /** Weather condition bucket. */
  condition: WeatherCondition;

  // ── Horizon glow ───────────────────────────────────────────────────────────
  /** Opacity of the horizon glow (0–1). 0 when sun is far below horizon. */
  horizonGlowOpacity: number;
  /** CSS color of the horizon glow (sun/moon tint). */
  horizonGlowColor: string;
  /**
   * Horizontal position of the glow center as a percentage (0–100).
   * Derived from sun azimuth. 0 = left edge, 100 = right edge.
   */
  horizonGlowX: number;

  // ── Sun disc ───────────────────────────────────────────────────────────────
  /** Whether to render the sun disc at all. */
  sunVisible: boolean;
  /** Sun disc x position as viewport percentage. */
  sunX: number;
  /** Sun disc y position as viewport percentage (0 = top). */
  sunY: number;
  /** Sun disc radius in viewport units. */
  sunSize: number;
  /** CSS color of the sun disc. Warm at horizon, white at zenith. */
  sunColor: string;
  /** CSS `box-shadow` string for the sun corona/glow. */
  sunGlow: string;
  /** Sun disc opacity (fades as it approaches/passes the horizon). */
  sunOpacity: number;

  // ── Moon disc ──────────────────────────────────────────────────────────────
  /** Whether to render the moon disc. */
  moonVisible: boolean;
  /** Moon disc x position as viewport percentage. */
  moonX: number;
  /** Moon disc y position as viewport percentage. */
  moonY: number;
  /** Moon disc radius in viewport units. */
  moonSize: number;
  /** Moon disc opacity — dimmer in daylight, modulated by phase. */
  moonOpacity: number;
  /**
   * CSS clip-path string that cuts the moon disc to show the correct phase.
   * Uses a two-circle approximation (accurate enough for rendering).
   */
  moonClip: string;

  // ── Stars ──────────────────────────────────────────────────────────────────
  /**
   * Opacity of the star layer (0–1).
   * 0 during the day; ramps up through astronomical twilight.
   * Also reduced by moon brightness (full moon washes out faint stars).
   */
  starOpacity: number;
  /**
   * Pre-computed `box-shadow` CSS string for the star field.
   * Generated once with a seeded algorithm — stable across re-renders.
   * Pass as a style prop on a 1×1px positioned element.
   */
  starField: string;

  // ── Clouds ─────────────────────────────────────────────────────────────────
  /** Opacity of the cloud layer (0–1), driven by cloudCover %. */
  cloudOpacity: number;
  /**
   * Number of cloud shapes to render (1–8).
   * Proportional to cloud cover — clear sky = 0, overcast = 8.
   */
  cloudCount: number;
  /** CSS color of cloud shapes. Warm at golden hour, grey when overcast. */
  cloudColor: string;
  /** CSS blur value for the cloud container (e.g. "40px"). */
  cloudBlur: string;
  /** Animation duration for cloud drift (ms). Faster in storms. */
  cloudSpeed: number;

  // ── Weather overlay ────────────────────────────────────────────────────────
  /** Opacity of the weather effect overlay (0 = none). */
  weatherOverlayOpacity: number;
  /** CSS color/gradient for the weather overlay. */
  weatherOverlayColor: string;
  /**
   * Type of weather overlay to render.
   * "none" | "fog" | "rain" | "storm" | "snow"
   */
  weatherOverlayType: "none" | "fog" | "rain" | "storm" | "snow";

  // ── Foreground ─────────────────────────────────────────────────────────────
  /** Tailwind text color class — white for dark skies, black for bright. */
  foregroundClass: "text-white" | "text-black" | "text-white/90";
  /** Tailwind muted text class for secondary elements. */
  mutedClass: "text-white/60" | "text-black/50";
  /**
   * Whether this phase is a "dark sky" — night, twilight, dusk family.
   * Use as `data-sky-dark={sky.isDark || undefined}` on the wrapper.
   */
  isDark: boolean;

  /**
   * Inline CSS custom properties to set on the sky wrapper element.
   * Apply as `style={sky.cssVars}` — they flow down to all tokens in
   * sky-tokens.css via the [data-sky="<phase>"] selectors.
   */
  cssVars: React.CSSProperties;
}

// =============================================================================
// § 2 · CONSTANTS & PALETTES
// =============================================================================

/** Gradient stop: [position 0–1, oklch string] */
type Stop = [number, string];

/** Base sky gradient palette per phase. */
const SKY_PALETTES: Record<SkyPhase, Stop[]> = {
  "deep-night": [
    [0, "oklch(0.07 0.02 260)"],
    [0.7, "oklch(0.09 0.025 255)"],
    [1, "oklch(0.11 0.03 250)"],
  ],
  astronomical: [
    [0, "oklch(0.10 0.03 260)"],
    [0.6, "oklch(0.14 0.04 255)"],
    [1, "oklch(0.18 0.05 245)"],
  ],
  nautical: [
    [0, "oklch(0.13 0.04 255)"],
    [0.5, "oklch(0.18 0.06 250)"],
    [1, "oklch(0.24 0.07 240)"],
  ],
  "civil-dawn": [
    [0, "oklch(0.22 0.06 255)"],
    [0.45, "oklch(0.35 0.08 260)"],
    [0.75, "oklch(0.62 0.10 55)"],
    [1, "oklch(0.75 0.13 60)"],
  ],
  "golden-morning": [
    [0, "oklch(0.42 0.09 240)"],
    [0.4, "oklch(0.60 0.10 230)"],
    [0.72, "oklch(0.78 0.14 75)"],
    [1, "oklch(0.88 0.12 80)"],
  ],
  morning: [
    [0, "oklch(0.55 0.10 235)"],
    [0.5, "oklch(0.72 0.09 225)"],
    [1, "oklch(0.90 0.05 215)"],
  ],
  midday: [
    [0, "oklch(0.60 0.14 240)"],
    [0.5, "oklch(0.72 0.11 230)"],
    [1, "oklch(0.88 0.06 220)"],
  ],
  afternoon: [
    [0, "oklch(0.58 0.13 238)"],
    [0.5, "oklch(0.70 0.10 228)"],
    [1, "oklch(0.87 0.07 218)"],
  ],
  "golden-evening": [
    [0, "oklch(0.40 0.09 238)"],
    [0.38, "oklch(0.58 0.10 228)"],
    [0.7, "oklch(0.75 0.16 55)"],
    [1, "oklch(0.84 0.14 45)"],
  ],
  "civil-dusk": [
    [0, "oklch(0.22 0.06 258)"],
    [0.42, "oklch(0.36 0.09 255)"],
    [0.72, "oklch(0.58 0.13 45)"],
    [1, "oklch(0.70 0.15 38)"],
  ],
  evening: [
    [0, "oklch(0.14 0.05 260)"],
    [0.5, "oklch(0.22 0.07 255)"],
    [1, "oklch(0.30 0.08 250)"],
  ],
  night: [
    [0, "oklch(0.10 0.03 258)"],
    [0.6, "oklch(0.13 0.04 255)"],
    [1, "oklch(0.17 0.05 250)"],
  ],
};

const FOREGROUND: Record<SkyPhase, SkyState["foregroundClass"]> = {
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

const MUTED: Record<SkyPhase, SkyState["mutedClass"]> = {
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

// =============================================================================
// § 3 · HELPERS
// =============================================================================

/** Linear interpolation. */
const lerp = (a: number, b: number, t: number) =>
  a + (b - a) * Math.max(0, Math.min(1, t));

/** Maps a value from one range to another, clamped. */
const remap = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) => lerp(outMin, outMax, (v - inMin) / (inMax - inMin));

/** Converts azimuth (0–360°, north = 0) to screen x percentage.
 *  South (180°) → center (50%). Full rotation maps to 0–100%. */
const azimuthToX = (az: number) => ((az % 360) / 360) * 100;

/** Converts altitude (−90 to +90°) to screen y percentage.
 *  0° (horizon) → 85%. 90° (zenith) → 5%. Below horizon clamped. */
const altitudeToY = (alt: number) => remap(Math.min(alt, 90), 0, 90, 85, 5);

/** Resolves sky phase from altitude and AM/PM. */
function resolvePhase(alt: number, isPM: boolean): SkyPhase {
  if (alt < -18) return "deep-night";
  if (alt < -12) return isPM ? "night" : "astronomical";
  if (alt < -6) return isPM ? "evening" : "nautical";
  if (alt < 0) return isPM ? "civil-dusk" : "civil-dawn";
  if (alt < 6) return isPM ? "golden-evening" : "golden-morning";
  if (alt < 20) return isPM ? "afternoon" : "morning";
  return isPM ? "afternoon" : "midday";
}

/** Classifies a WMO weather code into a {@link WeatherCondition}. */
function resolveCondition(
  weatherCode: number,
  cloudCover: number,
): WeatherCondition {
  if (weatherCode === 0) return "clear";
  if (weatherCode <= 3) return cloudCover > 60 ? "overcast" : "hazy";
  if (weatherCode <= 49) return "fog";
  if (weatherCode <= 69) return "rain";
  if (weatherCode <= 79) return "snow";
  if (weatherCode <= 82) return "rain";
  if (weatherCode <= 86) return "snow";
  return "storm"; // 95–99
}

/**
 * Adjusts an oklch lightness value toward overcast grey as cloud cover increases.
 * Only touches lightness — avoids a full CSS parser while still looking right.
 */
function applyCloudToColor(color: string, cloudCover: number): string {
  if (cloudCover < 5) return color;
  const grey = 0.72;
  const t = (cloudCover / 100) * 0.55;
  return color.replace(/oklch\(([\d.]+)/, (_, l) => {
    const adjusted = lerp(parseFloat(l), grey, t);
    return `oklch(${adjusted.toFixed(3)}`;
  });
}

/** Builds a `linear-gradient(to bottom, …)` string from stops + cloud cover. */
function buildSkyGradient(phase: SkyPhase, cloudCover: number): string {
  const stops = SKY_PALETTES[phase]
    .map(
      ([pos, color]) =>
        `${applyCloudToColor(color, cloudCover)} ${(pos * 100).toFixed(0)}%`,
    )
    .join(", ");
  return `linear-gradient(to bottom, ${stops})`;
}

// =============================================================================
// § 4 · STAR FIELD GENERATOR
// =============================================================================

/**
 * Generates a stable, seeded CSS `box-shadow` star field.
 * Called once (outside React) and reused — never regenerated.
 *
 * Uses a deterministic pseudo-random sequence so the star positions
 * are stable across renders and SSR hydration.
 *
 * @param count - Number of stars. 300 is imperceptible, 600 is rich.
 */
function generateStarField(count: number): string {
  const stars: string[] = [];
  for (let i = 0; i < count; i++) {
    // Deterministic pseudo-random using sine — no seed library needed
    const x = ((Math.sin(i * 127.1 + 1) * 0.5 + 0.5) * 100).toFixed(2);
    const y = ((Math.sin(i * 311.7 + 2) * 0.5 + 0.5) * 100).toFixed(2);
    // ~1 in 15 stars is slightly larger
    const size = i % 15 === 0 ? "2px" : "1px";
    // Vary brightness
    const alpha = (0.4 + (Math.sin(i * 74.3) * 0.5 + 0.5) * 0.6).toFixed(2);
    stars.push(`${x}vw ${y}vh 0 ${size} rgba(255,255,255,${alpha})`);
  }
  return stars.join(",");
}

/** Generated once at module level — never recalculated. */
const STAR_FIELD = generateStarField(500);

// =============================================================================
// § 5 · MOON PHASE CLIP-PATH
// =============================================================================

/**
 * Returns a CSS `clip-path: path(…)` string that masks a circular element
 * to show the correct lunar phase.
 *
 * Approximates the illuminated crescent/gibbous using two arcs:
 * one for the day/night boundary (always a semicircle) and one for the
 * limb (an ellipse that varies with phase).
 *
 * @param phase     - Phase fraction 0–1 (0 = new, 0.5 = full, 1 = new).
 * @param isWaxing  - True while fraction is growing (0 → 0.5).
 * @param size      - Disc diameter in pixels (used to scale the path).
 */
function moonPhasePath(phase: number, isWaxing: boolean, size: number): string {
  const r = size / 2;
  const cx = r;
  const cy = r;

  // Full moon — no clip needed
  if (phase > 0.48 && phase < 0.52) return "none";
  // New moon — fully hidden
  if (phase < 0.02 || phase > 0.98) return `circle(0px at ${cx}px ${cy}px)`;

  // Limb ellipse x-radius varies from r (full) → 0 (quarter) → r again (new)
  // At quarter (phase 0.25/0.75) the terminator is a straight line (rx = 0)
  const distFromQuarter = Math.abs((phase % 0.5) - 0.25);
  const limbRx = (distFromQuarter / 0.25) * r;

  const isGibbous =
    (phase > 0.25 && phase < 0.5) || (phase > 0.5 && phase < 0.75);

  // SVG path: lit half = right semicircle + limb arc
  // Waxing: lit side on right; Waning: lit side on left (flip x)
  const flip = isWaxing ? 1 : -1; // eslint-disable-line @typescript-eslint/no-unused-vars

  // Top of disc → bottom via lit semicircle
  const d = [
    `M ${cx} ${cy - r}`,
    // Outer limb arc (always a semicircle on the lit side)
    `A ${r} ${r} 0 0 ${isWaxing ? 1 : 0} ${cx} ${cy + r}`,
    // Inner terminator arc — ellipse that defines crescent/gibbous boundary
    `A ${limbRx} ${r} 0 0 ${isGibbous ? (isWaxing ? 0 : 1) : isWaxing ? 1 : 0} ${cx} ${cy - r}`,
    "Z",
  ].join(" ");

  return `path('${d}')`;
}

// =============================================================================
// § 6 · MAIN COMPUTATION
// =============================================================================

/**
 * Input to the sky system — pass what you have, defaults handle the rest.
 */
export interface SkyInput {
  sunPos: Pick<SunPosition, "altitudeDeg" | "azimuthDeg" | "isAboveHorizon">;
  moonPos: Pick<MoonPosition, "altitudeDeg" | "azimuthDeg" | "isAboveHorizon">;
  moonIllum: Pick<MoonIllumination, "fraction" | "phase" | "isWaxing">;
  isPastSolarNoon: boolean;
  /** Cloud cover 0–100. Pass 0 if unavailable. */
  cloudCover: number;
  /** WMO weather code. Pass 0 (clear) if unavailable. */
  weatherCode: number;
  /** UV index 0–11+. Used for brightness scaling. */
  uvIndex?: number;
}

/**
 * Derives the complete sky state from astronomical and weather inputs.
 *
 * Pure function — no side effects, safe to call every second.
 *
 * @param input - {@link SkyInput}
 * @returns     - {@link SkyState}
 */
export function computeSkyState(input: SkyInput): SkyState {
  const {
    sunPos,
    moonPos,
    moonIllum,
    isPastSolarNoon,
    cloudCover,
    weatherCode,
    uvIndex = 0,
  } = input;

  const { altitudeDeg: sunAlt, azimuthDeg: sunAz } = sunPos;
  const { altitudeDeg: moonAlt, azimuthDeg: moonAz } = moonPos;

  // ── Phase & condition ─────────────────────────────────────────────────────

  const phase = resolvePhase(sunAlt, isPastSolarNoon);
  const condition = resolveCondition(weatherCode, cloudCover);

  // ── Sky gradient ──────────────────────────────────────────────────────────

  const skyGradient = buildSkyGradient(phase, cloudCover);

  // ── Horizon glow ──────────────────────────────────────────────────────────
  // Strongest near sunrise/sunset (alt −6° → +6°), from the sun's direction.
  // After dark, a faint glow from the moon if it's bright.

  const sunGlowStrength = remap(Math.abs(sunAlt), 6, -4, 0, 1);
  const moonGlowStrength = moonPos.isAboveHorizon
    ? moonIllum.fraction * remap(moonAlt, 20, 0, 0, 0.3)
    : 0;

  const isGoldenHour =
    phase === "golden-morning" ||
    phase === "golden-evening" ||
    phase === "civil-dawn" ||
    phase === "civil-dusk";

  const horizonGlowColor = isGoldenHour
    ? `oklch(0.75 0.18 ${isPastSolarNoon ? "38" : "55"})`
    : moonGlowStrength > 0
      ? `oklch(0.85 0.02 240)` // cool moonlight
      : `oklch(0.65 0.06 220)`; // soft blue twilight

  const horizonGlowOpacity = Math.max(sunGlowStrength, moonGlowStrength);
  const horizonGlowX =
    sunGlowStrength > moonGlowStrength ? azimuthToX(sunAz) : azimuthToX(moonAz);

  // ── Sun disc ──────────────────────────────────────────────────────────────

  const sunVisible = sunAlt > -4; // hide when well below horizon
  const sunX = azimuthToX(sunAz);
  const sunY = altitudeToY(Math.max(sunAlt, 0));

  // Size: slightly larger near horizon (atmospheric magnification illusion)
  const sunSize = remap(sunAlt, 0, 60, 4.5, 2.8);

  // Color: deep orange at horizon → warm white at zenith
  const sunHue = remap(sunAlt, 0, 30, 35, 80);
  const sunChroma = remap(sunAlt, 0, 30, 0.2, 0.04);
  const sunLightness = remap(sunAlt, 0, 30, 0.78, 0.98);

  // UV-driven brightness boost at solar noon
  const uvBoost = remap(uvIndex, 0, 8, 0, 0.04);

  const sunColor = `oklch(${(sunLightness + uvBoost).toFixed(3)} ${sunChroma.toFixed(3)} ${sunHue.toFixed(0)})`;

  // Corona glow — huge near horizon, tight at zenith
  const coronaSpread = remap(sunAlt, 0, 60, 60, 20);
  const coronaColor = isGoldenHour
    ? `rgba(255, 180, 60, 0.35)`
    : `rgba(255, 240, 200, 0.25)`;
  const sunGlow = [
    `0 0 ${(sunSize * 2).toFixed(1)}vw ${(sunSize * 0.5).toFixed(1)}vw ${coronaColor}`,
    `0 0 ${coronaSpread}px ${(coronaSpread * 0.4).toFixed(0)}px ${coronaColor}`,
  ].join(", ");

  const sunOpacity = sunVisible ? remap(sunAlt, -4, 2, 0, 1) : 0;

  // ── Moon disc ─────────────────────────────────────────────────────────────

  // Moon visible at night, and faintly during the day if above horizon
  const moonVisible = moonPos.isAboveHorizon && moonIllum.fraction > 0.02;
  const moonX = azimuthToX(moonAz);
  const moonY = altitudeToY(Math.max(moonAlt, 0));
  const moonSize = 2.2; // slightly smaller than sun
  // const sunSize = remap(sunAlt, 0, 60, 4.5, 2.8);

  // Dim significantly during daylight; modulate by phase (brighter when full)
  const dayDim = remap(sunAlt, -6, 20, 1, 0.12);
  const moonOpacity = moonVisible
    ? Math.max(0.05, dayDim * (0.4 + moonIllum.fraction * 0.6))
    : 0;

  const moonClip = moonPhasePath(moonIllum.phase, moonIllum.isWaxing, 100);

  // ── Stars ─────────────────────────────────────────────────────────────────

  // Fade in from astronomical twilight (−18°) to full night (−18° and below)
  const baseStarOpacity = remap(sunAlt, -6, -18, 0, 0.7);
  // Full moon washes out fainter stars — reduce by up to 40% at full moon
  const moonWash = moonPos.isAboveHorizon ? moonIllum.fraction * 0.4 : 0;
  const starOpacity = Math.max(0, baseStarOpacity - moonWash);

  // ── Clouds ────────────────────────────────────────────────────────────────

  const cloudOpacity = remap(cloudCover, 5, 85, 0, 0.55);
  const cloudCount = Math.round(remap(cloudCover, 0, 100, 0, 8));

  // Cloud color: warm at golden hour, white in daylight, grey at night/overcast
  const cloudColor = isGoldenHour
    ? `rgba(255, 210, 140, 0.9)`
    : phase === "midday" || phase === "morning" || phase === "afternoon"
      ? `rgba(255, 255, 255, 0.85)`
      : `rgba(180, 185, 200, 0.8)`;

  // Heavier blur when overcast (diffuse), lighter when scattered (individual shapes)
  const cloudBlur = cloudCover > 70 ? "50px" : "35px";

  // Storm clouds move faster
  const cloudSpeed =
    condition === "storm" ? 25_000 : condition === "rain" ? 40_000 : 70_000;

  // ── Weather overlay ───────────────────────────────────────────────────────

  let weatherOverlayType: SkyState["weatherOverlayType"] = "none";
  let weatherOverlayOpacity = 0;
  let weatherOverlayColor = "transparent";

  if (condition === "fog") {
    weatherOverlayType = "fog";
    weatherOverlayOpacity = remap(cloudCover, 30, 90, 0.15, 0.5);
    weatherOverlayColor = "rgba(220, 225, 230, 0.7)";
  } else if (condition === "storm") {
    weatherOverlayType = "storm";
    weatherOverlayOpacity = 0.18;
    weatherOverlayColor = "rgba(40, 45, 60, 0.6)";
  } else if (condition === "rain") {
    weatherOverlayType = "rain";
    weatherOverlayOpacity = remap(cloudCover, 40, 90, 0.05, 0.2);
    weatherOverlayColor = "rgba(140, 155, 175, 0.35)";
  } else if (condition === "snow") {
    weatherOverlayType = "snow";
    weatherOverlayOpacity = 0.1;
    weatherOverlayColor = "rgba(230, 235, 245, 0.4)";
  }

  return {
    skyGradient,
    phase,
    condition,

    horizonGlowOpacity,
    horizonGlowColor,
    horizonGlowX,

    sunVisible,
    sunX,
    sunY,
    sunSize,
    sunColor,
    sunGlow,
    sunOpacity,

    moonVisible,
    moonX,
    moonY,
    moonSize,
    moonOpacity,
    moonClip,

    starOpacity,
    starField: STAR_FIELD,

    cloudOpacity,
    cloudCount,
    cloudColor,
    cloudBlur,
    cloudSpeed,

    weatherOverlayOpacity,
    weatherOverlayColor,
    weatherOverlayType,

    foregroundClass: FOREGROUND[phase],
    mutedClass: MUTED[phase],
    isDark: IS_DARK_PHASE.has(phase),
    cssVars: {}, // empty — tokens are driven by data-sky attr in CSS
  };
}
