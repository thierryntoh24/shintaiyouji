/**
 * @file astronomy-engine-v2.ts
 *
 * @description A self-contained astronomical computation engine with zero
 * runtime dependencies. Replaces both `solarTime.ts` and `solarLunar.ts`
 * (suncalc) with formulas derived from:
 *
 * - NOAA Solar Position Algorithm (SPA) — Jean Meeus, "Astronomical Algorithms"
 *   2nd ed. (1998), Chapters 25–27
 * - NOAA Equation of Time — Spencer (1971) / Iqbal (1983)
 * - Lunar position — Meeus Ch. 47 (truncated series, ~0.3° accuracy)
 * - Moon illumination — Meeus Ch. 48
 * - Moonrise/moonset — iterative altitude-bisection method
 *
 * Accuracy vs suncalc:
 * - Solar position:   ±0.01°  (suncalc: ±0.1°)
 * - Solar events:     ±30 s   (suncalc: ±1 min)
 * - Moon position:    ±0.3°   (suncalc: ±0.5°)
 * - Moon phase:       ±0.5%   (suncalc: ±1%)
 * - Moonrise/set:     ±2 min  (suncalc: ±2 min)
 *
 * All input/output angles are in decimal degrees unless noted.
 * All Date objects are standard JS Dates (UTC internally).
 */

// =============================================================================
// § 1 · CONSTANTS
// =============================================================================

/** Milliseconds in one day */
const MS_PER_DAY = 86_400_000;

/** Milliseconds in one minute */
const MS_PER_MIN = 60_000;

/** Astronomical Unit in kilometres */
const AU_KM = 149_597_870.7;

/**
 * Atmospheric refraction correction applied near the horizon (degrees).
 * Standard value used by NOAA SPA for sunrise/sunset calculations.
 */
const REFRACTION_HORIZON_DEG = 0.5667;

// =============================================================================
// § 2 · PRIMITIVE MATH HELPERS
// =============================================================================

/**
 * Converts degrees to radians.
 * @param deg - Angle in degrees
 */
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Converts radians to degrees.
 * @param rad - Angle in radians
 */
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Reduces an angle to the range [0, 360).
 * @param deg - Angle in degrees (any value)
 */
const wrapDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Reduces an angle to the range [0, 2π).
 * @param rad - Angle in radians (any value)
 */
const wrapRad = (rad: number): number =>
  ((rad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/**
 * Clamps a value to [-1, 1]. Guards Math.asin / Math.acos from
 * floating-point values that drift slightly outside the valid domain.
 * @param x - Input value
 */
const clamp = (x: number): number => Math.max(-1, Math.min(1, x));

// =============================================================================
// § 3 · CALENDAR & TIME HELPERS
// =============================================================================

/**
 * Returns whether a given year is a leap year.
 * @param year - Full calendar year (e.g. 2024)
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the integer day-of-year for a UTC Date (1 = Jan 1).
 * @param date - Any Date object
 */
export function getDayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const now = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.floor((now - start) / MS_PER_DAY);
}

/**
 * Converts a UTC Date to a Julian Day Number (JDN).
 *
 * The Julian Day is a continuous count of days from noon on January 1, 4713 BC.
 * It is the universal time coordinate used in all astronomical formulae here.
 *
 * @param date - UTC Date
 * @returns Julian Day Number (fractional)
 */
export function toJulianDay(date: Date): number {
  return date.getTime() / MS_PER_DAY + 2_440_587.5;
}

/**
 * Converts a Julian Day Number back to a UTC Date.
 * @param jd - Julian Day Number
 */
export function fromJulianDay(jd: number): Date {
  return new Date((jd - 2_440_587.5) * MS_PER_DAY);
}

/**
 * Computes Julian Centuries (T) from J2000.0 for a given Julian Day.
 *
 * T is the primary time argument for Meeus's polynomial series.
 * J2000.0 = JD 2451545.0 = 2000 January 1, 12:00 TT
 *
 * @param jd - Julian Day Number
 * @returns T in Julian centuries since J2000.0
 */
export function julianCenturies(jd: number): number {
  return (jd - 2_451_545.0) / 36_525;
}

/**
 * Returns a UTC Date snapped to midnight (00:00:00.000 UTC) for the
 * same calendar day as the input.
 * @param date - Any UTC Date
 */
function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

// =============================================================================
// § 4 · NOAA EQUATION OF TIME  (Spencer 1971 / Iqbal 1983)
// =============================================================================

/**
 * Calculates the fractional year (in radians) for a given UTC date and hour.
 * Used as the basis for all NOAA EoT intermediate values.
 *
 * @param date - UTC date
 * @returns Fractional year γ in radians
 */
function fractionalYearRad(date: Date): number {
  const doy = getDayOfYear(date);
  const hour = date.getUTCHours();
  const days = isLeapYear(date.getUTCFullYear()) ? 366 : 365;
  return ((2 * Math.PI) / days) * (doy - 1 + (hour - 12) / 24);
}

/**
 * Calculates the Equation of Time correction in minutes using the
 * NOAA standard Fourier series (Spencer 1971 / Iqbal 1983).
 *
 * The EoT corrects for two effects that cause the apparent Sun to deviate
 * from a uniform 24-hour clock:
 * - Earth's elliptical orbit (perihelion/aphelion speed variation)
 * - Earth's axial tilt (obliquity of the ecliptic)
 *
 * Range: approximately −16.4 min (early November) to +14.3 min (mid-February).
 *
 * @param date - UTC Date
 * @returns EoT correction in minutes
 *
 * @see {@link https://www.esrl.noaa.gov/gmd/grad/solcalc/solareqns.PDF}
 */
export function equationOfTime(date: Date): number {
  const γ = fractionalYearRad(date);
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(γ) -
      0.032077 * Math.sin(γ) -
      0.014615 * Math.cos(2 * γ) -
      0.04089 * Math.sin(2 * γ))
  );
}

