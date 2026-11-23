import { blockPreviewProject, BLOCK_PREVIEW_LEN, COMBO_PREVIEW_LEAD, COMBO_PREVIEW_TAIL, comboPreviewProject, PREVIEW_BG, PREVIEW_GROUND } from './preview.ts';
import { parseProject, type VideoItem } from './schema.ts';
import { resolveTimes } from './time.ts';
import type { ComboPlacement } from './combos.ts';

test('a block alone: one track of it over the plain ground, no sources', () => {
  const p = blockPreviewProject({ type: 'common.slam', kind: 'overlay', plugins: ['common'], params: { text: 'x' } });
  expect(p.sources).toEqual({});
  expect(p.tracks).toEqual([{ id: 'g', kind: 'overlay', items: [{ id: 'block', type: 'common.slam', start: 0, end: BLOCK_PREVIEW_LEN, params: { text: 'x' } }] }]);
  expect(() => parseProject(p)).not.toThrow();
});

test('the card\'s ground and shape: a background string and a wide or square film; none given, the plain tall one', () => {
  const p = blockPreviewProject({ type: 'common.doodle', kind: 'overlay', plugins: ['common'], background: 'repeating-linear-gradient(90deg, #fff 0px, #000 9px)' });
  expect(p.meta).toMatchObject({ width: 1080, height: 1920, background: 'repeating-linear-gradient(90deg, #fff 0px, #000 9px)' });
  expect(parseProject(p).meta.background).toBe('repeating-linear-gradient(90deg, #fff 0px, #000 9px)');
  expect(blockPreviewProject({ type: 'common.film', kind: 'overlay', plugins: ['common'], aspect: 'wide', ground: true }).meta).toMatchObject({ width: 1920, height: 1080, background: PREVIEW_BG });
  expect(blockPreviewProject({ type: 'common.masthead', kind: 'overlay', plugins: ['common'], aspect: 'square' }).meta).toMatchObject({ width: 1080, height: 1080 });
  expect(blockPreviewProject({ type: 'common.slam', kind: 'overlay', plugins: ['common'], background: '' }).meta.background).toBe(PREVIEW_BG);
});

test('with a ground, the gallery street plays on a video track under the block for the whole film', () => {
  const p = blockPreviewProject({ type: 'common.grade', kind: 'overlay', plugins: ['common'], ground: true, theme: { palette: { accent: '#ff0000' } } });
  // the photo source the gallery player asks the server for (/api/projects/_gallery/media/image/street), full frame
  expect(p.sources).toEqual({ [PREVIEW_GROUND]: expect.objectContaining({ kind: 'image', width: 1080, height: 1920, duration: BLOCK_PREVIEW_LEN }) });
  expect(p.tracks.map((t) => t.kind)).toEqual(['video', 'overlay']);
  expect(p.tracks[0].items).toEqual([expect.objectContaining({ source: PREVIEW_GROUND, start: 0, end: BLOCK_PREVIEW_LEN, in: 0, speed: 1 })]);
  expect(p.tracks[1].items[0]).toMatchObject({ type: 'common.grade', start: 0, end: BLOCK_PREVIEW_LEN });
  // the rest is the plain film's: the theme, the size, the length
  expect(p.meta).toMatchObject({ width: 1080, height: 1920, duration: BLOCK_PREVIEW_LEN, theme: { palette: { accent: '#ff0000' } } });
  const parsed = parseProject(p);
  expect(parsed.sources[PREVIEW_GROUND].kind).toBe('image');
});

test('stand: each source a sample reads a picture from is the gallery street, a photo source on no track, with or without the ground', () => {
  const p = blockPreviewProject({ type: 'common.magazine', kind: 'overlay', plugins: ['common'], params: { cells: 'pic|0' }, stand: ['pic', 'pic', 'cover'] });
  const still = { path: `${PREVIEW_GROUND}.png`, duration: BLOCK_PREVIEW_LEN, width: 1080, height: 1920, kind: 'image' };
  expect(p.sources).toEqual({ pic: still, cover: still });
  expect(p.tracks.map((t) => t.kind)).toEqual(['overlay']);
  expect(parseProject(p).sources.pic.kind).toBe('image');
  // over the street: the ground's source and the stand-ins together, the ground alone on the video track
  const q = blockPreviewProject({ type: 'common.camcorder', kind: 'overlay', plugins: ['common'], ground: true, stand: ['pic'] });
  expect(Object.keys(q.sources).sort()).toEqual(['pic', PREVIEW_GROUND].sort());
  expect(q.tracks[0].items).toEqual([expect.objectContaining({ source: PREVIEW_GROUND })]);
  // none given, or an empty list: no sources
  expect(blockPreviewProject({ type: 'common.slam', kind: 'overlay', plugins: ['common'], stand: [] }).sources).toEqual({});
});

