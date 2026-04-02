"use client";

/**
 * @file sky-canvas-refined.tsx
 * @description Refined atmospheric renderer with balanced visuals and performance.
 *
 * Key improvements over previous version:
 * - Reduced visual noise (especially clouds + rain)
 * - Softer gradients and blending
 * - Fewer DOM nodes, more reuse
 * - Controlled animation (slower, subtle, realistic)
 * - Better storm readability (contrast instead of clutter)
 *
 * Design philosophy:
 * "Suggest atmosphere, don't simulate it literally"
 */

import React, { memo } from "react";
import type { SkyState } from "@/lib/sky-system";

// =============================================================================
// SkyCanvas
// =============================================================================

/**
 * Refined sky renderer.
 * Focuses on visual clarity and subtle realism instead of heavy layering.
 */
export const SkyCanvas = memo(function SkyCanvas({ sky }: { sky: SkyState }) {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {/* ── 1. Base sky ───────────────────────────────────────────── */}
      <div
        className="absolute inset-0 transition-[background] duration-[4s] ease-out"
        style={{ background: sky.skyGradient }}
      />

      {/* ── 2. Horizon glow (soft, not overpowering) ─────────────── */}
      <div
        className="absolute inset-x-0 bottom-0 h-[40%] pointer-events-none transition-opacity duration-2000"
        style={{
          opacity: sky.horizonGlowOpacity * 0.8,
          background: `radial-gradient(ellipse 70% 50% at ${sky.horizonGlowX}% 100%, ${sky.horizonGlowColor}, transparent 70%)`,
        }}
      />

      {/* ── 3. Stars (clean, not grid-like) ───────────────────────── */}
      <StarLayer opacity={sky.starOpacity} starField={sky.starField} />

      {/* ── 4. Sun ───────────────────────────────────────────────── */}
      {sky.sunVisible && (
        <div
          className="absolute rounded-full pointer-events-none"
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

      {/* ── 5. Clouds (FEWER, softer, slower) ───────────────────── */}
      {sky.cloudCount > 0 && (
        <CloudLayer
          count={Math.min(4, sky.cloudCount)} // cap to avoid noise
          opacity={sky.cloudOpacity}
          color={sky.cloudColor}
          blur={sky.cloudBlur}
          speed={sky.cloudSpeed}
        />
      )}

      {/* ── 6. Weather overlay (simplified + readable) ───────────── */}
      {sky.weatherOverlayType !== "none" && (
        <WeatherOverlay
          type={sky.weatherOverlayType}
          opacity={sky.weatherOverlayOpacity}
          color={sky.weatherOverlayColor}
        />
      )}
    </div>
  );
});

// =============================================================================
// StarLayer (unchanged, already optimal)
// =============================================================================

const StarLayer = memo(function StarLayer({
  opacity,
  starField,
}: {
  opacity: number;
  starField: string;
}) {
  return (
    <div
      className="absolute inset-0 pointer-events-none transition-opacity duration-[3s]"
      style={{ opacity }}
    >
      <div
        style={{
          width: "1px",
          height: "1px",
          boxShadow: starField,
        }}
      />
    </div>
  );
});

// =============================================================================
// CloudLayer (MAJOR REFINEMENT)
// =============================================================================

/**
 * Clouds redesigned to avoid "blob spam" look.
 * Uses fewer elements + better shaping.
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
      className="absolute inset-0 z-[3] pointer-events-none transition-opacity duration-[4s] ease-in-out overflow-hidden"
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

// =============================================================================
// WeatherOverlay (CLEANED UP)
// =============================================================================

const WeatherOverlay = memo(function WeatherOverlay({
  type,
  opacity,
  color,
}: {
  type: SkyState["weatherOverlayType"];
  opacity: number;
  color: string;
}) {
  if (type === "storm") {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "rgba(20,25,40,0.4)",
          opacity,
        }}
      />
    );
  }

  if (type === "rain") {
    return (
      <div className="absolute inset-0 pointer-events-none" style={{ opacity }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(
              170deg,
              transparent,
              transparent 6px,
              rgba(180,200,230,0.08) 6px,
              rgba(180,200,230,0.08) 8px
            )`,
            animation: "rainFall 0.6s linear infinite",
          }}
        />

        <style>{`
          @keyframes rainFall {
            from { background-position: 0 0; }
            to { background-position: 0 20px; }
          }
        `}</style>
      </div>
    );
  }

  if (type === "fog") {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${color}, transparent)`,
          opacity,
        }}
      />
    );
  }

  return null;
});
