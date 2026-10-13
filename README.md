# Theme Pack Studio

Build, preview and export themed **widget + wallpaper packs**. Each pack is a
small JSON file. The app renders it into:

- wallpapers for iPhone, Android, tablet and desktop
- clock, calendar, weather, countdown and quote widgets in small, medium and large
- a home-screen preview, all bundled into one `.zip`

No build step and no dependencies. It is plain HTML, CSS and JavaScript using Canvas.

## Run it

```bash
npm start          # http://localhost:5173
npm test           # unit tests (schema, zip writer, bundled packs)
npm run validate   # check every pack in packs/
```

Requires Node 18+. The app must be served over HTTP (not opened as a
`file://`) because it uses ES modules and `fetch`.

## Using the app

- **Gallery:** browse the built-in packs and your own.
- **Editor:** change colors, wallpaper style, fonts and widget content with a
  live phone preview. Built-in packs are read-only; *Save as my pack* makes
  an editable copy.
- **New pack / Import JSON:** start from scratch or load a `theme.json`.
- **Export:** download one wallpaper, the theme JSON, or the full pack zip:

```
<pack-id>/
  theme.json
  README.txt
  preview.png
  wallpapers/<pack-id>-iphone-1179x2556.png  (+ android, tablet, desktop)
  widgets/<type>-<small|medium|large>.png
```

Your packs are stored in the browser (`localStorage`). Export the JSON to back
them up or share them.

## Theme format

Every field is optional except `id` and `name`. Missing values come from
`DEFAULT_THEME` in [`js/theme.js`](js/theme.js).

```jsonc
{
  "id": "neon-night",                 // lowercase, digits, dashes
  "name": "Neon Night",
  "author": "You",
  "description": "One-line pitch.",
  "tags": ["dark", "vibrant"],
  "palette": {
    "background": ["#0b0221", "#3a0ca3", "#f72585"], // 1–6 colors used by the wallpaper
    "surface": "#140a2e",             // widget card
    "text": "#f8f7ff",
    "accent": "#f72585",              // highlights, clock second hand, today marker
    "muted": "#a5a1c9"                // secondary text
  },
  "font": { "display": "Space Grotesk", "body": "Space Grotesk" },
  "wallpaper": {
    "style": "blobs",                 // gradient | blobs | waves | dots | stripes | sunset
    "angle": 160,                     // gradient/stripe direction in degrees
    "seed": 7,                        // same seed = same wallpaper
    "grain": 0.06                     // film grain 0–0.3
  },
  "widgets": {
    "radius": 48,                     // corner radius at small size (px)
    "opacity": 0.78,                  // card opacity 0–1
    "include": ["clock", "calendar", "weather", "countdown", "quote"],
    "quote": { "text": "…", "author": "…" },
    "weather": { "city": "Tokyo", "temp": 18, "condition": "partly", "unit": "C" },
    "countdown": { "label": "Concert", "date": "2026-11-28" }
  }
}
```

Weather `condition` is one of `sunny`, `partly`, `cloudy`, `rainy`.

### Adding a built-in pack

1. Add `packs/<id>.json` (the file name must match `id`).
2. Add the id to `packs/index.json`.
3. Run `npm run validate`.

## Project layout

| Path | What it does |
| --- | --- |
| `js/theme.js` | Schema, defaults, validation, seeded RNG (DOM-free, so it is testable in Node) |
| `js/render.js` | Canvas renderers for each wallpaper style, each widget and the home-screen preview |
| `js/zip.js` | Small dependency-free ZIP writer for pack exports |
| `js/app.js` | Gallery, editor, storage, import and export |
| `packs/` | Built-in theme packs |
| `scripts/` | Dev server and pack validator |

### Extending

- **New wallpaper style:** add a function to `WALLPAPERS` in `js/render.js` and
  its name to `WALLPAPER_STYLES` in `js/theme.js`.
- **New widget:** add a function to `WIDGETS` in `js/render.js` (it receives
  `ctx, w, h, theme, date, pad` and should adapt to small, medium and large
  sizes), then add its name to `WIDGET_TYPES`.

## Toward a native app

Exported widget PNGs are snapshots. Clock, calendar, weather and countdown
show the time of export. For live widgets, ship `theme.json` with a native
widget (iOS WidgetKit, Android Glance or App Widgets) and draw with the same
palette, fonts and layout rules as `js/render.js`. The JSON format is designed
to be that shared contract.