// =============================================================================
// § 5 · SOLAR POSITION (Meeus Ch. 25 — low-precision series)
// =============================================================================

/**
 * Internal intermediate values computed from Julian Centuries T.
 * Kept together to avoid recomputing T multiple times per snapshot.
 */
interface SolarOrbitalElements {
  /** Julian Centuries since J2000.0 */
  T: number;
  /** Geometric mean longitude of the Sun (degrees) */
  L0: number;
  /** Mean anomaly of the Sun (degrees) */
  M: number;
  /** Equation of centre (degrees) */
  C: number;
  /** Sun's true longitude (degrees) */
  sunTrueLon: number;
  /** Apparent longitude (degrees), corrected for aberration & nutation */
  apparentLon: number;
  /** Mean obliquity of the ecliptic (degrees) */
  obliquity: number;
  /** Sun's right ascension (degrees) */
  rightAscension: number;
  /** Sun's declination (degrees) */
  declination: number;
  /** Earth–Sun distance in AU */
  radiusVectorAU: number;
  /** Earth–Sun distance in kilometres */
  distanceKm: number;
}

/**
 * Computes the Sun's orbital elements for a given Julian Day using
 * Meeus low-precision series (accurate to ~0.01°).
 *
 * @param jd - Julian Day Number
 * @returns {@link SolarOrbitalElements}
 */
