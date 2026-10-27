import { parseProject, resolveTimes } from '@tellcut/engine';
import { strayFindings, strayTimes, videoOnly } from './stray.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const crop = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } };
const clip = (id: string, start: number, end: number, o: object = {}) => ({ id, start, end, source: 'v', in: 0, speed: 1, crop, ...o });
// a 1000 × 1000 film: a panel clip in [0.1, 0.2, 0.8, 0.5] over a blurred full-screen copy, then a full-screen clip; a caption on top
const project = () => parseProject({ version: 1, meta: { name: 't', width: 1000, height: 1000, fps: 30, duration: 6, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 60, kind: 'video' }, ph: { path: 'p.jpg', duration: 3600, kind: 'image' } }, media: {}, grids: [],
  tracks: [
    { id: 'bg', kind: 'video', items: [clip('blur', 0, 3, { defocus: { from: 0, to: 0, px: 30 } })] },
    { id: 'v1', kind: 'video', magnetic: true, items: [clip('pan', 0, 3, { frame: [0.1, 0.2, 0.8, 0.5] }), clip('full', 3, 6)] },
    { id: 'text', kind: 'overlay', items: [{ id: 'cap', type: 'core.caption', start: 0, end: 6, params: { text: '我們的字' } }] },
  ] });

test('the film is read with its own video only: no overlays, no blurred backdrop', () => {
  const q = videoOnly(project());
  expect(q.tracks.map((t) => t.id)).toEqual(['bg', 'v1']);
  expect(q.tracks[0].items).toEqual([]);
  expect(project().tracks).toHaveLength(3);   // the project itself untouched
});

test('sample times: every second, and one frame inside both ends of each clip, within the film', () => {
  const p = project(), at = strayTimes(p, resolveTimes(p));
  // r3c-baking: a subtitle typing on in a clip's last 0.3 s showed "Cre" one frame before the cut and nothing 0.12 s before it;
  // both sides of a cut are read (the text may be on either)
  expect(at).toEqual([{ t: 0.05, edge: true }, { t: 0.5 }, { t: 1.5 }, { t: 2.5 }, { t: 2.95, edge: true }, { t: 3.05, edge: true }, { t: 3.5 }, { t: 4.5 }, { t: 5.5 }, { t: 5.95, edge: true }]);
  expect(strayTimes(p, resolveTimes(p), 4).length).toBeLessThanOrEqual(5);
});

test('text read in a clip: against the frame edge a warning, whole text one note, readable only, the same text once over its span', () => {
  const p = project(), times = resolveTimes(p);
  const read = new Map([
    [0.5, [{ text: 'Raw sug', box: [0.1, 0.4, 0.12, 0.03] as [number, number, number, number] }, { text: 'l', box: [0.5, 0.5, 0.005, 0.005] as [number, number, number, number] }]],
    [1.5, [{ text: 'Raw sug', box: [0.1, 0.4, 0.12, 0.03] as [number, number, number, number] }]],
    [3.5, [{ text: '在家做生魚片', box: [0.3, 0.3, 0.2, 0.04] as [number, number, number, number] }]],
    [4.5, [{ text: '外面', box: [0.05, 0.05, 0.06, 0.02] as [number, number, number, number] }]],
  ]);
  const f = strayFindings(p, times, read);
  expect(f).toHaveLength(2);
  expect(f[0]).toMatchObject({ level: 'warn', t: [0.5, 1.5], ids: ['pan'], msg: expect.stringContaining('「Raw sug」') });
  expect(f[1]).toMatchObject({ level: 'note', ids: ['full'], msg: expect.stringContaining('0:03.5「在家做生魚片」') });
  expect(f[1].msg).toContain('0:04.5「外面」');
});
