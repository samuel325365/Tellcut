import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject, resolveTimes, type Project } from '@tellcut/engine';
import { fakeTts, parseNarration, renderVoice } from '@tellcut/media-node';
import { Cut } from '../cut.ts';
import type { Inventory } from '../inventory.ts';
import { describeRecipe, RECIPES } from './index.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const base = () => parseProject({ version: 1, meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 60, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 30, width: 1920, height: 1080, kind: 'video', audio: true }, ph: { path: 'p.jpg', duration: 3600, width: 900, height: 1200, kind: 'image' } },
  media: {}, grids: [], tracks: [] });
const inv = (dir: string): Inventory => ({ id: 't', dir, project: base(), chapters: [], photoSheets: [], overview: [],
  sources: [{ id: 'v', kind: 'video', duration: 30, width: 1920, height: 1080, orientation: 'landscape', audio: true, speech: '', sheets: [], segments: [[0, 30]],
    transcript: { language: 'zh', segments: [{ start: 1, end: 2.5, text: '大家好', words: [] }, { start: 6, end: 8, text: '我們出發', words: [] }] } }],
  music: [] });
const fresh = () => { const dir = mkdtempSync(join(tmpdir(), 'recipe-')); return new Cut(base(), inv(dir), dir); };
const track = (p: Project, id: string) => (p.tracks.find((t) => t.id === id)?.items ?? []) as any[];

test('every recipe has an example that passes its own check, and the list names them all', () => {
  for (const r of Object.values(RECIPES)) expect(r.schema.safeParse(r.example).success, r.id).toBe(true);
  expect(describeRecipe()).toMatch(/travel[\s\S]*hook[\s\S]*montage/);
  expect(describeRecipe('hook')).toContain('"segments"');
  expect(() => describeRecipe('nope')).toThrow('沒有「nope」');
});

test('wrong content says which field, and how to see the format', () => {
  expect(() => fresh().recipe('travel', { scenes: [] })).toThrow(/scenes[\s\S]*npm run tellcut -- recipe travel/);
  expect(() => fresh().recipe('hook', { segments: [{ src: 'v', from: 0 }] })).toThrow(/hook[\s\S]*segments\.0\.len/);
  expect(() => fresh().recipe('nope', {})).toThrow('沒有「nope」這個配方');
});

test('travel: the title first, each scene’s narration with its shots and captions, a place tag, the end card, music that dips under the voice', async () => {
  const c = fresh();
  await renderVoice({ dir: c.dir, narration: parseNarration({ scenes: [{ id: 's1', text: '第一句，第二句。' }, { id: 's2', text: '最後一句。' }] }), tts: fakeTts() });
  c.recipe('travel', { title: '京都', scenes: [{ voice: 's1', shots: [{ src: 'v', from: 0 }, { src: 'ph' }], place: '城南宮' }, { voice: 's2', shots: [{ src: 'v', from: 10 }] }], end: ['謝謝收看'] });
  const p = await c.save(), times = resolveTimes(p);
  const voices = track(p, 'voice');
  expect(voices).toHaveLength(2);
  expect(voices[0].start).toBeCloseTo(2.4, 3);                                          // after the title
  expect(voices[1].start).toBeCloseTo(voices[0].end + 0.5, 3);                           // a gap between scenes
  const clips = track(p, 'v1');
  expect(clips).toHaveLength(3);
  expect(clips[1].transitionIn).toEqual({ type: 'dissolve', dur: 0.4 });
  const lastClip = times.get(clips[2].id)!;
  expect(lastClip.end).toBeGreaterThan(voices[1].end + 1);                               // the last scene lingers
  const text = track(p, 'text');
  expect(text.filter((i) => i.type === 'common.caption').map((i) => i.params.text)).toEqual(['第一句', '第二句', '最後一句']);
  expect(text.find((i) => i.type === 'common.header')).toMatchObject({ params: { text: '城南宮' } });
  expect(text.find((i) => i.type === 'core.title')).toMatchObject({ params: { text: '京都' } });
  expect(text.find((i) => i.type === 'core.endCard')!.start).toBeCloseTo(lastClip.end, 3);
  const music = track(p, 'music')[0];
  expect(music.media).toBe('score-pluck');
  expect(music.envelope?.length).toBeGreaterThanOrEqual(4);
});