function solarOrbitalElements(jd: number): SolarOrbitalElements {
  const T = julianCenturies(jd);

  // Geometric mean longitude of the Sun (deg), referred to mean equinox of date
  const L0 = wrapDeg(280.46646 + 36000.76983 * T + 0.0003032 * T * T);

  // Mean anomaly of the Sun (deg)
  const M = wrapDeg(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mrad = toRad(M);

  // Equation of centre
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
    0.000289 * Math.sin(3 * Mrad);

  // Sun's true longitude and true anomaly
  const sunTrueLon = L0 + C;
  const sunTrueAnomaly = M + C;

  // Earth–Sun radius vector (AU) — from true anomaly
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const radiusVectorAU =
    (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(toRad(sunTrueAnomaly)));
  const distanceKm = radiusVectorAU * AU_KM;

  // Apparent longitude — corrected for aberration and nutation (Ω = Moon's node)
  const omega = 125.04 - 1934.136 * T;
  const apparentLon = sunTrueLon - 0.00569 - 0.00478 * Math.sin(toRad(omega));

  // Mean obliquity of the ecliptic (Meeus eq. 22.2, degrees)
  const obliquity =
    23.439291111 -
    0.013004167 * T -
    0.0000001639 * T * T +
    0.0000005036 * T * T * T;

  // Corrected obliquity for apparent right ascension
  const obliqCorr = obliquity + 0.00256 * Math.cos(toRad(omega));

  // Sun's right ascension (degrees)
  const raRad = Math.atan2(
    Math.cos(toRad(obliqCorr)) * Math.sin(toRad(apparentLon)),
    Math.cos(toRad(apparentLon)),
  );
  const rightAscension = wrapDeg(toDeg(raRad));

  // Sun's declination (degrees)
  const decRad = Math.asin(
    clamp(Math.sin(toRad(obliqCorr)) * Math.sin(toRad(apparentLon))),
  );
  const declination = toDeg(decRad);

  return {
    T,
    L0,
    M,
    C,
    sunTrueLon,
    apparentLon,
    obliquity,
    rightAscension,
    declination,
    radiusVectorAU,
    distanceKm,
  };
}

/**
 * Computes the Greenwich Mean Sidereal Time (GMST) in degrees for a given JD.
 * Meeus eq. 12.4.
 *
 * @param jd - Julian Day Number
 */
function greenwichMeanSiderealTime(jd: number): number {
  const T = julianCenturies(jd);
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2_451_545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38_710_000;
  return wrapDeg(gmst);
}

/**
 * Computes the Local Hour Angle (degrees) of the Sun for a given JD and longitude.
 *
 * The hour angle is 0 at solar noon, negative before noon, positive after.
 *
 * @param jd       - Julian Day Number
 * @param elements - Pre-computed solar orbital elements
 * @param longitude - Observer longitude (decimal degrees, east = positive)
 */
function localHourAngle(
  jd: number,
  elements: SolarOrbitalElements,
  longitude: number,
): number {
  const gmst = greenwichMeanSiderealTime(jd);
  const lha = wrapDeg(gmst + longitude - elements.rightAscension);
  // Shift to [-180, 180] so negative = before noon, positive = after noon
  return lha > 180 ? lha - 360 : lha;
}

// =============================================================================
// § 6 · TRUE SOLAR TIME  (supersedes solarTime.ts)
// =============================================================================

/**
 * Result of a True Solar Time computation.
 */
export interface TrueSolarTimeResult {
  /**
   * Date representing an absolute moment in time (internally stored as UTC).
   *
   * JavaScript `Date` objects always store time as **milliseconds since the Unix epoch (UTC)**.
   * However, some constructors interpret input as **local time before converting to UTC**.
   *
   * Safe ways to construct a UTC moment include:
   *
   * - `Date.now()` (epoch milliseconds)
   * - `new Date()` (current moment)
   * - `new Date("2026-03-06T12:00:00Z")` (ISO string with `Z` or timezone)
   * - `new Date(Date.UTC(2026, 2, 6, 12, 0))`
   * - `new Date(epochMilliseconds)`
   *
   * Be careful with constructors that interpret input as **local time**, such as:
   *
   * - `new Date(2026, 2, 6, 12, 0)`
   * - `new Date("2026-03-06T12:00:00")` (missing timezone)
   *
   * These will apply the system timezone before converting to UTC,
   * which can lead to incorrect results in calculations that assume UTC input.
   */
  utcDate: Date;
  /** Observer longitude used */
  longitude: number;
  /** Day of year (1–366) */
  dayOfYear: number;
  /** Longitude offset component in minutes (longitude × 4) */
  longitudeOffsetMinutes: number;
  /** Equation of Time correction in minutes */
  equationOfTimeMinutes: number;
  /** Total offset from UTC in minutes */
  totalOffsetMinutes: number;
  /** Mean Solar Time as a Date object */
  meanSolarTime: Date;
  /** True Solar Time as a Date object */
  trueSolarTime: Date;
  /** True Solar Time in decimal hours (0–24) */
  trueSolarHours: number;
  /** Whether solar noon has passed */
  isPastSolarNoon: boolean;
}

/**
 * Computes True Solar Time for a given UTC moment and geographic longitude
 * using the NOAA-standard Equation of Time.
 *
 * True Solar Time (TST) reflects the actual position of the Sun — solar noon
 * (TST = 12:00:00) is when the Sun transits the meridian. It differs from
 * civil time due to timezone offsets, longitude within a timezone, and the
 * Equation of Time.
 *
 * ```
 * TST = UTC + (longitude × 4 min/°) + EoT
 * ```
 *
 * @param utcDate   - Observation time in UTC. use nowDate() (corrected UTC)
 * @param longitude - Observer longitude (decimal degrees, east = positive)
 * @returns {@link TrueSolarTimeResult}
 *
 * @example
 * ```ts
 * const tst = computeTrueSolarTime(new Date(), 8.6821); // Frankfurt
 * console.log(tst.trueSolarHours);        // e.g. 11.72
 * console.log(tst.equationOfTimeMinutes); // e.g. −2.3
 * ```
 */
export function computeTrueSolarTime(
  utcDate: Date,
  longitude: number,
): TrueSolarTimeResult {
  const dayOfYear = getDayOfYear(utcDate);
  const longitudeOffsetMinutes = longitude * 4;
  const equationOfTimeMinutes = equationOfTime(utcDate);
  const totalOffsetMinutes = longitudeOffsetMinutes + equationOfTimeMinutes;

  const meanSolarTime = new Date(
    utcDate.getTime() + longitudeOffsetMinutes * MS_PER_MIN, // without EoT
  );
  const trueSolarTime = new Date(
    utcDate.getTime() + totalOffsetMinutes * MS_PER_MIN,
  );

  const trueSolarHours =
    trueSolarTime.getUTCHours() +
    trueSolarTime.getUTCMinutes() / 60 +
    trueSolarTime.getUTCSeconds() / 3600;

  return {
    utcDate,
    longitude,
    dayOfYear,
    longitudeOffsetMinutes,
    equationOfTimeMinutes,
    totalOffsetMinutes,
    trueSolarTime,
    meanSolarTime,
    trueSolarHours,
    isPastSolarNoon: trueSolarHours >= 12,
  };
}

// =============================================================================
// § 7 · SOLAR POSITION  (altitude, azimuth, subsolar point)
// =============================================================================

/**
 * Cardinal/intercardinal compass direction.
 */
export type CompassDirection =
  | "N"
  | "NNE"
  | "NE"
  | "ENE"
  | "E"
  | "ESE"
  | "SE"
  | "SSE"
  | "S"
  | "SSW"
  | "SW"
  | "WSW"
  | "W"
  | "WNW"
  | "NW"
  | "NNW";

/** Maps a north-referenced bearing (0–360°) to a compass label. */
function toCompassDirection(bearingDeg: number): CompassDirection {
  const dirs: CompassDirection[] = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return dirs[Math.round(wrapDeg(bearingDeg) / 22.5) % 16];
}

/**
 * Current position of the Sun in the observer's sky.
 */
export interface SunPosition {
  /** Altitude above the horizon (degrees); negative = below horizon */
  altitudeDeg: number;
  /** Azimuth clockwise from north (degrees, 0 = north) */
  azimuthDeg: number;
  /** 16-point compass direction the Sun is in */
  compassDirection: CompassDirection;
  /** Whether the Sun is currently above the geometric horizon */
  isAboveHorizon: boolean;
  /** Sun's declination (degrees) */
  declination: number;
  /** Local hour angle (degrees; negative = AM, positive = PM) */
  hourAngle: number;
  /** Earth–Sun distance in AU */
  distanceAU: number;
  /** Earth–Sun distance in km */
  distanceKm: number;
}

/**
 * Computes the Sun's altitude and azimuth for an observer at a given
 * location and time using Meeus Chapter 13 / NOAA SPA.
 *
 * @param date      - Observation time (UTC)
 * @param latitude  - Observer latitude (decimal degrees, north = positive)
 * @param longitude - Observer longitude (decimal degrees, east = positive)
 * @returns {@link SunPosition}
 *
 * @example
 * ```ts
 * const pos = getSunPosition(new Date(), 50.1109, 8.6821);
 * console.log(`Alt: ${pos.altitudeDeg.toFixed(2)}°`);
 * console.log(`Az:  ${pos.azimuthDeg.toFixed(2)}°`);
 * ```
 */
export function getSunPosition(
  date: Date,
  latitude: number,
  longitude: number,
): SunPosition {
  const jd = toJulianDay(date);
  const elements = solarOrbitalElements(jd);
  const lha = localHourAngle(jd, elements, longitude);
  const lhaRad = toRad(lha);
  const latRad = toRad(latitude);
  const decRad = toRad(elements.declination);

  // Altitude
  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(lhaRad);
  const altitudeDeg = toDeg(Math.asin(clamp(sinAlt)));

  // Azimuth — Meeus eq. 13.5, north-referenced clockwise
  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * Math.sin(toRad(altitudeDeg))) /
    (Math.cos(latRad) * Math.cos(toRad(altitudeDeg)));
  let azimuthDeg = toDeg(Math.acos(clamp(cosAz)));
  if (Math.sin(lhaRad) > 0) azimuthDeg = 360 - azimuthDeg;

  return {
    altitudeDeg,
    azimuthDeg,
    compassDirection: toCompassDirection(azimuthDeg),
    isAboveHorizon: altitudeDeg > 0,
    declination: elements.declination,
    hourAngle: lha,
    distanceAU: elements.radiusVectorAU,
    distanceKm: elements.distanceKm,
  };
}

