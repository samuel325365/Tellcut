import { parseProject, ProjectError, allItems, migrateProject, PROJECT_VERSION } from './schema.ts';

export function minimalProject(): any {
  return {
    version: 1,
    meta: {
      name: 't', width: 1920, height: 1080, fps: 30, duration: 10, plugins: [],
      mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.008, release: 0.25 }, reverb: { seconds: 2.4, send: 0.4 } },
    },
    sources: { s1: { path: 'a.mp4', duration: 20 } },
    media: { m1: { path: 'b.mp3' } },
    grids: [],
    tracks: [
      { id: 'v1', kind: 'video', items: [{ id: 'c1', source: 's1', in: 1, speed: 1, start: 0, end: 2,
        crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } } }] },
      { id: 'mus', kind: 'music', items: [{ id: 'm', media: 'm1', in: 0, start: 0, end: 10, gain: 0, fadeIn: 0, fadeOut: 0 }] },
    ],
  };
}

test('parses a minimal project and applies defaults', () => {
  const p = parseProject(minimalProject());
  const v = p.tracks[0].items[0] as any;
  expect(v.frame).toEqual([0, 0, 1, 1]);
  expect(v.interp).toBe('none');
  expect(p.meta.background).toBe('#000');
  expect(p.meta.cut).toEqual({ crf: 18, preset: 'medium' });
  expect(p.sources.s1.width).toBe(1920);
});

test('rejects items whose end is not after start', () => {
  const j = minimalProject();
  j.tracks[0].items[0].end = 0;
  expect(() => parseProject(j)).toThrow(ProjectError);
  try { parseProject(j); } catch (e) {
    expect((e as ProjectError).issues).toContain('tracks.0.items.0.end: end must be greater than start');
  }
});

test('rejects duplicate ids across tracks', () => {
  const j = minimalProject();
  j.tracks[1].items[0].id = 'c1';
  expect(() => parseProject(j)).toThrow(/duplicate id "c1"/);
});

test('rejects unknown source, media and parent references', () => {
  const j = minimalProject();
  j.tracks[0].items[0].source = 'nope';
  j.tracks[1].items[0].media = 'gone';
  j.tracks[1].items[0].parent = 'ghost';
  try { parseProject(j); throw new Error('should fail'); } catch (e) {
    const issues = (e as ProjectError).issues.join('\n');
    expect(issues).toMatch(/unknown source "nope"/);
    expect(issues).toMatch(/unknown media "gone"/);
    expect(issues).toMatch(/unknown parent "ghost"/);
  }
});

test('rejects an item hung on itself or a loop of parents (the project was saved, then opened nowhere)', () => {
  const self = minimalProject();
  self.tracks[1].items[0].parent = 'm';
  expect(() => parseProject(self)).toThrow(/parent loop: m -> m/);
  const loop = minimalProject();
  loop.tracks[0].items[0].parent = 'm';
  loop.tracks[1].items[0].parent = 'c1';
  expect(() => parseProject(loop)).toThrow(/parent loop: c1 -> m -> c1/);
});

test('allItems walks tracks in order', () => {
  const p = parseProject(minimalProject());
  expect(allItems(p).map((x) => x.item.id)).toEqual(['c1', 'm']);
});

test('rejects an in point at or past the end of its source', () => {
  const p = minimalProject();
  p.tracks[0].items[0].in = 20;
  expect(() => parseProject(p)).toThrow('tracks.0.items.0.in: in (20 s) is past the end of source "s1" (20 s)');
});

test('engine-gap fields are optional and keep old projects unchanged', () => {
  const base = minimalProject();
  const before = JSON.stringify(parseProject(base));
  expect(JSON.stringify(parseProject(JSON.parse(before)))).toBe(before);
  const v = parseProject(base).tracks.find((t) => t.kind === 'video')!.items[0] as any;
  expect(v.radius).toBeUndefined();
  expect(v.shake).toBeUndefined();
  expect(v.stabilize).toBeUndefined();
  expect(v.crop.keys).toBeUndefined();
  expect(parseProject(base).meta.loudness).toBeUndefined();
});

