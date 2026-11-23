import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { createRegistry, expandCombo } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { combos } from '@tellcut/plugin-common';
import { makeProjects, startApp } from './test-utils.ts';

test('the gallery lists every block (core and common first), the sounds, the music styles and the recipes', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const g = await (await fetch(`${base}/api/gallery`)).json();
    expect(g.blocks[0].plugin).toBe('core');
    const slam = g.blocks.find((b: any) => b.type === 'common.slam');
    expect(slam).toMatchObject({ plugin: 'common', label: '爆字', kind: 'overlay', needsMedia: false });
    expect(slam.doc.length).toBeGreaterThan(5);
    expect(slam.params.find((p: any) => p.key === 'color')).toMatchObject({ type: 'color', theme: 'palette.paper' });
    expect([...new Set(g.blocks.map((b: any) => b.plugin))]).toEqual(['core', 'common']);   // the sample films' plugins are gone
    // the old frames are not offered: the 3D desk took their place (older projects still open them)
    const types = g.blocks.map((b: any) => b.type);
    expect(types).toContain('common.flatlay');
    expect(types).not.toContain('common.postcard');
    expect(types).not.toContain('common.frame');
    // nor the core lower third and end card (a heading template and the outro do the same) or the wash (common.grade's deep)
    for (const old of ['core.lowerThird', 'core.endCard', 'common.wash']) expect(types).not.toContain(old);
    expect(types).toEqual(expect.arrayContaining(['common.heading', 'common.outro', 'common.grade']));
    const media = (type: string) => g.blocks.find((b: any) => b.type === type).needsMedia;
    expect([media('common.backdrop'), media('core.title')]).toEqual([false, false]);
    // a media() hook marks a block, unless it says its footage is optional (the dachshund's film frames are empty without any)
    expect([media('common.dachshund'), media('common.card')]).toEqual([false, true]);
    expect(g.sfx.map((s: any) => s.type)).toEqual(expect.arrayContaining(['common.beep', 'common.whoosh']));
    expect(g.styles.filter((s: any) => s.origin === 'built-in').map((s: any) => s.id)).toEqual(['pluck', 'lofi', 'cinematic', 'tech', 'playful']);
    expect(g.recipes.map((r: any) => r.id)).toEqual(['travel', 'hook', 'montage']);
    expect(g.recipes[0].example.scenes.length).toBeGreaterThan(0);
    // a block's templates, each with the golden picture of its sample <block>-tpl-<id> (common.leak's are drawn over the street: below)
    const leak = g.blocks.find((b: any) => b.type === 'common.leak'), lines = g.blocks.find((b: any) => b.type === 'common.speedlines');
    expect(lines.templates.slice(0, 2).map((x: any) => [x.id, x.thumb])).toEqual([['manga-focus', '/api/gallery/thumb/speedlines-tpl-manga-focus-t1.50.png'], ['rush-right', '/api/gallery/thumb/speedlines-tpl-rush-right-t1.50.png']]);
    for (const x of lines.templates) expect(x.thumb, x.id).toMatch(new RegExp(`^/api/gallery/thumb/speedlines-tpl-${x.id}-t\\d+\\.\\d\\d\\.png$`));
    expect(leak.templates.length).toBeGreaterThan(2);
    expect(leak.templates[0]).toMatchObject({ label: '彩虹光帶橫掃', params: { look: 'prism' } });
    expect(leak.templates[0].doc.length).toBeGreaterThan(5);
    expect(slam.templates).toBeUndefined();
    expect((await fetch(base + leak.templates[0].thumb)).status).toBe(200);
  } finally { await app.close(); }
});

