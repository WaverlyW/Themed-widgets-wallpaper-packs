// Canvas renderers for wallpapers and widgets. Every function takes a 2D
// context plus a normalized theme and draws at whatever size the canvas is,
// so the same pack exports cleanly to any device resolution.

import { mulberry32 } from './theme.js';

// ---------------------------------------------------------------- helpers

function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function font(weight, px, family) {
  return `${weight} ${Math.round(px)}px "${family}", system-ui, sans-serif`;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function linearAcross(ctx, w, h, angleDeg, colors) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  const len = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
  const cx = w / 2;
  const cy = h / 2;
  const g = ctx.createLinearGradient(
    cx - Math.cos(a) * len, cy - Math.sin(a) * len,
    cx + Math.cos(a) * len, cy + Math.sin(a) * len,
  );
  const stops = colors.length === 1 ? [colors[0], colors[0]] : colors;
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Shrink the font until the wrapped text fits in the box. */
function fitText(ctx, text, maxWidth, maxHeight, startPx, weight, family, lineHeight = 1.25) {
  let px = startPx;
  let lines;
  do {
    ctx.font = font(weight, px, family);
    lines = wrapLines(ctx, text, maxWidth);
    if (lines.length * px * lineHeight <= maxHeight) break;
    px *= 0.92;
  } while (px > 10);
  return { px, lines };
}

/** Set ctx.font to the largest size <= startPx that keeps one line within maxWidth. */
function fitLine(ctx, text, maxWidth, startPx, weight, family) {
  let px = startPx;
  ctx.font = font(weight, px, family);
  while (px > 8 && ctx.measureText(text).width > maxWidth) {
    px *= 0.94;
    ctx.font = font(weight, px, family);
  }
  return px;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let grainTile = null;
function grainPattern(ctx) {
  if (!grainTile) {
    grainTile = makeCanvas(160, 160);
    const g = grainTile.getContext('2d');
    const img = g.createImageData(160, 160);
    const rand = mulberry32(42);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(grainTile, 'repeat');
}

// ------------------------------------------------------------- wallpapers

const WALLPAPERS = {
  gradient(ctx, w, h, t) {
    ctx.fillStyle = linearAcross(ctx, w, h, t.wallpaper.angle, t.palette.background);
    ctx.fillRect(0, 0, w, h);
  },

  blobs(ctx, w, h, t, rand) {
    const bg = t.palette.background;
    ctx.fillStyle = linearAcross(ctx, w, h, t.wallpaper.angle, [bg[0], mix(bg[0], bg[bg.length - 1], 0.35)]);
    ctx.fillRect(0, 0, w, h);
    const colors = [...bg.slice(1), t.palette.accent];
    const s = Math.max(w, h);
    for (let i = 0; i < 7; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = s * (0.25 + rand() * 0.35);
      const c = colors[i % colors.length];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, 0.85));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },

  waves(ctx, w, h, t, rand) {
    const bg = t.palette.background;
    ctx.fillStyle = linearAcross(ctx, w, h, 180, [bg[0], mix(bg[0], '#ffffff', 0.15)]);
    ctx.fillRect(0, 0, w, h);
    const layers = Math.max(4, bg.length + 2);
    const ramp = bg.length > 1 ? bg.slice(1) : [t.palette.accent];
    for (let i = 0; i < layers; i++) {
      const p = i / (layers - 1);
      const base = h * (0.35 + p * 0.55);
      const amp = h * (0.02 + rand() * 0.035);
      const freq = (1.2 + rand() * 1.6) * Math.PI * 2;
      const phase = rand() * Math.PI * 2;
      const pos = p * (ramp.length - 1);
      const lo = Math.floor(pos);
      const color = mix(ramp[lo], ramp[Math.min(lo + 1, ramp.length - 1)], pos - lo);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += Math.max(2, w / 240)) {
        ctx.lineTo(x, base + Math.sin((x / w) * freq + phase) * amp);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = rgba(color, 0.55 + p * 0.45);
      ctx.fill();
    }
  },

  dots(ctx, w, h, t) {
    WALLPAPERS.gradient(ctx, w, h, t);
    const step = Math.min(w, h) / 14;
    const r = step * 0.09;
    ctx.fillStyle = rgba(t.palette.surface, 0.22);
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  stripes(ctx, w, h, t) {
    const colors = t.palette.background;
    const band = Math.min(w, h) / 9;
    const diag = Math.hypot(w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((t.wallpaper.angle * Math.PI) / 180);
    let i = 0;
    for (let x = -diag / 2; x < diag / 2; x += band, i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, -diag / 2, band + 1, diag);
    }
    ctx.restore();
  },

  sunset(ctx, w, h, t, rand) {
    const bg = t.palette.background;
    ctx.fillStyle = linearAcross(ctx, w, h, 180, bg);
    ctx.fillRect(0, 0, w, h);
    const sunR = Math.min(w, h) * 0.22;
    const sx = w * (0.3 + rand() * 0.4);
    const sy = h * 0.5;
    const glow = ctx.createRadialGradient(sx, sy, sunR * 0.6, sx, sy, sunR * 3);
    glow.addColorStop(0, rgba(t.palette.accent, 0.45));
    glow.addColorStop(1, rgba(t.palette.accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = mix(t.palette.accent, '#ffffff', 0.35);
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.fill();

    const dark = mix(bg[0], '#000000', 0.55);
    for (let layer = 0; layer < 4; layer++) {
      const base = h * (0.56 + layer * 0.11);
      let y = base;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, y);
      const step = w / 60;
      for (let x = 0; x <= w + step; x += step) {
        y += (rand() - 0.5) * h * 0.025 + (base - y) * 0.08;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = mix(bg[bg.length - 1], dark, 0.35 + layer * 0.2);
      ctx.fill();
    }
  },
};

export function renderWallpaper(ctx, w, h, theme) {
  const rand = mulberry32(theme.wallpaper.seed);
  ctx.save();
  WALLPAPERS[theme.wallpaper.style](ctx, w, h, theme, rand);
  if (theme.wallpaper.grain > 0) {
    ctx.globalAlpha = theme.wallpaper.grain;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- widgets

const CONDITION_LABELS = { sunny: 'Sunny', partly: 'Partly cloudy', cloudy: 'Cloudy', rainy: 'Rainy' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function drawAnalogClock(ctx, cx, cy, r, date, t) {
  const { text, accent, muted } = t.palette;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const major = i % 3 === 0;
    ctx.strokeStyle = major ? text : rgba(muted, 0.7);
    ctx.lineWidth = r * (major ? 0.05 : 0.025);
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * r * 0.78, -Math.cos(a) * r * 0.78);
    ctx.lineTo(Math.sin(a) * r * 0.92, -Math.cos(a) * r * 0.92);
    ctx.stroke();
  }
  const hand = (angle, len, width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(-Math.sin(angle) * r * 0.1, Math.cos(angle) * r * 0.1);
    ctx.lineTo(Math.sin(angle) * len, -Math.cos(angle) * len);
    ctx.stroke();
  };
  const m = date.getMinutes() + date.getSeconds() / 60;
  const hr = (date.getHours() % 12) + m / 60;
  hand((hr / 12) * Math.PI * 2, r * 0.5, r * 0.08, text);
  hand((m / 60) * Math.PI * 2, r * 0.72, r * 0.055, text);
  hand((date.getSeconds() / 60) * Math.PI * 2, r * 0.8, r * 0.02, accent);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function timeString(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function drawCalendarGrid(ctx, x, y, w, h, date, t) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((first + days) / 7) + 1;
  const cw = w / 7;
  const ch = h / rows;
  const px = Math.min(cw, ch) * 0.48;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(700, px * 0.85, t.font.body);
  ctx.fillStyle = t.palette.muted;
  'SMTWTFS'.split('').forEach((d, i) => ctx.fillText(d, x + cw * (i + 0.5), y + ch * 0.5));
  ctx.font = font(500, px, t.font.body);
  for (let d = 1; d <= days; d++) {
    const cell = first + d - 1;
    const cx = x + cw * ((cell % 7) + 0.5);
    const cy = y + ch * (Math.floor(cell / 7) + 1.5);
    if (d === date.getDate()) {
      ctx.fillStyle = t.palette.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(cw, ch) * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palette.surface;
    } else {
      ctx.fillStyle = t.palette.text;
    }
    ctx.fillText(String(d), cx, cy);
  }
}

function drawWeatherIcon(ctx, cx, cy, s, condition, t) {
  const sun = () => {
    ctx.fillStyle = t.palette.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = t.palette.accent;
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.4);
      ctx.lineTo(cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.5);
      ctx.stroke();
    }
  };
  const cloud = (ox, oy, k, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ox - s * 0.18 * k, oy, s * 0.2 * k, 0, Math.PI * 2);
    ctx.arc(ox + s * 0.05 * k, oy - s * 0.1 * k, s * 0.26 * k, 0, Math.PI * 2);
    ctx.arc(ox + s * 0.28 * k, oy + s * 0.02 * k, s * 0.18 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(ox - s * 0.18 * k, oy, s * 0.46 * k, s * 0.2 * k);
  };
  if (condition === 'sunny') sun();
  else if (condition === 'cloudy') {
    cloud(cx, cy, 1, t.palette.muted);
  } else if (condition === 'rainy') {
    cloud(cx, cy - s * 0.1, 1, t.palette.muted);
    ctx.strokeStyle = t.palette.accent;
    ctx.lineWidth = s * 0.06;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * s * 0.18, cy + s * 0.25);
      ctx.lineTo(cx + i * s * 0.18 - s * 0.06, cy + s * 0.42);
      ctx.stroke();
    }
  } else {
    // partly cloudy
    ctx.save();
    ctx.translate(-s * 0.12, -s * 0.12);
    sun();
    ctx.restore();
    cloud(cx + s * 0.05, cy + s * 0.08, 0.85, mix(t.palette.muted, t.palette.surface, 0.3));
  }
}

const WIDGETS = {
  clock(ctx, w, h, t, date, pad) {
    if (w > h * 1.5) {
      const r = (h - pad * 2) / 2;
      drawAnalogClock(ctx, pad + r, h / 2, r, date, t);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const tx = pad * 2 + r * 2;
      ctx.fillStyle = t.palette.text;
      ctx.font = font(700, h * 0.3, t.font.display);
      ctx.fillText(timeString(date), tx, h * 0.55);
      ctx.fillStyle = t.palette.accent;
      ctx.font = font(600, h * 0.1, t.font.body);
      ctx.fillText(DAYS[date.getDay()].toUpperCase(), tx, h * 0.72);
    } else if (h > w * 1.5 || h > 600) {
      const r = (w - pad * 2) / 2 * 0.8;
      drawAnalogClock(ctx, w / 2, pad + r + h * 0.04, r, date, t);
      ctx.textAlign = 'center';
      ctx.fillStyle = t.palette.text;
      ctx.font = font(700, h * 0.09, t.font.display);
      ctx.fillText(timeString(date), w / 2, h - pad - h * 0.07);
      ctx.fillStyle = t.palette.muted;
      ctx.font = font(500, h * 0.04, t.font.body);
      ctx.fillText(`${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`, w / 2, h - pad);
    } else {
      drawAnalogClock(ctx, w / 2, h / 2, Math.min(w, h) / 2 - pad, date, t);
    }
  },

  calendar(ctx, w, h, t, date, pad) {
    ctx.textBaseline = 'alphabetic';
    if (w <= h * 1.2 && h < 600) {
      ctx.textAlign = 'left';
      const maxW = w - pad * 2;
      const weekday = DAYS[date.getDay()].toUpperCase();
      const monthYear = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
      ctx.fillStyle = t.palette.accent;
      fitLine(ctx, weekday, maxW, h * 0.11, 700, t.font.body);
      ctx.fillText(weekday, pad, pad + h * 0.1);
      ctx.fillStyle = t.palette.text;
      fitLine(ctx, String(date.getDate()), maxW, h * 0.42, 700, t.font.display);
      ctx.fillText(String(date.getDate()), pad - h * 0.01, pad + h * 0.5);
      ctx.fillStyle = t.palette.muted;
      fitLine(ctx, monthYear, maxW, h * 0.1, 500, t.font.body);
      ctx.fillText(monthYear, pad, h - pad);
      return;
    }
    if (w > h * 1.5) {
      const left = w * 0.36;
      WIDGETS.calendar(ctx, left, h, t, date, pad);
      drawCalendarGrid(ctx, left + pad * 0.2, pad * 0.6, w - left - pad, h - pad * 1.2, date, t);
      return;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = t.palette.accent;
    ctx.font = font(700, h * 0.06, t.font.display);
    ctx.fillText(MONTHS[date.getMonth()], pad, pad + h * 0.05);
    ctx.fillStyle = t.palette.muted;
    ctx.font = font(500, h * 0.06, t.font.display);
    ctx.textAlign = 'right';
    ctx.fillText(String(date.getFullYear()), w - pad, pad + h * 0.05);
    drawCalendarGrid(ctx, pad, pad + h * 0.1, w - pad * 2, h - pad * 2 - h * 0.1, date, t);
  },

  quote(ctx, w, h, t, date, pad) {
    const { text, author } = t.widgets.quote;
    ctx.fillStyle = rgba(t.palette.accent, 0.9);
    ctx.font = font(700, Math.min(w, h) * 0.3, t.font.display);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('“', pad * 0.8, pad * 0.4);
    const authorPx = Math.min(w, h) * 0.075;
    const top = pad + Math.min(w, h) * 0.18;
    const box = { w: w - pad * 2, h: h - top - pad - authorPx * 1.8 };
    const { px, lines } = fitText(ctx, text, box.w, box.h, Math.min(w, h) * 0.12, 600, t.font.display);
    ctx.fillStyle = t.palette.text;
    ctx.font = font(600, px, t.font.display);
    lines.forEach((line, i) => ctx.fillText(line, pad, top + i * px * 1.25));
    if (author) {
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = t.palette.muted;
      ctx.font = font(500, authorPx, t.font.body);
      ctx.fillText(`— ${author}`, pad, h - pad);
    }
  },

  weather(ctx, w, h, t, date, pad) {
    const wx = t.widgets.weather;
    const unit = `°${wx.unit === 'F' ? 'F' : 'C'}`;
    const s = Math.min(w, h);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = t.palette.text;
    const heading = `${wx.city} · ${unit}`;
    fitLine(ctx, heading, w * 0.6 - pad, s * 0.09, 600, t.font.body);
    ctx.fillText(heading, pad, pad + s * 0.08);
    const hero = w > h * 1.5 ? h - pad * 2 : Math.min(w, h * 0.55) - pad * 2;
    ctx.font = font(700, s * 0.3, t.font.display);
    ctx.fillText(`${Math.round(wx.temp)}°`, pad, pad + s * 0.08 + s * 0.32);
    drawWeatherIcon(ctx, w - pad - hero * 0.3, pad + hero * 0.3, hero * 0.55, wx.condition, t);
    ctx.fillStyle = t.palette.muted;
    ctx.font = font(500, s * 0.075, t.font.body);
    const label = CONDITION_LABELS[wx.condition] || wx.condition;
    if (h < 600 && w <= h * 1.5) {
      fitLine(ctx, label, w - pad * 2, s * 0.075, 500, t.font.body);
      ctx.fillText(label, pad, h - pad);
      return;
    }
    // Forecast row (deterministic mock data derived from the seed).
    const rand = mulberry32(t.wallpaper.seed + 7);
    const conds = ['sunny', 'partly', 'cloudy', 'rainy'];
    const n = 5;
    const rowTop = w > h * 1.5 ? h * 0.5 : h * 0.62;
    const colW = (w > h * 1.5 ? w * 0.55 : w - pad * 2) / n;
    const rowX = w > h * 1.5 ? w * 0.38 : pad;
    const rowH = h - pad - rowTop;
    if (w <= h * 1.5) ctx.fillText(label, pad, pad + s * 0.52);
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const cx = rowX + colW * (i + 0.5);
      const day = DAYS[(date.getDay() + i + 1) % 7].slice(0, 3);
      ctx.fillStyle = t.palette.muted;
      ctx.font = font(600, rowH * 0.18, t.font.body);
      ctx.fillText(day, cx, rowTop + rowH * 0.18);
      drawWeatherIcon(ctx, cx, rowTop + rowH * 0.5, Math.min(colW, rowH) * 0.42, conds[Math.floor(rand() * 4)], t);
      ctx.fillStyle = t.palette.text;
      ctx.font = font(600, rowH * 0.18, t.font.body);
      ctx.fillText(`${Math.round(wx.temp + (rand() - 0.5) * 8)}°`, cx, rowTop + rowH * 0.95);
    }
  },

  countdown(ctx, w, h, t, date, pad) {
    const { label, date: target } = t.widgets.countdown;
    const [y, m, d] = target.split('-').map(Number);
    const end = new Date(y, m - 1, d);
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.max(0, Math.round((end - today) / 86400000));
    const s = Math.min(w, h);
    const tall = h >= 600 && w <= h * 1.5;
    const ringR = tall ? h * 0.3 : s / 2 - pad;
    const ringW = s * 0.07;
    const cx = w > h * 1.5 ? pad + ringR : w / 2;
    const cy = w > h * 1.5 || h < 600 ? h / 2 : pad + ringR + h * 0.03;
    const progress = Math.max(0.03, Math.min(1, 1 - days / 365));
    ctx.lineCap = 'round';
    ctx.lineWidth = ringW;
    ctx.strokeStyle = rgba(t.palette.muted, 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR - ringW / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = t.palette.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR - ringW / 2, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.palette.text;
    ctx.font = font(700, ringR * 0.6, t.font.display);
    ctx.fillText(String(days), cx, cy - ringR * 0.08);
    ctx.fillStyle = t.palette.muted;
    ctx.font = font(600, ringR * 0.17, t.font.body);
    ctx.fillText(days === 1 ? 'DAY' : 'DAYS', cx, cy + ringR * 0.38);
    if (w > h * 1.5) {
      ctx.textAlign = 'left';
      const tx = pad * 2 + ringR * 2;
      const { px, lines } = fitText(ctx, label, w - tx - pad, h * 0.45, h * 0.16, 700, t.font.display, 1.15);
      ctx.fillStyle = t.palette.text;
      ctx.font = font(700, px, t.font.display);
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => ctx.fillText(line, tx, h * 0.3 + i * px * 1.15));
      ctx.fillStyle = t.palette.muted;
      ctx.font = font(500, h * 0.08, t.font.body);
      ctx.fillText(`${MONTHS[m - 1]} ${d}, ${y}`, tx, h * 0.3 + lines.length * px * 1.15 + h * 0.04);
    } else if (h >= 600) {
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = t.palette.text;
      ctx.font = font(700, h * 0.07, t.font.display);
      fitLine(ctx, label, w - pad * 2, h * 0.07, 700, t.font.display);
      ctx.fillText(label, w / 2, h - pad - h * 0.06);
      ctx.fillStyle = t.palette.muted;
      ctx.font = font(500, h * 0.04, t.font.body);
      ctx.fillText(`${MONTHS[m - 1]} ${d}, ${y}`, w / 2, h - pad);
    }
  },
};

/**
 * Draw one widget filling the canvas. `transparent` skips the card so the
 * export can sit on top of any wallpaper.
 */
export function renderWidget(ctx, w, h, theme, type, { date = new Date(), card = true } = {}) {
  const pad = Math.min(w, h) * 0.1;
  ctx.save();
  if (card) {
    roundRect(ctx, 0, 0, w, h, theme.widgets.radius * (Math.min(w, h) / 340));
    ctx.fillStyle = rgba(theme.palette.surface, theme.widgets.opacity);
    ctx.fill();
    ctx.clip();
  }
  WIDGETS[type](ctx, w, h, theme, date, pad);
  ctx.restore();
}

/**
 * Compose a home-screen preview: wallpaper plus a stack of widgets laid out
 * on a 2-column phone grid. Used for gallery thumbnails and the editor.
 */
export function renderPreview(ctx, w, h, theme, { date = new Date() } = {}) {
  renderWallpaper(ctx, w, h, theme);
  const types = theme.widgets.include;
  if (!types.length) return;
  const margin = w * 0.07;
  const gap = w * 0.045;
  const unit = (w - margin * 2 - gap) / 2; // one "small" cell
  const layout = [];
  // First widget medium, then pairs of smalls, then one large if room.
  let y = h * 0.1;
  types.forEach((type, i) => {
    if (i === 0) {
      layout.push({ type, x: margin, y, w: unit * 2 + gap, h: unit });
      y += unit + gap;
    } else if (i <= 2) {
      layout.push({ type, x: margin + (i - 1) * (unit + gap), y, w: unit, h: unit });
      if (i === 2 || i === types.length - 1) y += unit + gap;
    } else if (i === 3 && y + unit * 2.2 < h * 0.92) {
      layout.push({ type, x: margin, y, w: unit * 2 + gap, h: unit });
      y += unit + gap;
    }
  });
  const scale = unit / 340;
  for (const box of layout) {
    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.scale(scale, scale);
    renderWidget(ctx, box.w / scale, box.h / scale, theme, box.type, { date });
    ctx.restore();
  }
}