test('hook: the opening jolts when hook.shake asks for it', async () => {
  const c = fresh();
  c.recipe('hook', { hook: { text: '你絕對想不到', shake: true }, segments: [{ src: 'v', from: 0, len: 4 }] });
  const p = await c.save();
  expect((track(p, 'v1')[0] as any).shake).toEqual([{ at: 0.05, dur: 0.45, px: 28, hz: 18 }]);
});

test('hook: a numbered badge and tags per segment, captions with highlighted and bleeped words, the bleep itself, chapter dots, the opening, the call to action', async () => {
  const c = fresh();
  c.recipe('hook', {
    hook: { text: '你絕對\n想不到' },
    segments: [
      { src: 'v', from: 0, len: 4, badge: 'No.1', plate: '阿桃的店', tags: ['500碗', '傳奇'], censor: ['大家'], tighten: false },
      { src: 'v', from: 5, len: 4, highlight: ['出發'], tighten: false },
    ],
    cta: '看原片', icons: '🍗,🥟',
  });
  const p = await c.save();
  const text = track(p, 'text');
  const caps = text.filter((i) => i.type === 'common.caption').map((i) => i.params.text);
  expect(caps).toEqual(['{大家}好', '我們【出發】']);
  expect(text.find((i) => i.type === 'common.badge')).toMatchObject({ params: { label: 'No.1', plate: '阿桃的店' } });
  expect((track(p, 'v1')[0] as any).shake).toBeUndefined();   // the opening jolts only when asked (hook.shake)
  expect(text.find((i) => i.type === 'common.tag')).toMatchObject({ params: { tags: '500碗,傳奇' } });
  const at = resolveTimes(p);   // the per-segment items ride on their clip: their own start is relative to it
  expect(text.filter((i) => i.type === 'common.progress').map((i) => [at.get(i.id)!.start, i.params.step, i.params.dots])).toEqual([[0, 0, 2], [4, 1, 2]]);
  expect(text.filter((i) => i.type === 'common.progress').every((i) => typeof i.parent === 'string')).toBe(true);
  expect(text.filter((i) => i.type === 'common.burst')).toHaveLength(2);                // the opening and the call to action
  expect(text.some((i) => i.type === 'common.speedlines')).toBe(true);
  // 大家 is said 1.0–2.0 s into the source (大家好 spoken over 1–2.5 s): a beep there, a sticker, the original sound cut out
  const beep = track(p, 'sfx').find((i) => i.type === 'common.beep');
  expect(beep.start).toBeCloseTo(1, 2);
  expect(beep.end).toBeCloseTo(2, 2);
  expect(text.find((i) => i.type === 'common.censor')!.start).toBeCloseTo(1, 2);
  const tm = resolveTimes(p), orig = track(p, 'orig').map((i) => [tm.get(i.id)!.start, tm.get(i.id)!.end]);   // sound items sit relative to their clip
  expect(orig.some(([a, b]) => a < 1.5 && b > 1.5)).toBe(false);
  expect(track(p, 'sfx').map((i) => i.type)).toEqual(expect.arrayContaining(['common.whoosh', 'common.impact', 'common.pop']));
  expect(p.tracks.map((t) => t.id)).toEqual(expect.arrayContaining(['bg', 'panel']));
  expect(track(p, 'music')[0]).toMatchObject({ media: 'score-playful', gain: -8 });
});

test('hook: by default each segment plays tight (pauses cut); what hangs on it lasts over all its pieces, the bleep still lands on the word', async () => {
  const c = fresh();
  const r = c.recipe('hook', { hook: { text: '想不到' }, segments: [{ src: 'v', from: 0, len: 4, badge: 'No.1', censor: ['大家'] }, { src: 'v', from: 5, len: 4 }] }) as any;
  const p = await c.save(), at = resolveTimes(p), text = track(p, 'text');
  // 大家好 1–2.5 s: 0.85–2.65 s of the source is kept (1.8 s); 我們出發 6–8 s: 5.85–8.15 → 5.85–9 cut to the clip's end 9 (2.3 s)
  expect(track(p, 'v1').map((i) => [at.get(i.id)!.start, at.get(i.id)!.end, i.in])).toEqual([[0, 1.8, 0.85], [1.8, 4.1, 5.85]]);
  expect(r.segments[0].pieces).toEqual([r.segments[0].clip]);
  const badge = text.find((i) => i.type === 'common.badge')!;
  expect([at.get(badge.id)!.start, at.get(badge.id)!.end]).toEqual([0, 1.8]);
  expect(text.filter((i) => i.type === 'common.progress').map((i) => at.get(i.id)!.start)).toEqual([0, 1.8]);
  const beep = track(p, 'sfx').find((i) => i.type === 'common.beep');
  expect(at.get(beep.id)!.start).toBeCloseTo(0.15, 2);
  expect(text.filter((i) => i.type === 'common.caption').map((i) => [i.params.text, at.get(i.id)!.start])).toEqual([['{大家}好', 0.15], ['我們出發', 1.95]]);
});