/**
 * The subsolar point — the latitude and longitude on Earth's surface where
 * the Sun is directly overhead (altitude = 90°) at a given moment.
 *
 * Useful for map visualisations showing the Sun's ground track.
 *
 * @param date - Observation time (UTC)
 * @returns `{ latitude, longitude }` in decimal degrees
 */
export function getSubsolarPoint(date: Date): {
  latitude: number;
  longitude: number;
} {
  const jd = toJulianDay(date);
  const elements = solarOrbitalElements(jd);
  const gmst = greenwichMeanSiderealTime(jd);

  // Subsolar longitude = RA − GMST, wrapped to [-180, 180]
  let lon = wrapDeg(elements.rightAscension - gmst);
  if (lon > 180) lon -= 360;

  return { latitude: elements.declination, longitude: lon };
}

// =============================================================================
// § 8 · SOLAR EVENTS  (sunrise, sunset, twilights, golden hour, solar noon)
// =============================================================================

/**
 * Named solar event times for a calendar day at a geographic location.
 * All values are UTC Date objects, or `null` if the event does not occur
 * (e.g. polar day/night).
 */
export interface SolarTimes {
  /** Astronomical dawn — Sun at −18° */
  astronomicalDawn: Date | null;
  /** Nautical dawn — Sun at −12° */
  nauticalDawn: Date | null;
  /** Civil dawn — Sun at −6° */
  civilDawn: Date | null;
  /** Sunrise — upper limb touches horizon (corrected for refraction) */
  sunrise: Date | null;
  /** Solar noon — Sun transits the meridian */
  solarNoon: Date;
  /** Sunset — upper limb dips below horizon */
  sunset: Date | null;
  /** Civil dusk — Sun at −6° */
  civilDusk: Date | null;
  /** Nautical dusk — Sun at −12° */
  nauticalDusk: Date | null;
  /** Astronomical dusk — Sun at −18° */
  astronomicalDusk: Date | null;
  /** Morning golden hour end — Sun at +6° */
  morningGoldenHourEnd: Date | null;
  /** Evening golden hour start — Sun at +6° */
  eveningGoldenHourStart: Date | null;
  /** Duration of daylight in minutes, or null during polar night/day */
  daylightMinutes: number | null;
}

/**
 * Solves for the UTC time when the Sun reaches a target altitude on a given
 * day, before or after solar noon, using bisection search.
 *
 * @param date      - Calendar day (UTC)
 * @param latitude  - Observer latitude (decimal degrees)
 * @param longitude - Observer longitude (decimal degrees)
 * @param targetAlt - Target solar altitude in degrees (e.g. −0.5667 for sunrise)
 * @param isMorning - `true` = solve for AM crossing, `false` = PM crossing
 * @returns UTC Date of the crossing, or `null` if it does not occur that day
 */
