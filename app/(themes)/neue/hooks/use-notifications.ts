"use client";

/**
 * @file use-notifications.ts
 * @description Derives notification strings from current app state.
 *
 * Previously this logic was copy-pasted identically into both `header.tsx`
 * and `mobile-header.tsx`. It is now a single source of truth.
 *
 * Notification sources (in order):
 * 1. Active location solar offset vs home solar offset.
 * 2. Civil time vs solar time at the active location (Equation of Time).
 * 3. Civil time vs solar time at home.
 * 4. System clock drift vs network time (only when > 1 s).
 */

import { useMemo } from "react";
import { formatDuration, secsToMins } from "@/utils";
import { useGlobal } from "@/app/contexts/global-provider";

/** Threshold below which civil-vs-solar offset is not worth showing (minutes). */
const MIN_OFFSET_MIN = 0.5;

/** Threshold below which clock drift is not worth showing (ms). */
const MIN_DRIFT_MS = 1_000;

/**
 * Returns a stable array of human-readable notification strings.
 * Recomputes only when `active`, `activeRes`, `home`, or `clockOffsetMs` change.
 *
 * @example
 * ```tsx
 * const notifications = useNotifications();
 * // ["Tokyo is 3h 2m ahead of London", "…"]
 * ```
 */
export function useNotifications(): string[] {
  const { active, activeRes, home, clockOffsetMs, homeRes } = useGlobal();

  return useMemo(() => {
    const msgs: string[] = [];

    const isViewingHome =
      Math.abs((active?.longitude ?? 0) - (home?.longitude ?? 0)) < 0.01;

    // 1 · Active location solar time vs home solar time
    if (!isViewingHome && homeRes && activeRes && active && home?.longitude) {
      const diffMin = activeRes.totalOffsetMinutes - homeRes.totalOffsetMinutes;
      const dir = diffMin > 0 ? "ahead of" : "behind";
      msgs.push(
        `${active.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} ${home.label.title}`,
      );
    }

    // 2 · Civil vs solar at active location
    if (activeRes && active?.time?.totalOffset != null) {
      const diffMin =
        secsToMins(active.time.totalOffset) - activeRes.totalOffsetMinutes;
      if (Math.abs(diffMin) >= MIN_OFFSET_MIN) {
        const dir = diffMin > 0 ? "ahead of" : "behind";
        msgs.push(
          `The local time in ${active.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`,
        );
      }
    }

    // 3 · Civil vs solar at home
    if (!isViewingHome && homeRes && home?.time?.totalOffset != null) {
      const diffMin =
        secsToMins(home.time.totalOffset) - homeRes.totalOffsetMinutes;
      if (Math.abs(diffMin) >= MIN_OFFSET_MIN) {
        const dir = diffMin > 0 ? "ahead of" : "behind";
        msgs.push(
          `${home.label.title}'s local time is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`,
        );
      }
    }

    // 4 · System clock drift
    if (Math.abs(clockOffsetMs) > MIN_DRIFT_MS) {
      const dir = clockOffsetMs > 0 ? "ahead of" : "behind";
      msgs.push(
        `Your system clock is ${formatDuration(Math.abs(clockOffsetMs), "ms")} ${dir} network time`,
      );
    }

    return msgs;
    // homeRes ticks every second
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    activeRes?.totalOffsetMinutes,
    home,
    clockOffsetMs,
    homeRes?.totalOffsetMinutes,
  ]);
}
