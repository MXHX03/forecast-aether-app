/**
 * Units & formatting. All API data is fetched in metric and converted here,
 * so flipping units is instant and never costs a request.
 */

export const cToF = c => (c * 9) / 5 + 32;

/** Rounded temperature in the active unit. */
export function temp(celsius, unit) {
  if (celsius == null || Number.isNaN(celsius)) return null;
  return Math.round(unit === 'f' ? cToF(celsius) : celsius);
}

/** "18°" — unit letter is shown once in the hero, not on every number. */
export function deg(celsius, unit) {
  const t = temp(celsius, unit);
  return t == null ? '--°' : `${t}°`;
}

export function wind(kmh, unit) {
  if (kmh == null) return { v: '--', u: unit === 'f' ? 'mph' : 'km/h' };
  return unit === 'f'
    ? { v: Math.round(kmh / 1.609344), u: 'mph' }
    : { v: Math.round(kmh), u: 'km/h' };
}

export function distance(metres, unit) {
  if (metres == null) return { v: '--', u: unit === 'f' ? 'mi' : 'km' };
  return unit === 'f'
    ? { v: (metres / 1609.344).toFixed(1), u: 'mi' }
    : { v: (metres / 1000).toFixed(1), u: 'km' };
}

export function precip(mm, unit) {
  if (mm == null) return { v: '0', u: unit === 'f' ? 'in' : 'mm' };
  return unit === 'f'
    ? { v: (mm / 25.4).toFixed(2), u: 'in' }
    : { v: mm.toFixed(1), u: 'mm' };
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Compass point for a bearing in degrees. */
export const bearing = d =>
  d == null ? '--' : POINTS[Math.round((d % 360) / 22.5) % 16];

/** Beaufort-ish plain-language wind strength. */
export function windWord(kmh) {
  if (kmh == null) return '';
  if (kmh < 2)  return 'Calm';
  if (kmh < 12) return 'Light air';
  if (kmh < 20) return 'Light breeze';
  if (kmh < 29) return 'Moderate';
  if (kmh < 39) return 'Fresh';
  if (kmh < 50) return 'Strong';
  if (kmh < 62) return 'Near gale';
  if (kmh < 75) return 'Gale';
  if (kmh < 89) return 'Severe gale';
  return 'Storm force';
}

export function uvWord(uv) {
  if (uv == null) return { word: '—', tone: 'good' };
  if (uv < 3)  return { word: 'Low',       tone: 'good' };
  if (uv < 6)  return { word: 'Moderate',  tone: 'mid'  };
  if (uv < 8)  return { word: 'High',      tone: 'warn' };
  if (uv < 11) return { word: 'Very high', tone: 'bad'  };
  return { word: 'Extreme', tone: 'vbad' };
}

/** European AQI bands (Open-Meteo `european_aqi`). */
export function aqiWord(aqi) {
  if (aqi == null) return { word: '—', tone: 'good', pct: 0 };
  const pct = Math.min(100, (aqi / 100) * 100);
  if (aqi <= 20)  return { word: 'Good',      tone: 'good', pct };
  if (aqi <= 40)  return { word: 'Fair',      tone: 'good', pct };
  if (aqi <= 60)  return { word: 'Moderate',  tone: 'mid',  pct };
  if (aqi <= 80)  return { word: 'Poor',      tone: 'warn', pct };
  if (aqi <= 100) return { word: 'Very poor', tone: 'bad',  pct };
  return { word: 'Extreme', tone: 'vbad', pct: 100 };
}

/** Dew-point comfort read-out. */
export function dewWord(c) {
  if (c == null) return '';
  if (c < 5)  return 'Very dry';
  if (c < 10) return 'Dry';
  if (c < 13) return 'Comfortable';
  if (c < 16) return 'Pleasant';
  if (c < 18) return 'Sticky';
  if (c < 21) return 'Humid';
  if (c < 24) return 'Oppressive';
  return 'Sweltering';
}

export function pressureWord(hPa) {
  if (hPa == null) return '';
  if (hPa < 1000) return 'Low — unsettled';
  if (hPa > 1022) return 'High — settled';
  return 'Normal';
}

/* ── time ─────────────────────────────────────────────────── */

/**
 * Open-Meteo returns local wall-clock strings ("2026-11-14T14:00") with no
 * offset. Parsing them as UTC keeps the arithmetic honest; we then format
 * with timeZone:'UTC' so what we print is exactly the place's local time.
 */
export const parseLocal = s => (s ? new Date(`${s}Z`) : null);

const fmt = (opts) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts });

export const clock   = d => (d ? fmt({ hour: 'numeric', minute: '2-digit' }).format(d) : '—');
export const hourTag = d => (d ? fmt({ hour: 'numeric' }).format(d) : '—');
export const dayName = d => (d ? fmt({ weekday: 'short' }).format(d) : '—');
export const dayDate = d => (d ? fmt({ day: 'numeric', month: 'short' }).format(d) : '—');
export const stamp   = d => (d ? fmt({ weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(d) : '—');

/** "4h 12m" from seconds. */
export function duration(sec) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** "just now" / "6 min ago" — for the cache stamp. */
export function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/** ISO 3166-1 alpha-2 → flag emoji. */
export function flag(cc) {
  if (!cc || cc.length !== 2) return '📍';
  return String.fromCodePoint(
    ...[...cc.toUpperCase()].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}

/** Guess a human place name from an IANA zone — avoids a reverse-geocode call. */
export const zoneCity = tz =>
  tz ? tz.split('/').pop().replace(/_/g, ' ') : 'Your location';
