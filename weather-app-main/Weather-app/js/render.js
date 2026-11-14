/**
 * All DOM writing lives here. Pure-ish: given (state, bundle) it paints.
 * Anything interpolated into markup goes through esc().
 */

import { describe, SEVERE } from './wmo.js';
import * as f from './format.js';

const $ = sel => document.querySelector(sel);

/** Minimal HTML-escape for API-supplied strings. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  humidity: '<path d="M12 2.7S5.5 10 5.5 14.2a6.5 6.5 0 0 0 13 0C18.5 10 12 2.7 12 2.7z"/>',
  wind:     '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 16h8a3 3 0 1 1-3 3"/><path d="M3 12h18"/>',
  gauge:    '<path d="M4 15a8 8 0 1 1 16 0"/><path d="M12 15l4-4"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/>',
  eye:      '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.7"/>',
  uv:       '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19"/>',
  drop:     '<path d="M12 21a6 6 0 0 0 6-6c0-4-6-12-6-12S6 11 6 15a6 6 0 0 0 6 6z"/>',
  cloud:    '<path d="M6.5 18h11a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 6.5 18z"/>',
  thermo:   '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
  alert:    '<path d="M12 3l9.5 17H2.5L12 3z"/><path d="M12 9.5v5M12 17.6v.1"/>',
  info:     '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/>'
};

const svgIco = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/** Assign incremental entrance delays to already-rendered children. */
function stagger(selector, step = 0.05, base = 0) {
  document.querySelectorAll(selector).forEach((el, i) => {
    el.style.setProperty('--d', `${(base + i * step).toFixed(3)}s`);
  });
}

/** Replay a CSS keyframe on an element (class toggle + reflow). */
function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;            // force reflow so the animation restarts
  el.classList.add(cls);
}

/* ═══════════════════════════ THEME ═══════════════════════════ */

export function paintTheme(fam, isDay) {
  const root = document.documentElement;
  root.dataset.cond = fam;
  root.dataset.sky = isDay ? 'day' : 'night';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDay ? '#070c1a' : '#04060e';
}

/* ═══════════════════════════ HERO ════════════════════════════ */

export function paintHero(place, bundle, unit) {
  const c = bundle.current;
  const d0 = bundle.daily;
  const look = describe(c.weather_code, !!c.is_day);

  $('#city').textContent = place.name;
  $('#region').textContent = place.region || `${c.latitude ?? ''}`.trim() || '—';

  const when = f.parseLocal(c.time);
  const cached = bundle.cachedAt ? ` · cached ${f.ago(bundle.cachedAt)}` : '';
  $('#stamp').textContent = `${f.stamp(when)} local${cached}`;

  const icon = $('#icon');
  icon.src = look.icon;
  icon.alt = look.label;

  const t = $('#temp');
  const numEl = t.querySelector('.num');
  const next = String(f.temp(c.temperature_2m, unit) ?? '--');
  // only animate when the displayed reading actually changes, not on every repaint
  const changed = numEl.dataset.v !== undefined && numEl.dataset.v !== next;
  numEl.textContent = next;
  numEl.dataset.v = next;
  t.querySelector('.unit').textContent = unit === 'f' ? 'F' : 'C';
  t.setAttribute('aria-label',
    `${f.temp(c.temperature_2m, unit)} degrees ${unit === 'f' ? 'Fahrenheit' : 'Celsius'}, ${look.label}. Activate to switch units.`);

  $('#cond').textContent = look.label;
  if (changed) { replay(numEl, 'flip'); replay($('#cond'), 'flip'); }

  $('#feels').textContent = f.deg(c.apparent_temperature, unit);
  $('#hi').textContent = f.deg(d0?.temperature_2m_max?.[0], unit);
  $('#lo').textContent = f.deg(d0?.temperature_2m_min?.[0], unit);

  // quick chips
  const wd = f.wind(c.wind_speed_10m, unit);
  const pop = bundle.nextPop;
  const chips = [
    ['wind', `<b>${wd.v}</b> ${wd.u} ${f.bearing(c.wind_direction_10m)}`],
    ['humidity', `<b>${c.relative_humidity_2m ?? '--'}</b>%`],
    ['cloud', `<b>${c.cloud_cover ?? '--'}</b>% cloud`],
    pop != null ? ['drop', `<b>${pop}</b>% next hr`] : null,
    ['uv', `UV <b>${(d0?.uv_index_max?.[0] ?? 0).toFixed(1)}</b>`]
  ].filter(Boolean);

  $('#chips').innerHTML = chips
    .map(([ico, html], i) =>
      `<li class="chip" style="--d:${(0.25 + i * 0.06).toFixed(2)}s">${svgIco(ico)}<span>${html}</span></li>`)
    .join('');

  return look;
}