test('montage: every cut on the beat, a flash each fourth shot, a title, a card, grain over all of it', async () => {
  const c = fresh();
  const r = c.recipe('montage', {
    title: '夏天', music: 'pluck', shots: [0, 2, 4, 6, 8, 10].map((from) => ({ src: 'v', from })).concat([{ src: 'ph', from: 0 }]), cards: [{ shot: 2, text: '最好的一天' }],
  });
  const p = await c.save(), beat = 60 / 112;
  for (const t of r.cuts as number[]) expect(Math.abs(t / beat - Math.round(t / beat))).toBeLessThan(1e-3);
  expect((r.cuts as number[])[1]).toBeCloseTo(4 * beat, 3);
  const top = track(p, 'top');
  expect(top.filter((i) => i.type === 'core.flash').map((i) => +i.start.toFixed(3))).toEqual([+(16 * beat).toFixed(3)]);
  expect(top.find((i) => i.type === 'common.film')!.start).toBe(0);
  const text = track(p, 'text');
  expect(text.filter((i) => i.type === 'common.slam').map((i) => i.params.text)).toEqual(['夏天', '最好的一天']);
  expect(track(p, 'orig')).toEqual([]);                                                // the footage is silent under the music
  expect(p.grids).toEqual([{ id: 'music', at: 0, bpm: 112 }]);
});

test('montage: holds come from the mood and run long-short-longer-long; a hero holds twice; drop dips the music; sound keeps a shot\'s own; a jump between neighbours is noted', async () => {
  const c = fresh(), beat = 60 / 112;
  const r = c.recipe('montage', { music: 'pluck', mood: 'lively', drop: 4,
    shots: [{ src: 'v', from: 0 }, { src: 'v', from: 20 }, { src: 'ph' }, { src: 'v', from: 10, sound: -14 }, { src: 'v', from: 25, hero: true }, { src: 'v', from: 22, beats: 5 }] }) as any;
  // lively ≈ 1.6 s → 3 beats (1.61 s); long, short, longer, long → 3, 2, 4, 3 (12 = four of 3: the section stays on the bar); the hero 6; a shot's own beats win
  expect(r.beats).toEqual([3, 2, 4, 3, 6, 5]);
  const p = await c.save();
  const music = track(p, 'music')[0];
  const dropAt = (3 + 2 + 4 + 3) * beat;
  expect(music.envelope.find((x: number[]) => x[1] === -18)[0]).toBeCloseTo(dropAt, 3);
  expect(track(p, 'orig').map((i) => i.gain)).toEqual([-14]);
  expect(c.notes).toEqual([expect.stringContaining('第 4、5 個鏡頭')]);            // 25 s and 22 s of the same footage, next to each other
  const even = fresh().recipe('montage', { music: 'pluck', rhythm: 'even', shots: [{ src: 'v', from: 0 }, { src: 'v', from: 20 }, { src: 'ph' }] }) as any;
  expect(even.beats).toEqual([4, 4, 4]);
  // a section of four always lasts four bases, whatever the base: the flash every fourth shot stays on the bar
  for (const bpm of [70, 100, 120, 140, 180]) for (const mood of ['gentle', 'steady', 'lively', 'urgent']) {
    const b = (fresh().recipe('montage', { music: 'pluck', bpm, mood, shots: [0, 1, 2, 3].map((i) => ({ src: 'v', from: i * 5 })) }) as any).beats as number[];
    expect(b.reduce((x, y) => x + y, 0)).toBe(4 * b[0]);
  }
  // the old way of asking (beats given) still holds every shot the same
  expect((fresh().recipe('montage', { music: 'pluck', beats: 4, shots: [{ src: 'v' }, { src: 'ph' }, { src: 'v', from: 20 }] }) as any).beats).toEqual([4, 4, 4]);
  expect(() => fresh().recipe('montage', { music: 'pluck', drop: 9, shots: [{ src: 'v' }, { src: 'ph' }] })).toThrow('drop 9');
  // a style of the score library or the project's own keeps its own tempo, as score() does: 90 bpm, steady (2.5 s) → 4 beats of 0.667 s
  const own = fresh();
  (own as any).styleBpm = { 'my-waltz': 90 };
  const w = own.recipe('montage', { music: 'my-waltz', rhythm: 'even', shots: [{ src: 'v' }, { src: 'v', from: 20 }] }) as any;
  expect(w.beats).toEqual([4, 4]);
  expect(() => fresh().recipe('montage', { music: 'nope', shots: [{ src: 'v' }, { src: 'ph' }] })).toThrow('nope');
});

