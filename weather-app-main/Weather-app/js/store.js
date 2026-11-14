/**
 * Persistence. Every localStorage touch is guarded — private mode, blocked
 * site data and quota errors must never take the app down.
 */

const K = {
  unit:   'aether.unit',
  places: 'aether.places',
  last:   'aether.last',
  cache:  'aether.cache'
};

const MAX_PLACES = 8;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function drop(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/* ── unit ─────────────────────────────────────────────────── */
export const getUnit = () => (read(K.unit, 'c') === 'f' ? 'f' : 'c');
export const setUnit = u => write(K.unit, u === 'f' ? 'f' : 'c');

/* ── saved places ─────────────────────────────────────────── */
export const getPlaces = () => {
  const v = read(K.places, []);
  return Array.isArray(v) ? v : [];
};

const same = (a, b) =>
  a && b && Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;

export function savePlace(place) {
  const list = getPlaces().filter(p => !same(p, place));
  list.unshift({
    name: place.name, region: place.region, cc: place.cc,
    lat: place.lat, lon: place.lon, tz: place.tz
  });
  write(K.places, list.slice(0, MAX_PLACES));
  return getPlaces();
}

export function removePlace(place) {
  write(K.places, getPlaces().filter(p => !same(p, place)));
  return getPlaces();
}

export const isSaved = place => getPlaces().some(p => same(p, place));

/* ── last viewed ──────────────────────────────────────────── */
export const getLast = () => read(K.last, null);
export const setLast = place => write(K.last, place);

/* ── offline payload cache ────────────────────────────────── */
export function cacheBundle(place, bundle) {
  write(K.cache, { at: Date.now(), place, bundle });
}

/** Cached bundle for this place if it is still fresh enough to show. */
export function cachedBundle(place) {
  const c = read(K.cache, null);
  if (!c?.bundle || !same(c.place, place)) return null;
  if (Date.now() - c.at > CACHE_TTL) return null;
  return { ...c.bundle, cachedAt: c.at };
}

/** Anything at all, regardless of place — the offline cold-start fallback. */
export function anyCached() {
  const c = read(K.cache, null);
  return c?.bundle ? { place: c.place, bundle: { ...c.bundle, cachedAt: c.at } } : null;
}

export const clearAll = () => Object.values(K).forEach(drop);
