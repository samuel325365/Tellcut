// The Cut API: re-running a cut and saving it (length, magnetic main track, what hangs on clips, edits made since).
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTimes, runOps, settle } from '@tellcut/engine';
import { Cut, editedSinceCut } from './cut.ts';
import { base, inv, fresh, items } from './cut-test-kit.ts';

test('a re-run starts from what the script sets: an old theme, fx list and unused generated narration/music are gone; imported music stays', async () => {
  const make = () => {
    const dir = mkdtempSync(join(tmpdir(), 'cut-')), p = base();
    p.meta.theme = { palette: { accent: '#ff0000' } } as any;
    p.meta.fx = ['fx/old.js'];
    p.media['voice-s1'] = { path: 'media/voice/s1.wav', duration: 3 } as any;
    p.media['score-lofi'] = { path: 'media/score-lofi.wav', duration: 30 } as any;
    return new Cut(p, inv(dir), dir);
  };
  const c = make();
  expect([c.p.meta.theme, c.p.meta.fx]).toEqual([undefined, undefined]);
  c.clip('v', { from: 0, len: 2 });
  expect(Object.keys((await c.save()).media)).toEqual(['song']);
  // a score made by npm run score and used through c.music() stays
  const d = make();
  d.clip('v', { from: 0, len: 2 });
  d.music('score-lofi');
  expect(Object.keys((await d.save()).media).sort()).toEqual(['score-lofi', 'song']);
});

test('save: the length follows the edit, music fades at the end, a beat grid, a valid file with history; edits since are noticed', async () => {
  const c = fresh();
  writeFileSync(join(c.dir, 'project.json'), JSON.stringify(base()));
  c.music('song', { fadeOut: 2 });
  c.clip('v', { from: 0, len: 6 });
  const p = await c.save();
  expect(p.meta.duration).toBe(6);
  expect((p.tracks.find((t) => t.id === 'music')!.items as any[]).map((i) => [i.media, i.start, i.end, i.fadeOut])).toEqual([['song', 0, 6, 2]]);
  expect(p.grids).toEqual([{ id: 'music', at: 0.25, bpm: 120 }]);
  expect(JSON.parse(readFileSync(join(c.dir, 'project.json'), 'utf8')).meta.duration).toBe(6);
  expect(readdirSync(join(c.dir, '.history')).some((f) => f.endsWith('_cut.json'))).toBe(true);
  expect(editedSinceCut(c.dir)).toBe(false);
  writeFileSync(join(c.dir, 'project.json'), JSON.stringify({ ...p, meta: { ...p.meta, name: 'edited' } }));
  expect(editedSinceCut(c.dir)).toBe(true);
  expect(existsSync(join(c.dir, 'cache', 'cut-state.json'))).toBe(true);
});

test('save: an edit saved while the cut ran (transcribing, scoring) is not written over; --force writes anyway', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cut-'));
  writeFileSync(join(dir, 'project.json'), JSON.stringify(base()));
  const c = await Cut.open(dir);
  const edited = JSON.stringify({ ...base(), meta: { ...base().meta, name: 'edited in the editor' } });
  writeFileSync(join(dir, 'project.json'), edited);
  await expect(c.save()).rejects.toThrow(/--force/);
  expect(readFileSync(join(dir, 'project.json'), 'utf8')).toBe(edited);
  expect(existsSync(join(dir, 'cache', 'cut-state.json'))).toBe(false);
  const forced = await Cut.open(dir, { force: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify(base()));
  await forced.save();
  expect(editedSinceCut(dir)).toBe(false);
  const again = await Cut.open(dir);   // unchanged since open: no complaint
  await again.save();
});

test('a first cut has a magnetic main track and music that ends with the film', async () => {
  const c = fresh();
  c.music('song');
  c.clip('v', { from: 0, len: 2 });
  c.clip('v', { from: 5, len: 2 });
  const p = await c.save();
  expect((p.tracks.find((t) => t.id === 'v1') as any).magnetic).toBe(true);
  expect((p.tracks.find((t) => t.id === 'music')!.items[0] as any).toEnd).toBe(true);
  expect(p.media.song.duration).toBe(30);   // inv(): the song is 30 s
  expect(items(c, 'v1').map((i) => [i.start, i.end])).toEqual([[0, 2], [2, 4]]);
});

test('a cut that leaves gaps on the main track saves it as not magnetic, so the first edit in the editor moves nothing', async () => {
  // a brand film's way: 3D overlays sit over a gap in the main track, the logo after the last clip
  const c = fresh();
  c.clip('v', { from: 0, len: 2 });
  c.at(5);
  c.clip('v', { from: 5, len: 2 });
  c.effect('common.headline', { at: 2, len: 3, text: 'over the gap' });
  c.sfx('common.impact', { at: 8, len: 1 });
  const p = await c.save();
  expect((p.tracks.find((t) => t.id === 'v1') as any).magnetic).toBeUndefined();
  expect(c.notes.join('\n')).toMatch(/主軌有 1 個空檔/);
  // the editor runs settle after every command: a volume change must leave every item where it was
  const after = structuredClone(p), sfx = after.tracks.find((t) => t.id === 'sfx')!.items[0] as any;
  sfx.gain = -20;
  settle(p, after);
  const at = (q: typeof p) => q.tracks.flatMap((t) => (t.items as any[]).map((i) => [i.id, i.start, i.end]));
  expect(at(after)).toEqual(at(p));
});

test('save hangs what lies within one clip on that clip, so a trim or ripple delete in the editor carries it; what spans a cut stays put', async () => {
  const c = fresh();
  c.music('song');
  c.panel();
  const [a, b, d] = [0, 3, 6].map((from) => c.clip('v', { from, len: 2 }));             // 0–2, 2–4, 4–6
  const card = c.effect('common.slam', { at: 2.5, len: 1, text: 'on b' });
  const ding = c.sfx('common.pop', { at: 2.6, len: 0.3 });
  const flash = c.effect('core.flash', { at: 4, len: 0.3, layer: 'top' });
  const bg = c.effect('common.ambient', { at: 4, len: 2 });
  const across = c.effect('common.slam', { at: 1, len: 2, text: 'over the cut' });
  const grain = c.effect('common.film', { at: 0, len: 6, layer: 'top' });
  const whoosh = c.sfx('common.whoosh', { at: 1.8, len: 0.5 });
  c.update(card, { end: 3.6 });                                                           // the script works in film seconds
  const p = await c.save(), byId = (q: typeof p, id: string) => q.tracks.flatMap((t) => t.items as any[]).find((i) => i.id === id);
  expect([card, ding, flash, bg].map((id) => byId(p, id).parent)).toEqual([b, b, d, d]);
  expect([byId(p, card).start, byId(p, card).end, byId(p, ding).start]).toEqual([0.5, 1.6, 0.6]);
  expect([across, grain, whoosh].map((id) => byId(p, id).parent)).toEqual([undefined, undefined, undefined]);
  expect(p.tracks.filter((t) => t.id === 'bg' || t.id === 'panel').flatMap((t) => t.items as any[]).every((i) => i.parent === undefined)).toBe(true);
  // the editor: ripple-delete the first clip, trim the head of the second; its card and sound stay on its picture
  const after = structuredClone(p);
  runOps(after, [{ op: 'rippleDelete', ids: [a] }, { op: 'trimStart', id: b, dt: 0.2 }]);
  const at = resolveTimes(after);
  expect([card, ding, flash].map((id) => +at.get(id)!.start.toFixed(3))).toEqual([0.3, 0.4, 1.8]);
  expect(at.get(across)!.start).toBe(1);                                                  // across the cut: where it was
});