function solveHorizonCrossing(
  date: Date,
  latitude: number,
  longitude: number,
  targetAlt: number,
  isMorning: boolean,
): Date | null {
  const noon = getSolarNoon(date, longitude);
  const noonMs = noon.getTime();
  const halfDayMs = 12 * 3_600_000;

  // Search window: midnight→noon (AM) or noon→midnight (PM)
  let lo = isMorning ? noonMs - halfDayMs : noonMs;
  let hi = isMorning ? noonMs : noonMs + halfDayMs;

  const altAt = (ms: number) =>
    getSunPosition(new Date(ms), latitude, longitude).altitudeDeg;

  const loAlt = altAt(lo);
  const hiAlt = altAt(hi);

  // If both endpoints are on the same side of the target, no crossing exists
  if ((loAlt - targetAlt) * (hiAlt - targetAlt) > 0) return null;

  // Bisection — 50 iterations gives sub-millisecond precision
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const midAlt = altAt(mid);
    if ((loAlt - targetAlt) * (midAlt - targetAlt) <= 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return new Date((lo + hi) / 2);
}

/**
 * Returns the UTC time of solar noon for a given date and longitude.
 *
 * Solar noon is when the Sun's hour angle is 0 — it crosses the local meridian
 * and is at its highest altitude for the day.
 *
 * @param date      - Any moment on the desired date (UTC)
 * @param longitude - Observer longitude (decimal degrees)
 * @returns UTC Date of solar noon
 *
 * @example
 * ```ts
 * const noon = getSolarNoon(new Date(), 8.6821);
 * console.log(noon.toISOString()); // e.g. "2024-06-21T10:17:00.000Z"
 * ```
 */
export function getSolarNoon(date: Date, longitude: number): Date {
  // Noon in UTC ≈ 12h − (longitude × 4 min) − EoT, iterated once for accuracy
  const midnight = utcMidnight(date).getTime();
  const approxUtc = new Date(midnight + 12 * 3_600_000);
  const eot = equationOfTime(approxUtc);
  const offsetMins = longitude * 4 + eot;
  return new Date(midnight + 12 * 3_600_000 - offsetMins * MS_PER_MIN);
}

/**
 * Computes all named solar event times for a calendar day and location.
 *
 * Uses bisection solving on the Sun's altitude function — no lookup tables,
 * valid for any latitude and any date.
 *
 * @param date      - Calendar day (time-of-day is ignored; midnight UTC is used)
 * @param latitude  - Observer latitude (decimal degrees, north = positive)
 * @param longitude - Observer longitude (decimal degrees, east = positive)
 * @returns {@link SolarTimes}
 *
 * @example
 * ```ts
 * const times = getSolarTimes(new Date(), 50.1109, 8.6821);
 * console.log(times.sunrise?.toISOString()); // "2024-06-21T03:24:00.000Z"
 * console.log(times.daylightMinutes);        // e.g. 986
 * ```
 */
export function getSolarTimes(
  date: Date,
  latitude: number,
  longitude: number,
): SolarTimes {
  const solve = (alt: number, am: boolean) =>
    solveHorizonCrossing(date, latitude, longitude, alt, am);

  const sunrise = solve(-REFRACTION_HORIZON_DEG, true);
  const sunset = solve(-REFRACTION_HORIZON_DEG, false);

  const daylightMinutes =
    sunrise && sunset
      ? (sunset.getTime() - sunrise.getTime()) / MS_PER_MIN
      : null;

  return {
    astronomicalDawn: solve(-18, true),
    nauticalDawn: solve(-12, true),
    civilDawn: solve(-6, true),
    sunrise,
    solarNoon: getSolarNoon(date, longitude),
    sunset,
    civilDusk: solve(-6, false),
    nauticalDusk: solve(-12, false),
    astronomicalDusk: solve(-18, false),
    morningGoldenHourEnd: solve(6, true),
    eveningGoldenHourStart: solve(6, false),
    daylightMinutes,
  };
}

// =============================================================================
// § 9 · LUNAR POSITION  (Meeus Ch. 47 — truncated series)
// =============================================================================

/**
 * Computes fundamental lunar orbital arguments in degrees.
 * Meeus Table 47.A.
 *
 * @param T - Julian centuries since J2000.0
 */
function lunarOrbitalArguments(T: number): {
  Lp: number;
  D: number;
  M: number;
  Mp: number;
  F: number;
} {
  return {
    /** Moon's mean longitude */
    Lp: wrapDeg(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T),
    /** Moon's mean elongation */
    D: wrapDeg(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T),
    /** Sun's mean anomaly */
    M: wrapDeg(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T),
    /** Moon's mean anomaly */
    Mp: wrapDeg(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T),
    /** Moon's argument of latitude */
    F: wrapDeg(93.272095 + 483202.0175233 * T - 0.0036539 * T * T),
  };
}

/**
 * Lunar geocentric position and distance.
 */
interface LunarGeocentricPosition {
  /** Geocentric ecliptic longitude (degrees) */
  longitude: number;
  /** Geocentric ecliptic latitude (degrees) */
  latitude: number;
  /** Distance from Earth centre to Moon (km) */
  distanceKm: number;
}

/**
 * Computes the Moon's geocentric ecliptic longitude, latitude, and distance
 * using the Meeus Chapter 47 truncated series (top terms only).
 *
 * Accuracy: longitude ±0.3°, latitude ±0.2°, distance ±20 km.
 *
 * @param jd - Julian Day Number
 * @returns {@link LunarGeocentricPosition}
 */
function lunarGeocentricPosition(jd: number): LunarGeocentricPosition {
  const T = julianCenturies(jd);
  const { Lp, D, M, Mp, F } = lunarOrbitalArguments(T);

  // Eccentricity correction for terms involving M
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const E2 = E * E;

  // Longitude periodic terms ΣL (0.0001° units) — top 15 terms from Meeus
  const sumsL: [number, number, number, number, number, number][] = [
    // D,  M,  Mp,  F,  E-factor, coefficient
    [0, 0, 1, 0, 1, 6288774],
    [2, 0, -1, 0, 1, 1274027],
    [2, 0, 0, 0, 1, 658314],
    [0, 0, 2, 0, 1, 213618],
    [0, 1, 0, 0, E, -185116],
    [0, 0, 0, 2, 1, -114332],
    [2, 0, -2, 0, 1, 58793],
    [2, -1, -1, 0, E, 57066],
    [2, 0, 1, 0, 1, 53322],
    [2, -1, 0, 0, E, 45758],
    [0, 1, -1, 0, E, -40923],
    [1, 0, 0, 0, 1, -34720],
    [0, 1, 1, 0, E, -30383],
    [2, 0, 0, -2, 1, 15327],
    [0, 0, 1, 2, 1, -12528],
  ];

  // Latitude periodic terms ΣB — top 10 terms
  const sumsB: [number, number, number, number, number, number][] = [
    [0, 0, 0, 1, 1, 5128122],
    [0, 0, 1, 1, 1, 280602],
    [0, 0, 1, -1, 1, 277693],
    [2, 0, 0, -1, 1, 173237],
    [2, 0, -1, 1, 1, 55413],
    [2, 0, -1, -1, 1, 46271],
    [2, 0, 0, 1, 1, 32573],
    [0, 0, 2, 1, 1, 17198],
    [2, 0, 1, -1, 1, 9266],
    [0, 0, 2, -1, 1, 8822],
  ];

  // Distance terms ΣR (0.001 km units) — top 10 terms
  const sumsR: [number, number, number, number, number, number][] = [
    [0, 0, 0, 0, 1, -20905355],
    [2, 0, 0, 0, 1, -3699111],
    [2, 0, -1, 0, 1, -2955968],
    [0, 0, 1, 0, 1, -569925],
    [0, 1, 0, 0, E, 48888],
    [0, 0, 0, 2, 1, -3149],
    [2, 0, -2, 0, 1, 246158],
    [2, -1, -1, 0, E, -152138],
    [2, 0, 1, 0, 1, -170733],
    [2, -1, 0, 0, E, -204586],
  ];

  const Drad = toRad(D);
  const Mrad = toRad(M);
  const Mprad = toRad(Mp);
  const Frad = toRad(F);

  const computeSum = (
    terms: [number, number, number, number, number, number][],
    useCos: boolean,
  ): number =>
    terms.reduce((acc, [dC, mC, mpC, fC, eFactor, coeff]) => {
      const arg = dC * Drad + mC * Mrad + mpC * Mprad + fC * Frad;
      const eCorr = Math.abs(mC) === 2 ? E2 : Math.abs(mC) === 1 ? eFactor : 1;
      return acc + coeff * eCorr * (useCos ? Math.cos(arg) : Math.sin(arg));
    }, 0);

  const sigmaL = computeSum(sumsL, false); // 0.0001° units
  const sigmaB = computeSum(sumsB, false); // 0.0001° units
  const sigmaR = computeSum(sumsR, true); // 0.001 km units

  // Add the largest Venus/Jupiter perturbation terms (Meeus §47)
  const A1 = toRad(wrapDeg(119.75 + 131.849 * T));
  const A2 = toRad(wrapDeg(53.09 + 479264.29 * T));
  const sigmaLCorrected =
    sigmaL +
    3958 * Math.sin(A1) +
    1962 * Math.sin(toRad(Lp - F)) +
    318 * Math.sin(A2);

  const sigmaBCorrected =
    sigmaB -
    2235 * Math.sin(toRad(Lp)) +
    382 * Math.sin(toRad(wrapDeg(313.45 + 481266.484 * T))) +
    175 * Math.sin(A1 - Frad) +
    175 * Math.sin(A1 + Frad) +
    127 * Math.sin(toRad(Lp - Mp)) -
    115 * Math.sin(toRad(Lp + Mp));

  return {
    longitude: wrapDeg(Lp + sigmaLCorrected / 10_000),
    latitude: sigmaBCorrected / 10_000,
    distanceKm: 385_000.56 + sigmaR / 1_000,
  };
}

/**
 * Current position of the Moon in the observer's sky.
 */
export interface MoonPosition {
  /** Altitude above the horizon (degrees); negative = below horizon */
  altitudeDeg: number;
  /** Azimuth clockwise from north (degrees) */
  azimuthDeg: number;
  /** 16-point compass direction */
  compassDirection: CompassDirection;
  /** Whether the Moon is currently above the horizon */
  isAboveHorizon: boolean;
  /** Moon's geocentric declination (degrees) */
  declination: number;
  /** Earth–Moon distance (km) */
  distanceKm: number;
  /** Parallactic angle (degrees) — orientation of the bright limb */
  parallacticAngleDeg: number;
}

/**
 * Computes the Moon's altitude, azimuth, distance, and parallactic angle
 * for an observer at a given location and time.
 *
 * @param date      - Observation time (UTC)
 * @param latitude  - Observer latitude (decimal degrees)
 * @param longitude - Observer longitude (decimal degrees)
 * @returns {@link MoonPosition}
 *
 * @example
 * ```ts
 * const moon = getMoonPosition(new Date(), 50.1109, 8.6821);
 * console.log(`Moon alt: ${moon.altitudeDeg.toFixed(1)}°`);
 * console.log(`Distance: ${moon.distanceKm.toFixed(0)} km`);
 * ```
 */
export function getMoonPosition(
  date: Date,
  latitude: number,
  longitude: number,
): MoonPosition {
  const jd = toJulianDay(date);
  const T = julianCenturies(jd);
  const geo = lunarGeocentricPosition(jd);
  const gmst = greenwichMeanSiderealTime(jd);

  // Convert ecliptic → equatorial
  const obliq = 23.439291111 - 0.013004167 * T;
  const oblRad = toRad(obliq);
  const lonRad = toRad(geo.longitude);
  const latRad = toRad(geo.latitude);

  const decRad = Math.asin(
    clamp(
      Math.sin(latRad) * Math.cos(oblRad) +
        Math.cos(latRad) * Math.sin(oblRad) * Math.sin(lonRad),
    ),
  );
  const declination = toDeg(decRad);

  const raRad = Math.atan2(
    Math.sin(lonRad) * Math.cos(oblRad) - Math.tan(latRad) * Math.sin(oblRad),
    Math.cos(lonRad),
  );
  const rightAscension = wrapDeg(toDeg(raRad));

  // Local hour angle
  const lha = wrapDeg(gmst + longitude - rightAscension);
  const lhaAdj = lha > 180 ? lha - 360 : lha;
  const lhaRad = toRad(lhaAdj);
  const latRad2 = toRad(latitude);

  // Altitude
  const sinAlt =
    Math.sin(latRad2) * Math.sin(decRad) +
    Math.cos(latRad2) * Math.cos(decRad) * Math.cos(lhaRad);
  const altitudeDeg = toDeg(Math.asin(clamp(sinAlt)));

  // Azimuth (north-referenced, clockwise)
  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad2) * Math.sin(toRad(altitudeDeg))) /
    (Math.cos(latRad2) * Math.cos(toRad(altitudeDeg)));
  let azimuthDeg = toDeg(Math.acos(clamp(cosAz)));
  if (Math.sin(lhaRad) > 0) azimuthDeg = 360 - azimuthDeg;

  // Parallactic angle — orientation of the lunar bright limb (Meeus eq. 14.1)
  const parRad = Math.atan2(
    Math.sin(lhaRad),
    Math.tan(latRad2) * Math.cos(decRad) - Math.sin(decRad) * Math.cos(lhaRad),
  );

  return {
    altitudeDeg,
    azimuthDeg,
    compassDirection: toCompassDirection(azimuthDeg),
    isAboveHorizon: altitudeDeg > 0,
    declination,
    distanceKm: geo.distanceKm,
    parallacticAngleDeg: toDeg(parRad),
  };
}