test('fixes from the first run: hook stacks badge, panel, dots and captions without overlap and fixes misheard words; travel keeps a shot inside its scene; montage takes a title size', async () => {
  const h = fresh();
  h.recipe('hook', { hook: { text: '開場' }, segments: [{ src: 'v', from: 5, len: 4, fix: { 我們: '咱們' } }], panel: { frame: [0.05, 0.2, 0.9, 0.4] }, music: { style: 'tech', gain: -9 } });
  const hp = await h.save(), ht = track(hp, 'text');
  expect(ht.find((i) => i.type === 'common.caption').params.text).toBe('咱們出發');
  expect(ht.find((i) => i.type === 'common.progress').params.y).toBeCloseTo(0.635, 3);   // just under the panel's bottom edge (0.2 + 0.4)
  expect(track(hp, 'music')[0]).toMatchObject({ media: 'score-tech', gain: -9 });
  // the source has one scene 0–30 in this fixture: give it two scenes to see a shot pulled back inside its own
  const t = fresh();
  t.inv.sources[0].segments = [[0, 8], [8, 30]];
  await renderVoice({ dir: t.dir, narration: parseNarration({ scenes: [{ id: 'a', text: '一二三四五六七八九十一二三四五六七八' }] }), tts: fakeTts() });
  const r = t.recipe('travel', { scenes: [{ voice: 'a', shots: [{ src: 'v', from: 6 }] }], music: { style: 'lofi', bpm: 70 } });
  const clip = t.p.tracks.find((x) => x.id === 'v1')!.items[0] as any, len = clip.end - clip.start;
  expect(clip.in + len).toBeLessThanOrEqual(8 + 1e-6);
  expect(r.warnings).toEqual([]);
  const m = fresh();
  m.recipe('montage', { title: { text: '京都・回憶', size: 6 }, shots: [{ src: 'v' }, { src: 'v', from: 4 }] });
  expect((m.p.tracks.find((x) => x.id === 'text')!.items as any[]).find((i) => i.type === 'common.slam').params.size).toBe(6);
});

test('a recipe hands back what it made: c.update adjusts an item, c.remove takes one off; hook can keep only chosen sentences', async () => {
  const c = fresh();
  const r = c.recipe('hook', { hook: { text: '開場' }, segments: [{ src: 'v', from: 0, len: 9, badge: 'No.1', captions: ['出發'] }] }) as { segments: Array<Record<string, any>> };
  const s = r.segments[0];
  expect(s.captions).toHaveLength(1);                                                   // '大家好' left out, '我們出發' kept
  const text = c.p.tracks.find((t) => t.id === 'text')!.items as any[];
  expect(text.filter((i) => i.type === 'common.caption').map((i) => i.params.text)).toEqual(['我們出發']);
  c.update(s.badge, { params: { size: 20 }, transform: { x: 0, y: 0.02, scale: 1 } });
  const badge = text.find((i) => i.id === s.badge);
  expect(badge.params).toMatchObject({ label: 'No.1', size: 20 });
  expect(badge.transform).toMatchObject({ y: 0.02 });
  c.remove(s.progress);
  expect(text.some((i) => i.id === s.progress)).toBe(false);
  expect(() => c.update('nope', {})).toThrow('時間軸上沒有');
  await c.save();
});