/* ════════════════════════ SUN ARC ════════════════════════════ */

export function paintSun(bundle) {
  const d = bundle.daily;
  const rise = f.parseLocal(d?.sunrise?.[0]);
  const set = f.parseLocal(d?.sunset?.[0]);
  const now = f.parseLocal(bundle.current.time);

  $('#sunrise').textContent = f.clock(rise);
  $('#sunset').textContent = f.clock(set);
  $('#daylight').textContent = f.duration(d?.daylight_duration?.[0]);

  if (!rise || !set || !now) { $('#sunarc').innerHTML = ''; return; }

  const span = set - rise;
  const p = Math.max(0, Math.min(1, (now - rise) / span));
  const up = now >= rise && now <= set;

  // semicircle: 20,100 → 270,100 with apex at y=14
  const W = 290, H = 126, L = 22, R = W - 22, BASE = 104, APEX = 16;
  const a = Math.PI * (1 - p);
  const cx = (L + R) / 2, rx = (R - L) / 2, ry = BASE - APEX;
  const x = cx - Math.cos(Math.PI * p) * rx * -1;
  const y = BASE - Math.sin(Math.PI * p) * ry;
  void a;

  $('#sunarc').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sun position: ${Math.round(p * 100)}% through the day">
      <defs>
        <linearGradient id="arcg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="var(--accent-2)"/>
          <stop offset=".5" stop-color="var(--accent)"/>
          <stop offset="1" stop-color="var(--accent-2)"/>
        </linearGradient>
      </defs>
      <line x1="6" y1="${BASE}" x2="${W - 6}" y2="${BASE}" stroke="var(--stroke)" stroke-dasharray="3 5"/>
      <path d="M${L} ${BASE} A ${rx} ${ry} 0 0 1 ${R} ${BASE}"
            stroke="rgba(255,255,255,.1)" stroke-width="2.5"/>
      <path class="arc-lit" d="M${L} ${BASE} A ${rx} ${ry} 0 0 1 ${R} ${BASE}"
            stroke="url(#arcg)" stroke-width="2.5"
            pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - p).toFixed(4)}"
            opacity="${up ? 1 : 0.35}"/>
      <g class="sun-dot" opacity="${up ? 1 : 0.5}">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="var(--glow)" opacity=".55"/>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="var(--accent)" stroke="none"/>
      </g>
      <text x="${L}" y="${BASE + 17}" fill="var(--ink-dim)" stroke="none" font-size="10" text-anchor="middle">${esc(f.clock(rise))}</text>
      <text x="${R}" y="${BASE + 17}" fill="var(--ink-dim)" stroke="none" font-size="10" text-anchor="middle">${esc(f.clock(set))}</text>
    </svg>`;
}

/* ════════════════════════ HOURLY ═════════════════════════════ */

/* Geometry must mirror the .hr cell box in style.css:
   6px pad + 16px time + 6px gap + 34px icon + 6px gap = 68px before the band. */
const CELL = 74, BAND_TOP = 68, BAND_H = 112, PAD_T = 24, PAD_B = 16;

export function paintHourly(bundle, unit) {
  const rows = bundle.hours;
  if (!rows.length) { $('#hourly').innerHTML = ''; return; }

  const temps = rows.map(r => r.t);
  const min = Math.min(...temps), max = Math.max(...temps);
  const range = max - min || 1;
  const plotH = BAND_H - PAD_T - PAD_B;
  const yOf = t => BAND_TOP + PAD_T + (1 - (t - min) / range) * plotH;
  const xOf = i => i * CELL + CELL / 2;

  const W = rows.length * CELL;
  const H = BAND_TOP + BAND_H + 26;

  // smooth-ish polyline via mid-point quadratic curves
  const pts = rows.map((r, i) => [xOf(i), yOf(r.t)]);
  let line = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx2, cy2] = pts[i];
    const mx = (px + cx2) / 2;
    line += ` Q ${px} ${py.toFixed(1)} ${mx} ${((py + cy2) / 2).toFixed(1)}`;
  }
  line += ` L ${pts.at(-1)[0]} ${pts.at(-1)[1].toFixed(1)}`;
  const area = `${line} L ${W} ${BAND_TOP + BAND_H} L 0 ${BAND_TOP + BAND_H} Z`;

  /** Per-item entrance delay, capped so the last cell doesn't lag. */
  const delay = i => `--d:${Math.min(i * 0.035, 0.8).toFixed(3)}s`;

  const popBars = rows.map((r, i) => {
    if (!r.pop) return '';
    const bh = (r.pop / 100) * (plotH * 0.58);
    return `<rect class="pop-bar" style="${delay(i)}" x="${xOf(i) - 7}"
             y="${(BAND_TOP + BAND_H - bh).toFixed(1)}" width="14"
             height="${bh.toFixed(1)}" rx="3" fill="var(--accent-2)" opacity=".30" stroke="none"/>`;
  }).join('');

  const dots = rows.map((r, i) => `
    <circle class="dot" style="${delay(i)}" cx="${xOf(i)}" cy="${yOf(r.t).toFixed(1)}" r="${r.now ? 4 : 2.6}"
            fill="${r.now ? 'var(--accent)' : 'var(--bg-2)'}" stroke="var(--accent)" stroke-width="1.6"/>`).join('');

  const labels = rows.map((r, i) => `
    <text class="lbl" style="${delay(i)};font-variant-numeric:tabular-nums"
          x="${xOf(i)}" y="${(yOf(r.t) - 11).toFixed(1)}" text-anchor="middle"
          fill="var(--ink)" stroke="none" font-size="12.5" font-weight="600">${f.temp(r.t, unit)}°</text>`).join('');

  const cells = rows.map((r, i) => {
    const look = describe(r.code, r.isDay);
    return `
      <div class="hr${r.now ? ' now' : ''}" style="${delay(i)}" role="group"
           aria-label="${esc(r.now ? 'Now' : f.hourTag(r.at))}: ${esc(look.label)}, ${f.temp(r.t, unit)} degrees${r.pop ? `, ${r.pop}% chance of precipitation` : ''}">
        <span class="h-t">${esc(r.now ? 'NOW' : f.hourTag(r.at))}</span>
        <img src="${look.icon}" alt="" width="34" height="34" loading="lazy">
        <div class="h-band"></div>
        <span class="h-p">${r.pop ? `${r.pop}%` : ''}</span>
      </div>`;
  }).join('');

  $('#hourly').innerHTML = `
    <div class="hr-inner" style="width:${W}px">
      <svg class="hr-curve" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"
           preserveAspectRatio="none">
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--accent)" stop-opacity=".34"/>
            <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${popBars}
        <path class="area" d="${area}" fill="url(#hg)" stroke="none"/>
        <path class="line" d="${line}" pathLength="1" stroke="var(--accent)" stroke-width="2.2" fill="none"
              style="filter:drop-shadow(0 0 7px var(--glow))"/>
        ${dots}${labels}
      </svg>
      ${cells}
    </div>`;

  // park the strip on "now"
  const nowEl = $('#hourly .hr.now');
  if (nowEl) $('#hourly').scrollLeft = Math.max(0, nowEl.offsetLeft - CELL);
}

/* ════════════════════════ TILES ══════════════════════════════ */

export function paintTiles(bundle, unit) {
  const c = bundle.current;
  const h = bundle.nowHour ?? {};
  const d0 = bundle.daily;

  const wd = f.wind(c.wind_speed_10m, unit);
  const gust = f.wind(c.wind_gusts_10m, unit);
  const vis = f.distance(h.vis, unit);
  const uv = h.uv ?? d0?.uv_index_max?.[0];
  const uvw = f.uvWord(uv);
  const pr = f.precip(d0?.precipitation_sum?.[0], unit);
  const dir = c.wind_direction_10m ?? 0;

  const tile = (ico, label, value, sub, extra = '') => `
    <div class="tile">
      <div class="t-h">${svgIco(ico)}<span>${esc(label)}</span></div>
      <div class="t-v">${value}</div>
      ${sub ? `<div class="t-s">${esc(sub)}</div>` : ''}
      ${extra}
    </div>`;

  const bar = pct => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(0)}%"></i></div>`;

  $('#tiles').innerHTML = `
    <div class="tile wind-tile">
      <div>
        <div class="t-h">${svgIco('wind')}<span>Wind</span></div>
        <div class="t-v">${wd.v}<small>${wd.u}</small></div>
        <div class="t-s">${esc(f.windWord(c.wind_speed_10m))} · gust ${gust.v}</div>
      </div>
      <svg class="compass" viewBox="0 0 54 54" role="img" aria-label="Wind from ${esc(f.bearing(dir))}">
        <circle cx="27" cy="27" r="22" stroke="var(--stroke)"/>
        <g stroke="var(--ink-dim)" stroke-width="1">
          <path d="M27 5v4M27 45v4M5 27h4M45 27h4"/>
        </g>
        <text x="27" y="15" font-size="7" fill="var(--ink-dim)" stroke="none" text-anchor="middle">N</text>
        <g class="needle" style="transform:rotate(${(dir + 180).toFixed(0)}deg)">
          <path d="M27 11 L31.5 31 L27 27.5 L22.5 31 Z" fill="var(--accent)" stroke="none"/>
        </g>
        <circle cx="27" cy="27" r="2.6" fill="var(--ink)" stroke="none"/>
      </svg>
    </div>
    ${tile('humidity', 'Humidity', `${c.relative_humidity_2m ?? '--'}<small>%</small>`,
           f.dewWord(h.dew) ? `Dew point ${f.deg(h.dew, unit)} · ${f.dewWord(h.dew)}` : '',
           bar(c.relative_humidity_2m ?? 0))}
    ${tile('uv', 'UV index', `${uv == null ? '--' : uv.toFixed(1)}`,
           `${uvw.word}${uv >= 3 ? ' · cover up' : ''}`, bar(((uv ?? 0) / 11) * 100))}
    ${tile('gauge', 'Pressure', `${c.pressure_msl == null ? '--' : Math.round(c.pressure_msl)}<small>hPa</small>`,
           f.pressureWord(c.pressure_msl))}
    ${tile('eye', 'Visibility', `${vis.v}<small>${vis.u}</small>`,
           h.vis == null ? '' : h.vis >= 10000 ? 'Clear and far' : h.vis >= 4000 ? 'Moderate haze' : 'Poor — take care')}
    ${tile('drop', 'Precipitation', `${pr.v}<small>${pr.u}</small>`,
           `Today · ${d0?.precipitation_probability_max?.[0] ?? 0}% chance`)}
    ${tile('cloud', 'Cloud cover', `${c.cloud_cover ?? '--'}<small>%</small>`,
           (c.cloud_cover ?? 0) < 25 ? 'Mostly open sky' : (c.cloud_cover ?? 0) < 70 ? 'Broken cloud' : 'Overcast',
           bar(c.cloud_cover ?? 0))}
    ${tile('thermo', 'Feels like', `${f.temp(c.apparent_temperature, unit) ?? '--'}<small>°</small>`,
           describeDelta(c.apparent_temperature, c.temperature_2m, unit))}
  `;

  stagger('#tiles .tile', 0.055, 0.1);
}

