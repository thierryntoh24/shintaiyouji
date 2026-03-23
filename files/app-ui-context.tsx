"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
  Dispatch,
  SetStateAction,
} from "react";
import type { GeocodingResult } from "@/lib/geocoding";
import { TrueSolarTimeResult } from "@/lib/astronomy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppUIState {
  /** Whether the app is in fullscreen layout mode */
  isFocus: boolean;
  /**
   * Whether the app is in expanded ("more") layout mode.
   * When `true`, the clock row compresses and the data panel grows.
   */
  isExpanded: boolean;
  /**
   * The location currently being displayed on the main page.
   * `undefined` during initial boot before geolocation resolves.
   */
  active?: GeocodingResult;
  /**
   * The location the app is anchored to, initialised during boot.
   * Initialised from `active` until user searches a new location.
   */
  home?: GeocodingResult;
  /**
   * TST result computed from `active`.
   * This is the source of truth for TST display across components.
   * `undefined` during initial boot before geolocation resolves.
   */
  activeRes?: TrueSolarTimeResult;
}

interface AppUIContextValue extends AppUIState {
  /** Toggle fullscreen layout on/off */
  toggleFocus: () => void;
  /** Enter fullscreen layout */
  enterFullscreen: () => void;
  /** Exit fullscreen layout */
  exitFullscreen: () => void;
  /** Toggle expanded ("more") layout on/off */
  toggleExpanded: () => void;
  /**
   * Update the active display location.
   * Called once on boot with the user's geolocation, then again whenever
   * the user searches a new place.
   */
  setActive: (loc: GeocodingResult) => void;
  /**
   * Update the 'home' display location.
   * Called once on boot with the user's geolocation.
   */
  setHome: (loc: GeocodingResult) => void;
  /**
   * Update the active TST result.
   * Called once on boot with the user's geolocation, then again whenever
   * the user searches a new place.
   */
  setActiveRes: Dispatch<SetStateAction<TrueSolarTimeResult | undefined>>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AppUIContext = createContext<AppUIContextValue | null>(null);

/**
 * Provides fullscreen state, expanded state, and the active display location
 * to the component tree.
 *
 * The active location drives the main TST ticker and all location-dependent
 * displays (coordinates, place name, solar events). It starts as `undefined`
 * and is set to the user's geolocation during the boot sequence in `page.tsx`.
 *
 * @example
 * ```tsx
 * <AppUIProvider>
 *   <Header />
 *   <main>...</main>
 *   <Footer />
 * </AppUIProvider>
 * ```
 */
export function AppUIProvider({ children }: { children: ReactNode }) {
  const [isFocus, setisFocus] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [active, setActive] = useState<GeocodingResult>();
  const [home, setHome] = useState<GeocodingResult>();
  const [activeRes, setActiveRes] = useState<TrueSolarTimeResult>();

  const toggleFocus = useCallback(() => setisFocus((v) => !v), []);
  const enterFullscreen = useCallback(() => setisFocus(true), []);
  const exitFullscreen = useCallback(() => setisFocus(false), []);
  const toggleExpanded = useCallback(() => setIsExpanded((v) => !v), []);

  return (
    <AppUIContext.Provider
      value={{
        isFocus,
        isExpanded,
        active,
        activeRes,
        home,

        toggleFocus,
        enterFullscreen,
        exitFullscreen,
        toggleExpanded,

        setActive,
        setActiveRes,
        setHome,
      }}
    >
      {children}
    </AppUIContext.Provider>
  );
}

/**
 * Returns app-level UI state and setters.
 * Must be used within an {@link AppUIProvider}.
 *
 * @throws If used outside of `AppUIProvider`
 */
export function useAppUI(): AppUIContextValue {
  const ctx = useContext(AppUIContext);
  if (!ctx) throw new Error("useAppUI must be used within AppUIProvider");
  return ctx;
}