test('a block that works on the picture under it says so, and its cards are drawn over the street unless they already are', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const g = await (await fetch(`${base}/api/gallery`)).json(), block = (type: string) => g.blocks.find((b: any) => b.type === type);
    const over = g.blocks.filter((b: any) => b.over).map((b: any) => b.type);
    expect(over).toEqual(expect.arrayContaining(['core.flash', 'common.grade', 'common.glitch', 'common.lens', 'common.panel', 'common.letterbox']));
    for (const t of ['common.slam', 'common.grid', 'common.flatlay', 'common.magazine']) expect(block(t).over, t).toBeUndefined();
    // every block of the look category (the grades and textures laid over the video) is one
    expect(g.blocks.filter((b: any) => b.category === 'look' && !b.over).map((b: any) => b.type)).toEqual([]);
    // the card and each template's: the sample's street sibling, or the sample itself when it is over the street already
    expect(block('common.glitch').thumb).toBe('/api/gallery/thumb/glitch-street-t0.20.png');
    for (const x of block('common.glitch').templates) expect(x.thumb, x.id).toMatch(new RegExp(`^/api/gallery/thumb/glitch-tpl-${x.id}-street-t\\d+\\.\\d\\d\\.png$`));
    expect(block('common.grade').thumb).toBe('/api/gallery/thumb/grade-photo-t1.00.png');
    expect(block('common.grade').templates[0].thumb).toMatch(/^\/api\/gallery\/thumb\/grade-tpl-[a-z-]+-t\d\.\d\d\.png$/);
    expect(block('common.slam').thumb).toMatch(/^\/api\/gallery\/thumb\/slam-t/);
    for (const b of g.blocks.filter((x: any) => x.over)) for (const u of [b.thumb, ...(b.templates ?? []).map((x: any) => x.thumb)])
      expect((await fetch(base + u)).status, u).toBe(200);
  } finally { await app.close(); }
});

test('each card says the ground and shape it was drawn on, for the preview to play on the same; one over the street says no ground', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const g = await (await fetch(`${base}/api/gallery`)).json(), block = (type: string) => g.blocks.find((b: any) => b.type === type);
    const tpl = (type: string, id: string) => block(type).templates.find((x: any) => x.id === id);
    expect([block('common.handwrite').bg, block('common.doodle').bg, block('common.speedlines').bg]).toEqual(['#7a8c6a', '#f4f2ec', '#ffd9a0']);
    expect([tpl('common.speedlines', 'rush-right').bg, tpl('common.speedlines', 'fall-down').bg]).toEqual(['#ffd9a0', '#ffd9a0']);
    // the default ground says nothing; neither does a block over the street, nor its templates
    expect('bg' in block('common.slam')).toBe(false);
    for (const b of g.blocks.filter((x: any) => x.over)) for (const x of [b, ...(b.templates ?? [])]) expect(x.bg, `${b.type} ${x.id ?? ''}`).toBeUndefined();
    // the 16:9 look's card is wide; the block itself and its other looks tall
    expect(tpl('common.film', 'cinema-scope').aspect).toBe('wide');
    expect([block('common.film').aspect, tpl('common.film', 'super8-home').aspect]).toEqual([undefined, undefined]);
  } finally { await app.close(); }
});

test('a block with variants lists them with their cards and what their previews play: the sample\'s params, words, theme and pictures', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const g = await (await fetch(`${base}/api/gallery`)).json(), block = (type: string) => g.blocks.find((b: any) => b.type === type);
    const variant = (type: string, value: string) => block(type).variants.list.find((v: any) => v.value === value);
    // every variant, in the options' order, each with its card's picture; the default one's is the block's own card
    const progress = block('common.progress');
    expect(progress.variants.param).toBe('mode');
    expect(progress.variants.list).toHaveLength(17);
    expect(progress.variants.list.map((v: any) => v.value)).toEqual(progress.params.find((p: any) => p.key === 'mode').options);
    for (const v of progress.variants.list) {
      expect(v.thumb, v.value).toMatch(/^\/api\/gallery\/thumb\/progress[a-z0-9-]*-t\d+\.\d\d\.png$/);
      expect([v.label.length > 0, v.doc.length > 0], v.value).toEqual([true, true]);
    }
    expect(progress.variants.list[0].thumb).toBe(progress.thumb);
    expect(variant('common.progress', 'ring').params).toMatchObject({ mode: 'ring' });
    // a sample with its own look carries it, for the preview to play in it
    expect(variant('common.progress', 'dots').theme).toEqual(expect.objectContaining({ palette: expect.any(Object) }));
    // a block marked over: the street sibling's picture, no plain ground; the preview plays the sample itself
    const lens = variant('common.lens', 'fisheye');
    expect(lens.thumb).toBe('/api/gallery/thumb/lens-fisheye-street-t1.50.png');
    expect(lens.params).toMatchObject({ look: 'fisheye' });
    expect(lens.bg).toBeUndefined();
    // a sample that shows a picture from a source: the ids the preview stands the gallery's made-up map in for (not the street ground of a
    // sample already drawn over it)
    expect(variant('common.magazine', 'feature').stand).toEqual(['pic']);
    expect(variant('common.flatlay', 'polaroid').stand).toEqual(['pic']);
    expect(variant('core.flash', 'flat').stand).toBeUndefined();
    expect(variant('common.progress', 'ring').stand).toBeUndefined();
    // the English and Japanese words of a sample that shows Chinese (golden/thumbs.ts), the card's ground and shape
    const withWords = g.blocks.flatMap((b: any) => b.variants?.list ?? []).filter((v: any) => v.local);
    expect(withWords.length).toBeGreaterThan(0);
    for (const v of withWords) expect(Object.keys(v.local).every((k) => k === 'en' || k === 'ja'), v.value).toBe(true);
    expect(variant('common.grid', 'two').aspect).toBe('wide');
    // a block without variants has none; every variant's picture is served
    expect(block('core.title').variants).toBeUndefined();
    for (const b of g.blocks.filter((x: any) => x.variants)) for (const v of b.variants.list)
      if (v.thumb) expect((await fetch(base + v.thumb)).status, `${b.type} ${v.value}`).toBe(200);
  } finally { await app.close(); }
});

