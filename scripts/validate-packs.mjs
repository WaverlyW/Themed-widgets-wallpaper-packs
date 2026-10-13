// Check every pack in packs/ against the schema. Exits non-zero on errors.
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateTheme } from '../js/theme.js';

const dir = resolve(import.meta.dirname, '../packs');
const ids = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
let failed = 0;
for (const id of ids) {
  const pack = JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8'));
  const errors = validateTheme(pack);
  if (pack.id !== id) errors.push(`id "${pack.id}" does not match file name "${id}.json"`);
  if (errors.length) {
    failed++;
    console.error(`✗ ${id}\n  ${errors.join('\n  ')}`);
  } else {
    console.log(`✓ ${id}`);
  }
}
process.exit(failed ? 1 : 0);
