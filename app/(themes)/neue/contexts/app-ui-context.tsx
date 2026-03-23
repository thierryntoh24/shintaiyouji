"use client";

/**
 * @file app-ui-context.tsx
 * @description Application-level UI state shared across all pages.
 *
 * This context is mounted in the root layout so it survives client-side
 * navigation. The boot sequence ({@link BootProvider}) populates `active`,
 * `home`, and `clockOffsetMs` once on app load.
 *
 * Pages read from this context rather than running their own boot logic.
 *
 * URL sync: active location coords are always reflected in the URL via
 * `useActiveUrlSync()`, which should be called once at the page level.
 * This keeps deep links and share-by-URL working for free.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { GeocodingResult } from "@/lib/geocoding";
import type { TrueSolarTimeResult } from "@/lib/astronomy";
import { BootStatus } from "@/types/consts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppUIState {
  /** Boot progress status ("syncing" | "locating" | "geocoding" | "ready") */
  status: BootStatus;
  /** Whether the app is in fullscreen layout mode. */
  isFocus: boolean;
  /**
   * Whether the app is in expanded ("more") layout mode.
   * When `true`, the clock row compresses and the data panel grows.
   */
  isExpanded: boolean;
  /**
   * The location currently shown on the main page.
   * `undefined` until boot completes.
   */
  active?: GeocodingResult;
  /**
   * The user's home location — set once during boot, never changed by search.
   * Used as the reference point for header notifications and the map toolbar.
   */
  home?: GeocodingResult;
  /**
   * The most-recent TST computation for `active`.
   * Ticks via `requestAnimationFrame` on the main page.
   */
  activeRes?: TrueSolarTimeResult;
  /**
   * System clock offset vs network time in milliseconds.
   * Populated by {@link BootProvider} and refreshed hourly.
   * Positive = system clock is ahead. Negative = behind.
   */
  clockOffsetMs: number;
}

interface AppUIContextValue extends AppUIState {
  setStatus: (status: BootStatus) => void;
  /** Toggle fullscreen layout on/off */
  toggleFocus: () => void;
  /** Enter fullscreen layout */
  enterFullscreen: () => void;
  /** Exit fullscreen layout */
  exitFullscreen: () => void;
  /** Toggle expanded ("more") layout on/off */
  toggleExpanded: () => void;
  /** Update the active display location (called on boot and on search). */
  setActive: (loc: GeocodingResult) => void;
  /** Set the home anchor location (called once during boot). */
  setHome: (loc: GeocodingResult) => void;
  /** Update the live TST result (called by the rAF ticker on the main page). */
  setActiveRes: Dispatch<SetStateAction<TrueSolarTimeResult | undefined>>;
  /** Update the measured clock offset (called by BootProvider). */
  setClockOffsetMs: (offsetMs: number) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AppUIContext = createContext<AppUIContextValue | null>(null);

/**
 * Provides app-level UI state to the entire component tree.
 * Must be placed in the root layout so context survives navigation.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * <AppUIProvider>
 *   <TimeFormatProvider>
 *     <BootProvider>{children}</BootProvider>
 *   </TimeFormatProvider>
 * </AppUIProvider>
 * ```
 */
export function AppUIProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BootStatus>("syncing");
  const [isFocus, setisFocus] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [active, setActive] = useState<GeocodingResult>();
  const [home, setHome] = useState<GeocodingResult>();
  const [activeRes, setActiveRes] = useState<TrueSolarTimeResult>();
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const toggleFocus = useCallback(() => {
    setisFocus((v) => {
      if (!v) setIsExpanded(false); // entering focus → kill expanded
      return !v;
    });
  }, []);
  const enterFullscreen = useCallback(() => setisFocus(true), []);
  const exitFullscreen = useCallback(() => setisFocus(false), []);
  const toggleExpanded = useCallback(() => setIsExpanded((v) => !v), []);

  return (
    <AppUIContext.Provider
      value={{
        status,
        isFocus,
        isExpanded,

        active,
        home,
        activeRes,
        clockOffsetMs,

        setStatus,
        toggleFocus,
        enterFullscreen,
        exitFullscreen,
        toggleExpanded,

        setActive,
        setHome,
        setActiveRes,
        setClockOffsetMs,
      }}
    >
      {children}
    </AppUIContext.Provider>
  );
}

/**
 * Returns app-level UI state and setters.
 *
 * @throws {Error} If called outside of an `AppUIProvider`.
 */
export function useAppUI(): AppUIContextValue {
  const ctx = useContext(AppUIContext);
  if (!ctx) throw new Error("useAppUI must be used within an AppUIProvider");
  return ctx;
}
