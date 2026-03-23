"use client";

/**
 * @file time-format-context.tsx
 * @description Shared time-display preferences (solar mode, hour format)
 * consumed by all clock components in the Neue theme.
 */

import { createContext, useContext, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which solar time variant to display on the main clock. */
export type SolarTimeMode = "TST" | "MST";

interface TimeFormatState {
  /** True Solar Time or Mean Solar Time. */
  solarMode: SolarTimeMode;
  /** 24-hour display or 12-hour with AM/PM. */
  hourFormat: HourFormat;
}

interface TimeFormatContextValue extends TimeFormatState {
  setSolarMode: (mode: SolarTimeMode) => void;
  setHourFormat: (format: HourFormat) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TimeFormatContext = createContext<TimeFormatContextValue | null>(null);

/**
 * Provides shared time-format preferences to the component tree.
 *
 * @example
 * ```tsx
 * <TimeFormatProvider>
 *   <Header />
 *   <main>…</main>
 * </TimeFormatProvider>
 * ```
 */
export function TimeFormatProvider({ children }: { children: ReactNode }) {
  const [solarMode, setSolarMode] = useState<SolarTimeMode>("TST");
  const [hourFormat, setHourFormat] = useState<HourFormat>("24");

  return (
    <TimeFormatContext.Provider
      value={{ solarMode, setSolarMode, hourFormat, setHourFormat }}
    >
      {children}
    </TimeFormatContext.Provider>
  );
}

/**
 * Returns current time-format preferences and their setters.
 *
 * @throws {Error} If called outside of a `TimeFormatProvider`.
 */
export function useTimeFormat(): TimeFormatContextValue {
  const ctx = useContext(TimeFormatContext);
  if (!ctx) {
    throw new Error("useTimeFormat must be used within a TimeFormatProvider");
  }
  return ctx;
}