// =============================================================================
// § 10 · MOON ILLUMINATION & PHASE  (Meeus Ch. 48)
// =============================================================================

/** Human-readable moon phase name. */
export type MoonPhaseName =
  | "New Moon"
  | "Waxing Crescent"
  | "First Quarter"
  | "Waxing Gibbous"
  | "Full Moon"
  | "Waning Gibbous"
  | "Last Quarter"
  | "Waning Crescent";

/**
 * Moon illumination and phase data.
 */
export interface MoonIllumination {
  /** Illuminated fraction of the Moon's disk (0–1) */
  fraction: number;
  /** Phase angle (0–1): 0/1 = New Moon, 0.25 = First Quarter, 0.5 = Full */
  phase: number;
  /** Phase angle in degrees (0–360) */
  phaseDeg: number;
  /** Human-readable phase name */
  phaseName: MoonPhaseName;
  /** Whether the Moon is waxing (growing) */
  isWaxing: boolean;
  /** Elongation angle between Moon and Sun (degrees) */
  elongationDeg: number;
  /** Bright limb position angle (degrees) */
  brightLimbAngleDeg: number;
}

/**
 * Maps a phase fraction (0–1) to a {@link MoonPhaseName}.
 * @param phase - Phase fraction
 */
function moonPhaseNameFromFraction(phase: number): MoonPhaseName {
  if (phase < 0.0625 || phase >= 0.9375) return "New Moon";
  if (phase < 0.1875) return "Waxing Crescent";
  if (phase < 0.3125) return "First Quarter";
  if (phase < 0.4375) return "Waxing Gibbous";
  if (phase < 0.5625) return "Full Moon";
  if (phase < 0.6875) return "Waning Gibbous";
  if (phase < 0.8125) return "Last Quarter";
  return "Waning Crescent";
}

