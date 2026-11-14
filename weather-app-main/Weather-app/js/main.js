/**
 * AETHER — app controller.
 * Owns state, events and the load pipeline; render.js does the painting.
 */

import * as api from './api.js';
import * as store from './store.js';
import * as ui from './render.js';
import { createSky } from './sky.js';
import { describe } from './wmo.js';
import { zoneCity } from './format.js';

const $ = sel => document.querySelector(sel);

const state = {
  unit: store.getUnit(),
  place: null,
  bundle: null,
  air: null,
  results: [],
  cursor: -1,
  loading: false
};

const sky = createSky($('#sky'));
let loadToken = 0;         // guards against out-of-order responses
let searchCtl = null;
let searchTimer = null;

/* ═══════════════════ bundle shaping ═══════════════════════ */

/** Flatten the API payload into exactly what the views need. */
function shape(forecast) {
  const { current, hourly, daily } = forecast;
  const hourKey = `${current.time.slice(0, 13)}:00`;
  let idx = hourly.time.indexOf(hourKey);
  if (idx < 0) idx = Math.max(0, hourly.time.findIndex(t => t >= hourKey));

  const hours = [];
  for (let i = idx; i < Math.min(idx + 24, hourly.time.length); i++) {
    hours.push({
      at: new Date(`${hourly.time[i]}Z`),
      t: hourly.temperature_2m[i],
      code: hourly.weather_code[i],
      pop: hourly.precipitation_probability?.[i] ?? 0,
      isDay: !!hourly.is_day?.[i],
      now: i === idx
    });
  }

  return {
    current,
    daily,
    hours,
    nowHour: {
      vis: hourly.visibility?.[idx],
      uv: hourly.uv_index?.[idx],
      dew: hourly.dew_point_2m?.[idx]
    },
    nextPop: hourly.precipitation_probability?.[idx + 1] ?? null,
    fetchedAt: Date.now()
  };
}

/* ═══════════════════ load pipeline ════════════════════════ */

async function load(place, { silent = false } = {}) {
  const token = ++loadToken;
  state.place = place;
  state.loading = true;
  ui.setBusy(true);
  if (!silent && !state.bundle) ui.paintSkeleton();

  // Show a fresh-enough cached copy instantly, then refresh over it.
  const cached = store.cachedBundle(place);
  if (cached && !state.bundle) {
    state.bundle = cached;
    paint();
  }

  try {
    const [forecast, air] = await Promise.all([
      api.fetchForecast(place.lat, place.lon),
      api.fetchAir(place.lat, place.lon)
    ]);
    if (token !== loadToken) return;              // superseded

    state.bundle = shape(forecast);
    state.air = air;
    state.place = { ...place, name: place.name || zoneCity(forecast.timezone), tz: forecast.timezone };

    store.cacheBundle(state.place, state.bundle);
    store.setLast(state.place);
    syncUrl(state.place);
    paint();
  } catch (err) {
    if (token !== loadToken || err?.name === 'AbortError') return;

    const offline = !navigator.onLine;
    const msg = offline ? 'You are offline — showing the last saved reading.' : err.message;

    const fallback = store.cachedBundle(place) ?? (state.bundle ? null : store.anyCached()?.bundle);
    if (fallback && !state.bundle) {
      state.bundle = fallback;
      paint([{ tone: 'info', text: msg }]);
    } else {
      ui.paintAlerts(state.bundle ?? { current: {}, daily: {} }, state.unit, [{ tone: '', text: msg }]);
      if (!state.bundle) {
        $('#city').textContent = 'No data';
        $('#region').textContent = offline ? 'Offline' : 'Try again or search a city';
      }
    }
    ui.toast(msg);
  } finally {
    if (token === loadToken) {
      state.loading = false;
      ui.setBusy(false);
    }
  }
}