describe('review findings', () => {
  test('travel: a source shorter than its shot never makes the next scene talk over this one, and it is warned about', async () => {
    const c = fresh();
    c.p.sources.short = { path: 's.mp4', duration: 2, width: 1920, height: 1080, kind: 'video' } as any;
    c.inv.sources.push({ ...c.inv.sources[0], id: 'short', duration: 2, segments: [[0, 2]] });
    await renderVoice({ dir: c.dir, narration: parseNarration({ scenes: [{ id: 'a', text: '一二三四五六七八九十一二三四五六七八九十' }, { id: 'b', text: '再一句' }] }), tts: fakeTts() });
    const r = c.recipe('travel', { scenes: [{ voice: 'a', shots: [{ src: 'short' }] }, { voice: 'b', shots: [{ src: 'v', from: 10 }] }] }) as { warnings: string[] };
    const voices = c.p.tracks.find((t) => t.id === 'voice')!.items as any[];
    expect(voices[1].start).toBeGreaterThanOrEqual(voices[0].end);
    expect(r.warnings.join()).toContain('short 只有 2.0 秒');
  });

  test('a word cut by the clip’s in point is still bleeped, over the part the clip shows', () => {
    const c = fresh();
    const id = c.clip('v', { from: 1.4, len: 3 });                                           // 大家 is said 1.0–2.0 in the source
    expect(c.wordTimes(id, '大家')).toEqual([[0, 0.6]]);
  });

  test('update trims through the engine: what is attached follows, and it never goes below a frame', async () => {
    const c = fresh();
    const id = c.clip('v', { from: 0, len: 4 });
    c.update(id, { end: 2 });
    const orig = c.p.tracks.find((t) => t.id === 'orig')!.items[0] as any;
    expect(orig.end - orig.start).toBeCloseTo(2, 3);
    c.update(id, { start: 5 });
    const clip = c.p.tracks.find((t) => t.id === 'v1')!.items[0] as any;
    expect(clip.end - clip.start).toBeGreaterThan(0);
    await c.save();
  });

  test('montage: the grain covers the end card; hook: a very short segment with tags does not throw', async () => {
    const m = fresh();
    m.recipe('montage', { shots: [{ src: 'v' }, { src: 'v', from: 4 }], end: ['完'] });
    const top = m.p.tracks.find((t) => t.id === 'top')!.items as any[], end = (m.p.tracks.find((t) => t.id === 'text')!.items as any[]).find((i) => i.type === 'core.endCard');
    expect(top.find((i) => i.type === 'common.film').end).toBeCloseTo(end.end, 3);
    const h = fresh();
    expect(() => h.recipe('hook', { hook: { text: 'x' }, segments: [{ src: 'v', from: 0, len: 0.25, tags: ['a'], captions: false }] })).not.toThrow();
  });
});

test('hook on a 16:9 film uses the panel frame for that shape, not the tall one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'recipe-')), p = base();
  p.meta.width = 1920; p.meta.height = 1080;
  const c = new Cut(p, inv(dir), dir);
  c.recipe('hook', { hook: { text: '你絕對想不到' }, segments: [{ src: 'v', from: 0, len: 4 }] });
  expect(track(await c.save(), 'v1')[0].frame).toEqual([0.1, 0.06, 0.8, 0.8]);
});

test('hook on a 9:16 film keeps badge and tags under the top 11.5 % the app covers; the panel below them still ends at 0.62', async () => {
  const c = fresh();
  c.recipe('hook', { hook: { text: '開場' }, segments: [{ src: 'v', from: 0, len: 4, badge: 'No.1', plate: '阿桃的店', tags: ['500碗認證'] }] });
  const p = await c.save(), text = track(p, 'text');
  const badge = text.find((i) => i.type === 'common.badge'), tags = text.find((i) => i.type === 'common.tag'), frame = track(p, 'v1')[0].frame;
  const top = 0.115, diam = (0.12 * 1080) / 1920;                                 // the badge is 12 % of the short side
  expect(badge.params.y ?? -1).toBe(-1);                                           // its top on the safe margin
  expect(tags.params.y).toBeGreaterThanOrEqual(top + diam);
  expect(frame[1]).toBeGreaterThanOrEqual(tags.params.y + 0.03);                    // under the row of tags
  expect(frame[1] + frame[3]).toBeCloseTo(0.62, 3);
});