test('the gallery player (id=_gallery) gets its own pictures, street and map, at the URL a project photo has; nothing else', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const fixtures = join(TELLCUT_ROOT, 'packages/plugin-common/golden/fixtures');
    for (const [name, file] of [['street', 'street.png'], ['map', 'fake-map.png']]) {
      const r = await fetch(`${base}/api/projects/_gallery/media/image/${name}`);
      expect(r.status, name).toBe(200);
      expect(r.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await r.arrayBuffer()).equals(readFileSync(join(fixtures, file))), name).toBe(true);
    }
    // a still of one of them (a block's picture window asks for one), and of a source a variant's preview stands a picture in for
    // (`pic`, the variants' stand): the made-up map its golden card shows in that window; the whole picture, whatever width is asked
    const street = readFileSync(join(fixtures, 'street.png')), map = readFileSync(join(fixtures, 'fake-map.png'));
    for (const [path, want] of [['still?source=street&t=0&w=1080', street], ['still?source=pic&t=0&w=540', map], ['image/pic', map]] as const) {
      const r = await fetch(`${base}/api/projects/_gallery/media/${path}`);
      expect(r.status, path).toBe(200);
      expect(Buffer.from(await r.arrayBuffer()).equals(want), path).toBe(true);
    }
    expect(Buffer.from(await (await fetch(`${base}/api/projects/_gallery/media/still?source=map&t=0`)).arrayBuffer()).equals(readFileSync(join(fixtures, 'fake-map.png')))).toBe(true);
    // only those: no other file of the folder, no name every object has, no strip or square crop (the gallery makes none), and no
    // other kind of media of _gallery
    for (const path of ['image/colour-ref', 'image/constructor', 'image/..%2Fcolour-ref.png', 'proxy/street', 'still?source=colour-ref&t=0', 'still?source=constructor&t=0',
      'still?t=0', 'still?source=street&t=0&n=4&dur=2', 'still?source=street&t=0&square=200'])
      expect((await fetch(`${base}/api/projects/_gallery/media/${path}`)).status, path).toBeGreaterThanOrEqual(400);
    // and _gallery stays no project: the list has none, and its folder is not made by the pictures
    expect((await (await fetch(`${base}/api/projects`)).json()).map((p: any) => p.id)).not.toContain('_gallery');
    expect(existsSync(join(projectsDir, '_gallery'))).toBe(false);
  } finally { await app.close(); }
});

test('a music style preview is generated once and then served from the cache; an unknown style is a 404', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const r = await fetch(`${base}/api/gallery/score/lofi.wav?seed=3`);
    expect(r.status).toBe(200);
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.length).toBeGreaterThan(44100 * 4 * 10);                                // about 12 s of 16-bit stereo
    const cached = readdirSync(join(projectsDir, '_gallery'));
    expect(cached).toHaveLength(1);
    await fetch(`${base}/api/gallery/score/lofi.wav?seed=3`);
    expect(readdirSync(join(projectsDir, '_gallery'))).toEqual(cached);
    expect((await fetch(`${base}/api/gallery/score/nope.wav`)).status).toBe(404);
    expect((await fetch(`${base}/api/gallery/score/constructor.wav`)).status).toBe(404);   // a name every object has is no style
    expect((await fetch(`${base}/api/gallery/score/lofi.wav?bpm=999`)).status).toBe(400);
    expect(existsSync(join(projectsDir, '_gallery'))).toBe(true);
  } finally { await app.close(); }
});

