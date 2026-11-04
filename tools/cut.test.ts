import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editedSinceCut } from './cut/cut.ts';

test('npm run cut’s guard: a torn cut-state.json counts as none (no record of the last cut), it does not crash the command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cutguard-')), text = '{"meta":{}}';
  mkdirSync(join(dir, 'cache'));
  writeFileSync(join(dir, 'project.json'), text);
  writeFileSync(join(dir, 'cache', 'cut-state.json'), JSON.stringify({ hash: createHash('sha1').update(text).digest('hex') }));
  expect(editedSinceCut(dir)).toBe(false);
  writeFileSync(join(dir, 'project.json'), '{"meta":{"name":"edited"}}');
  expect(editedSinceCut(dir)).toBe(true);
  writeFileSync(join(dir, 'cache', 'cut-state.json'), '{"hash": "3f');
  expect(editedSinceCut(dir)).toBe(false);
});

test('npm run cut’s guard with no record of the last cut (copied without cache/, cache cleared): a timeline with anything on it counts as edited', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cutguard-'));
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ meta: {}, tracks: [{ id: 'v1', kind: 'video', items: [] }] }));
  expect(editedSinceCut(dir)).toBe(false);   // fresh from npm run new: nothing cut yet
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ meta: {}, tracks: [{ id: 'v1', kind: 'video', items: [{ id: 'clip' }] }] }));
  expect(editedSinceCut(dir)).toBe(true);
  mkdirSync(join(dir, 'cache'));
  writeFileSync(join(dir, 'cache', 'cut-state.json'), '{"hash": "3f');   // torn: no record either
  expect(editedSinceCut(dir)).toBe(true);
});