// brand plan 5: the brand recipe, the spike's twenty bars (80 BPM: a bar is 3 s)
const brandCut = (w = 1920, h = 1080) => {
  const c = fresh();
  c.p.meta.width = w; c.p.meta.height = h;
  for (let i = 1; i <= 8; i++) c.p.sources[`v${i}`] = { path: `v${i}.mp4`, duration: 40, width: 1920, height: 1080, kind: 'video' } as any;
  for (let i = 1; i <= 8; i++) c.p.sources[`p${i}`] = { path: `p${i}.jpg`, duration: 3600, width: 1600, height: 1200, kind: 'image' } as any;
  return c;
};
const BRAND = () => ({
  hook: [{ text: 'We film everything.', shot: { src: 'v1' } }, { text: 'It stays on our phones.', shot: { src: 'v2', from: 4 } }],
  wall: { tiles: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], count: 696, label: 'clips.' },
  beats: [{ line: 'It watches every clip.', shot: { src: 'v3', from: 2 }, tags: ['Street', 'Tram', 'Morning light'] }, { line: 'Captions on the beat.', shot: { src: 'v4' } }, { line: 'It checks its own work.', shot: { src: 'v5' } }],
  proof: [{ big: '90+', label: 'BUILT-IN EFFECTS AND SOUNDS' }, { line: 'Your footage stays\non your computer.' }],
  weAre: { text: 'We are Tellcut.', shot: { src: 'v6', from: 2 } },
  logo: { file: 'media/brand/logo.svg', name: 'Tellcut', tagline: 'Tell it. It cuts.', url: 'tellcut.app', split: 4 },
});
const items = (c: Cut, type: string) => c.p.tracks.flatMap((t) => t.items as any[]).filter((i) => i.type === type);
const startsOf = (c: Cut, id = 'v1') => track(c.p, id).map((i: any) => [i.source, +i.start.toFixed(3), +(i.end - i.start).toFixed(3)]);

test('brand lays the parts on bars at 80 BPM: hook, wall, beats with a dolly in, proof, we are with a dolly out, logo', () => {
  const c = brandCut(), r = c.recipe('brand', BRAND()) as any;
  expect(startsOf(c)).toEqual([['v1', 0, 3], ['v2', 3, 4.5], ['v3', 13.5, 4.5], ['v4', 18, 4.5], ['v5', 22.5, 4.5], ['v6', 33, 3]]);
  expect(items(c, 'common.wall').map((w) => [w.params.look ?? 'wall', w.start, w.end])).toEqual([['wall', 7.5, 12], ['sphere', 27, 33]]);
  expect(items(c, 'common.wall')[0].params).toMatchObject({ tiles: 'p1,p2,p3,p4,p5,p6', count: 696, countLabel: 'clips.', push: 0 });
  expect(items(c, 'common.dolly').map((d) => [d.params.dir, d.start, d.end])).toEqual([['in', 12, 13.5], ['out', 36, 37.5]]);
  expect(items(c, 'common.headline').filter((h) => h.params.look === 'proof').map((h) => [h.start, h.end, h.params.text, h.params.sub])).toEqual([[27, 30, '90+', 'BUILT-IN EFFECTS AND SOUNDS'], [30, 33, 'Your footage stays\non your computer.', '']]);
  expect(items(c, 'common.headline').filter((h) => h.params.look === 'brand').map((h) => h.params.text)).toEqual(['We film everything.', 'It stays on our phones.', 'It watches every clip.', 'Captions on the beat.', 'It checks its own work.', 'We are Tellcut.']);
  const logo = items(c, 'common.logo')[0];
  // the mark starts the moment the dolly out ends (hit 0.75: it pops from the logo's first frame), no dark gap before it
  expect([logo.start, logo.end, logo.params]).toEqual([37.5, 45.75, expect.objectContaining({ logo: 'media/brand/logo.svg', name: 'Tellcut', split: 4, hit: 0.75 })]);
  expect(items(c, 'common.tag').map((t) => [t.start, t.params.look, t.params.tags, +t.params.step.toFixed(4), t.params.size])).toEqual([[13.5 + 0.9, 'glass', 'Street,Tram,Morning light', 0.5625, 4.5]]);
  // the glass tags are at least 48 px high: 4.5 % of a 1080 frame, 2.5 % of a 1920 one
  const tall = brandCut(1080, 1920);
  tall.recipe('brand', BRAND());
  expect(items(tall, 'common.tag')[0].params.size).toBe(2.5);
  expect(r.duration).toBe(45.75);
  expect(r.parts).toMatchObject({ hook: [0, 7.5], wall: [7.5, 12], beats: [13.5, 27], proof: [27, 33], weAre: [33, 37.5], logo: [37.5, 45.75] });
});

