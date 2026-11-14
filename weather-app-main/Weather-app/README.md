# AETHER — Weather Console

A modernized rebuild of the classic vanilla-JS weather app. Still **zero dependencies
and zero build step** — but now with no API key, a full forecast stack, an animated
weather-reactive interface, and offline support.

![no dependencies](https://img.shields.io/badge/dependencies-0-46e0ff) ![no api key](https://img.shields.io/badge/API%20key-not%20required-3ddc97)

---

## Run it

Needs a local server — ES modules, service workers and the Geolocation API all
require a secure context, so `file://` won't do:

```bash
cd Weather-app

python -m http.server 8765        # or:  npx serve .
```

Then open **http://localhost:8765**.

---

## What changed

### Fixed from the original

| Issue | Before | Now |
|---|---|---|
| **Dead API key** | A public key hardcoded in `app.js`, long since expired | Open-Meteo — no key at all |
| **Insecure transport** | `http://` — blocked as mixed content on any HTTPS page | `https://` throughout |
| **Temperature error** | `KELVIN = 273`, losing 0.15° then flooring — up to 1.15° cold | API returns Celsius directly; proper rounding |
| **No error handling** | `fetch()` with no `.catch()` — a failure left "-°" forever | Typed errors, timeouts, abort, retries, user-facing banners |
| **Silent HTTP failures** | A 404/429 was parsed as JSON and crashed | Status checked; rate limits and outages explained in plain words |
| **Lost on F→C** | Re-fetching reset the unit toggle | Unit is state, persisted, applied on every paint |
| **One data point** | Current temperature only | Current + 24h + 7-day + air quality + sun |

### Added

- **City search** with live geocoding autocomplete, full keyboard navigation
  (`↑ ↓` to move, `Enter` to pick, `Esc` to dismiss) and proper
  `combobox`/`listbox` ARIA wiring.
- **24-hour strip** — an SVG temperature curve with gradient fill, per-hour
  icons, and precipitation-probability bars behind it.
- **7-day outlook** — each day's high/low drawn as a range bar positioned
  against the whole week's spread, so warm and cold days are visible at a glance.
- **Atmosphere tiles** — wind (with a live compass needle), humidity + dew point,
  UV index, pressure, visibility, precipitation, cloud cover, feels-like.
- **Air quality** — European AQI radial gauge plus PM2.5, PM10, NO₂, O₃ and SO₂
  against their reference limits.
- **Sun & sky** — an arc tracking the sun's real position between sunrise and
  sunset, with daylight duration.
- **Derived advisories** — severe weather, damaging gusts, very high UV, extreme
  heat or cold, and heavy precipitation surface as banners.
- **Saved places** — pin up to 8 locations, switch between them in one click.
- **Shareable URLs** — the location lives in the hash, so a link reopens the
  same place.
- **Offline support** — a service worker caches the shell; the last reading is
  stored and shown (clearly labelled) when the network is gone.
- **Installable PWA** — web manifest, theme colour, standalone display.
- **Weather-reactive design** — the accent palette, background aurora and canvas
  particles all follow the live conditions and the local day/night state.

---

## Design

A dark glass console: blurred translucent cards over a drifting aurora, 1px
luminous edges, neon accents and a film-grain overlay.

The whole palette is driven by two CSS custom properties (`--accent`,
`--accent-2`) that are redefined per condition family, so the entire interface
shifts colour with the weather:

| Condition | Palette |
|---|---|
| Clear | warm amber → orange |
| Cloud | cool slate blue |
| Rain | cyan → indigo |
| Snow | pale ice |
| Storm | violet → magenta |
| Fog | desaturated grey-blue |

**Motion.** A dedicated layer in `style.css` holds the whole animation system:
staggered entrances for the hourly strip, daily rows, tiles and chips (delays
emitted per item as `--d`, capped so the last item never lags); the hourly
temperature curve draws itself left-to-right via `pathLength` normalisation,
then its gradient fill fades in behind it; the sun arc draws and drops the sun
into place; the AQI gauge sweeps from zero; daily range bars grow from their low
end; the current hour breathes a soft indicator; cards catch a diagonal sheen on
hover; the temperature flips with a blur when the reading or unit changes; saving
a place fires a burst ring; and a progress bar runs across the top during fetches.
Cards also reveal on scroll through `animation-timeline: view()`, wrapped in
`@supports` so unsupporting browsers simply show them.

**Canvas backdrop** (`js/sky.js`) renders the live condition: falling rain
streaks, drifting snow, twinkling stars at night, rolling fog banks, and
lightning flashes during thunderstorms. Particle counts scale with viewport
area and are hard-capped; the loop pauses when the tab is hidden and is
disabled entirely under `prefers-reduced-motion`.

**Accessibility** — semantic landmarks, a skip link, visible focus rings,
`aria-live` regions for alerts and toasts, `aria-busy` during loads, full
keyboard operation, and respect for `prefers-reduced-motion`,
`prefers-contrast: more` and print.

---

## Architecture

```
Weather-app/
├── index.html                 app shell
├── manifest.webmanifest       PWA manifest
├── sw.js                      service worker (shell cache-first, data network-first)
├── css/style.css              design tokens → layout → components → motion
├── js/
│   ├── main.js                controller: state, events, load pipeline
│   ├── api.js                 Open-Meteo client: timeouts, aborts, typed errors
│   ├── render.js              all DOM writing + SVG charts
│   ├── store.js               localStorage: units, saved places, offline cache
│   ├── sky.js                 canvas weather particles
│   ├── format.js              unit conversion, timezone-correct formatting
│   └── wmo.js                 WMO code → label / icon / condition family
├── icons/                     weather icons (unchanged, by Ashley Jager)
├── font/                      Rimouski display face (unchanged)
└── legacy/                    the original index.html / app.js / style.css
```

Separation is strict: `render.js` never fetches, `api.js` never touches the DOM,
and `main.js` is the only module that holds state.

### Notable decisions

**Why Open-Meteo?** The original's OpenWeatherMap key was public and expired.
Open-Meteo needs no key, is CORS-enabled, free for non-commercial use, and
returns hourly, daily and air-quality data in a single request — so the app
works the moment you clone it, with nothing to sign up for.

**Metric in, converted at the edge.** All data is fetched in Celsius and km/h
and converted in `format.js` at paint time. Switching units is instant and
never costs a request.

**Timezone correctness.** Open-Meteo returns local wall-clock strings with no
offset (`2026-11-14T14:00`). These are parsed as UTC and formatted with
`timeZone: 'UTC'`, so a city's times render exactly as that city sees them
regardless of where the viewer is. Verified against Reykjavík (6h winter
daylight), Sydney (southern hemisphere) and Quito (equatorial).

**No reverse geocoding.** After a geolocation fix, the place name is derived
from the IANA timezone the forecast already returns (`Asia/Dubai` → "Dubai")
rather than calling a third-party reverse-geocode service. One less request,
one less dependency, and your coordinates are never sent anywhere but the
forecast API.

**Escaping.** Place names come from a remote API, so everything interpolated
into markup passes through an HTML escape; this is covered by tests.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Focus search |
| `L` | Use my location |
| `R` | Refresh |
| `U` | Toggle °C / °F |
| `↑` `↓` `Enter` | Navigate and pick search results |
| `Esc` | Close results |

Clicking the big temperature still flips the unit — the original app's one
interaction, kept.

---

## Credits

- Data — [Open-Meteo](https://open-meteo.com/) (no key, no tracking)
- Icons — [Ashley Jager](https://github.com/manifestinteractive/weather-underground-icons)
- Original tutorial — [CodeExplained](https://youtu.be/KqZGuzrY9D4)