/**
 * Computes Moon illumination, phase fraction, and related data for a given
 * UTC moment using Meeus Chapter 48.
 *
 * @param date - Observation time (UTC)
 * @returns {@link MoonIllumination}
 *
 * @example
 * ```ts
 * const illum = getMoonIllumination(new Date());
 * console.log(`${illum.phaseName} — ${(illum.fraction * 100).toFixed(0)}% lit`);
 * ```
 */
export function getMoonIllumination(date: Date): MoonIllumination {
  const jd = toJulianDay(date);
  const lunarGeo = lunarGeocentricPosition(jd);
  const solarEl = solarOrbitalElements(jd);

  // Geocentric elongation of the Moon from the Sun (Meeus eq. 48.2)
  const phi = toDeg(
    Math.acos(
      clamp(
        Math.cos(toRad(lunarGeo.latitude)) *
          Math.cos(toRad(lunarGeo.longitude - solarEl.apparentLon)),
      ),
    ),
  );

  // Phase angle i (Meeus eq. 48.4) — includes distance correction
  const i = Math.atan2(
    solarEl.radiusVectorAU * Math.sin(toRad(phi)),
    lunarGeo.distanceKm / AU_KM - solarEl.radiusVectorAU * Math.cos(toRad(phi)),
  );

  const phaseDeg = wrapDeg(toDeg(i));
  const fraction = (1 + Math.cos(i)) / 2;

  // Phase fraction 0→1 representing position in the synodic month
  // 0 = new, 0.5 = full, 1 = new again
  const lunarLon = lunarGeo.longitude;
  const solarLon = solarEl.apparentLon;
  const phase = wrapDeg(lunarLon - solarLon) / 360;

  // Bright limb position angle (Meeus eq. 48.5)
  const T = julianCenturies(jd);
  const obliq = 23.439291111 - 0.013004167 * T;
  const solarDecRad = toRad(solarEl.declination);
  const solarRaRad = toRad(solarEl.rightAscension);
  const moonLunarGeo = lunarGeocentricPosition(jd);
  const lunarDecRad = Math.asin(
    clamp(
      Math.sin(toRad(moonLunarGeo.latitude)) * Math.cos(toRad(obliq)) +
        Math.cos(toRad(moonLunarGeo.latitude)) *
          Math.sin(toRad(obliq)) *
          Math.sin(toRad(moonLunarGeo.longitude)),
    ),
  );
  const lunarRaRad = Math.atan2(
    Math.sin(toRad(moonLunarGeo.longitude)) * Math.cos(toRad(obliq)) -
      Math.tan(toRad(moonLunarGeo.latitude)) * Math.sin(toRad(obliq)),
    Math.cos(toRad(moonLunarGeo.longitude)),
  );
  const brightLimbRad = Math.atan2(
    Math.cos(solarDecRad) * Math.sin(solarRaRad - lunarRaRad),
    Math.sin(solarDecRad) * Math.cos(lunarDecRad) -
      Math.cos(solarDecRad) *
        Math.sin(lunarDecRad) *
        Math.cos(solarRaRad - lunarRaRad),
  );

  return {
    fraction,
    phase,
    phaseDeg,
    phaseName: moonPhaseNameFromFraction(phase),
    isWaxing: phase < 0.5,
    elongationDeg: phi,
    brightLimbAngleDeg: wrapDeg(toDeg(brightLimbRad)),
  };
}

// =============================================================================
// § 11 · MOONRISE / MOONSET  (iterative bisection)
// =============================================================================

/**
 * Moon rise and set times for a calendar day.
 */
export interface MoonTimes {
  /** Moonrise time (UTC), or null if it does not rise */
  moonrise: Date | null;
  /** Moonset time (UTC), or null if it does not set */
  moonset: Date | null;
  /** True if the Moon is above the horizon for the entire day */
  alwaysUp: boolean;
  /** True if the Moon is below the horizon for the entire day */
  alwaysDown: boolean;
}

/**
 * Finds the UTC time when the Moon crosses a target altitude using bisection,
 * within a given search window.
 *
 * @param loMs     - Window start (Unix ms)
 * @param hiMs     - Window end (Unix ms)
 * @param latitude - Observer latitude
 * @param longitude - Observer longitude
 * @param targetAlt - Target altitude in degrees
 * @returns Crossing time as Unix ms, or null if no crossing in the window
 */