test('no proof leaves the part out and the rest moves up', () => {
  const c = brandCut(), r = c.recipe('brand', { ...BRAND(), proof: [] }) as any;
  expect(startsOf(c).at(-1)).toEqual(['v6', 27, 3]);
  expect(items(c, 'common.wall').map((w) => w.params.look ?? 'wall')).toEqual(['wall']);
  expect(items(c, 'common.headline').some((h) => h.params.look === 'proof')).toBe(false);
  expect(r.parts.proof).toBeUndefined();
  expect(r.duration).toBe(39.75);
});

test('too few distinct shots is an error that says how many more', () => {
  const x = BRAND();
  x.beats[2].shot = { src: 'v1', from: 20 }; x.weAre.shot = { src: 'v2', from: 20 };
  expect(() => brandCut().recipe('brand', x)).toThrow(/還差 1 段不同的素材/);
});

test('the same shot twice, or a source three times, is an error', () => {
  const twice = BRAND(); twice.weAre.shot = { src: 'v1', from: 0 };
  expect(() => brandCut().recipe('brand', twice)).toThrow(/v1 的 0 秒用了兩次/);
  const near = BRAND(); near.weAre.shot = { src: 'v1', from: 2 };
  expect(() => brandCut().recipe('brand', near)).toThrow(/v1.*相隔 3 秒以上/);
  const three = BRAND(); three.hook.push({ text: 'x', shot: { src: 'v3', from: 10 } }); three.weAre.shot = { src: 'v3', from: 20 };   // with beats' v3 at 2
  three.beats.push({ line: 'y', shot: { src: 'v7' } } as any, { line: 'z', shot: { src: 'v8' } } as any);
  expect(() => brandCut().recipe('brand', three)).toThrow(/v3 用了 3 次/);
});

test('wall tiles must be photos not used in the main cut', () => {
  const video = BRAND(); video.wall.tiles = ['p1', 'p2', 'p3', 'p4', 'p5', 'v7'];
  expect(() => brandCut().recipe('brand', video)).toThrow(/畫面牆的 v7 不是照片/);
  const used = BRAND(); used.weAre.shot = { src: 'p1' } as any;
  expect(() => brandCut().recipe('brand', used)).toThrow(/畫面牆的 p1 也用在主片/);
});

test('music: cinematic 80 Dm by default with the level curve; sound effects at the moments', () => {
  const c = brandCut();
  c.recipe('brand', BRAND());
  expect((c as any).scoreReq).toMatchObject({ style: 'cinematic', bpm: 80, key: 'Dm', seed: 1 });
  const curve = (c as any).curve as Array<[number, number]>;
  expect(curve[0]).toEqual([0, 0.8]);
  expect(curve).toEqual(expect.arrayContaining([[7.1, 0.8], [7.8, 0.62], [11.4, 0.55], [12, 0.82], [13.5, 1], [14.5, 0.86], [27, 0.86], [27.5, 0.74], [33, 0.74], [36.05, 0.6], [38.2, 0.7], [38.3, 1], [45.75, 0.95]]));
  expect(curve.every((p, i) => !i || p[0] >= curve[i - 1][0])).toBe(true);
  const at = (type: string) => items(c, type).map((s) => +s.start.toFixed(4));
  expect(at('common.air')).toEqual([7.5]);
  expect(at('common.whoosh')).toEqual([12]);
  expect(at('common.tick')).toEqual([14.4, 14.9625, 15.525]);
  expect(items(c, 'common.ding').map((d) => [d.start, d.params.step, d.params.scale])).toEqual([[13.5, 0, 'pentatonic'], [18, 1, 'pentatonic'], [22.5, 2, 'pentatonic']]);
  expect(at('common.thud')).toEqual([27, 30]);
  expect(at('common.riser')).toEqual([36.65]);
  expect(at('common.impact')).toEqual([38.25]);
  expect(at('common.shing')).toEqual([38.25]);
});