function describeDelta(feels, actual, unit) {
  if (feels == null || actual == null) return '';
  const d = Math.round(Math.abs((unit === 'f' ? f.cToF(feels) - f.cToF(actual) : feels - actual)));
  if (d < 1) return 'Matches the air temperature';
  return feels < actual ? `${d}° colder than it reads` : `${d}° warmer than it reads`;
}

/* ════════════════════════ AIR QUALITY ════════════════════════ */

export function paintAir(air) {
  const box = $('#aqibody');
  const c = air?.current;

  if (!c || c.european_aqi == null) {
    box.innerHTML = `<p class="t-s" style="color:var(--ink-dim)">Air-quality data isn’t available for this location.</p>`;
    return;
  }

  const { word, tone, pct } = f.aqiWord(c.european_aqi);
  const R = 56;

  const rows = [
    ['PM2.5', c.pm2_5, 25],
    ['PM10', c.pm10, 50],
    ['NO₂', c.nitrogen_dioxide, 200],
    ['O₃', c.ozone, 120],
    ['SO₂', c.sulphur_dioxide, 350]
  ].filter(([, v]) => v != null);

  box.innerHTML = `
    <div class="gauge" role="img" aria-label="European air quality index ${c.european_aqi}, ${word}">
      <svg viewBox="0 0 132 132">
        <circle class="track" cx="66" cy="66" r="${R}" stroke-width="9"/>
        <circle class="val" cx="66" cy="66" r="${R}" stroke-width="9" pathLength="100"
                stroke="var(--${tone})" style="color:var(--${tone})"
                stroke-dasharray="${pct.toFixed(1)} 100"/>
      </svg>
      <div class="g-txt">
        <div class="g-n" style="color:var(--${tone})">${Math.round(c.european_aqi)}</div>
        <div class="g-l">${esc(word)}</div>
      </div>
    </div>
    <dl class="poll">
      ${rows.map(([name, v, limit], i) => `
        <div style="--d:${(0.5 + i * 0.07).toFixed(2)}s">
          <dt>${name}</dt>
          <div class="bar"><i style="width:${Math.min(100, (v / limit) * 100).toFixed(0)}%"></i></div>
          <dd>${v.toFixed(1)} <span style="color:var(--ink-dim)">µg/m³</span></dd>
        </div>`).join('')}
      ${c.us_aqi != null
        ? `<div style="--d:${(0.5 + rows.length * 0.07).toFixed(2)}s"><dt>US AQI</dt><div></div><dd>${Math.round(c.us_aqi)}</dd></div>`
        : ''}
    </dl>`;
}

