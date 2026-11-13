import { addItem, deleteItems, findItem, parseProject, settle, trimEnd, type Project } from '@tellcut/engine';
import { materialItem } from './materials.ts';
import { dropRecipe, placeImported } from '../timeline/drop.ts';

const MIX = { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } };
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const clip = (id: string, start: number, end: number, inp: number) => ({ id, source: 's', in: inp, speed: 1, start, end, crop });
/** a 12 s film of three 4 s clips, an empty music track and a 20 s song */
function film(magnetic: boolean): Project {
  return parseProject({ version: 1, meta: { name: 'm', width: 320, height: 180, fps: 25, duration: 12, plugins: [], mix: MIX },
    sources: { s: { path: 's.mp4', duration: 60 } }, media: { song: { path: 'song.mp3', duration: 20 } }, grids: [],
    tracks: [
      { id: 'v', kind: 'video', ...(magnetic ? { magnetic: true } : {}), items: [clip('c1', 0, 4, 0), clip('c2', 4, 8, 10), clip('c3', 8, 12, 20)] },
      { id: 'mu', kind: 'music', items: [] },
    ] });
}
const CTX = { peaks: {}, beats: {} };
/** one edit and the magnetic rules after it, as the editor's history runs it */
const go = (p: Project, edit: (d: Project) => void) => { const d = structuredClone(p); edit(d); settle(p, d); return d; };
/** the library's add at `t`: the item cut at the end of the film (editing.ts fitEnd), then its `also` */
function addSong(p: Project, t: number, len: number) {
  let id = '';
  const x = materialItem(p, { kind: 'music', media: 'song', len }, t, CTX);
  const d = go(p, (d) => { id = addItem(d, { track: 'mu', item: { ...x.item, end: Math.min(x.item.end as number, p.meta.duration) } }); x.also?.(d, id); });
  return { d, id };
}
const song = (p: Project, id: string): any => findItem(p, id).item;

test('music added to a magnetic film that reaches its end ends with the film: shorter clips shorten the film and the music', () => {
  const { d, id } = addSong(film(true), 0, 20);           // cut at 12 to fit
  expect(song(d, id)).toMatchObject({ toEnd: true, start: 0, end: 12 });
  expect(song(d, id).parent).toBeUndefined();               // it hangs on no clip
  const shorter = go(go(d, (x) => trimEnd(x, { id: 'c3', dt: -3 })), (x) => deleteItems(x, { ids: ['c2'] }));
  expect([shorter.meta.duration, song(shorter, id).end]).toEqual([5, 5]);
  // music that ends exactly at the end counts too
  const exact = addSong(film(true), 2, 10);
  expect(song(exact.d, exact.id).toEnd).toBe(true);
});

test('music that stops before the end of the film, or on a film with no magnetic track, stays a plain item', () => {
  const short = addSong(film(true), 0, 5);
  expect(song(short.d, short.id).toEnd).toBeUndefined();
  const plain = addSong(film(false), 0, 20);
  expect(song(plain.d, plain.id).toEnd).toBeUndefined();
});

test('a song dragged from the library or dropped as a file onto a magnetic film ends with it too', () => {
  const p = film(true), x = materialItem(p, { kind: 'music', media: 'song', len: 20 }, 0, CTX);
  let id = '';
  const dropped = go(p, (d) => { id = dropRecipe({ ok: true, track: 'mu', start: 3, end: 12 }, 'music', x.item, x.also)(d); });
  expect(song(dropped, id)).toMatchObject({ toEnd: true, start: 3 });
  const imported = go(p, (d) => { placeImported(d, ['song'], { t: 1, row: 'mu' }, { ...CTX, locked: new Set(), lengths: { song: 20 } }); });
  expect((imported.tracks.find((t) => t.id === 'mu')!.items as any[])[0]).toMatchObject({ toEnd: true, start: 1, end: 12 });
});
