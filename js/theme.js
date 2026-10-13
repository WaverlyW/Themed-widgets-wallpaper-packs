// Theme pack schema: defaults, normalization and validation.
// Pure module (no DOM) so it runs in the browser and under `node --test`.

export const WALLPAPER_STYLES = ['gradient', 'blobs', 'waves', 'dots', 'stripes', 'sunset'];
export const WIDGET_TYPES = ['clock', 'calendar', 'quote', 'weather', 'countdown'];
export const WIDGET_SIZES = {
  small: [340, 340],
  medium: [720, 340],
  large: [720, 760],
};
export const DEVICES = {
  iphone: { label: 'iPhone', size: [1179, 2556] },
  android: { label: 'Android', size: [1080, 2400] },
  tablet: { label: 'Tablet', size: [2048, 2732] },
  desktop: { label: 'Desktop', size: [2560, 1440] },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const DEFAULT_THEME = {
  id: 'untitled',
  name: 'Untitled Pack',
  author: '',
  description: '',
  tags: [],
  palette: {
    background: ['#1e1b4b', '#7c3aed', '#f472b6'],
    surface: '#ffffff',
    text: '#111827',
    accent: '#7c3aed',
    muted: '#6b7280',
  },
  font: {
    display: 'Inter',
    body: 'Inter',
  },
  wallpaper: {
    style: 'gradient',
    angle: 160,
    seed: 1,
    grain: 0.04,
  },
  widgets: {
    radius: 44,
    opacity: 0.9,
    include: [...WIDGET_TYPES],
    quote: { text: 'Make it simple, but significant.', author: 'Don Draper' },
    weather: { city: 'Lisbon', temp: 22, condition: 'sunny', unit: 'C' },
    countdown: { label: 'Vacation', date: '2026-12-20' },
  },
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(base, over) {
  if (!isObj(over)) return structuredClone(base);
  const out = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(over)])) {
    const b = base[key];
    const o = over[key];
    if (o === undefined) out[key] = structuredClone(b);
    else if (isObj(b) && isObj(o)) out[key] = merge(b, o);
    else out[key] = structuredClone(o);
  }
  return out;
}

/** Fill in every missing field from DEFAULT_THEME. */
export function normalizeTheme(input) {
  return merge(DEFAULT_THEME, input);
}

/** Return a list of human-readable problems; empty means valid. */
export function validateTheme(input) {
  const errors = [];
  if (!isObj(input)) return ['Theme must be a JSON object.'];
  const t = normalizeTheme(input);

  if (typeof t.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(t.id)) {
    errors.push('id must be lowercase letters, digits and dashes (e.g. "neon-night").');
  }
  if (typeof t.name !== 'string' || !t.name.trim()) errors.push('name is required.');
  if (!Array.isArray(t.tags)) errors.push('tags must be an array.');

  const bg = t.palette.background;
  if (!Array.isArray(bg) || bg.length < 1 || bg.length > 6) {
    errors.push('palette.background must list 1 to 6 colors.');
  } else {
    bg.forEach((c, i) => {
      if (!HEX.test(c)) errors.push(`palette.background[${i}] is not a hex color: ${c}`);
    });
  }
  for (const key of ['surface', 'text', 'accent', 'muted']) {
    if (!HEX.test(t.palette[key])) errors.push(`palette.${key} is not a hex color: ${t.palette[key]}`);
  }

  if (!WALLPAPER_STYLES.includes(t.wallpaper.style)) {
    errors.push(`wallpaper.style must be one of: ${WALLPAPER_STYLES.join(', ')}.`);
  }
  if (!Number.isFinite(t.wallpaper.angle)) errors.push('wallpaper.angle must be a number.');
  if (!Number.isInteger(t.wallpaper.seed)) errors.push('wallpaper.seed must be an integer.');
  if (!(t.wallpaper.grain >= 0 && t.wallpaper.grain <= 0.3)) errors.push('wallpaper.grain must be between 0 and 0.3.');

  if (!(t.widgets.opacity >= 0 && t.widgets.opacity <= 1)) errors.push('widgets.opacity must be between 0 and 1.');
  if (!(t.widgets.radius >= 0 && t.widgets.radius <= 170)) errors.push('widgets.radius must be between 0 and 170.');
  if (!Array.isArray(t.widgets.include) || t.widgets.include.some((w) => !WIDGET_TYPES.includes(w))) {
    errors.push(`widgets.include may only contain: ${WIDGET_TYPES.join(', ')}.`);
  }
  if (Number.isNaN(Date.parse(t.widgets.countdown.date))) errors.push('widgets.countdown.date must be a date (YYYY-MM-DD).');

  return errors;
}

/** Deterministic PRNG so the same seed always draws the same wallpaper. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pack';
}