/* ════════════════════════ 7 DAY ══════════════════════════════ */

export function paintDaily(bundle, unit) {
  const d = bundle.daily;
  if (!d?.time?.length) return;

  const lows = d.temperature_2m_min, highs = d.temperature_2m_max;
  const wkMin = Math.min(...lows), wkMax = Math.max(...highs);
  const wkRange = wkMax - wkMin || 1;

  $('#weekrange').textContent = `${f.deg(wkMin, unit)} → ${f.deg(wkMax, unit)}`;

  $('#daily').innerHTML = d.time.map((iso, i) => {
    const date = f.parseLocal(`${iso}T12:00`);
    const look = describe(d.weather_code[i], true);
    const left = ((lows[i] - wkMin) / wkRange) * 100;
    const width = Math.max(4, ((highs[i] - lows[i]) / wkRange) * 100);
    const pop = d.precipitation_probability_max?.[i] ?? 0;

    return `
      <li class="day${i === 0 ? ' today' : ''}" style="--d:${(i * 0.06).toFixed(2)}s">
        <div class="d-n">${i === 0 ? 'Today' : esc(f.dayName(date))}<small>${esc(f.dayDate(date))}</small></div>
        <img src="${look.icon}" alt="" width="40" height="40" loading="lazy">
        <div class="d-c">${esc(look.label)}</div>
        <div class="rng">
          <span class="t-lo">${f.deg(lows[i], unit)}</span>
          <span class="track"><i class="fill" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%;--d:${(0.2 + i * 0.06).toFixed(2)}s"></i></span>
          <span class="t-hi">${f.deg(highs[i], unit)}</span>
        </div>
        <div class="d-p">${pop ? `${pop}%` : '—'}</div>
      </li>`;
  }).join('');
}

