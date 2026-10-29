import type { Plugin } from '@tellcut/engine';
import { readFileSync } from 'node:fs';
import { BLOCK_CATEGORY, handleOf } from '@tellcut/protocol';
import { findBlocks, formatCatalog, formatFind, formatIndex, formatLookup, formatType } from './catalog.ts';
import { GUIDE_FILE, withIndex } from './blocks-index.ts';
import { plugins } from '@tellcut/plugins';

const fake: Plugin[] = [
  { id: 'core', items: [
    { type: 'core.title', label: '片名', kind: 'overlay', doc: '大標題，可加副標', build: () => null, draw: () => {},
      params: [{ key: 'size', label: '字級', type: 'number', min: 1, max: 30, step: 0.5, default: 8 }, { key: 'animIn', label: '進場', type: 'enum', options: ['fade', 'rise'], default: 'rise' }] },
  ] },
  { id: 'wedding', items: [
    { type: 'wedding.petals', label: '花瓣', kind: 'overlay', build: () => null, draw: () => {}, params: [{ key: 'color', label: '顏色', type: 'color', default: '#fff' }] },
  ], sfx: [{ type: 'wedding.chime', label: '鈴聲', params: [], duration: () => 1, synth: () => {} }], grades: { warm: 'sepia(0.2)', soft: 'blur(0)' } },
];

test('the catalog: one line per block, grouped by plugin with core first; doc when there is one, else the label', () => {
  const s = formatCatalog(fake);
  const lines = s.split('\n');
  expect(lines[0]).toContain('core');
  expect(s).toMatch(/core\.title +片名 — 大標題，可加副標/);
  expect(s).toMatch(/wedding\.petals +花瓣/);
  expect(s).toMatch(/音效[\s\S]*wedding\.chime +鈴聲/);
  expect(s).toMatch(/調色[\s\S]*wedding：warm、soft/);
  expect(lines.at(-1)).toContain('catalog <類型或代號>');
});

test('one block: each param with its type, default and range or options', () => {
  const s = formatType(fake, 'core.title');
  expect(s).toContain('core.title 片名 — 大標題，可加副標');
  expect(s).toContain('size（字級）：數字，預設 8，範圍 1–30');
  expect(s).toContain('animIn（進場）：選項 fade / rise，預設 rise');
  expect(formatType(fake, 'wedding.petals')).toContain('color（顏色）：顏色，預設 #fff');
});

test('an unknown block names the closest ones', () => {
  expect(() => formatType(fake, 'core.titel')).toThrow(/找不到 core\.titel.*core\.title/);
});

test('every registered block is listed and every core block has a doc', () => {
  const s = formatCatalog(plugins);
  for (const p of plugins) for (const it of p.items ?? []) expect(s).toContain(it.type);
  for (const it of plugins.find((p) => p.id === 'core')!.items!) expect(it.doc, it.type).toBeTruthy();
});

test('shared blocks are grouped by category in the catalog; every common block has a known one', () => {
  const s = formatCatalog(plugins);
  expect(s.indexOf(' 字幕與大字：')).toBeGreaterThan(0);
  expect(s.indexOf(' 字幕與大字：')).toBeLessThan(s.indexOf('common.caption'));
  for (const it of plugins.find((p) => p.id === 'common')!.items!) expect(Object.keys(BLOCK_CATEGORY), it.type).toContain(it.category);
  // a plugin without categories stays one list
  expect(formatCatalog(fake)).not.toContain('其他');
});

test('find: every word in the type, label, doc or a param (options too), sound effects included', () => {
  const types = (q: string) => findBlocks(plugins, q).map((t) => t.type);
  expect(types('路線')).toEqual(expect.arrayContaining(['common.route', 'common.routeboard', 'common.mapjump']));
  expect(types('收據 印')).toEqual(expect.arrayContaining(['common.printer', 'common.print']));
  expect(types('收據 印')).not.toContain('common.list');
  expect(types('PENCIL')).toContain('common.progress');   // an enum option, any case
  expect(types('  ')).toEqual([]);
  expect(formatFind(plugins, 'zzzz')).toContain('找不到');
});

