/**
 * @file weather.ts
 * @description Pure lightweight library for fetching weather data from the Open-Meteo API.
 *
 * Open-Meteo is free, requires no API key, and provides high-resolution
 * forecast and current-condition data worldwide.
 *
 * Three fetch modes are available — each requests **only** the variable group
 * it needs, keeping payloads minimal:
 * - {@link getCurrentWeather} — current conditions snapshot
 * - {@link getHourlyForecast} — hour-by-hour forecast
 * - {@link getDailyForecast}  — day-level aggregates
 * - {@link getWeather}        — all three in one request
 *
 * @see {@link https://open-meteo.com/en/docs}
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

/** Variable lists sent to Open-Meteo for each data group. */
const CURRENT_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "dew_point_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "weather_code",
  "cloud_cover",
  "surface_pressure",
  "precipitation",
  "is_day",
  "visibility",
  "uv_index",
] as const;

const HOURLY_VARIABLES = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "dew_point_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "weather_code",
  "cloud_cover",
  "surface_pressure",
  "precipitation",
  "precipitation_probability",
  "visibility",
  "uv_index",
  "is_day",
  "rain",
  "showers",
  "snowfall",
] as const;

const DAILY_VARIABLES = [
  "temperature_2m_max",
  "temperature_2m_min",
  "weather_code",
  "sunrise",
  "sunset",
  "precipitation_sum",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "wind_direction_10m_dominant",
  "uv_index_max",
  "precipitation_probability_max",
] as const;

// ---------------------------------------------------------------------------
// Types — units
// ---------------------------------------------------------------------------

export type WmoCode =
  | 0 // Clear sky
  // Mainly clear, partly cloudy, overcast
  | 1
  | 2
  | 3
  // Fog
  | 45
  | 48
  // Drizzle
  | 51
  | 53
  | 55
  // Rain
  | 61
  | 63
  | 65
  // Snow
  | 71
  | 73
  | 75
  // Snow grains
  | 77
  // Rain showers
  | 80
  | 81
  | 82
  // Snow showers
  | 85
  | 86
  // Thunderstorm
  | 95
  // Thunderstorm with hail
  | 96
  | 99;

/** Temperature unit for Open-Meteo requests. */
export type TemperatureUnit = "celsius" | "fahrenheit";

/** Wind speed unit for Open-Meteo requests. */
export type WindSpeedUnit = "kmh" | "mph" | "ms" | "kn";

/** Precipitation unit for Open-Meteo requests. */
export type PrecipitationUnit = "mm" | "inch";

// ---------------------------------------------------------------------------
// Types — options
// ---------------------------------------------------------------------------

/**
 * Shared request options for all weather fetch functions.
 */
export interface WeatherOptions {
  /** Temperature unit. @default "celsius" */
  temperatureUnit?: TemperatureUnit;
  /** Wind speed unit. @default "kmh" */
  windSpeedUnit?: WindSpeedUnit;
  /** Precipitation unit. @default "mm" */
  precipitationUnit?: PrecipitationUnit;
  /**
   * IANA timezone string used for daily aggregates and hourly timestamps. e.g. "Europe/Berlin"
   * @default "UTC"
   */
  timezone?: string;
  /**
   * Number of forecast days to include in hourly and daily responses.
   * @default 7
   * @minimum 1
   * @maximum 16
   */
  forecastDays?: number;
}

// ---------------------------------------------------------------------------
// Types — response shapes
// ---------------------------------------------------------------------------

/**
 * Current weather conditions at a location.
 */
export interface CurrentWeather {
  /** Observation timestamp (UTC). */
  timestamp: Date;
  /** Air temperature at 2 m in the configured unit. */
  temperature: number;
  /** Apparent ("feels like") temperature. */
  apparentTemperature: number;
  /** Relative humidity at 2 m in %. */
  relativeHumidity: number;
  /** Dew point at 2 m. */
  dewPoint: number;
  /** Wind speed at 10 m. */
  windSpeed: number;
  /** Wind direction at 10 m in degrees (0 = north). */
  windDirection: number;
  /** Wind gusts at 10 m. */
  windGusts: number;
  /** WMO weather interpretation code. */
  weatherCode: WmoCode;
  /** Plain-English description of the WMO code. */
  weatherDescription: string;
  /** Cloud cover in %. */
  cloudCover: number;
  /** Surface pressure in hPa. */
  surfacePressure: number;
  /** Precipitation in the last hour. */
  precipitation: number;
  /** Whether it is currently daytime at this location. */
  isDay: boolean;
  /** Visibility in metres. */
  visibility: number;
  /** UV index. */
  uvIndex: number;
}