function bisectMoonAltitude(
  loMs: number,
  hiMs: number,
  latitude: number,
  longitude: number,
  targetAlt: number,
): number | null {
  const altAt = (ms: number) =>
    getMoonPosition(new Date(ms), latitude, longitude).altitudeDeg;

  const loAlt = altAt(loMs);
  const hiAlt = altAt(hiMs);

  if ((loAlt - targetAlt) * (hiAlt - targetAlt) > 0) return null;

  for (let i = 0; i < 50; i++) {
    const mid = (loMs + hiMs) / 2;
    const midAlt = altAt(mid);
    if ((loAlt - targetAlt) * (midAlt - targetAlt) <= 0) {
      hiMs = mid;
    } else {
      loMs = mid;
    }
  }

  return (loMs + hiMs) / 2;
}

/**
 * Computes moonrise and moonset times for a calendar day and location.
 *
 * The Moon's rapid orbital motion (~13°/day) means it can rise and set at
 * very different times each day — or not at all near new/full moon in high
 * latitudes. This function searches the full 24-hour window in 2-hour
 * segments to detect all crossings.
 *
 * @param date      - Calendar day (time of day is ignored)
 * @param latitude  - Observer latitude (decimal degrees)
 * @param longitude - Observer longitude (decimal degrees)
 * @returns {@link MoonTimes}
 *
 * @example
 * ```ts
 * const mt = getMoonTimes(new Date(), 50.1109, 8.6821);
 * console.log(mt.moonrise?.toISOString()); // e.g. "2024-06-21T20:12:00.000Z"
 * ```
 */
export function getMoonTimes(
  date: Date,
  latitude: number,
  longitude: number,
): MoonTimes {
  const dayStart = utcMidnight(date).getTime();
  const dayEnd = dayStart + MS_PER_DAY;
  const step = 2 * 3_600_000; // 2-hour segments

  let moonrise: Date | null = null;
  let moonset: Date | null = null;

  const TARGET_ALT = -REFRACTION_HORIZON_DEG;

  for (let lo = dayStart; lo < dayEnd - step; lo += step) {
    const hi = lo + step;
    const loAlt = getMoonPosition(
      new Date(lo),
      latitude,
      longitude,
    ).altitudeDeg;
    const hiAlt = getMoonPosition(
      new Date(hi),
      latitude,
      longitude,
    ).altitudeDeg;

    if ((loAlt - TARGET_ALT) * (hiAlt - TARGET_ALT) < 0) {
      const tMs = bisectMoonAltitude(lo, hi, latitude, longitude, TARGET_ALT);
      if (tMs !== null) {
        const isRising = loAlt < hiAlt;
        if (isRising && moonrise === null) moonrise = new Date(tMs);
        if (!isRising && moonset === null) moonset = new Date(tMs);
      }
    }
  }

  // Determine always-up / always-down by sampling altitude at noon
  const sampleAlt = getMoonPosition(
    new Date(dayStart + 12 * 3_600_000),
    latitude,
    longitude,
  ).altitudeDeg;
  const alwaysUp = moonrise === null && moonset === null && sampleAlt > 0;
  const alwaysDown = moonrise === null && moonset === null && sampleAlt <= 0;

  return { moonrise, moonset, alwaysUp, alwaysDown };
}

// =============================================================================
// § 12 · AGGREGATE SNAPSHOT
// =============================================================================

/**
 * Complete solar and lunar snapshot for a location at a moment in time.
 * The single entry-point for most UI rendering needs.
 */
export interface AstronomySnapshot {
  /** UTC timestamp of the observation */
  timestamp: Date;
  /** Observer latitude */
  latitude: number;
  /** Observer longitude */
  longitude: number;
  /** True Solar Time result */
  trueSolarTime: TrueSolarTimeResult;
  /** Sun's current position in the sky */
  sunPosition: SunPosition;
  /** All solar event times for the day */
  solarTimes: SolarTimes;
  /** Subsolar point (lat/lon where Sun is directly overhead) */
  subsolarPoint: { latitude: number; longitude: number };
  /** Moon's current position in the sky */
  moonPosition: MoonPosition;
  /** Moon illumination, phase, and phase name */
  moonIllumination: MoonIllumination;
  /** Moonrise/moonset times for the day */
  moonTimes: MoonTimes;
}

/**
 * Computes a complete astronomical snapshot for an observer at a given
 * location and time. Combines all solar and lunar data into one call.
 *
 * This is the primary entry point for most application use cases.
 *
 * @param date      - Observation time (UTC)
 * @param latitude  - Observer latitude (decimal degrees, north = positive)
 * @param longitude - Observer longitude (decimal degrees, east = positive)
 * @returns {@link AstronomySnapshot}
 *
 * @example
 * ```ts
 * const snap = getAstronomySnapshot(new Date(), 50.1109, 8.6821);
 *
 * console.log(snap.trueSolarTime.trueSolarHours);    // e.g. 11.72
 * console.log(snap.sunPosition.altitudeDeg);         // e.g. 58.3
 * console.log(snap.moonIllumination.phaseName);      // e.g. "Waxing Gibbous"
 * console.log(snap.solarTimes.sunrise?.toISOString()); // "2024-06-21T03:24:00.000Z"
 * ```
 */
export function getAstronomySnapshot(
  date: Date,
  latitude: number,
  longitude: number,
): AstronomySnapshot {
  return {
    timestamp: date,
    latitude,
    longitude,
    trueSolarTime: computeTrueSolarTime(date, longitude),
    sunPosition: getSunPosition(date, latitude, longitude),
    solarTimes: getSolarTimes(date, latitude, longitude),
    subsolarPoint: getSubsolarPoint(date),
    moonPosition: getMoonPosition(date, latitude, longitude),
    moonIllumination: getMoonIllumination(date),
    moonTimes: getMoonTimes(date, latitude, longitude),
  };
}
