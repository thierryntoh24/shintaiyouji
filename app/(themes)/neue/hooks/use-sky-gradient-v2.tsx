"use client";

/**
 * @file use-sky-gradient.ts  (v2)
 * @description React hook and renderer for the atmospheric sky system.
 *
 * Two exports:
 *   {@link useSkyGradient}  — hook that derives {@link SkyState} once per second
 *   {@link SkyCanvas}       — React component that renders all sky layers as DOM
 *
 * Usage:
 * ```tsx
 * // In your page — the SkyCanvas goes behind everything else
 * <div className="relative w-full h-dvh">
 *   <SkyCanvas sky={sky} />
 *   <div className={cn("relative z-10", sky.foregroundClass)}>
 *     … your content …
 *   </div>
 * </div>
 *
 * // The hook — called once per second via the existing ticker
 * const sky = useSkyGradient({ sunPos, moonPos, moonIllum,
 *   isPastSolarNoon: res?.isPastSolarNoon ?? false,
 *   cloudCover: currentWeather?.cloudCover ?? 0,
 *   weatherCode: currentWeather?.weatherCode ?? 0,
 *   uvIndex: currentWeather?.uvIndex,
 * });
 * ```
 *
 * Performance notes:
 * - `useMemo` gates recomputation: only runs when inputs actually change.
 * - `SkyCanvas` layers that don't change (star field, static overlays) use
 *   `React.memo` to skip re-renders.
 * - Cloud animation is pure CSS `@keyframes` — zero JS after mount.
 * - The sun/moon disc and star field are positioned with inline `style` only;
 *   no layout properties change, so the browser composites them on the GPU.
 * - Weather overlays use `opacity` transitions only — compositor-only.
 */

import React, { useMemo, memo, useEffect } from "react";
import {
  computeSkyState,
  type SkyInput,
  type SkyState,
} from "@/lib/sky-system";
import { useNeue } from "@/app/(themes)/neue/contexts/ui-context";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Derives the full {@link SkyState} from live astronomical and weather inputs.
 * Memoised — only recomputes when inputs change.
 *
 * Designed to be called from a component that already ticks once per second
 * (the main page ticker). All inputs come from data already being computed.
 *
 * @param input - {@link SkyInput} — pass `?? 0` / `?? false` for optional fields
 *                during boot before weather/astronomy data is ready.
 */
export function useSkyGradient(input: SkyInput): SkyState {
  return useMemo(
    () => computeSkyState(input),
    // Destructure only the scalar values that actually affect output —
    // avoids recomputing when an upstream object reference changes but
    // the numbers inside haven't.
    [
      input.sunPos.altitudeDeg,
      input.sunPos.azimuthDeg,
      input.moonPos.altitudeDeg,
      input.moonPos.azimuthDeg,
      input.moonIllum.fraction,
      input.moonIllum.phase,
      input.moonIllum.isWaxing,
      input.isPastSolarNoon,
      input.cloudCover,
      input.weatherCode,
      input.uvIndex,
    ],
  );
}

// ---------------------------------------------------------------------------
// SkyCanvas
// ---------------------------------------------------------------------------

/**
 * Renders the full atmospheric layer stack as absolute-positioned DOM elements.
 *
 * Place this as the first child of a `position: relative` container that fills
 * the viewport. All layers sit at `z-0` or below — your content goes above.
 *
 * Layers rendered (bottom → top):
 *   z-0  Sky gradient          — base `background` on the root div
 *   z-1  Horizon glow          — radial gradient, sun/moon direction
 *   z-1  Stars                 — box-shadow point field
 *   z-2  Sun disc              — circle + corona
 *   z-2  Moon disc             — circle + phase clip
 *   z-3  Clouds                — animated blurred shapes
 *   z-4  Weather overlay       — fog / rain tint / storm darkening
 */