function paint(extraAlerts = []) {
  const { bundle, air, unit, place } = state;
  if (!bundle?.current) return;

  const look = ui.paintHero(place, bundle, unit);
  ui.paintSun(bundle);
  ui.paintHourly(bundle, unit);
  ui.paintTiles(bundle, unit);
  ui.paintAir(air);
  ui.paintDaily(bundle, unit);
  ui.paintAlerts(bundle, unit, extraAlerts);

  ui.paintTheme(look.fam, !!bundle.current.is_day);
  sky.set(look.fam, !bundle.current.is_day);

  const saved = store.isSaved(place);
  const btn = $('#save');
  btn.setAttribute('aria-pressed', String(saved));
  btn.querySelector('span').textContent = saved ? 'Saved' : 'Save';

  refreshPlaces();
}

function refreshPlaces() {
  ui.paintPlaces(store.getPlaces(), state.place,
    p => load(p),
    p => { store.removePlace(p); refreshPlaces(); ui.toast(`Removed ${p.name}`); });
}

/* ═══════════════════ url (shareable) ══════════════════════ */

function syncUrl(place) {
  const p = new URLSearchParams({
    q: place.name, lat: place.lat.toFixed(4), lon: place.lon.toFixed(4)
  });
  history.replaceState(null, '', `#${p}`);
}

function placeFromUrl() {
  const p = new URLSearchParams(location.hash.slice(1));
  const lat = parseFloat(p.get('lat')), lon = parseFloat(p.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { name: p.get('q') || 'Pinned location', region: '', cc: '', lat, lon };
}

/* ═══════════════════ search ═══════════════════════════════ */

function runSearch(term) {
  clearTimeout(searchTimer);
  searchCtl?.abort('superseded');

  if (term.trim().length < 2) { ui.hideResults(); state.results = []; return; }

  ui.paintResults([], { loading: true });
  searchTimer = setTimeout(async () => {
    searchCtl = new AbortController();
    try {
      const list = await api.searchPlaces(term, { signal: searchCtl.signal });
      state.results = list;
      state.cursor = -1;
      ui.paintResults(list);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      state.results = [];
      ui.paintResults([], { error: err.message });
    }
  }, 280);
}

function moveCursor(step) {
  const items = [...document.querySelectorAll('#results li[role="option"]')];
  if (!items.length) return;
  state.cursor = (state.cursor + step + items.length) % items.length;
  items.forEach((li, i) => li.setAttribute('aria-selected', String(i === state.cursor)));
  const active = items[state.cursor];
  // announce first: assistive tech must not depend on scrolling succeeding
  $('#q').setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView?.({ block: 'nearest' });
}

function choose(place) {
  if (!place) return;
  ui.hideResults();
  $('#q').value = '';
  $('#q').blur();
  load(place);
}

/* ═══════════════════ events ═══════════════════════════════ */

function bind() {
  // search box
  const q = $('#q');
  q.addEventListener('input', () => runSearch(q.value));
  q.addEventListener('focus', () => { if (state.results.length) ui.paintResults(state.results); });

  q.addEventListener('keydown', ev => {
    switch (ev.key) {
      case 'ArrowDown': ev.preventDefault(); moveCursor(1); break;
      case 'ArrowUp':   ev.preventDefault(); moveCursor(-1); break;
      case 'Enter':
        ev.preventDefault();
        choose(state.results[state.cursor >= 0 ? state.cursor : 0]);
        break;
      case 'Escape': ui.hideResults(); q.blur(); break;
    }
  });

  $('#results').addEventListener('click', ev => {
    const li = ev.target.closest('li[data-i]');
    if (li) choose(state.results[+li.dataset.i]);
  });

  document.addEventListener('click', ev => {
    if (!ev.target.closest('.search')) ui.hideResults();
  });

  $('.search').addEventListener('submit', ev => ev.preventDefault());

  // geolocate
  $('#geo').addEventListener('click', useMyLocation);

  // units
  document.querySelectorAll('[data-unit]').forEach(btn => {
    btn.addEventListener('click', () => setUnit(btn.dataset.unit));
  });
  $('#temp').addEventListener('click', () => setUnit(state.unit === 'c' ? 'f' : 'c'));
  $('#temp').addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setUnit(state.unit === 'c' ? 'f' : 'c'); }
  });

  // refresh
  $('#refresh').addEventListener('click', () => {
    if (state.place && !state.loading) { ui.toast('Refreshing…', 1200); load(state.place, { silent: true }); }
  });

  // save / unsave
  $('#save').addEventListener('click', () => {
    if (!state.place) return;
    if (store.isSaved(state.place)) {
      store.removePlace(state.place);
      ui.toast(`Removed ${state.place.name}`);
    } else {
      store.savePlace(state.place);
      ui.pulseSave();
      ui.toast(`Saved ${state.place.name}`);
    }
    paint();
  });

  // shortcuts
  document.addEventListener('keydown', ev => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (ev.key === '/' && !typing) { ev.preventDefault(); $('#q').focus(); return; }
    if (typing) return;
    const k = ev.key.toLowerCase();
    if (k === 'l') { ev.preventDefault(); useMyLocation(); }
    if (k === 'r' && state.place) { ev.preventDefault(); load(state.place, { silent: true }); }
    if (k === 'u') { ev.preventDefault(); setUnit(state.unit === 'c' ? 'f' : 'c'); }
    if (ev.key === 'Escape') ui.hideResults();
  });

  // connectivity + background freshness
  window.addEventListener('online', () => {
    ui.toast('Back online — refreshing');
    if (state.place) load(state.place, { silent: true });
  });
  window.addEventListener('offline', () => ui.toast('Offline — showing cached data'));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !state.place || !state.bundle) return;
    if (Date.now() - (state.bundle.fetchedAt ?? 0) > 10 * 60 * 1000) load(state.place, { silent: true });
  });
  setInterval(() => {
    if (!document.hidden && state.place && !state.loading) load(state.place, { silent: true });
  }, 15 * 60 * 1000);

  window.addEventListener('hashchange', () => {
    const p = placeFromUrl();
    if (p && (p.lat !== state.place?.lat || p.lon !== state.place?.lon)) load(p);
  });
}