test("the block index: one line per category with the short names, then the sound effects; guides/workflow.md carries the current one", () => {
  const idx = formatIndex(plugins);
  expect(idx.split('\n')[0]).toMatch(/^- Captions and big text \(TXT\): .*\d\d `caption`/);   // the prefix once, then number and name
  expect(idx).toMatch(/^- Sound effects \(`c\.sfx`; a sound file the project made itself goes in with `c\.sfxFile`\):$/m);
  expect(idx).toMatch(/^ {2}- Alerts, right and wrong, alarms \(SFX-ALR\): .*`beep`/m);    // the sounds by category, one line each
  expect(idx).toMatch(/^ {2}- Chimes, rewards and melodies \(SFX-CHM\): .*`ding`.*`chime`/m);
  expect(idx).toContain(`${handleOf('common.stamp')!.slice(4)} \`stamp\``);
  for (const s of plugins.find((p) => p.id === 'common')!.sfx!) expect(idx).toContain('`' + s.type.slice(7) + '`');
  expect(idx).not.toContain('common.');
  // every block but the ones used only when asked for (onRequest: the dachshund), which the agent is not offered here
  for (const it of plugins.find((p) => p.id === 'common')!.items!) {
    if (it.onRequest) expect(idx).not.toContain('`' + it.type.slice(7) + '`');
    else expect(idx).toContain('`' + it.type.slice(7) + '`');
  }
  const prompt = readFileSync(GUIDE_FILE, 'utf8');
  expect(withIndex(prompt), 'guides/workflow.md 的積木索引過期了：npm run blocks:index').toBe(prompt);
  expect(() => withIndex('no marks')).toThrow(/標記/);
});

test('handles: every catalog line of a shared block starts with its handle, and a handle (any case) is looked up like a type', async () => {
  const s = formatCatalog(plugins);
  expect(s).toMatch(/^ {2}MRK-03 +common\.stamp +印章/m);
  expect(s).toMatch(/^ {2}CLP-01 +鏡頭晃動：c\.shake\(/m);       // clip effects carry theirs too
  expect(await formatLookup(plugins, 'mrk3')).toMatch(/^MRK-03 common\.stamp 印章[\s\S]*shape（/);
  expect(await formatLookup(plugins, 'common.stamp')).toMatch(/^MRK-03 common\.stamp/);
  expect(await formatLookup(plugins, 'sfx-hit-1')).toMatch(/^SFX-HIT-01 common\.impact/);
  expect(await formatLookup(plugins, 'MUS-01')).toMatch(/^MUS-01 pluck .*配樂風格[\s\S]*c\.score\('pluck'/);
  expect(await formatLookup(plugins, 'rcp-1')).toMatch(/^RCP-01 travel[\s\S]*c\.recipe\('travel'/);
  expect(await formatLookup(plugins, 'CLP-03')).toMatch(/avoidBurned: true/);
  await expect(formatLookup(plugins, 'ZZZ-01')).rejects.toThrow(/沒有 ZZZ-01 這個代號/);
  expect(findBlocks(plugins, 'Mrk-03').map((t) => t.type)).toEqual(['common.stamp']);
});

test('a block marked onRequest is listed apart in the catalog and left out of the chat index', () => {
  const dog = { type: 'common.fakeDog', label: '假狗', kind: 'overlay', category: 'moment', onRequest: true, params: [], build: () => null, draw: () => {} };
  const badge = { type: 'common.fakeBadge', label: '假徽章', kind: 'overlay', category: 'moment', params: [], build: () => null, draw: () => {} };
  const ps = [{ id: 'common', items: [dog, badge] }] as unknown as Plugin[];
  const text = formatCatalog(ps);
  expect(text).toMatch(/只在使用者指名時用[\s\S]*common\.fakeDog/);
  expect(text.indexOf('common.fakeDog')).toBeGreaterThan(text.indexOf('common.fakeBadge'));
  expect(formatIndex(ps)).toContain('`fakeBadge`');
  expect(formatIndex(ps)).not.toContain('fakeDog');
  expect(findBlocks(ps, '假狗').map((t) => t.type)).toEqual(['common.fakeDog']);
});