/* ════════════════════════ PLACES ═════════════════════════════ */

export function paintPlaces(places, active, onPick, onDrop) {
  const nav = $('#places');
  nav.innerHTML = places.map((p, i) => `
    <span class="place" data-i="${i}" role="button" tabindex="0"
          ${active && Math.abs(p.lat - active.lat) < 0.05 && Math.abs(p.lon - active.lon) < 0.05 ? 'aria-current="true"' : ''}>
      <span>${f.flag(p.cc)} ${esc(p.name)}</span>
      <button class="x" type="button" aria-label="Remove ${esc(p.name)}" data-drop="${i}">
        <svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>
      </button>
    </span>`).join('');

  stagger('#places .place', 0.05);

  nav.querySelectorAll('.place').forEach(el => {
    const i = +el.dataset.i;
    const go = ev => {
      if (ev.target.closest('[data-drop]')) return;
      if (ev.type === 'keydown' && !['Enter', ' '].includes(ev.key)) return;
      ev.preventDefault();
      onPick(places[i]);
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', go);
  });

  nav.querySelectorAll('[data-drop]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      onDrop(places[+btn.dataset.drop]);
    });
  });
}

/* ════════════════════════ BANNERS ════════════════════════════ */

/** Derive advisories from the data — Open-Meteo has no official alert feed. */
export function paintAlerts(bundle, unit, extra = []) {
  const out = [...extra];
  const c = bundle.current;
  const d = bundle.daily;

  if (SEVERE.has(c.weather_code)) {
    out.push({ tone: '', text: `<b>${esc(describe(c.weather_code, true).label)}</b> right now — take care outdoors.` });
  }
  const gust = c.wind_gusts_10m;
  if (gust >= 60) {
    const g = f.wind(gust, unit);
    out.push({ tone: gust >= 90 ? '' : 'warn', text: `<b>Strong gusts</b> up to ${g.v} ${g.u}. Secure loose objects.` });
  }
  const uv = d?.uv_index_max?.[0];
  if (uv >= 8) out.push({ tone: 'warn', text: `<b>Very high UV</b> (${uv.toFixed(1)}) today — limit midday sun exposure.` });

  const hi = d?.temperature_2m_max?.[0], lo = d?.temperature_2m_min?.[0];
  if (hi >= 35) out.push({ tone: 'warn', text: `<b>Extreme heat</b> — high of ${f.deg(hi, unit)}. Hydrate often.` });
  if (lo <= -10) out.push({ tone: 'warn', text: `<b>Severe cold</b> — low of ${f.deg(lo, unit)}. Risk of frostbite.` });

  const rain = d?.precipitation_sum?.[0];
  if (rain >= 25) {
    const p = f.precip(rain, unit);
    out.push({ tone: 'warn', text: `<b>Heavy precipitation</b> expected — ${p.v} ${p.u} today.` });
  }

  $('#alerts').innerHTML = out.map(a => `
    <div class="alert ${a.tone}">${svgIco(a.tone === 'info' ? 'info' : 'alert')}<span>${a.text}</span></div>`).join('');
}

