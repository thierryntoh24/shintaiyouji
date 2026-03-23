import { useState, useEffect, useRef, useCallback } from "react";

// =============================================================================
// § 1 · ASTRONOMY ENGINE (inline — subset of astronomy-engine-v2.ts)
// =============================================================================

const MS_PER_MIN = 60_000;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const now   = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((now - start) / 86_400_000);
}

function fractionalYearRad(date: Date): number {
  const doy  = getDayOfYear(date);
  const hour = date.getUTCHours();
  const days = isLeapYear(date.getUTCFullYear()) ? 366 : 365;
  return ((2 * Math.PI) / days) * (doy - 1 + (hour - 12) / 24);
}

function equationOfTime(date: Date): number {
  const γ = fractionalYearRad(date);
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(γ)     -
      0.032077 * Math.sin(γ)     -
      0.014615 * Math.cos(2 * γ) -
      0.04089  * Math.sin(2 * γ))
  );
}

interface TrueSolarTimeResult {
  trueSolarTime: Date;
  trueSolarHours: number;
  longitudeOffsetMinutes: number;
  equationOfTimeMinutes: number;
  totalOffsetMinutes: number;
  isPastSolarNoon: boolean;
}

function computeTrueSolarTime(utcDate: Date, longitude: number): TrueSolarTimeResult {
  const longitudeOffsetMinutes = longitude * 4;
  const equationOfTimeMinutes  = equationOfTime(utcDate);
  const totalOffsetMinutes     = longitudeOffsetMinutes + equationOfTimeMinutes;
  const trueSolarTime          = new Date(utcDate.getTime() + totalOffsetMinutes * MS_PER_MIN);
  const trueSolarHours =
    trueSolarTime.getUTCHours() +
    trueSolarTime.getUTCMinutes() / 60 +
    trueSolarTime.getUTCSeconds() / 3600;

  return {
    trueSolarTime,
    trueSolarHours,
    longitudeOffsetMinutes,
    equationOfTimeMinutes,
    totalOffsetMinutes,
    isPastSolarNoon: trueSolarHours >= 12,
  };
}

// =============================================================================
// § 2 · NETWORK UTC  (HTTP round-trip, halved for one-way latency)
// =============================================================================

interface NetworkTimeResult {
  /** Signed offset in ms: positive = system clock is ahead of network */
  offsetMs: number;
  /** Round-trip latency in ms */
  roundTripMs: number;
  /** Corrected UTC time at the moment of measurement */
  networkUtc: Date;
}

async function fetchNetworkUtcOffset(): Promise<NetworkTimeResult> {
  const t0  = Date.now();
  const res = await fetch("https://worldtimeapi.org/api/ip");
  const t3  = Date.now();

  if (!res.ok) throw new Error(`WorldTimeAPI ${res.status}`);

  const data        = await res.json();
  const networkUtc  = new Date(data.utc_datetime);
  const roundTripMs = t3 - t0;
  const oneWay      = roundTripMs / 2;
  const corrected   = new Date(networkUtc.getTime() + oneWay);
  const offsetMs    = t3 - corrected.getTime();

  return { offsetMs, roundTripMs, networkUtc: corrected };
}

// =============================================================================
// § 3 · GEOLOCATION
// =============================================================================

interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** Uses high-accuracy geolocation with a 10 s timeout. */
function getUserLocation(): Promise<LocationResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  pos.coords.accuracy,
        }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  });
}

// =============================================================================
// § 4 · FORMATTING HELPERS
// =============================================================================

function pad(n: number, digits = 2): string {
  return String(Math.floor(n)).padStart(digits, "0");
}

function formatTST(date: Date): { hh: string; mm: string; ss: string } {
  return {
    hh: pad(date.getUTCHours()),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds()),
  };
}

function formatCoord(deg: number, posLabel: string, negLabel: string): string {
  const d = Math.abs(deg);
  const label = deg >= 0 ? posLabel : negLabel;
  return `${d.toFixed(4)}° ${label}`;
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "−";
  const abs  = Math.abs(minutes);
  const m    = Math.floor(abs);
  const s    = Math.round((abs - m) * 60);
  return `${sign}${m}m ${pad(s)}s`;
}

// =============================================================================
// § 5 · TYPES
// =============================================================================

type LoadPhase =
  | "idle"
  | "fetching-network-time"
  | "fetching-location"
  | "computing"
  | "ready"
  | "error";

interface AppState {
  phase:         LoadPhase;
  error:         string | null;
  offsetMs:      number;          // system vs network clock
  roundTripMs:   number;
  location:      LocationResult | null;
  tst:           TrueSolarTimeResult | null;
  displayTime:   Date | null;     // ticking TST
}

// =============================================================================
// § 6 · COMPONENT
// =============================================================================