function setUnit(u) {
  if (u === state.unit) return;
  state.unit = u;
  store.setUnit(u);
  document.querySelectorAll('[data-unit]').forEach(b => {
    const on = b.dataset.unit === u;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (state.bundle) paint();
}

async function useMyLocation() {
  ui.toast('Finding you…', 1800);
  try {
    const { lat, lon } = await api.locate();
    await load({ name: '', region: '', cc: '', lat, lon });
  } catch (err) {
    ui.toast(err.message, 4200);
    ui.paintAlerts(state.bundle ?? { current: {}, daily: {} }, state.unit, [{ tone: 'info', text: err.message }]);
    if (!state.bundle) {
      $('#city').textContent = 'Search a city';
      $('#region').textContent = 'Or allow location access';
    }
  }
}

/* ═══════════════════ boot ═════════════════════════════════ */

async function boot() {
  setUnit(state.unit);
  document.querySelectorAll('[data-unit]').forEach(b => {
    const on = b.dataset.unit === state.unit;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });

  bind();
  ui.addSheen();
  refreshPlaces();

  // priority: URL pin → last viewed → first saved → geolocation
  const pinned = placeFromUrl();
  const seed = pinned ?? store.getLast() ?? store.getPlaces()[0];

  if (seed) {
    load(seed);
    if (!pinned) {
      // quietly correct to the real position if permission is already granted
      navigator.permissions?.query({ name: 'geolocation' })
        .then(p => { if (p.state === 'granted' && !store.getLast()) useMyLocation(); })
        .catch(() => {});
    }
  } else {
    ui.paintSkeleton();
    useMyLocation();
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// expose a tiny debug handle without leaking internals
Object.defineProperty(window, 'aether', { value: Object.freeze({ state, reload: () => load(state.place) }) });

boot();

export { describe };