test('a combo on the street: the moment after the earliest layer\'s lead, placed as Add to timeline places it', () => {
  const layers: ComboPlacement[] = [
    { name: 'rise', kind: 'sfx', type: 'x.riser', at: -0.8, len: 0.8, params: {}, gain: -10 },
    { name: 'glow', kind: 'effect', type: 'x.glow', at: -0.1, len: 1.2, params: { a: 1 } },
    { name: 'lid', kind: 'effect', type: 'x.lid', at: 0, len: 0.5, params: {}, layer: 'top' },
    { name: 'floor', kind: 'effect', type: 'x.floor', at: 0, len: 0.5, params: {}, layer: 'under' },
    { name: 'shake', kind: 'shake', at: 0, len: 1.6, params: {}, px: 28 },
  ];
  const p = comboPreviewProject({ layers, plugins: ['x'], name: 'combo:t' });
  const moment = COMBO_PREVIEW_LEAD + 0.8;
  // the film: the street the whole length, ending a moment after the last layer (the shake, here)
  expect(p.meta.duration).toBeCloseTo(moment + 1.6 + COMBO_PREVIEW_TAIL, 6);
  const ground = p.tracks.find((t) => t.id === 'v')!.items[0] as VideoItem;
  expect(ground).toMatchObject({ source: PREVIEW_GROUND, start: 0, end: p.meta.duration });
  expect(p.sources[PREVIEW_GROUND].duration).toBe(p.meta.duration);
  expect(ground.shake).toEqual([{ at: +moment.toFixed(6), dur: 1.6, px: 28, hz: 18 }]);
  // every layer on its kind of track, at the moment plus its offset, hung on the street
  // `at`: the track's place in the stack (later: drawn above)
  const times = resolveTimes(p), typeOf = (i: unknown) => (i as { type?: string }).type;
  const where = (type: string) => {
    const tr = p.tracks.find((t) => (t.items as unknown[]).some((i) => typeOf(i) === type))!, it = (tr.items as Array<{ id: string }>).find((i) => typeOf(i) === type)!;
    return { kind: tr.kind, at: p.tracks.indexOf(tr), start: times.get(it.id)!.start, parent: (it as { parent?: string }).parent };
  };
  expect(where('x.riser')).toMatchObject({ kind: 'sfx', start: COMBO_PREVIEW_LEAD, parent: 'ground' });
  expect(where('x.glow')).toMatchObject({ kind: 'overlay', parent: 'ground' });
  expect(where('x.glow').start).toBeCloseTo(moment - 0.1, 6);
  expect(where('x.floor').kind).toBe('scene');
  expect(where('x.floor').at).toBeLessThan(p.tracks.findIndex((t) => t.id === 'v'));
  expect(where('x.lid').at).toBeGreaterThan(where('x.glow').at);
});

test('an ending combo ends the film with its last picture layer, as it would end a real one', () => {
  const layers: ComboPlacement[] = [
    { name: 'door', kind: 'effect', type: 'x.door', at: 0, len: 2.4, params: {} },
    { name: 'clunk', kind: 'sfx', type: 'x.clunk', at: 1, len: 0.16, params: {} },
  ];
  expect(comboPreviewProject({ layers, plugins: ['x'], ending: true }).meta.duration).toBeCloseTo(COMBO_PREVIEW_LEAD + 2.4, 6);
  expect(comboPreviewProject({ layers, plugins: ['x'] }).meta.duration).toBeCloseTo(COMBO_PREVIEW_LEAD + 2.4 + COMBO_PREVIEW_TAIL, 6);
});