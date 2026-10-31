import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupLeftovers } from './cleanup.ts';

test('files left by a crashed server are removed; a live server\'s are kept', () => {
  const root = mkdtempSync(join(tmpdir(), 'clean-')), p = join(root, 'demo');
  mkdirSync(join(p, 'cache', 'media'), { recursive: true });
  mkdirSync(join(p, 'cache', 'analysis', 'abc'), { recursive: true });
  const put = (rel: string, ageMin = 0) => { const f = join(p, rel); writeFileSync(f, 'x'); const t = Date.now() / 1000 - ageMin * 60; utimesSync(f, t, t); return f; };
  const dead = [put('project.json.111.tmp'), put('.export-k1-111.json'), put('cache/index-k1-111.json'), put('cache/media/ab.tmp.jpg', 120), put('cache/analysis/abc/proxy.tmp.mp4', 120)];
  const kept = [put('project.json.222.tmp'), put('.export-k2-222.json'), put('cache/media/cd.tmp.jpg', 5), put('project.json')];
  const removed = cleanupLeftovers(root, { alive: (pid) => pid === 222 });
  expect(removed.length).toBe(5);
  for (const f of dead) expect(existsSync(f)).toBe(false);
  for (const f of kept) expect(existsSync(f)).toBe(true);
});

const project = () => {
  const root = mkdtempSync(join(tmpdir(), 'clean-')), p = join(root, 'demo');
  for (const d of ['exports', 'cache/cuts', 'cache/stills', 'cache/audio']) mkdirSync(join(p, d), { recursive: true });
  const put = (rel: string, ageMin = 0) => { const f = join(p, rel); writeFileSync(f, 'x'); const t = Date.now() / 1000 - ageMin * 60; utimesSync(f, t, t); return f; };
  return { root, put };
};

test('a leftover that cannot be removed (locked) is skipped instead of stopping the server', () => {
  const { root, put } = project();
  put('project.json.111.tmp'); put('.export-k1-111.json');
  const locked = (f: string) => { if (f.endsWith('.tmp')) throw Object.assign(new Error('EPERM: locked'), { code: 'EPERM' }); rmSync(f); };
  expect(cleanupLeftovers(root, { alive: () => false, remove: locked })).toEqual([join('demo', '.export-k1-111.json')]);
});

test('intermediates of an interrupted export and half-cut clips are removed once stale; finished exports stay', () => {
  const { root, put } = project();
  const stale = [put('exports/婚禮-20261013-0110.video.mp4', 120), put('exports/婚禮-20261013-0110.mix.wav', 120),
    put('cache/cuts/a.tmp.mp4', 120), put('cache/stills/b.tmp.jpg', 120), put('cache/audio/c.tmp.wav', 120)];
  const kept = [put('exports/x.video.mp4', 5), put('exports/婚禮-20261013-0110.mp4', 120), put('cache/cuts/a.mp4', 120)];
  cleanupLeftovers(root, { alive: () => true });
  for (const f of stale) expect(existsSync(f)).toBe(false);
  for (const f of kept) expect(existsSync(f)).toBe(true);
});

test('a leftover named after a process id that is alive again (a reused pid) still goes once it is a day old', () => {
  const { root, put } = project();
  const old = put('project.json.333.tmp', 25 * 60), recent = put('.export-k3-333.json', 5);
  cleanupLeftovers(root, { alive: () => true });
  expect([existsSync(old), existsSync(recent)]).toEqual([false, true]);
});

