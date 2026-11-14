/**
 * Data layer — Open-Meteo (no API key, CORS-enabled, no tracking).
 * Everything is requested in metric; conversion happens in format.js.
 */

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE  = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR      = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const TIMEOUT = 12_000;

const CURRENT = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
  'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl',
  'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'
];
const HOURLY = [
  'temperature_2m', 'apparent_temperature', 'precipitation_probability',
  'precipitation', 'weather_code', 'visibility', 'uv_index',
  'relative_humidity_2m', 'dew_point_2m', 'wind_speed_10m', 'is_day'
];
const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min',
  'sunrise', 'sunset', 'daylight_duration', 'uv_index_max',
  'precipitation_sum', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_direction_10m_dominant'
];
const POLLUTANTS = [
  'european_aqi', 'us_aqi', 'pm10', 'pm2_5',
  'carbon_monoxide', 'nitrogen_dioxide', 'sulphur_dioxide', 'ozone'
];

/** Error with a message already fit for a user-facing banner. */
export class ApiError extends Error {
  constructor(message, kind = 'network') {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

async function getJSON(url, { signal } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort('timeout'), TIMEOUT);

  // Caller-driven aborts (a newer search superseding this one) chain through.
  const onAbort = () => ctl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new ApiError(
        res.status === 429
          ? 'Rate limit reached — give it a minute.'
          : `Weather service returned ${res.status}.`,
        res.status === 429 ? 'rate' : 'http'
      );
    }
    const data = await res.json();
    if (data?.error) throw new ApiError(data.reason || 'Weather service rejected the request.', 'http');
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'AbortError') {
      // A superseded request is not a failure the user needs to hear about.
      if (ctl.signal.reason === 'timeout') throw new ApiError('Request timed out.', 'timeout');
      throw err;
    }
    throw new ApiError('Network unreachable — check your connection.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const q = params => new URLSearchParams(params).toString();

/** Full forecast bundle for a coordinate. */
export function fetchForecast(lat, lon, opts) {
  const url = `${FORECAST}?${q({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: CURRENT.join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    timezone: 'auto',
    forecast_days: 7,
    past_hours: 1
  })}`;
  return getJSON(url, opts);
}

/** Air quality; resolves to null rather than failing the whole page. */
export async function fetchAir(lat, lon, opts) {
  try {
    return await getJSON(`${AIR}?${q({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: POLLUTANTS.join(','),
      timezone: 'auto'
    })}`, opts);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.warn('[aether] air quality unavailable:', err.message);
    return null;
  }
}

/** City search. Returns a normalised, de-duplicated list. */
export async function searchPlaces(name, opts) {
  const term = name.trim();
  if (term.length < 2) return [];

  const data = await getJSON(`${GEOCODE}?${q({
    name: term, count: 8, language: 'en', format: 'json'
  })}`, opts);

  const seen = new Set();
  return (data.results ?? []).reduce((out, r) => {
    const key = `${r.name}|${r.admin1 ?? ''}|${r.country_code ?? ''}`;
    if (seen.has(key)) return out;
    seen.add(key);
    out.push({
      id: r.id,
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(', '),
      country: r.country ?? '',
      cc: r.country_code ?? '',
      lat: r.latitude,
      lon: r.longitude,
      tz: r.timezone,
      population: r.population ?? 0
    });
    return out;
  }, []);
}

/** Browser geolocation, promisified with a sane timeout. */
export function locate() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new ApiError('This browser does not support geolocation.', 'geo'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      err => {
        const msg = {
          1: 'Location permission denied — search for a city instead.',
          2: 'Your position is unavailable right now.',
          3: 'Locating took too long.'
        }[err.code] ?? 'Could not determine your location.';
        reject(new ApiError(msg, 'geo'));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 }
    );
  });
}
