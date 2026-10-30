import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TELLCUT_ROOT } from '@tellcut/media-node';
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
    const media = (type: string) => g.blocks.find((b: any) => b.type === type).needsMedia;
    expect([media('common.backdrop'), media('core.title')]).toEqual([false, false]);
    expect(g.sfx.map((s: any) => s.type)).toEqual(expect.arrayContaining(['common.beep', 'common.whoosh']));
    expect(g.styles.filter((s: any) => s.origin === 'built-in').map((s: any) => s.id)).toEqual(['pluck', 'lofi', 'cinematic', 'tech', 'playful']);
    expect(g.recipes.map((r: any) => r.id)).toEqual(['travel', 'hook', 'montage']);
    expect(g.recipes[0].example.scenes.length).toBeGreaterThan(0);
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
    expect((await fetch(`${base}/api/gallery/score/lofi.wav?bpm=999`)).status).toBe(400);
    expect(existsSync(join(projectsDir, '_gallery'))).toBe(true);
  } finally { await app.close(); }
});

test('while a music preview is being composed the server keeps answering other requests', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    // the server runs in this process: composing on its thread would stall this timer for about 2 s
    let last = Date.now(), worst = 0;
    const tick = setInterval(() => { const now = Date.now(); worst = Math.max(worst, now - last); last = now; }, 20);
    const r = await fetch(`${base}/api/gallery/score/cinematic.wav?seed=11`);
    clearInterval(tick);
    expect(r.status).toBe(200);
    expect(worst).toBeLessThan(300);
  } finally { await app.close(); }
}, 30000);

test('blocks carry their category (core ones mapped) and a golden thumbnail; the thumbnail route serves only golden pngs', async () => {
  const projectsDir = makeProjects(), { app, base } = await startApp({ projectsDir });
  try {
    const g = await (await fetch(`${base}/api/gallery`)).json();
    const by = (t: string) => g.blocks.find((b: any) => b.type === t);
    expect(by('core.title')).toMatchObject({ category: 'text', thumb: '/api/gallery/thumb/core-title-t1.50.png' });
    expect([by('core.caption').category, by('core.lowerThird').category, by('core.flash').category, by('core.endCard').category]).toEqual(['text', 'chapter', 'moment', 'moment']);
    expect(by('common.backdrop').category).toBe('look');
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
