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
  const top = track(p, 'top'), at = resolveTimes(p), shots = track(p, 'v1');
  // the flash and the card lie within their shot and ride on it (save hangs them); the grain spans every shot and stays put
  expect(top.filter((i) => i.type === 'core.flash').map((i) => [+at.get(i.id)!.start.toFixed(3), i.parent])).toEqual([[+(16 * beat).toFixed(3), shots[4].id]]);
  expect([top.find((i) => i.type === 'common.film')!.start, top.find((i) => i.type === 'common.film')!.parent]).toEqual([0, undefined]);
  expect(track(p, 'text').find((i) => i.params.text === '最好的一天')!.parent).toBe(shots[2].id);
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