/**
 * Weather conditions for a single hour in an hourly forecast.
 */
export interface HourlyWeather {
  /** Hour timestamp (UTC or localised per `timezone` option). */
  timestamp: Date;
  temperature: number;
  apparentTemperature: number;
  relativeHumidity: number;
  dewPoint: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  weatherCode: WmoCode;
  weatherDescription: string;
  cloudCover: number;
  surfacePressure: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number; // cm
  /** Precipitation probability in %. */
  precipitationProbability: number;
  visibility: number;
  uvIndex: number;
  isDay: boolean;
}

/**
 * Daily aggregated weather forecast for a single day.
 */
export interface DailyWeather {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Maximum temperature */
  temperatureMax: number;
  /** Minimum temperature */
  temperatureMin: number;
  /** Dominant WMO weather code for the day */
  weatherCode: WmoCode;
  /** Human-readable description */
  weatherDescription: string;
  /** Sunrise time (UTC) */
  sunrise: Date;
  /** Sunset time (UTC) */
  sunset: Date;
  /** Precipitation sum */
  precipitationSum: number;
  /** Maximum wind speed */
  windSpeedMax: number;
  /** Maximum wind gust */
  windGustsMax: number;
  /** Dominant wind direction in degrees */
  windDirectionDominant: number;
  /** UV index maximum */
  uvIndexMax: number;
  /** Precipitation probability max (%) */
  precipitationProbabilityMax: number;
}

/**
 * Unit metadata echoed back in combined {@link WeatherResponse} objects.
 */
export interface WeatherUnits {
  temperature: TemperatureUnit;
  windSpeed: WindSpeedUnit;
  precipitation: PrecipitationUnit;
}

/**
 * Response from {@link getCurrentWeather}.
 */
export interface CurrentWeatherResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  elevationMetres: number;
  units: WeatherUnits;
  current: CurrentWeather;
}

/**
 * Response from {@link getHourlyForecast}.
 */
export interface HourlyWeatherResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  elevationMetres: number;
  units: WeatherUnits;
  hourly: HourlyWeather[];
}

/**
 * Response from {@link getDailyForecast}.
 */
export interface DailyWeatherResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  elevationMetres: number;
  units: WeatherUnits;
  daily: DailyWeather[];
}

/**
 * Combined response from {@link getWeather} containing all three groups.
 */
export interface WeatherResponse
  extends CurrentWeatherResponse, HourlyWeatherResponse, DailyWeatherResponse {}

// ---------------------------------------------------------------------------
// WMO descriptions
// ---------------------------------------------------------------------------

/**
 * Maps a WMO weather interpretation code to a plain-English description.
 *
 * @param code - WMO weather code.
 * @returns Human-readable description string.
 */