test('home drafts nobody wrote in (a conversation that moved to its project leaves just a note) go once a day old; ones with the user\u2019s words stay', () => {
  const root = mkdtempSync(join(tmpdir(), 'clean-')), home = join(root, '_home');
  mkdirSync(home, { recursive: true });
  const note = { role: 'assistant', text: '這串對話已移到專案…', time: 't', status: 'done' }, said = { role: 'user', text: '剪一支短片', time: 't' };
  const put = (name: string, messages: unknown[], ageH: number) => { const f = join(home, name); writeFileSync(f, JSON.stringify({ sessionId: 's', started: false, messages })); const t = Date.now() / 1000 - ageH * 3600; utimesSync(f, t, t); return f; };
  const moved = put('home-aaaaaaaa.json', [note], 30), old = put('chat.json', [note], 300), fresh = put('home-bbbbbbbb.json', [], 1);
  const talked = put('home-cccccccc.json', [said, note], 300);
  const removed = cleanupLeftovers(root, { alive: () => true });
  expect([existsSync(moved), existsSync(old), existsSync(fresh), existsSync(talked)]).toEqual([false, false, true, true]);
  expect(removed.sort()).toEqual([join('_home', 'chat.json'), join('_home', 'home-aaaaaaaa.json')]);
});

test('a .deleting- folder left by a delete that could not finish (a locked file) is removed at start', () => {
  const root = mkdtempSync(join(tmpdir(), 'clean-')), left = join(root, '.deleting-demo-123-456');
  mkdirSync(join(left, 'exports'), { recursive: true });
  writeFileSync(join(left, 'exports', 'a.mp4'), 'x');
  expect(cleanupLeftovers(root)).toContain('.deleting-demo-123-456');
  expect(existsSync(left)).toBe(false);
});

test('My blocks’ folders set aside by a dead process are removed at start; a live one’s and the entries stay', () => {
  const root = mkdtempSync(join(tmpdir(), 'clean-')), blocks = join(root, '_library', 'blocks');
  for (const n of ['.box.deleting-111-1', '.box.thumb-111-2', '.box.tmp-222-3', 'box']) mkdirSync(join(blocks, n, 'fx'), { recursive: true });
  const removed = cleanupLeftovers(root, { alive: (pid) => pid === 222 });
  expect(removed.sort()).toEqual([join('_library', 'blocks', '.box.deleting-111-1'), join('_library', 'blocks', '.box.thumb-111-2')]);
  expect(readdirSync(blocks).sort()).toEqual(['.box.tmp-222-3', 'box']);
});

test('a gallery music preview a killed composer left half written is removed; one still being written and the finished ones stay', () => {
  const root = mkdtempSync(join(tmpdir(), 'clean-')), g = join(root, '_gallery');
  mkdirSync(g, { recursive: true });
  const put = (name: string) => { writeFileSync(join(g, name), 'x'); return join(g, name); };
  const dead = put('score-lofi-3-d-d.wav.111.tmp'), live = put('score-lofi-4-d-d.wav.222.tmp'), done = put('score-lofi-3-d-d.wav');
  cleanupLeftovers(root, { alive: (pid) => pid === 222 });
  expect([existsSync(dead), existsSync(live), existsSync(done)]).toEqual([false, true, true]);
});

test('a copy of My blocks that nothing in its project names any more is removed at the start once a day old', () => {
  const root = mkdtempSync(join(tmpdir(), 'clean-')), p = join(root, 'demo');
  mkdirSync(join(p, 'fx', 'lib', 'box'), { recursive: true });
  mkdirSync(join(p, 'fx', 'lib', 'used'), { recursive: true });
  writeFileSync(join(p, 'project.json'), JSON.stringify({ meta: { fx: ['fx/lib/used/_entry.js'] } }));
  for (const s of ['box', 'used']) writeFileSync(join(p, 'fx', 'lib', s, '_entry.js'), "export { default } from './box.js';\n");
  writeFileSync(join(p, 'fx', 'lib', 'links.json'), JSON.stringify({ box: { file: 'fx/lib/box/_entry.js', version: '1', types: [] }, used: { file: 'fx/lib/used/_entry.js', version: '1', types: [] } }));
  expect(cleanupLeftovers(root, { alive: () => true })).toEqual([]);
  expect(cleanupLeftovers(root, { alive: () => true, now: Date.now() + 2 * 24 * 3600_000 })).toEqual([join('demo', 'fx', 'lib', 'box')]);
  expect([existsSync(join(p, 'fx', 'lib', 'box')), existsSync(join(p, 'fx', 'lib', 'used'))]).toEqual([false, true]);
});