let toastTimer;
export function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ════════════════════════ SEARCH LIST ════════════════════════ */

export function paintResults(list, { loading = false, error = '' } = {}) {
  const ul = $('#results');
  const input = $('#q');

  if (loading) {
    ul.innerHTML = `<li class="r-empty">Searching…</li>`;
  } else if (error) {
    ul.innerHTML = `<li class="r-empty">${esc(error)}</li>`;
  } else if (!list.length) {
    ul.innerHTML = `<li class="r-empty">No matching place</li>`;
  } else {
    ul.innerHTML = list.map((p, i) => `
      <li role="option" id="opt-${i}" data-i="${i}" aria-selected="false">
        <span class="flag">${f.flag(p.cc)}</span>
        <span>
          <span class="r-name">${esc(p.name)}</span>
          <span class="r-sub" style="display:block">${esc(p.region)}</span>
        </span>
      </li>`).join('');
  }

  ul.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  stagger('#results li', 0.035);
}

export function hideResults() {
  const ul = $('#results');
  ul.hidden = true;
  ul.innerHTML = '';
  $('#q').setAttribute('aria-expanded', 'false');
  $('#q').removeAttribute('aria-activedescendant');
}

/* ════════════════════════ LOADING ════════════════════════════ */

export function setBusy(on) {
  $('#main').classList.toggle('busy', on);
  $('#refresh').classList.toggle('spin', on);
  $('#bar')?.classList.toggle('on', on);
  $('#main').setAttribute('aria-busy', String(on));
}

/** Celebrate a save — fires only from the click handler, not on repaint. */
let burstTimer;
export function pulseSave() {
  const btn = $('#save');
  replay(btn, 'burst');
  clearTimeout(burstTimer);
  burstTimer = setTimeout(() => btn.classList.remove('burst'), 700);
}

/** Give every card its hover-sheen layer (called once at boot). */
export function addSheen() {
  document.querySelectorAll('.card').forEach(card => {
    if (card.dataset.sheen) return;
    card.dataset.sheen = '1';
    const s = document.createElement('div');
    s.className = 'sheen';
    s.setAttribute('aria-hidden', 'true');
    card.append(s);
  });
}

export function paintSkeleton() {
  $('#city').textContent = 'Loading…';
  $('#region').textContent = '—';
  $('#chips').innerHTML = Array.from({ length: 4 },
    () => `<li class="chip sk" style="width:104px;height:31px"></li>`).join('');
  $('#tiles').innerHTML = Array.from({ length: 6 },
    () => `<div class="tile sk" style="height:96px"></div>`).join('');
  $('#daily').innerHTML = Array.from({ length: 7 },
    () => `<li class="day"><div class="sk" style="height:34px;grid-column:1/-1"></div></li>`).join('');
  $('#hourly').innerHTML = `<div class="sk" style="height:200px"></div>`;
  $('#aqibody').innerHTML = `<div class="sk" style="height:132px;width:100%"></div>`;
}