test('engine-gap fields parse with their defaults and bounds', () => {
  const p = minimalProject();
  const v = (p.tracks.find((t: any) => t.kind === 'video') as any).items[0];
  Object.assign(v, {
    radius: 46, stabilize: {}, shake: [{ at: 0.2, dur: 0.4, px: 12 }],
    crop: { ...v.crop, keys: [{ t: 0.5, x: 0.4, y: 0.5, zoom: 1.2 }], ease: 'inOut' },
    defocus: { from: 0, to: 1, px: 2, px0: 16 },
  });
  p.meta.loudness = -16;
  const q = parseProject(p), w = (q.tracks.find((t) => t.kind === 'video') as any).items[0];
  expect(w.stabilize).toEqual({ smoothing: 20, zoom: 3 });
  expect(w.shake[0].hz).toBe(18);
  expect(w.crop.keys[0]).toEqual({ t: 0.5, x: 0.4, y: 0.5, zoom: 1.2 });
  expect(w.defocus.px0).toBe(16);
  expect(q.meta.loudness).toBe(-16);
  expect(() => parseProject({ ...p, meta: { ...p.meta, loudness: -40 } })).toThrow();
  v.crop.ease = 'bounce';
  expect(() => parseProject(p)).toThrow();
});

const magBase = (): any => ({ version: 1, meta: { name: 'm', width: 320, height: 180, fps: 25, duration: 4, plugins: [],
  mix: { master: 0.9, compressor: { threshold: -12, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 0.5, send: 0.3 } } },
  sources: { s: { path: 's.mp4', duration: 9 } }, media: { song: { path: 'song.mp3', duration: 20 } }, grids: [],
  tracks: [{ id: 'v', kind: 'video', magnetic: true, items: [] }, { id: 'v2', kind: 'video', items: [] },
    { id: 'mu', kind: 'music', items: [{ id: 'm', media: 'song', in: 0, start: 0, end: 4, gain: 0, fadeIn: 0, fadeOut: 0, toEnd: true }] }] });

test('a video track can be magnetic, music can end with the film, music files can carry their length', () => {
  const p: any = parseProject(magBase());
  expect([p.tracks[0].magnetic, p.tracks[2].items[0].toEnd, p.media.song.duration]).toEqual([true, true, 20]);
});

test('at most one magnetic track per project', () => {
  const b = magBase(); b.tracks[1].magnetic = true;
  expect(() => parseProject(b)).toThrow(/magnetic/);
});

test('a project from a newer Tellcut says so; an older version goes through the migrations in order (R3-H8)', () => {
  expect(() => parseProject({ ...minimalProject(), version: PROJECT_VERSION + 1 })).toThrow(`版本 ${PROJECT_VERSION + 1}`);
  expect(() => parseProject({ ...minimalProject(), version: 'x' })).toThrow(ProjectError);
  const seen: number[] = [];
  const steps = { 0: (p: any) => { seen.push(0); return { ...p, version: 1, meta: { ...p.meta, name: 'upgraded' } }; } };
  const old = { ...minimalProject(), version: 0 };
  expect(migrateProject(old, steps)).toMatchObject({ version: 1, meta: { name: 'upgraded' } });
  expect(seen).toEqual([0]);
  expect(() => migrateProject({ ...minimalProject(), version: -1 }, steps)).toThrow('版本 -1');
  expect(migrateProject(minimalProject())).toEqual(minimalProject());
});

test('meta.preset is optional; its styles default to none', () => {
  expect(parseProject(minimalProject()).meta.preset).toBeUndefined();
  const p = minimalProject(); p.meta.preset = { id: 'travel' };
  expect(parseProject(p).meta.preset).toEqual({ id: 'travel', styles: [] });
  p.meta.preset = { id: 'custom', fields: { ratio: '9:16', length: '45' } };
  expect(parseProject(p).meta.preset).toEqual({ id: 'custom', styles: [], fields: { ratio: '9:16', length: '45' } });
});
