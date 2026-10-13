import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_THEME, mulberry32, normalizeTheme, slugify, validateTheme } from '../js/theme.js';

test('normalizeTheme fills missing fields without mutating defaults', () => {
  const t = normalizeTheme({ id: 'x', name: 'X', palette: { accent: '#ff0000' } });
  assert.equal(t.palette.accent, '#ff0000');
  assert.equal(t.palette.surface, DEFAULT_THEME.palette.surface);
  assert.deepEqual(t.widgets.include, DEFAULT_THEME.widgets.include);
  t.widgets.include.pop();
  assert.equal(DEFAULT_THEME.widgets.include.length, 5);
});

test('arrays replace rather than merge', () => {
  const t = normalizeTheme({ palette: { background: ['#000000'] } });
  assert.deepEqual(t.palette.background, ['#000000']);
});

test('default theme is valid', () => {
  assert.deepEqual(validateTheme(DEFAULT_THEME), []);
});

test('validateTheme reports bad fields', () => {
  const errors = validateTheme({
    id: 'Bad Id',
    palette: { background: ['red'], accent: '#12' },
    wallpaper: { style: 'plaid' },
    widgets: { include: ['clock', 'stocks'], countdown: { date: 'soon' } },
  });
  const joined = errors.join('\n');
  for (const needle of ['id must', 'background[0]', 'palette.accent', 'wallpaper.style', 'widgets.include', 'countdown.date']) {
    assert.match(joined, new RegExp(needle.replace(/[.[\]]/g, '\\$&')));
  }
  assert.deepEqual(validateTheme(null), ['Theme must be a JSON object.']);
});

test('mulberry32 is deterministic', () => {
  const a = mulberry32(5);
  const b = mulberry32(5);
  const seq = [a(), a(), a()];
  assert.deepEqual(seq, [b(), b(), b()]);
  assert.ok(seq.every((v) => v >= 0 && v < 1));
});

test('slugify', () => {
  assert.equal(slugify('  Neon Night!! '), 'neon-night');
  assert.equal(slugify('***'), 'pack');
});

test('all bundled packs are valid', async () => {
  const ids = JSON.parse(await readFile(new URL('../packs/index.json', import.meta.url), 'utf8'));
  for (const id of ids) {
    const pack = JSON.parse(await readFile(new URL(`../packs/${id}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(validateTheme(pack), [], id);
    assert.equal(pack.id, id);
  }
});
