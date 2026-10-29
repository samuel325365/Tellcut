// The film a saved block is previewed and pictured in (spec 2026-10-29-my-library §3.4, §4.2).
import { parseProject } from '@tellcut/engine';
import type { BlockEntry } from './store.ts';
import { previewProject, serialQueue } from './thumb.ts';

const entry: BlockEntry = { slug: 'chalk', types: [{ type: 'fx.chalk', name: 'Chalk', desc: '' }], main: 'fx/chalk.js', files: ['fx/chalk.js'],
  from: { project: 'p1', file: 'fx/chalk.js' }, savedAt: '2026-10-29T00:00:00.000Z', version: 'abc', theme: { palette: { accent: '#ff0000' } } };

test('a preview is a 3 s portrait film of the one block, loading the entry main module', () => {
  const p = previewProject(entry, 'fx.chalk', 'overlay', { params: { text: 'x' } });
  expect(p.meta).toMatchObject({ width: 1080, height: 1920, duration: 3, fx: ['fx/chalk.js'], theme: { palette: { accent: '#ff0000' } } });
  expect(p.tracks[0]).toMatchObject({ kind: 'overlay', items: [{ type: 'fx.chalk', start: 0, end: 3, params: { text: 'x' } }] });
  expect(() => parseProject(p)).not.toThrow();
});

test('a scene block goes on a scene track; a theme given replaces the saved one', () => {
  const p = previewProject(entry, 'fx.chalk', 'scene', { theme: { palette: { accent: '#00ff00' } } });
  expect(p.tracks[0].kind).toBe('scene');
  expect(p.meta.theme).toEqual({ palette: { accent: '#00ff00' } });
});

test('thumbnails are drawn one at a time; a slug already waiting is not queued twice', async () => {
  const q = serialQueue(), log: string[] = [];
  let running = 0, most = 0;
  const job = (name: string) => async () => { running++; most = Math.max(most, running); log.push(name); await new Promise((r) => setTimeout(r, 10)); running--; return name; };
  const a = q('a', job('a1')), b = q('b', job('b1')), b2 = q('b', job('b2')), c = q('c', async () => { throw new Error('no Chrome'); });
  expect(b2).toBe(b);   // waiting already: the same run
  expect(await Promise.all([a, b])).toEqual(['a1', 'b1']);
  await expect(c).rejects.toThrow('no Chrome');
  expect(await q('a', job('a2'))).toBe('a2');   // a failure does not stop the queue; a slug asked again after its run runs again
  expect([log, most]).toEqual([['a1', 'b1', 'a2'], 1]);
});
