/**
 * @file ntp.ts
 * @description Utilities for comparing the local system clock against public
 * HTTP time sources. Provides a corrected `now()` helper that compensates
 * for measured clock drift.
 *
 * This module is intentionally side-effect-free except for the mutable
 * `clockOffsetMs` slot, which is updated once per sync via `setClockOffset`.
 *
 * Accuracy is typically ±50–200 ms — sufficient for detecting significant
 * drift but not a replacement for NTP's stratum hierarchy.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Optional TimeZoneDB API key.
 * Only required if fallback is used.
 */
const TIMEZONEDB_KEY = process.env.NEXT_PUBLIC_TIMEZONEDB_KEY;

/**
 * Public HTTP time endpoints tried in order.
 * Each entry describes which JSON field contains the UTC datetime.
 */
const HTTP_TIME_ENDPOINTS = [
  { url: "https://worldtimeapi.org/api/ip", field: "utc_datetime" },
  { url: "https://timeapi.io/api/v1/time/current/utc", field: "utc_time" },
  {
    url: "https://timeapi.io/api/v1/timezone/coordinate?latitude=0&longitude=0",
    field: "local_time",
  },
  {
    url: `https://api.timezonedb.com/v2.1/get-time-zone?key=${TIMEZONEDB_KEY}&format=json&by=position&lat=0&lng=0`,
    field: "timestamp",
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a single clock-comparison measurement against a remote time source.
 */
export interface ClockSyncResult {
  /** System clock time at the moment of measurement. */
  systemTime: Date;
  /** Remote time, corrected for estimated one-way network latency. */
  networkTime: Date;
  /**
   * Signed offset in milliseconds.
   * Positive → system clock is **ahead** of network time.
   * Negative → system clock is **behind** network time.
   */
  offsetMs: number;
  /** Full round-trip latency in milliseconds. */
  roundTripMs: number;
  /** Estimated one-way latency (`roundTripMs / 2`). */
  oneWayLatencyMs: number;
  /** Human-readable drift description. */
  driftSummary: string;
  /** URL of the endpoint that was queried. */
  endpoint: string;
  /** Whether the measured offset exceeds `driftThresholdMs`. */
  isDrifted: boolean;
  /** The threshold used to determine drift, in milliseconds. */
  driftThresholdMs: number;
}

/**
 * Options for {@link syncClock}.
 */
export interface ClockSyncOptions {
  /**
   * Custom HTTP endpoint URL.
   * Must return a JSON body with a parseable datetime field.
   */
  endpointUrl?: string;
  /**
   * JSON field name in the response body containing the datetime string.
   * Only relevant when `endpointUrl` is provided.
   * @default "utc_datetime"
   */
  dateField?: string;
  /**
   * Milliseconds of offset above which the clock is considered "drifted".
   * @default 1000 (1 second)
   */
  driftThresholdMs?: number;
}

// ---------------------------------------------------------------------------
// Module-level clock offset
// ---------------------------------------------------------------------------

let _clockOffsetMs = 0;

/**
 * Overrides the stored clock offset.
 * Called automatically by {@link syncClock}.
 *
 * @param offsetMs - Signed offset in milliseconds.
 */
function setClockOffset(offsetMs: number): void {
  _clockOffsetMs = offsetMs;
}

/**
 * Returns the current stored clock offset in milliseconds.
 */
export function getClockOffset(): number {
  return _clockOffsetMs;
}

/**
 * Returns a network-corrected timestamp in epoch milliseconds.
 * Use in place of `Date.now()`.
 */
export function now(): number {
  return Date.now() - _clockOffsetMs;
}

/**
 * Returns a network-corrected `Date` object.
 * Use in place of `new Date()`.
 */
export function nowDate(): Date {
  return new Date(now());
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses a loosely formatted ISO-8601 timestamp and returns epoch milliseconds.
 *
 * This helper is designed for APIs that return ISO timestamps that:
 * - omit a timezone indicator (e.g. `2026-03-06T11:57:22.4290106`)
 * - contain more than 3 fractional second digits
 *
 * JavaScript's `Date.parse()` interprets timestamps **without a timezone**
 * as **local time**, which can introduce timezone offsets when the server
 * actually intended the timestamp to be UTC.
 *
 * This function normalizes the string by:
 * - trimming fractional seconds to **millisecond precision**
 * - appending a `Z` if no timezone is present (forcing UTC parsing)
 *
 * Supported examples:
 *
 * - `2026-03-06T11:57:22`
 * - `2026-03-06T11:57:22.4`
 * - `2026-03-06T11:57:22.429`
 * - `2026-03-06T11:57:22.4290106`
 * - `2026-03-06T11:57:22Z`
 * - `2026-03-06T11:57:22.429Z`
 *
 * @param raw - Raw ISO timestamp string from an API response.
 * @returns Epoch time in milliseconds.
 * @throws {Error} if the timestamp cannot be parsed.
 *
 * @example
 * parseIsoUtc("2026-03-06T11:57:22.4290106") // treats as UTC
 * parseIsoUtc("2026-03-06T11:57:22Z")         // passes through
 */
export function parseIsoUtc(raw: string): number {
  let s = raw.trim();

  // Append Z if no timezone designator is present
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    s += "Z";
  }

  // Truncate fractional seconds to millisecond precision
  s = s.replace(/\.(\d+)(?=[zZ]|[+-]\d{2}:\d{2}$)/, (_, frac: string) => {
    return "." + frac.slice(0, 3).padEnd(3, "0");
  });

  const epoch = Date.parse(s);
  if (Number.isNaN(epoch))
    throw new Error(`Cannot parse ISO timestamp: ${raw}`);
  return epoch;
}

/**
 * Produces a compact, human-readable description of a clock drift.
 *
 * - Offsets < 1 s → `"System clock matches network time (< 1 s difference)"`
 * - Otherwise → e.g. `"System clock is 1m 5s ahead of network time"`
 *
 * @param offsetMs - Signed offset in milliseconds.
 */
function describeDrift(offsetMs: number): string {
  const abs = Math.abs(offsetMs);
  if (abs < 1_000)
    return "System clock matches network time (< 1 s difference)";

  const dir = offsetMs > 0 ? "ahead of" : "behind";
  const totalSecs = Math.floor(abs / 1_000);
  const h = Math.floor(totalSecs / 3_600);
  const m = Math.floor((totalSecs % 3_600) / 60);
  const s = totalSecs % 60;

  let t = "";
  if (h > 0) {
    t = `${h}h`;
    if (m > 0) t += ` ${m}m`;
  } else if (m > 0) {
    t = `${m}m`;
    if (s > 0) t += ` ${s}s`;
  } else {
    t = `${s} sec${s === 1 ? "" : "s"}`;
  }

  return `System clock is ${t} ${dir} network time`;
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

/**
 * Compares the local system clock against a public HTTP time source and
 * stores the measured offset for use by {@link now} and {@link nowDate}.
 *
 * Uses the NTP round-trip timing principle:
 * 1. Record `t0` immediately before the request.
 * 2. Record `t3` immediately after the response is received.
 * 3. Round-trip latency ≈ `t3 − t0`.
 * 4. Estimated offset = `systemTime − (serverTime + latency / 2)`.
 *
 * This is an approximation — HTTP overhead and server processing time
 * introduce noise that NTP's stratum hierarchy avoids. Accuracy is typically
 * within ±50–200 ms, sufficient for detecting significant clock drift.
 *
 * Tries each endpoint in {@link HTTP_TIME_ENDPOINTS} in order, returning
 * the first successful measurement.
 *
 * @param options - Optional endpoint and threshold overrides.
 * @returns A {@link ClockSyncResult} describing the measurement.
 * @throws {Error} If all configured endpoints fail.
 *
 * @example
 * ```ts
 * const result = await syncClock();
 * console.log(result.driftSummary);
 * // "System clock is 1m 5s ahead of network time"
 * ```
 */
export async function compareClockViaHttp(
  options: ClockSyncOptions = {},
): Promise<ClockSyncResult> {
  const driftThresholdMs = options.driftThresholdMs ?? 1_000;

  const endpoints = options.endpointUrl
    ? [{ url: options.endpointUrl, field: options.dateField ?? "utc_datetime" }]
    : [...HTTP_TIME_ENDPOINTS];

  let lastError: Error | undefined;

  for (const ep of endpoints) {
    try {
      const t0 = Date.now();
      const response = await fetch(ep.url);
      const t3 = Date.now();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${ep.url}`);
      }

      const roundTripMs = t3 - t0;
      const body = await response.json();
      const raw: string | number = body[ep.field];

      const networkMs =
        typeof raw === "string" ? parseIsoUtc(raw) : (raw as number);
      const networkTime = new Date(networkMs);

      if (isNaN(networkTime.getTime())) {
        throw new Error(`Cannot parse datetime from field "${ep.field}"`);
      }

      const oneWayLatencyMs = roundTripMs / 2;
      const correctedNetwork = new Date(
        networkTime.getTime() + oneWayLatencyMs,
      );
      const systemTime = new Date(t3);
      const offsetMs = systemTime.getTime() - correctedNetwork.getTime();

      setClockOffset(offsetMs);
      console.warn("NTPS", offsetMs, ep.url);

      return {
        systemTime,
        networkTime: correctedNetwork,
        offsetMs,
        roundTripMs,
        oneWayLatencyMs,
        driftSummary: describeDrift(offsetMs),
        endpoint: ep.url,
        isDrifted: Math.abs(offsetMs) > driftThresholdMs,
        driftThresholdMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("All HTTP time endpoints failed");
}
