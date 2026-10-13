import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, createZip } from '../js/zip.js';

test('crc32 matches known value', () => {
  assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686);
});

test('createZip produces an archive python can read back', () => {
  const zip = createZip([
    { name: 'pack/theme.json', data: '{"a":1}' },
    { name: 'pack/img.bin', data: new Uint8Array([0, 1, 2, 255]) },
  ]);
  const file = join(mkdtempSync(join(tmpdir(), 'zip-')), 'out.zip');
  writeFileSync(file, zip);
  const out = execFileSync('python3', ['-I', '-c', `
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(z.namelist(), z.read('pack/theme.json').decode(), list(z.read('pack/img.bin')))
`, file]).toString().trim();
  assert.equal(out, "['pack/theme.json', 'pack/img.bin'] {\"a\":1} [0, 1, 2, 255]");
});