test('cinemascope adds the letterbox and keeps headline y above the bottom bar', () => {
  const c = brandCut();
  c.recipe('brand', { ...BRAND(), style: 'cinemascope' });
  expect(items(c, 'common.film')[0].params).toMatchObject({ grain: 0.07, blend: 'overlay', letterbox: 2.39 });
  const bar = (1 - 16 / 9 / 2.39) / 2;
  for (const h of items(c, 'common.headline').filter((x) => x.params.look === 'brand')) expect(h.params.y).toBeGreaterThan(0.5), expect(h.params.y).toBeLessThan(1 - bar);
  const real = brandCut(); real.recipe('brand', BRAND());
  expect(items(real, 'common.film')[0].params.letterbox ?? 0).toBe(0);
});

test('a 9:16 film lays out too', () => {
  const c = brandCut(1080, 1920), r = c.recipe('brand', BRAND()) as any;
  expect(r.duration).toBe(45.75);
  expect(startsOf(c).map((s) => s[0])).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
  expect(items(c, 'common.wall')).toHaveLength(2);
  expect(items(c, 'common.logo')).toHaveLength(1);
});

test('a scene beat sits between the wall and the beats for its bars', () => {
  const c = brandCut(), r = c.recipe('brand', { ...BRAND(), scene: { type: 'fx.tellcutFlow', bars: 2, params: { accent: '#2f8cff' } } }) as any;
  expect(items(c, 'fx.tellcutFlow').map((s) => [s.start, s.end, s.params.accent])).toEqual([[12, 18, '#2f8cff']]);
  expect(items(c, 'common.dolly')[0]).toMatchObject({ start: 18, end: 19.5 });
  expect(r.parts.scene).toEqual([12, 18]);
});

test('the first beat leaves footage before it for the dolly in', () => {
  const x = BRAND(); x.beats[0].shot = { src: 'v3', from: 0.5 };
  expect(() => brandCut().recipe('brand', x)).toThrow(/beats\[0\] 的 from 至少要 1\.5 秒/);
});

test('the brand film saves: every block and sound it places is known, the music is shaped', async () => {
  const c = brandCut();
  c.recipe('brand', { ...BRAND(), style: 'cinemascope' });
  const p = await c.save();
  expect(track(p, 'music')[0]).toMatchObject({ media: 'score-cinematic' });
  expect(p.meta.duration).toBeCloseTo(45.75, 3);
});

test('a hook line with shots cuts between them on the half bar; every hook shot counts toward the distinct footage', () => {
  const x: any = BRAND();
  x.hook = [{ text: 'We film everything.', shots: [{ src: 'v1' }, { src: 'v7', from: 2 }] }, { text: 'It stays on our phones.', shots: [{ src: 'v2', from: 4 }, { src: 'v8' }] }];
  const c = brandCut(), r = c.recipe('brand', x) as any;
  expect(startsOf(c).slice(0, 4)).toEqual([['v1', 0, 1.5], ['v7', 1.5, 1.5], ['v2', 3, 2.25], ['v8', 5.25, 2.25]]);
  expect(items(c, 'common.headline').filter((h) => h.params.look === 'brand').slice(0, 2).map((h) => [h.start, h.end])).toEqual([[0.2, 3], [3.2, 7.5]]);
  expect(r.parts.hook).toEqual([0, 7.5]);
  // four hook shots + three beats = 7 distinct needed: a beat and "we are" on hook sources leave v1 v7 v2 v8 v3 v4, one short
  const short: any = BRAND(); short.hook = x.hook; short.beats[2].shot = { src: 'v7', from: 20 }; short.weAre.shot = { src: 'v1', from: 20 };
  expect(() => brandCut().recipe('brand', short)).toThrow(/還差 1 段不同的素材/);
  expect(() => brandCut().recipe('brand', { ...BRAND(), hook: [{ text: 'x' }] } as any)).toThrow(/shot.*shots/);
});

test('a beat with show puts that block over its shot, showing what the line says', () => {
  const x: any = BRAND();
  x.beats[2].show = { type: 'common.notecard', params: { mode: 'list', items: 'No black frames|No clipped audio' } };
  const c = brandCut();
  c.recipe('brand', x);
  expect(items(c, 'common.notecard').map((n) => [n.start, +(n.end - n.start).toFixed(3), n.params.items])).toEqual([[22.5 + 0.9, 3.4, 'No black frames|No clipped audio']]);
});