export function describeWmoCode(code: number): string {
  const descriptions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return descriptions[code] ?? `Unknown (WMO ${code})`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolves shared unit parameters into a URLSearchParams-ready object. */
function baseParams(
  latitude: number,
  longitude: number,
  options: WeatherOptions,
): Record<string, string> {
  return {
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    temperature_unit: options.temperatureUnit ?? "celsius",
    wind_speed_unit: options.windSpeedUnit ?? "kmh",
    precipitation_unit: options.precipitationUnit ?? "mm",
    timezone: options.timezone ?? "UTC",
    forecast_days: String(Math.min(Math.max(options.forecastDays ?? 7, 1), 16)),
  };
}

/** Extracts the shared envelope fields from a raw Open-Meteo response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEnvelope(data: any, options: WeatherOptions) {
  return {
    latitude: data.latitude as number,
    longitude: data.longitude as number,
    timezone: data.timezone as string,
    elevationMetres: data.elevation as number,
    units: {
      temperature: options.temperatureUnit ?? "celsius",
      windSpeed: options.windSpeedUnit ?? "kmh",
      precipitation: options.precipitationUnit ?? "mm",
    } satisfies WeatherUnits,
  };
}

/**
 * Parses the raw current object from Open-Meteo JSON response into a typed {@link CurrentWeather}.
 *
 * @param c - Raw `current` JSON from Open-Meteo
 * @returns Parsed and typed current weather object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCurrent(c: any): CurrentWeather {
  return {
    timestamp: new Date(c.time + "Z"),
    temperature: c.temperature_2m,
    apparentTemperature: c.apparent_temperature,
    relativeHumidity: c.relative_humidity_2m,
    dewPoint: c.dew_point_2m,
    windSpeed: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    windGusts: c.wind_gusts_10m,
    weatherCode: c.weather_code as WmoCode,
    weatherDescription: describeWmoCode(c.weather_code),
    cloudCover: c.cloud_cover,
    surfacePressure: c.surface_pressure,
    precipitation: c.precipitation,
    isDay: c.is_day === 1,
    visibility: c.visibility,
    uvIndex: c.uv_index,
  };
}

/**
 * Parses the raw hourly object from Open-Meteo JSON response into a typed {@link HourlyWeather}.
 *
 * @param h - Raw JSON from Open-Meteo
 * @returns Parsed and typed hourly weather object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseHourly(h: any): HourlyWeather[] {
  return (h.time as string[]).map((t, i) => ({
    timestamp: new Date(t + (t.endsWith("Z") ? "" : "Z")),
    temperature: h.temperature_2m[i],
    apparentTemperature: h.apparent_temperature[i],
    relativeHumidity: h.relative_humidity_2m[i],
    dewPoint: h.dew_point_2m[i],
    windSpeed: h.wind_speed_10m[i],
    windDirection: h.wind_direction_10m[i],
    windGusts: h.wind_gusts_10m[i],
    weatherCode: h.weather_code[i] as WmoCode,
    weatherDescription: describeWmoCode(h.weather_code[i]),
    cloudCover: h.cloud_cover[i],
    surfacePressure: h.surface_pressure[i],
    precipitation: h.precipitation[i],
    rain: h.rain[i],
    showers: h.showers[i],
    snowfall: h.snowfall[i],
    precipitationProbability: h.precipitation_probability[i] ?? 0,
    visibility: h.visibility[i],
    uvIndex: h.uv_index[i],
    isDay: h.is_day[i] === 1,
  }));
}

/**
 * Parses the raw daily object from Open-Meteo JSON response into a typed {@link DailyWeather}.
 *
 * @param d - Raw JSON from Open-Meteo
 * @returns Parsed and typed daily weather object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDaily(d: any): DailyWeather[] {
  return (d.time as string[]).map((dateStr, i) => ({
    date: dateStr,
    temperatureMax: d.temperature_2m_max[i],
    temperatureMin: d.temperature_2m_min[i],
    weatherCode: d.weather_code[i] as WmoCode,
    weatherDescription: describeWmoCode(d.weather_code[i]),
    sunrise: new Date(d.sunrise[i] + ":00Z"),
    sunset: new Date(d.sunset[i] + ":00Z"),
    precipitationSum: d.precipitation_sum[i],
    windSpeedMax: d.wind_speed_10m_max[i],
    windGustsMax: d.wind_gusts_10m_max[i],
    windDirectionDominant: d.wind_direction_10m_dominant[i],
    uvIndexMax: d.uv_index_max[i],
    precipitationProbabilityMax: d.precipitation_probability_max[i] ?? 0,
  }));
}

/** Fetches from Open-Meteo and throws on non-200 or API-level errors. */
async function fetchOpenMeteo(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Open-Meteo request failed: ${res.status} ${res.statusText}`,
    );
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`Open-Meteo API error: ${data.reason ?? "Unknown error"}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Primary exports
// ---------------------------------------------------------------------------

/**
 * Fetches **only** current weather conditions for a location.
 *
 * Requests only the `current` variable group — no hourly or daily data
 * is fetched, keeping the payload minimal.
 *
 * @param latitude  - Observer latitude in decimal degrees.
 * @param longitude - Observer longitude in decimal degrees.
 * @param options   - Optional unit and timezone preferences.
 * @returns A {@link CurrentWeatherResponse}.
 * @throws {Error} On network failure or API error.
 *
 * @example
 * ```ts
 * const { current } = await getCurrentWeather(50.11, 8.68);
 * console.log(`${current.temperature}°C — ${current.weatherDescription}`);
 * ```
 */
export async function getCurrentWeather(
  latitude: number,
  longitude: number,
  options: WeatherOptions = {},
): Promise<CurrentWeatherResponse> {
  const params = new URLSearchParams({
    ...baseParams(latitude, longitude, options),
    current: CURRENT_VARIABLES.join(","),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await fetchOpenMeteo(`${OPEN_METEO_BASE}?${params}`)) as any;

  return {
    ...parseEnvelope(data, options),
    current: parseCurrent(data.current),
  };
}

/**
 * Fetches **only** an hourly forecast for a location.
 *
 * Requests only the `hourly` variable group.
 *
 * @param latitude  - Observer latitude in decimal degrees.
 * @param longitude - Observer longitude in decimal degrees.
 * @param options   - Optional unit, timezone, and `forecastDays` (1–16, default 7).
 * @returns A {@link HourlyWeatherResponse} with one {@link HourlyWeather} entry per hour.
 * @throws {Error} On network failure or API error.
 *
 * @example
 * ```ts
 * const { hourly } = await getHourlyForecast(50.11, 8.68, { forecastDays: 2 });
 * console.log(hourly[0].temperature); // first hour
 * ```
 */
export async function getHourlyForecast(
  latitude: number,
  longitude: number,
  options: WeatherOptions = {},
): Promise<HourlyWeatherResponse> {
  const params = new URLSearchParams({
    ...baseParams(latitude, longitude, options),
    hourly: HOURLY_VARIABLES.join(","),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await fetchOpenMeteo(`${OPEN_METEO_BASE}?${params}`)) as any;

  return {
    ...parseEnvelope(data, options),
    hourly: parseHourly(data.hourly),
  };
}

/**
 * Fetches **only** a daily forecast for a location.
 *
 * Requests only the `daily` variable group.
 *
 * @param latitude  - Observer latitude in decimal degrees.
 * @param longitude - Observer longitude in decimal degrees.
 * @param options   - Optional unit, timezone, and `forecastDays` (1–16, default 7).
 * @returns A {@link DailyWeatherResponse} with one {@link DailyWeather} entry per day.
 * @throws {Error} On network failure or API error.
 *
 * @example
 * ```ts
 * const { daily } = await getDailyForecast(50.11, 8.68, { forecastDays: 3 });
 * console.log(daily[0].temperatureMax);
 * ```
 */
export async function getDailyForecast(
  latitude: number,
  longitude: number,
  options: WeatherOptions = {},
): Promise<DailyWeatherResponse> {
  const params = new URLSearchParams({
    ...baseParams(latitude, longitude, options),
    daily: DAILY_VARIABLES.join(","),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await fetchOpenMeteo(`${OPEN_METEO_BASE}?${params}`)) as any;

  return {
    ...parseEnvelope(data, options),
    daily: parseDaily(data.daily),
  };
}

/**
 * Fetches current conditions **and** hourly and daily forecasts in a single
 * request.
 *
 * Use this when you need all three data groups at once. For individual groups,
 * prefer {@link getCurrentWeather}, {@link getHourlyForecast}, or
 * {@link getDailyForecast} to keep payloads minimal.
 *
 * @param latitude  - Observer latitude in decimal degrees.
 * @param longitude - Observer longitude in decimal degrees.
 * @param options   - Optional unit, timezone, and `forecastDays` (1–16, default 7).
 * @returns A {@link WeatherResponse} containing `current`, `hourly`, and `daily`.
 * @throws {Error} On network failure or API error.
 *
 * @example
 * ```ts
 * const weather = await getWeather(50.11, 8.68, { forecastDays: 5 });
 * console.log(weather.current.temperature);
 * console.log(weather.daily[0].temperatureMax);
 * ```
 */
export async function getWeather(
  latitude: number,
  longitude: number,
  options: WeatherOptions = {},
): Promise<WeatherResponse> {
  const params = new URLSearchParams({
    ...baseParams(latitude, longitude, options),
    current: CURRENT_VARIABLES.join(","),
    hourly: HOURLY_VARIABLES.join(","),
    daily: DAILY_VARIABLES.join(","),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await fetchOpenMeteo(`${OPEN_METEO_BASE}?${params}`)) as any;
  const envelope = parseEnvelope(data, options);

  return {
    ...envelope,
    current: parseCurrent(data.current),
    hourly: parseHourly(data.hourly),
    daily: parseDaily(data.daily),
  };
}
