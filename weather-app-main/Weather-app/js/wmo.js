/**
 * WMO 4677 weather code → label, icon, condition family.
 * Icons reuse the existing Weather Underground set (by Ashley Jager)
 * already shipped in /icons, keyed the OpenWeatherMap way (01d/01n…).
 */

const CODES = {
  0:  { label: 'Clear sky',            icon: '01', fam: 'clear' },
  1:  { label: 'Mainly clear',         icon: '02', fam: 'clear' },
  2:  { label: 'Partly cloudy',        icon: '03', fam: 'cloud' },
  3:  { label: 'Overcast',             icon: '04', fam: 'cloud' },
  45: { label: 'Fog',                  icon: '50', fam: 'fog'   },
  48: { label: 'Freezing fog',         icon: '50', fam: 'fog'   },
  51: { label: 'Light drizzle',        icon: '09', fam: 'rain'  },
  53: { label: 'Drizzle',              icon: '09', fam: 'rain'  },
  55: { label: 'Heavy drizzle',        icon: '09', fam: 'rain'  },
  56: { label: 'Freezing drizzle',     icon: '09', fam: 'rain'  },
  57: { label: 'Freezing drizzle',     icon: '09', fam: 'rain'  },
  61: { label: 'Light rain',           icon: '10', fam: 'rain'  },
  63: { label: 'Rain',                 icon: '10', fam: 'rain'  },
  65: { label: 'Heavy rain',           icon: '10', fam: 'rain'  },
  66: { label: 'Freezing rain',        icon: '10', fam: 'rain'  },
  67: { label: 'Heavy freezing rain',  icon: '10', fam: 'rain'  },
  71: { label: 'Light snow',           icon: '13', fam: 'snow'  },
  73: { label: 'Snow',                 icon: '13', fam: 'snow'  },
  75: { label: 'Heavy snow',           icon: '13', fam: 'snow'  },
  77: { label: 'Snow grains',          icon: '13', fam: 'snow'  },
  80: { label: 'Light showers',        icon: '09', fam: 'rain'  },
  81: { label: 'Showers',              icon: '09', fam: 'rain'  },
  82: { label: 'Violent showers',      icon: '09', fam: 'rain'  },
  85: { label: 'Snow showers',         icon: '13', fam: 'snow'  },
  86: { label: 'Heavy snow showers',   icon: '13', fam: 'snow'  },
  95: { label: 'Thunderstorm',         icon: '11', fam: 'storm' },
  96: { label: 'Storm with hail',      icon: '11', fam: 'storm' },
  99: { label: 'Severe storm, hail',   icon: '11', fam: 'storm' }
};

const FALLBACK = { label: 'Unknown', icon: null, fam: 'cloud' };

/** @returns {{label:string, icon:string, fam:string}} */
export function describe(code, isDay = true) {
  const e = CODES[code] ?? FALLBACK;
  return {
    label: e.label,
    fam: e.fam,
    icon: e.icon ? `icons/${e.icon}${isDay ? 'd' : 'n'}.png` : 'icons/unknown.png'
  };
}

/** Codes that deserve a heads-up banner. */
export const SEVERE = new Set([65, 67, 75, 82, 86, 95, 96, 99]);