export default function TrueSolarTimePage() {
  const [state, setState] = useState<AppState>({
    phase:       "idle",
    error:       null,
    offsetMs:    0,
    roundTripMs: 0,
    location:    null,
    tst:         null,
    displayTime: null,
  });

  // Stable ref for offset so ticker always uses latest value
  const offsetRef  = useRef(0);
  const locationRef = useRef<LocationResult | null>(null);
  const tickerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Ticker ──────────────────────────────────────────────────────────────
  const startTicker = useCallback((initialTST: TrueSolarTimeResult) => {
    if (tickerRef.current) clearInterval(tickerRef.current);

    // Anchor: the network-corrected UTC moment when TST was first computed
    const anchorUtcMs  = Date.now() - offsetRef.current;
    const anchorTstMs  = initialTST.trueSolarTime.getTime();
    const totalOffsetMs = initialTST.totalOffsetMinutes * MS_PER_MIN;

    tickerRef.current = setInterval(() => {
      const elapsedMs     = Date.now() - offsetRef.current - anchorUtcMs;
      const currentTstMs  = anchorTstMs + elapsedMs;
      const currentUtcMs  = anchorUtcMs + elapsedMs;

      // Recompute EoT once per minute to stay accurate (EoT changes slowly)
      const loc = locationRef.current;
      if (!loc) return;

      const freshUtc = new Date(currentUtcMs);
      const freshTST = computeTrueSolarTime(freshUtc, loc.longitude);

      setState((prev) => ({
        ...prev,
        tst:         freshTST,
        displayTime: freshTST.trueSolarTime,
      }));
    }, 1_000);
  }, []);

  // ── Boot sequence ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // 1 · Network time
      setState((p) => ({ ...p, phase: "fetching-network-time" }));
      let offsetMs = 0;
      let roundTripMs = 0;
      try {
        const net = await fetchNetworkUtcOffset();
        if (cancelled) return;
        offsetMs    = net.offsetMs;
        roundTripMs = net.roundTripMs;
        offsetRef.current = offsetMs;
        setState((p) => ({ ...p, offsetMs, roundTripMs }));
      } catch {
        // Non-fatal: fall back to system clock (offset = 0)
        if (cancelled) return;
        console.warn("Network time unavailable, using system clock.");
      }

      // 2 · Geolocation
      setState((p) => ({ ...p, phase: "fetching-location" }));
      let location: LocationResult;
      try {
        location = await getUserLocation();
        if (cancelled) return;
        locationRef.current = location;
        setState((p) => ({ ...p, location }));
      } catch (err) {
        if (cancelled) return;
        setState((p) => ({
          ...p,
          phase: "error",
          error: err instanceof Error ? err.message : "Location unavailable.",
        }));
        return;
      }

      // 3 · Compute TST
      setState((p) => ({ ...p, phase: "computing" }));
      const correctedUtc = new Date(Date.now() - offsetMs);
      const tst          = computeTrueSolarTime(correctedUtc, location.longitude);

      if (cancelled) return;
      setState((p) => ({
        ...p,
        phase:       "ready",
        tst,
        displayTime: tst.trueSolarTime,
      }));

      startTicker(tst);
    }

    boot();
    return () => {
      cancelled = true;
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [startTicker]);

  // ── Render ───────────────────────────────────────────────────────────────
  const { phase, error, offsetMs, roundTripMs, location, tst, displayTime } = state;
  const time = displayTime ? formatTST(displayTime) : null;
  const eotMin = tst ? tst.equationOfTimeMinutes : null;
  const lonOff = tst ? tst.longitudeOffsetMinutes : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:        #080c14;
          --surface:   #0d1424;
          --border:    #1a2540;
          --border-hi: #2a3f6a;
          --amber:     #e8a44a;
          --amber-dim: #7a4f1a;
          --text:      #c8d4e8;
          --text-dim:  #4a5e80;
          --text-hi:   #e8f0ff;
          --green:     #4aaa7a;
          --red:       #e05050;
          --font-mono: 'Space Mono', monospace;
          --font-serif:'Instrument Serif', serif;
        }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-mono);
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* Star-field background */
        .starfield {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% 0%, #0d1f3a 0%, transparent 70%),
            radial-gradient(1px 1px at 20%  15%, #fff9 0%, transparent 100%),
            radial-gradient(1px 1px at 75%  8%,  #fff7 0%, transparent 100%),
            radial-gradient(1px 1px at 45%  25%, #fffa 0%, transparent 100%),
            radial-gradient(1px 1px at 88%  32%, #fff8 0%, transparent 100%),
            radial-gradient(1px 1px at 12%  42%, #fff6 0%, transparent 100%),
            radial-gradient(1px 1px at 63%  55%, #fff9 0%, transparent 100%),
            radial-gradient(1px 1px at 30%  68%, #fff7 0%, transparent 100%),
            radial-gradient(1px 1px at 91%  72%, #fff8 0%, transparent 100%),
            radial-gradient(1px 1px at 5%   82%, #fffa 0%, transparent 100%),
            radial-gradient(1px 1px at 55%  88%, #fff6 0%, transparent 100%),
            radial-gradient(2px 2px at 38%  5%,  #ffd 0%, transparent 100%),
            radial-gradient(2px 2px at 82%  48%, #ffd 0%, transparent 100%),
            var(--bg);
        }

        .page {
          position: relative; z-index: 1;
          min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 2rem 1rem;
          gap: 2rem;
        }

        /* Header */
        .header {
          text-align: center;
          animation: fadeDown 0.8s ease both;
        }
        .header-label {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.25em;
          color: var(--text-dim);
          text-transform: uppercase;
          margin-bottom: 0.5rem;
        }
        .header-title {
          font-family: var(--font-serif);
          font-size: clamp(1.4rem, 4vw, 2rem);
          font-style: italic;
          color: var(--text-hi);
          letter-spacing: 0.02em;
        }
        .header-title span {
          color: var(--amber);
          font-style: normal;
        }

        /* Main clock card */
        .clock-card {
          width: 100%; max-width: 580px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 2px;
          position: relative;
          animation: fadeUp 0.8s ease 0.2s both;
          overflow: hidden;
        }
        .clock-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--amber-dim), var(--amber), var(--amber-dim), transparent);
        }

        .clock-inner {
          padding: 2.5rem 2rem 2rem;
          text-align: center;
        }

        /* Status bar */
        .status-bar {
          display: flex; align-items: center; justify-content: center;
          gap: 0.5rem;
          font-size: 0.65rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 2rem;
          min-height: 1.2rem;
        }
        .status-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--text-dim);
          flex-shrink: 0;
        }
        .status-dot.active {
          background: var(--amber);
          box-shadow: 0 0 6px var(--amber);
          animation: pulse 1.5s ease-in-out infinite;
        }
        .status-dot.ready  { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .status-dot.error  { background: var(--red);   box-shadow: 0 0 6px var(--red); }

        /* The time display */
        .tst-display {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 0.1em;
          margin-bottom: 0.5rem;
          line-height: 1;
        }
        .tst-segment {
          font-family: var(--font-mono);
          font-size: clamp(3.5rem, 14vw, 6rem);
          font-weight: 700;
          color: var(--text-hi);
          letter-spacing: -0.03em;
          transition: color 0.3s;
        }
        .tst-segment.ready { color: var(--amber); }
        .tst-sep {
          font-family: var(--font-mono);
          font-size: clamp(2.5rem, 10vw, 4.5rem);
          font-weight: 700;
          color: var(--amber-dim);
          animation: blink 1s step-end infinite;
          margin: 0 0.05em;
          align-self: flex-start;
          padding-top: 0.15em;
        }
        .tst-placeholder {
          font-size: clamp(3.5rem, 14vw, 6rem);
          color: var(--border-hi);
          letter-spacing: -0.03em;
        }

        .tst-label {
          font-size: 0.6rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 2rem;
        }

        /* Divider */
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--border-hi), transparent);
          margin: 0 -2rem 1.5rem;
        }

        /* Data grid */
        .data-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 1px;
          overflow: hidden;
          text-align: left;
        }
        .data-cell {
          background: var(--surface);
          padding: 0.85rem 1rem;
        }
        .data-cell-label {
          font-size: 0.58rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 0.3rem;
        }
        .data-cell-value {
          font-size: 0.82rem;
          color: var(--text);
          font-family: var(--font-mono);
        }
        .data-cell-value.hi { color: var(--text-hi); }
        .data-cell-value.amber { color: var(--amber); }
        .data-cell-value.dim { color: var(--text-dim); }
        .data-cell-value.positive { color: var(--green); }
        .data-cell-value.negative { color: #7ab8e8; }

        /* Footer note */
        .footnote {
          font-size: 0.58rem;
          letter-spacing: 0.12em;
          color: var(--text-dim);
          text-align: center;
          margin-top: 1.2rem;
          line-height: 1.6;
          padding: 0 1rem;
        }

        /* Loading skeleton */
        .skeleton {
          display: inline-block;
          background: linear-gradient(90deg, var(--border) 25%, var(--border-hi) 50%, var(--border) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
          border-radius: 2px;
          height: 0.9em;
        }

        /* Animations */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0; }
        }
        @keyframes shimmer {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }

        /* Noon indicator */
        .noon-pip {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          margin-left: 0.4em;
          vertical-align: middle;
        }
        .noon-pip.am { background: #7ab8e8; }
        .noon-pip.pm { background: var(--amber); }
      `}</style>

      <div className="starfield" />

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="header-label">Heliocentric Chronometry</div>
          <h1 className="header-title">
            True <span>Solar</span> Time
          </h1>
        </div>

        {/* Clock card */}
        <div className="clock-card">
          <div className="clock-inner">

            {/* Status */}
            <div className="status-bar">
              <div className={`status-dot ${
                phase === "ready"   ? "ready"  :
                phase === "error"   ? "error"  :
                phase === "idle"    ? ""        : "active"
              }`} />
              <span>{
                phase === "idle"                  ? "Initialising…"            :
                phase === "fetching-network-time" ? "Synchronising clock…"     :
                phase === "fetching-location"     ? "Acquiring location…"       :
                phase === "computing"             ? "Computing solar time…"     :
                phase === "ready"                 ? "Solar time · Live"         :
                `Error — ${error}`
              }</span>
            </div>

            {/* Time display */}
            <div className="tst-display">
              {time ? (
                <>
                  <span className="tst-segment ready">{time.hh}</span>
                  <span className="tst-sep">:</span>
                  <span className="tst-segment ready">{time.mm}</span>
                  <span className="tst-sep">:</span>
                  <span className="tst-segment ready">{time.ss}</span>
                </>
              ) : (
                <span className="tst-segment tst-placeholder">
                  {phase === "error" ? "——:——:——" : "░░:░░:░░"}
                </span>
              )}
            </div>
            <div className="tst-label">
              {tst ? (
                <>
                  {tst.isPastSolarNoon ? "Post Meridiem" : "Ante Meridiem"}
                  <span className={`noon-pip ${tst.isPastSolarNoon ? "pm" : "am"}`} />
                </>
              ) : "True Solar Time"}
            </div>

            <div className="divider" />

            {/* Data grid */}
            <div className="data-grid">
              {/* Latitude */}
              <div className="data-cell">
                <div className="data-cell-label">Latitude</div>
                <div className={`data-cell-value ${location ? "hi" : "dim"}`}>
                  {location
                    ? formatCoord(location.latitude, "N", "S")
                    : <span className="skeleton" style={{width:"9ch"}} />}
                </div>
              </div>
              {/* Longitude */}
              <div className="data-cell">
                <div className="data-cell-label">Longitude</div>
                <div className={`data-cell-value ${location ? "hi" : "dim"}`}>
                  {location
                    ? formatCoord(location.longitude, "E", "W")
                    : <span className="skeleton" style={{width:"9ch"}} />}
                </div>
              </div>
              {/* EoT */}
              <div className="data-cell">
                <div className="data-cell-label">Equation of Time</div>
                <div className={`data-cell-value ${
                  eotMin === null ? "dim" :
                  eotMin >= 0    ? "positive" : "negative"
                }`}>
                  {eotMin !== null
                    ? formatOffset(eotMin)
                    : <span className="skeleton" style={{width:"7ch"}} />}
                </div>
              </div>
              {/* Longitude offset */}
              <div className="data-cell">
                <div className="data-cell-label">Longitude Offset</div>
                <div className={`data-cell-value ${
                  lonOff === null ? "dim" :
                  lonOff >= 0    ? "positive" : "negative"
                }`}>
                  {lonOff !== null
                    ? formatOffset(lonOff)
                    : <span className="skeleton" style={{width:"7ch"}} />}
                </div>
              </div>
              {/* Clock offset */}
              <div className="data-cell">
                <div className="data-cell-label">Clock Drift</div>
                <div className={`data-cell-value ${
                  phase === "ready"
                    ? Math.abs(offsetMs) > 1000 ? "negative" : "positive"
                    : "dim"
                }`}>
                  {phase === "ready"
                    ? `${offsetMs >= 0 ? "+" : ""}${offsetMs} ms`
                    : phase === "fetching-network-time"
                    ? <span className="skeleton" style={{width:"7ch"}} />
                    : <span style={{color:"var(--text-dim)"}}>Unavailable</span>}
                </div>
              </div>
              {/* Network latency */}
              <div className="data-cell">
                <div className="data-cell-label">Network RTT</div>
                <div className={`data-cell-value ${
                  roundTripMs > 0 ? "hi" : "dim"
                }`}>
                  {roundTripMs > 0
                    ? `${roundTripMs} ms`
                    : phase === "fetching-network-time"
                    ? <span className="skeleton" style={{width:"5ch"}} />
                    : <span style={{color:"var(--text-dim)"}}>—</span>}
                </div>
              </div>
            </div>

            <div className="footnote">
              Solar noon occurs when TST = 12:00:00 · Sun is highest at this longitude
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
