import {
  DEVICES, WALLPAPER_STYLES, WIDGET_SIZES, WIDGET_TYPES,
  normalizeTheme, validateTheme, slugify,
} from './theme.js';
import { renderPreview, renderWallpaper, renderWidget } from './render.js';
import { createZip } from './zip.js';

const FONTS = ['Inter', 'Space Grotesk', 'Nunito', 'Fraunces', 'Playfair Display', 'DM Serif Display', 'JetBrains Mono'];
const CONDITIONS = { sunny: 'Sunny', partly: 'Partly cloudy', cloudy: 'Cloudy', rainy: 'Rainy' };
const STORE_KEY = 'theme-pack-studio.custom';
const PREVIEW_SIZE = [600, 1300]; // 9:19.5 phone screen, drawn at 2x for crispness

const app = document.getElementById('app');
const state = { builtIn: [], custom: [] };

// ---------------------------------------------------------------- storage

function loadCustom() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeTheme) : [];
  } catch {
    return [];
  }
}

function saveCustom() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.custom));
    return true;
  } catch {
    toast('Could not save: browser storage is unavailable. Export the JSON instead.');
    return false;
  }
}

async function loadBuiltIns() {
  const ids = await (await fetch('packs/index.json')).json();
  const packs = await Promise.all(ids.map(async (id) => (await fetch(`packs/${id}.json`)).json()));
  return packs.map(normalizeTheme);
}

const allPacks = () => [...state.custom, ...state.builtIn];
const findPack = (id) => allPacks().find((p) => p.id === id);
const isCustom = (id) => state.custom.some((p) => p.id === id);

function uniqueId(base) {
  const root = slugify(base);
  let id = root;
  for (let n = 2; findPack(id); n++) id = `${root}-${n}`;
  return id;
}

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