test('while a music preview is being composed the server keeps answering other requests', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    // the server runs in this process: composing on its thread would stall this timer for the
    // whole request (about 2 s). A busy machine (the full suite) stretches both the request and
    // the timer's gaps, so the gap is judged against the request's own length, not a fixed 300 ms.
    const start = Date.now();
    let last = start, worst = 0;
    const tick = setInterval(() => { const now = Date.now(); worst = Math.max(worst, now - last); last = now; }, 20);
    const r = await fetch(`${base}/api/gallery/score/cinematic.wav?seed=11`);
    clearInterval(tick);
    const total = Date.now() - start;
    expect(r.status).toBe(200);
    expect(worst).toBeLessThan(Math.max(300, total / 2));
  } finally { await app.close(); }
}, 30000);

test('blocks carry their category (core ones mapped) and a golden thumbnail; the thumbnail route serves only golden pngs', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const g = await (await fetch(`${base}/api/gallery`)).json();
    const by = (t: string) => g.blocks.find((b: any) => b.type === t);
    expect(by('core.title')).toMatchObject({ category: 'title', thumb: '/api/gallery/thumb/core-title-t1.50.png' });
    expect([by('core.caption').category, by('core.flash').category]).toEqual(['caption', 'moment']);
    expect([by('common.backdrop').category, by('common.grade').category, by('common.polaroid').category]).toEqual(['background', 'look', 'photo']);
    expect(by('common.backdrop').thumb).toBe('/api/gallery/thumb/backdrop-gingham-t0.50.png');
    expect(g.blocks.every((b: any) => b.category && b.thumb)).toBe(true);   // every card has a picture
    const r = await fetch(`${base}${by('core.title').thumb}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/png/);
    expect((await fetch(`${base}/api/gallery/thumb/..%2F..%2Fcases.ts`)).status).toBe(404);
    expect((await fetch(`${base}/api/gallery/thumb/nope-t1.00.png`)).status).toBe(404);
  } finally { await app.close(); }
});

// showcase films (spec 2026-10-30 part 2): the English and Japanese UI see thumbnails without Chinese
test('a thumbnail asked for in English or Japanese is the translated picture when there is one, else the golden one', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  const bytes = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer());
  const file = (lang: string, f: string) => readFileSync(join(TELLCUT_ROOT, 'packages/plugin-common/golden', lang, f));
  try {
    const title = `${base}/api/gallery/thumb/core-title-t1.50.png`;
    expect((await bytes(`${title}?lang=en`)).equals(file('thumbs/en', 'core-title-t1.50.png'))).toBe(true);
    expect((await bytes(`${title}?lang=ja`)).equals(file('thumbs/ja', 'core-title-t1.50.png'))).toBe(true);
    expect((await bytes(title)).equals(file('', 'core-title-t1.50.png'))).toBe(true);
    expect((await bytes(`${title}?lang=xx`)).equals(file('', 'core-title-t1.50.png'))).toBe(true);
    // a block whose picture has no words: the golden one in every language
    const flash = `${base}/api/gallery/thumb/backdrop-gingham-t0.50.png`;
    expect((await bytes(`${flash}?lang=en`)).equals(file('', 'backdrop-gingham-t0.50.png'))).toBe(true);
  } finally { await app.close(); }
});

test('a music style of My blocks replaced under the same id is composed afresh, not served from the old cache', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const dir = join(projectsDir, '_library', 'score'), mod = (midi: number) => `export default { id: 'my-hum', label: 'hum', doc: 'a style', defaults: { bpm: 96, key: 'C' }, build: (c) => [{ t: 0, inst: 'pad', vel: 0.1, pan: 0, midi: ${midi}, dur: c.bar }] };\n`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'my-hum.js'), mod(48));
    writeFileSync(join(dir, 'my-hum.json'), JSON.stringify({ id: 'my-hum', name: 'hum', desc: '', from: { project: 'demo', file: 'score/my-hum.js' }, savedAt: '', version: '1' }));
    const first = Buffer.from(await (await fetch(`${base}/api/gallery/score/my-hum.wav?seed=1`)).arrayBuffer());
    writeFileSync(join(dir, 'my-hum.js'), mod(72));
    const second = Buffer.from(await (await fetch(`${base}/api/gallery/score/my-hum.wav?seed=1`)).arrayBuffer());
    expect(second.subarray(0, 4).toString()).toBe('RIFF');
    expect(second.equals(first)).toBe(false);
    // composed beside the cache and renamed in: no half-written file is left in it
    expect(readdirSync(join(projectsDir, '_gallery')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    // the old preview of that request goes (one cached before names carried the hash too); other seeds stay
    writeFileSync(join(projectsDir, '_gallery', 'score-mine-my-hum-1-d-d.wav'), 'old');
    writeFileSync(join(projectsDir, '_gallery', 'score-mine-my-hum-2-d-d.wav'), 'other seed');
    writeFileSync(join(dir, 'my-hum.js'), mod(60));
    await (await fetch(`${base}/api/gallery/score/my-hum.wav?seed=1`)).arrayBuffer();
    expect(readdirSync(join(projectsDir, '_gallery')).filter((f) => f.startsWith('score-mine-my-hum')).map((f) => f.replace(/-[0-9a-f]{8}-/, '-<hash>-')).sort())
      .toEqual(['score-mine-my-hum-2-d-d.wav', 'score-mine-my-hum-<hash>-1-d-d.wav']);
  } finally { await app.close(); }
}, 30000);

test('caption templates: every one in the index with what it sets and its golden picture, which the thumbnail route serves', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const g = await (await fetch(`${base}/api/gallery`)).json();
    expect(g.captions.length).toBeGreaterThanOrEqual(31);
    expect(g.captions.find((c: any) => c.id === 'neon-fill')).toMatchObject({ params: { style: 'neon', wordFx: 'fill' }, thumb: '/api/gallery/thumb/tpl-neon-fill-t1.50.png' });
    expect(g.captions.every((c: any) => c.thumb)).toBe(true);
    expect((await fetch(`${base}/api/gallery/thumb/tpl-neon-fill-t1.50.png`)).status).toBe(200);
  } finally { await app.close(); }
});

test('combos: each with its handle, its layers and the three golden pictures of its sample in time order, which the thumbnail route serves', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const g = await (await fetch(`${base}/api/gallery`)).json();
    expect(g.combos.map((c: any) => [c.id, c.handle])).toEqual(expect.arrayContaining([['impact', 'CMB-01'], ['glitchcut', 'CMB-02']]));
    const impact = g.combos.find((c: any) => c.id === 'impact');
    expect(impact).toMatchObject({ label: '重擊', frames: ['/api/gallery/thumb/combo-impact-t0.06.png', '/api/gallery/thumb/combo-impact-t0.15.png', '/api/gallery/thumb/combo-impact-t0.70.png'] });
    expect(impact.doc.length).toBeGreaterThan(5);
    expect(impact.parts).toEqual([
      { name: 'lines', kind: 'effect', type: 'common.speedlines', template: 'burst-center', at: 0, len: 0.8 },
      { name: 'flash', kind: 'effect', type: 'core.flash', template: 'bloom-pop', at: 0, len: 0.5, layer: 'top' },
      { name: 'hit', kind: 'sfx', type: 'common.impact', at: 0, len: 1.4 },
      { name: 'shake', kind: 'shake', at: 0, len: 0.4 },
    ]);
    for (const c of g.combos) {
      expect(c.frames, c.id).toHaveLength(3);
      for (const f of c.frames) expect((await fetch(base + f)).status, f).toBe(200);
    }
    // expanded for the live preview: every layer, templates applied, with the plugins their types are in; closing says it ends a film
    const expanded = (id: string) => expandCombo(combos.find((c) => c.id === id)!, createRegistry(plugins));
    for (const c of g.combos) expect(c.layers, c.id).toEqual(JSON.parse(JSON.stringify(expanded(c.id))));
    expect(impact.plugins.sort()).toEqual(['common', 'core']);
    expect(impact.layers.find((l: any) => l.name === 'shake')).toMatchObject({ kind: 'shake', px: 28 });
    expect(g.combos.filter((c: any) => c.ending).map((c: any) => c.id)).toEqual(['closing']);
  } finally { await app.close(); }
});
