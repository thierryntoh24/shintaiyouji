"use client";

/**
 * @file use-solar-ticker.ts
 * @description Shared rAF-based True Solar Time ticker.
 *
 * The ticker:
 * - Advances both TST and MST every second via `requestAnimationFrame`
 *   so switching between modes is seamless.
 * - Re-anchors (recomputes EoT) every 60 seconds to stay accurate.
 * - Stores longitude in a ref so the rAF closure always reads the latest
 *   value without needing to restart when longitude changes.
 */

import { useEffect, useRef, SetStateAction } from "react";
import {
  computeTrueSolarTime,
  type TrueSolarTimeResult,
} from "@/lib/astronomy";
import { nowDate } from "@/lib/ntp";

/**
 * Returns a live-ticking {@link TrueSolarTimeResult} for a fixed longitude,
 * or `undefined` while the longitude is not yet known.
 *
 * @param longitude - Observer longitude in decimal degrees (east = positive).
 *   Pass `undefined` before geolocation resolves; the hook will start as soon
 *   as a value arrives.
 *
 * @example
 * ```tsx
 * const tst = useSolarTicker(home?.longitude);
 * const solarDate = tst?.trueSolarTime;
 * ```
 */
export function useSolarTicker(
  setTST: (value: SetStateAction<TrueSolarTimeResult | undefined>) => void,
  longitude?: number,
) {
  const rafRef = useRef<number | null>(null);
  const lastSecRef = useRef(-1);
  const anchorTSTMs = useRef(0);
  const anchorMSTMs = useRef(0);
  const anchorPerfMs = useRef(0);

  // Keep longitude in a ref so the rAF closure reads the latest value
  // without needing to restart on every longitude change.
  const lonRef = useRef(longitude);
  useEffect(() => {
    lonRef.current = longitude;
  }, [longitude]);

  useEffect(() => {
    if (longitude == null) return;

    // Anchor to current moment
    const initial = computeTrueSolarTime(nowDate(), longitude);
    anchorTSTMs.current = initial.trueSolarTime.getTime();
    anchorMSTMs.current = initial.meanSolarTime.getTime();
    anchorPerfMs.current = performance.now();
    setTST(initial);
    lastSecRef.current = -1;

    function tick() {
      const elapsed = performance.now() - anchorPerfMs.current;
      const tstMs = anchorTSTMs.current + elapsed;
      const mstMs = anchorMSTMs.current + elapsed;
      const sec = Math.floor(tstMs / 1_000);

      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec;

        // Re-anchor every 60 s to keep EoT accurate
        if (sec % 60 === 0) {
          const fresh = computeTrueSolarTime(nowDate(), lonRef.current!);
          anchorTSTMs.current = fresh.trueSolarTime.getTime();
          anchorMSTMs.current = fresh.meanSolarTime.getTime();
          anchorPerfMs.current = performance.now();
          setTST(fresh);
        } else {
          setTST((prev) =>
            prev
              ? {
                  ...prev,
                  trueSolarTime: new Date(tstMs),
                  meanSolarTime: new Date(mstMs),
                }
              : prev,
          );
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [longitude]); // restart only when longitude actually changes
}