async function ensureFonts(theme) {
  if (!document.fonts) return;
  const families = new Set([theme.font.display, theme.font.body]);
  await Promise.all([...families].flatMap((f) => [
    document.fonts.load(`500 32px "${f}"`),
    document.fonts.load(`700 32px "${f}"`),
  ])).catch(() => {});
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

async function canvasBytes(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

function download(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

function themeJson(theme) {
  return `${JSON.stringify(theme, null, 2)}\n`;
}

// ----------------------------------------------------------------- export

function wallpaperCanvas(theme, device) {
  const [w, h] = DEVICES[device].size;
  const c = makeCanvas(w, h);
  renderWallpaper(c.getContext('2d'), w, h, theme);
  return c;
}

function widgetCanvas(theme, type, size) {
  const [w, h] = WIDGET_SIZES[size];
  const c = makeCanvas(w, h);
  renderWidget(c.getContext('2d'), w, h, theme, type);
  return c;
}

const README = (theme) => `${theme.name}
${'='.repeat(theme.name.length)}
${theme.description}

Made with Theme Pack Studio.

wallpapers/  One PNG per device size. Set it as your home/lock screen.
widgets/     Each widget in small, medium and large, with transparent
             rounded corners. Use them with any photo-widget app
             (Widgetsmith, Photo Widget, KWGT image layer) or as design
             references when building live widgets.
theme.json   The source theme. Import it back into Theme Pack Studio to
             edit, or feed it to your own widget app.

Note: clock, calendar, weather and countdown images are snapshots of the
moment you exported. A live widget app should read theme.json and draw
them itself.
`;

async function exportPack(theme, button) {
  button.disabled = true;
  const label = button.textContent;
  try {
    await ensureFonts(theme);
    const root = theme.id;
    const files = [
      { name: `${root}/theme.json`, data: themeJson(theme) },
      { name: `${root}/README.txt`, data: README(theme) },
    ];
    const preview = makeCanvas(1179, 2556);
    renderPreview(preview.getContext('2d'), 1179, 2556, theme);
    files.push({ name: `${root}/preview.png`, data: await canvasBytes(preview) });

    const jobs = [
      ...Object.keys(DEVICES).map((d) => ['wallpaper', d]),
      ...theme.widgets.include.flatMap((type) => Object.keys(WIDGET_SIZES).map((s) => [type, s])),
    ];
    for (const [i, [kind, variant]] of jobs.entries()) {
      button.textContent = `Rendering ${i + 1}/${jobs.length}…`;
      await nextFrame();
      if (kind === 'wallpaper') {
        const [w, h] = DEVICES[variant].size;
        files.push({
          name: `${root}/wallpapers/${root}-${variant}-${w}x${h}.png`,
          data: await canvasBytes(wallpaperCanvas(theme, variant)),
        });
      } else {
        files.push({
          name: `${root}/widgets/${kind}-${variant}.png`,
          data: await canvasBytes(widgetCanvas(theme, kind, variant)),
        });
      }
    }
    download(createZip(files), `${root}.zip`, 'application/zip');
    toast(`Exported ${files.length} files`);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// ---------------------------------------------------------------- gallery

function swatches(theme) {
  const colors = [...theme.palette.background, theme.palette.accent].slice(0, 6);
  return `<div class="swatches">${colors.map((c) => `<span style="background:${esc(c)}"></span>`).join('')}</div>`;
}

async function showGallery() {
  const packs = allPacks();
  app.innerHTML = `
    <h1>Theme packs</h1>
    <p class="lede">Pick a pack to customize it, or start a new one. Every pack exports wallpapers for each device plus widgets in three sizes.</p>
    <div class="gallery">
      ${packs.map((p) => `
        <a class="card" href="#/pack/${esc(p.id)}">
          <canvas width="${PREVIEW_SIZE[0] / 2}" height="${(PREVIEW_SIZE[0] / 2) * (16 / 9)}" data-id="${esc(p.id)}" aria-hidden="true"></canvas>
          <div class="card-body">
            <div class="card-title">${esc(p.name)}${isCustom(p.id) ? '<span class="badge">Mine</span>' : ''}</div>
            <p class="card-desc">${esc(p.description || p.tags.join(' · '))}</p>
            ${swatches(p)}
          </div>
        </a>`).join('')}
    </div>`;

  for (const canvas of app.querySelectorAll('canvas[data-id]')) {
    const theme = findPack(canvas.dataset.id);
    await ensureFonts(theme);
    if (!canvas.isConnected) return; // navigated away mid-render
    renderPreview(canvas.getContext('2d'), canvas.width, canvas.height, theme);
  }
}

// ----------------------------------------------------------------- editor

function field(label, inner) {
  return `<label class="field">${label}${inner}</label>`;
}

function controlsHtml(t) {
  const range = (path, label, min, max, step, suffix = '') => field(
    `<span>${label} <span class="value" data-value-for="${path}">${getPath(t, path)}${suffix}</span></span>`,
    `<input type="range" data-path="${path}" data-type="number" min="${min}" max="${max}" step="${step}" value="${getPath(t, path)}">`,
  );
  const text = (path, label, type = 'text') => field(label, `<input type="${type}" data-path="${path}" value="${esc(getPath(t, path))}">`);
  const select = (path, label, options) => field(label, `<select data-path="${path}">${Object.entries(options)
    .map(([v, l]) => `<option value="${esc(v)}" ${getPath(t, path) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`);
  const asOptions = (list) => Object.fromEntries(list.map((v) => [v, v.replace(/^\w/, (c) => c.toUpperCase())]));

  return `
    <section>
      <h2>Pack</h2>
      ${text('name', 'Name')}
      ${field('Description', `<textarea data-path="description" rows="2">${esc(t.description)}</textarea>`)}
      ${text('author', 'Author')}
    </section>
    <section>
      <h2>Colors</h2>
      <div class="field"><span>Background</span>
        <div class="colors" id="bg-colors">
          ${t.palette.background.map((c, i) => `<span class="color" style="background:${c}"><input type="color" data-bg="${i}" value="${c}" aria-label="Background color ${i + 1}"></span>`).join('')}
          <button type="button" class="btn btn-small" data-action="bg-add" ${t.palette.background.length >= 6 ? 'disabled' : ''} aria-label="Add color">+</button>
          <button type="button" class="btn btn-small" data-action="bg-remove" ${t.palette.background.length <= 1 ? 'disabled' : ''} aria-label="Remove last color">−</button>
        </div>
      </div>
      <div class="named-colors">
        ${['surface', 'text', 'accent', 'muted'].map((k) => `
          <label><span class="color" style="background:${t.palette[k]}"><input type="color" data-path="palette.${k}" value="${t.palette[k]}"></span>${k}</label>`).join('')}
      </div>
    </section>
    <section>
      <h2>Wallpaper</h2>
      ${select('wallpaper.style', 'Style', asOptions(WALLPAPER_STYLES))}
      ${range('wallpaper.angle', 'Angle', 0, 360, 1, '°')}
      ${range('wallpaper.grain', 'Grain', 0, 0.3, 0.01)}
      <div class="field"><span>Variation <span class="value" data-value-for="wallpaper.seed">${t.wallpaper.seed}</span></span>
        <button type="button" class="btn btn-small" data-action="shuffle">Shuffle</button>
      </div>
    </section>
    <section>
      <h2>Type</h2>
      <div class="field-row">
        ${select('font.display', 'Display', asOptions(FONTS))}
        ${select('font.body', 'Body', asOptions(FONTS))}
      </div>
    </section>
    <section>
      <h2>Widgets</h2>
      <div class="field"><span>Include (first one is shown wide)</span>
        <div class="checks">
          ${WIDGET_TYPES.map((w) => `<label><input type="checkbox" data-include="${w}" ${t.widgets.include.includes(w) ? 'checked' : ''}>${w}</label>`).join('')}
        </div>
      </div>
      ${range('widgets.radius', 'Corner radius', 0, 170, 1, 'px')}
      ${range('widgets.opacity', 'Card opacity', 0, 1, 0.01)}
      ${field('Quote', `<textarea data-path="widgets.quote.text" rows="2">${esc(t.widgets.quote.text)}</textarea>`)}
      ${text('widgets.quote.author', 'Quote author')}
      <div class="field-row">
        ${text('widgets.weather.city', 'Weather city')}
        ${field('Temperature', `<input type="number" data-path="widgets.weather.temp" data-type="number" value="${t.widgets.weather.temp}">`)}
      </div>
      <div class="field-row">
        ${select('widgets.weather.condition', 'Condition', CONDITIONS)}
        ${select('widgets.weather.unit', 'Unit', { C: '°C', F: '°F' })}
      </div>
      <div class="field-row">
        ${text('widgets.countdown.label', 'Countdown label')}
        ${text('widgets.countdown.date', 'Countdown date', 'date')}
      </div>
    </section>`;
}

function showEditor(id) {
  const source = findPack(id);
  if (!source) {
    app.innerHTML = '<h1>Pack not found</h1><p class="lede"><a href="#/">Back to the gallery</a></p>';
    return;
  }
  const custom = isCustom(id);
  const draft = structuredClone(source);
  let dirty = false;

  app.innerHTML = `
    <p class="lede"><a href="#/">← All packs</a></p>
    <div class="editor">
      <form class="panel controls" id="controls" autocomplete="off" onsubmit="return false"></form>
      <div class="stage">
        <div class="stage-top">
          <div class="phone"><canvas id="preview" width="${PREVIEW_SIZE[0]}" height="${PREVIEW_SIZE[1]}" role="img" aria-label="Home screen preview"></canvas></div>
          <div class="panel export">
            <h1 id="title">${esc(draft.name)}</h1>
            <p class="export-note" id="status">${custom ? 'Your pack' : 'Built-in pack. Saving creates your own copy.'}</p>
            <ul class="errors" id="errors" hidden></ul>
            <button type="button" class="btn btn-primary" data-action="save">${custom ? 'Save' : 'Save as my pack'}</button>
            <button type="button" class="btn" data-action="export-pack">Download full pack (.zip)</button>
            <div class="field-row">
              <select id="device" class="btn" aria-label="Device">
                ${Object.entries(DEVICES).map(([k, d]) => `<option value="${k}">${d.label} ${d.size.join('×')}</option>`).join('')}
              </select>
              <button type="button" class="btn" data-action="export-wallpaper">Wallpaper PNG</button>
            </div>
            <button type="button" class="btn" data-action="export-json">Export theme.json</button>
            <button type="button" class="btn" data-action="duplicate">Duplicate</button>
            ${custom ? '<button type="button" class="btn btn-ghost btn-danger" data-action="delete">Delete pack</button>' : ''}
          </div>
        </div>
        <div class="panel">
          <h2>Widgets</h2>
          <div class="widget-strip" id="widgets"></div>
        </div>
      </div>
    </div>`;

  const form = app.querySelector('#controls');
  const preview = app.querySelector('#preview');
  const errorsEl = app.querySelector('#errors');
  const exportButtons = app.querySelectorAll('[data-action^="export"], [data-action="save"]');

  const renderControls = () => { form.innerHTML = controlsHtml(draft); };

  let frame = 0;
  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(async () => {
      const errors = validateTheme(draft);
      errorsEl.hidden = !errors.length;
      errorsEl.innerHTML = errors.map((e) => `<li>${esc(e)}</li>`).join('');
      exportButtons.forEach((b) => { b.disabled = errors.length > 0; });
      if (errors.length) return;

      await ensureFonts(draft);
      app.querySelector('#title').textContent = draft.name;
      renderPreview(preview.getContext('2d'), preview.width, preview.height, draft);
      renderWidgetStrip(app.querySelector('#widgets'), draft);
    });
  };

  const markDirty = () => {
    dirty = true;
    app.querySelector('#status').textContent = 'Unsaved changes';
  };

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.path) {
      const value = el.dataset.type === 'number' ? Number(el.value) : el.value;
      setPath(draft, el.dataset.path, value);
      const out = form.querySelector(`[data-value-for="${el.dataset.path}"]`);
      if (out) out.textContent = el.value + (el.dataset.path === 'wallpaper.angle' ? '°' : el.dataset.path === 'widgets.radius' ? 'px' : '');
    } else if (el.dataset.bg !== undefined) {
      draft.palette.background[Number(el.dataset.bg)] = el.value;
    } else if (el.dataset.include) {
      // Keep the user's chosen order: append new picks, drop unticked ones.
      const on = el.checked;
      draft.widgets.include = draft.widgets.include.filter((w) => w !== el.dataset.include);
      if (on) draft.widgets.include.push(el.dataset.include);
    }
    if (el.type === 'color') el.parentElement.style.background = el.value;
    markDirty();
    redraw();
  });

  form.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    const bg = draft.palette.background;
    if (action === 'bg-add' && bg.length < 6) bg.push(draft.palette.accent);
    else if (action === 'bg-remove' && bg.length > 1) bg.pop();
    else if (action === 'shuffle') draft.wallpaper.seed = Math.floor(Math.random() * 100000);
    else return;
    renderControls();
    markDirty();
    redraw();
  });

  app.querySelector('.export').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const theme = normalizeTheme(draft);
    switch (button.dataset.action) {
      case 'save': {
        if (custom) {
          state.custom = state.custom.map((p) => (p.id === id ? theme : p));
          if (saveCustom()) {
            dirty = false;
            app.querySelector('#status').textContent = 'Saved';
          }
        } else {
          const copy = { ...theme, id: uniqueId(`${draft.name}-mine`) };
          state.custom.unshift(copy);
          if (saveCustom()) {
            dirty = false;
            location.hash = `#/pack/${copy.id}`;
            toast('Saved to your packs');
          }
        }
        break;
      }
      case 'duplicate': {
        const name = `${draft.name} copy`;
        const copy = { ...theme, id: uniqueId(name), name };
        state.custom.unshift(copy);
        dirty = false;
        if (saveCustom()) location.hash = `#/pack/${copy.id}`;
        break;
      }
      case 'delete':
        if (confirm(`Delete "${source.name}"? This can't be undone.`)) {
          state.custom = state.custom.filter((p) => p.id !== id);
          saveCustom();
          dirty = false;
          location.hash = '#/';
        }
        break;
      case 'export-json':
        download(themeJson(theme), `${theme.id}.json`, 'application/json');
        break;
      case 'export-wallpaper': {
        const device = app.querySelector('#device').value;
        await ensureFonts(theme);
        const [w, h] = DEVICES[device].size;
        download(await canvasBytes(wallpaperCanvas(theme, device)), `${theme.id}-${device}-${w}x${h}.png`, 'image/png');
        break;
      }
      case 'export-pack':
        await exportPack(theme, button);
        break;
      default:
    }
  });

  hasUnsaved = () => dirty;
  renderControls();
  redraw();
}

function renderWidgetStrip(container, theme) {
  // Each tile shows the widget over a crop of the wallpaper, like on a phone.
  container.innerHTML = '';
  // Wide enough for the largest tile (720 + margins) so crops never run off the edge.
  const wall = makeCanvas(820, 1560);
  renderWallpaper(wall.getContext('2d'), wall.width, wall.height, theme);
  for (const type of theme.widgets.include) {
    for (const size of Object.keys(WIDGET_SIZES)) {
      const [w, h] = WIDGET_SIZES[size];
      const m = 40;
      const c = makeCanvas(w + m * 2, h + m * 2);
      const ctx = c.getContext('2d');
      ctx.drawImage(wall, 0, (wall.height - c.height) / 2, c.width, c.height, 0, 0, c.width, c.height);
      ctx.translate(m, m);
      renderWidget(ctx, w, h, theme, type);
      const tile = document.createElement('figure');
      tile.className = `widget-tile ${size}`;
      tile.style.margin = '0';
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', `${type} widget, ${size}`);
      const caption = document.createElement('figcaption');
      caption.textContent = `${type} · ${size}`;
      tile.append(c, caption);
      container.append(tile);
    }
  }
}

// ----------------------------------------------------------------- router

let hasUnsaved = () => false;
let currentHash = location.hash;

const confirmLeave = () => !hasUnsaved() || confirm('Discard unsaved changes to this pack?');

function route() {
  if (location.hash !== currentHash && !confirmLeave()) {
    history.replaceState(null, '', currentHash || '#/');
    return;
  }
  currentHash = location.hash;
  hasUnsaved = () => false;
  window.scrollTo(0, 0);
  const match = location.hash.match(/^#\/pack\/([\w-]+)/);
  if (match) showEditor(match[1]);
  else showGallery();
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => {
  if (hasUnsaved()) e.preventDefault();
});

document.getElementById('new-pack').addEventListener('click', () => {
  if (!confirmLeave()) return;
  hasUnsaved = () => false;
  const theme = normalizeTheme({
    id: uniqueId('my-pack'),
    name: 'My Pack',
    wallpaper: { seed: Math.floor(Math.random() * 100000) },
  });
  state.custom.unshift(theme);
  if (saveCustom()) location.hash = `#/pack/${theme.id}`;
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    toast('That file is not valid JSON.');
    return;
  }
  const errors = validateTheme(parsed);
  if (errors.length) {
    toast(`Can't import: ${errors[0]}`);
    return;
  }
  if (!confirmLeave()) return;
  hasUnsaved = () => false;
  const theme = normalizeTheme(parsed);
  if (findPack(theme.id)) theme.id = uniqueId(theme.id);
  state.custom.unshift(theme);
  if (saveCustom()) {
    toast(`Imported "${theme.name}"`);
    location.hash = `#/pack/${theme.id}`;
  }
});

state.custom = loadCustom();
try {
  state.builtIn = await loadBuiltIns();
} catch {
  toast('Could not load the built-in packs. Serve the folder over HTTP (npm start).');
}
route();