export const SkyCanvas = memo(function SkyCanvas({ sky }: { sky: SkyState }) {
  const { setSkyPhase, skyPhase } = useNeue();
  const pathname = usePathname();
  useEffect(() => {
    if (sky.phase === skyPhase) return;
    setSkyPhase(pathname !== "/about" ? sky.phase : "");
  }, [sky.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* ── Layer 0: Base sky gradient ──────────────────────────────────── */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 transition-all duration-[3s] ease-in-out"
        style={{ background: sky.skyGradient }}
      />

      {/* ── Layer 1: Horizon glow ────────────────────────────────────────── */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 z-1 h-[45%] pointer-events-none transition-opacity duration-[2s] ease-in-out"
        style={{
          opacity: sky.horizonGlowOpacity,
          background: `radial-gradient(ellipse 80% 60% at ${sky.horizonGlowX}% 100%, ${sky.horizonGlowColor}, transparent 70%)`,
        }}
      />

      {/* ── Layer 1: Stars ────────────────────────────────────────────────── */}
      {/* <StarLayer opacity={sky.starOpacity} starField={sky.starField} /> */}

      {/* ── Layer 2: Sun disc ────────────────────────────────────────────── */}
      {sky.sunVisible && (
        <div
          aria-hidden
          data-name={"sun-layer"}
          className="absolute z-2 rounded-full pointer-events-none transition-all duration-1000 ease-out"
          style={{
            width: `${sky.sunSize}vw`,
            height: `${sky.sunSize}vw`,
            left: `${sky.sunX}%`,
            top: `${sky.sunY}%`,
            transform: "translate(-50%, -50%)",
            background: sky.sunColor,
            boxShadow: sky.sunGlow,
            opacity: sky.sunOpacity,
          }}
        />
      )}

      {/* ── Layer 2: Moon disc ───────────────────────────────────────────── */}
      {/* {sky.moonVisible && (
        <MoonDisc
          moonX={sky.moonX}
          moonY={sky.moonY}
          moonSize={sky.moonSize}
          moonOpacity={sky.moonOpacity}
          moonClip={sky.moonClip}
        />
      )} */}

      {/* ── Layer 3: Clouds ──────────────────────────────────────────────── */}
      {sky.cloudCount > 0 && (
        <CloudLayer
          count={sky.cloudCount}
          opacity={sky.cloudOpacity}
          color={sky.cloudColor}
          blur={sky.cloudBlur}
          speed={sky.cloudSpeed}
        />
      )}

      {/* ── Layer 4: Weather overlay ─────────────────────────────────────── */}
      {sky.weatherOverlayType !== "none" && (
        <WeatherOverlay
          type={sky.weatherOverlayType}
          opacity={sky.weatherOverlayOpacity}
          color={sky.weatherOverlayColor}
        />
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// StarLayer
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-unused-vars */
/** Memoised — only re-renders when opacity changes. */
const StarLayer = memo(function StarLayer({
  opacity,
  starField,
}: {
  opacity: number;
  starField: string;
}) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-1 pointer-events-none transition-all duration-[3s] ease-in-out"
      style={{ opacity }}
    >
      {/* 1×1px element; stars rendered as box-shadows spreading out from it */}
      <div
        className="absolute"
        style={{
          width: "1px",
          height: "1px",
          top: 0,
          left: 0,
          boxShadow: starField,
        }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// MoonDisc
// ---------------------------------------------------------------------------

/** Moon disc with phase clip-path. Memoised to avoid unnecessary repaints. */
const MoonDisc = memo(function MoonDisc({
  moonX,
  moonY,
  moonSize,
  moonOpacity,
  moonClip,
}: {
  moonX: number;
  moonY: number;
  moonSize: number;
  moonOpacity: number;
  moonClip: string;
}) {
  return (
    <div
      aria-hidden
      data-name={"moon-layer"}
      className="absolute z-2 rounded-full pointer-events-none transition-all duration-[2s] ease-in-out"
      style={{
        width: `${moonSize}vw`,
        height: `${moonSize}vw`,
        left: `${moonX}%`,
        top: `${moonY}%`,
        transform: "translate(-50%, -50%)",
        background:
          "radial-gradient(circle at 35% 35%, oklch(0.97 0.01 220), oklch(0.82 0.02 240))",
        boxShadow: `0 0 ${moonSize * 4}vw ${moonSize * 0.5}vw rgba(200, 215, 255, 0.15)`,
        opacity: moonOpacity,
        // filter: `blur(2px)`,
        // clipPath applies phase mask; "none" = full disc (full moon)
        clipPath: moonClip === "none" ? undefined : moonClip,
      }}
    />
  );
});
/* eslint-enable @typescript-eslint/no-unused-vars */

// ---------------------------------------------------------------------------
// CloudLayer
// ---------------------------------------------------------------------------

/**
 * Renders `count` cloud shapes inside a blurred container.
 *
 * One `filter: blur()` on the container = one paint layer total,
 * regardless of how many cloud divs are inside.
 * Individual clouds animate with `transform: translateX` only — composited.
 */
const CloudLayer = memo(function CloudLayer({
  count,
  opacity,
  color,
  blur,
  speed,
}: {
  count: number;
  opacity: number;
  color: string;
  blur: string;
  speed: number;
}) {
  // Fixed cloud templates — varying size, vertical position, and speed offset
  const CLOUDS = [
    { w: 28, h: 10, top: 12, delay: 0, speedMul: 1.0 },
    { w: 22, h: 8, top: 20, delay: -15, speedMul: 0.8 },
    { w: 35, h: 12, top: 8, delay: -32, speedMul: 1.2 },
    { w: 18, h: 7, top: 28, delay: -8, speedMul: 0.7 },
    { w: 30, h: 11, top: 16, delay: -45, speedMul: 1.1 },
    { w: 25, h: 9, top: 22, delay: -22, speedMul: 0.9 },
    { w: 20, h: 8, top: 6, delay: -55, speedMul: 1.3 },
    { w: 32, h: 13, top: 18, delay: -38, speedMul: 0.85 },
  ].slice(0, count);

  return (
    <div
      aria-hidden
      className="absolute inset-0 z-[3] pointer-events-none transition-all duration-[4s] ease-in-out overflow-hidden"
      style={{ opacity, filter: `blur(${blur})` }}
    >
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${c.w}%`,
            height: `${c.h}%`,
            top: `${c.top}%`,
            left: "-20%",
            background: color,
            animationName: "cloudDrift",
            animationDuration: `${(speed * c.speedMul).toFixed(0)}ms`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}

      {/* Inject the keyframe once via a style tag — no CSS file needed */}
      <style>{`
        @keyframes cloudDrift {
          from { transform: translateX(0%); }
          to   { transform: translateX(140vw); }
        }
      `}</style>
    </div>
  );
});

// ---------------------------------------------------------------------------
// WeatherOverlay
// ---------------------------------------------------------------------------

/** Fog / rain / storm / snow overlay. Opacity transitions smoothly on change. */
const WeatherOverlay = memo(function WeatherOverlay({
  type,
  opacity,
  color,
}: {
  type: SkyState["weatherOverlayType"];
  opacity: number;
  color: string;
}) {
  const isFog = type === "fog";
  const isRain = type === "rain" || type === "storm";

  return (
    <div
      aria-hidden
      className="absolute inset-0 z-4 pointer-events-none transition-smooth-short"
      data-name={type}
      style={{ opacity }}
    >
      {/* Fog / snow — soft radial wash from bottom */}
      {(isFog || type === "snow") && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 120% 60% at 50% 120%, ${color}, transparent 65%)`,
          }}
        />
      )}

      {/* Rain / storm — diagonal streak pattern + general darkening */}
      {isRain && (
        <>
          <div
            className="absolute inset-0 pop-chan"
            style={{ background: color }}
          />
          {/* Rain streak overlay using repeating-gradient */}
          <div
            className="absolute inset-0 kochi"
            style={{
              backgroundImage: `repeating-linear-gradient(
                ${type === "storm" ? "175deg" : "170deg"},
                transparent,
                transparent 3px,
                rgba(180, 200, 230, 0.06) 3px,
                rgba(180, 200, 230, 0.06) 4px
              )`,
            }}
          />
        </>
      )}
    </div>
  );
});
