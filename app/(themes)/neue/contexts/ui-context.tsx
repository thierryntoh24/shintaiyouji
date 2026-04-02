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
  type ReactNode,
} from "react";
import { fonts } from "@/app/(themes)/neue/fonts";
import { PathValue, PersistentStore } from "@/lib/store";
import { usePersistentStore } from "@/app/hooks/use-store";

/** preferences store */
const DATA_KEY = "neue:data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NeueState {
  /** Whether the app is in fullscreen layout mode. */
  isFocus: boolean;
  /**
   * Current sky phase — useful for conditional rendering decisions.
   * convenient property for homepage popovers
   */
  skyPhase: string;
  /**
   * Whether the app is in expanded ("more") layout mode.
   * When `true`, the clock row compresses and the data panel grows.
   */
  isExpanded: boolean;
  /**User preferences and data */
  prefs: {
    readonly data: NeuePreferences;
    readonly update: (partial: Partial<NeuePreferences>) => void;
    readonly patch: <P extends never>(
      path: P,
      value: PathValue<NeuePreferences, P>,
    ) => void;
    readonly reset: () => void;
    readonly clear: () => void;
  };
}

interface NeueContextValue extends NeueState {
  /** Toggle fullscreen layout on/off */
  toggleFocus: () => void;
  /** Enter fullscreen layout */
  enterFullscreen: () => void;
  /** Exit fullscreen layout */
  exitFullscreen: () => void;
  /** Toggle expanded ("more") layout on/off */
  toggleExpanded: () => void;
  setSkyPhase: (phase: string) => void;
  // /** Update the active display location (called on boot and on search). */
  // setActive: (loc: GeocodingResult) => void;
  // /** Set the home anchor location (called once during boot). */
  // setHome: (loc: GeocodingResult) => void;
  // /** Update the live TST result (called by the rAF ticker on the main page). */
  // setActiveRes: Dispatch<SetStateAction<TrueSolarTimeResult | undefined>>;
  // /** Update the measured clock offset (called by BootProvider). */
  // setClockOffsetMs: (offsetMs: number) => void;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/**
 * All persisted user preferences.
 * Add new keys here — the defaults object below must have a matching entry.
 */
interface NeuePreferences {
  /** TST block display font */
  font: {
    class: string;
    styles: { default: string; focus?: string; expanded?: string };
  };

  /**
   * Whether the main page starts in expanded ("more") mode.
   * Persisted so it survives a page reload.
   */
  startMode: "focus" | "expanded" | "default";
}

/**
 * Fallback values for every preference key.
 * Applied when localStorage has no value, or when a new key is added
 * and an existing stored object doesn't contain it yet.
 */
const DEFAULT: NeuePreferences = {
  startMode: "default",
  font: {
    class: fonts["Gloock"],
    styles: {
      default: "",
      focus: undefined,
      expanded: undefined,
    },
  },
};

const preferences = new PersistentStore(DATA_KEY, DEFAULT);

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AppUIContext = createContext<NeueContextValue | null>(null);

/**
 * Provides app-level UI state to the entire component tree.
 * Must be placed in the root layout so context survives navigation.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * <NeueProvider>
 *    <BootProvider>{children}</BootProvider>
 * </NeueProvider>
 * ```
 */
export function NeueProvider({ children }: { children: ReactNode }) {
  const prefs = usePersistentStore(preferences);

  const [isFocus, setisFocus] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [skyPhase, setSkyPhase] = useState("");

  const toggleFocus = useCallback(() => {
    setisFocus((v) => {
      if (!v) setIsExpanded(false); // entering focus → kill expanded
      return !v;
    });
  }, []);
  const enterFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Browser may deny (e.g. in an iframe) — fail silently
      });
    }
  }, []);
  const exitFullscreen = useCallback(
    () => document.exitFullscreen().catch(() => {}),
    [],
  );
  const toggleExpanded = useCallback(() => setIsExpanded((v) => !v), []);

  return (
    <AppUIContext.Provider
      value={{
        prefs,
        isFocus,
        isExpanded,
        skyPhase,

        toggleFocus,
        enterFullscreen,
        exitFullscreen,
        toggleExpanded,
        setSkyPhase,
      }}
    >
      {children}
    </AppUIContext.Provider>
  );
}

/**
 * Returns app-level UI state and setters.
 *
 * @throws {Error} If called outside of an `NeueProvider`.
 */
export function useNeue(): NeueContextValue {
  const ctx = useContext(AppUIContext);
  if (!ctx) throw new Error("useNeue must be used within an NeueProvider");
  return ctx;
}
