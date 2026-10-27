// Recipe `brand`: a company's brand film, the spike's twenty bars (80 BPM) as a
// starting point that stretches with the content: a hook of short lines over everyday shots, a wall of photos with a number that
// climbs, the company's own 3D beat, what they do (a dolly into the first shot, glass tags), proof from their own words over a turning
// ball, "we are" with a dolly out, and the 3D logo landing on the music's peak. The music is shaped by c.level as the spike's
// shape.mjs did; the footage rules (spec §4) are checked before anything is laid out, so too few shots is an error, never a repeat.
import { z } from 'zod';
import type { Cut } from '../cut.ts';
import { ThemeSchema, type Recipe } from './types.ts';

const Shot = z.object({ src: z.string(), from: z.number().min(0).default(0) });
const Content = z.object({
  music: z.string().default('cinematic'), bpm: z.number().min(50).max(140).default(80), key: z.string().default('Dm'), seed: z.number().default(1),
  /** 2–5 short lines over everyday shots: the promise or the problem; `shots` (2–3) cut within the line, the spike's half-bar pace */
  hook: z.array(z.object({ text: z.string(), shot: Shot.optional(), shots: z.array(Shot).min(1).max(3).optional() })
    .refine((h) => !h.shot !== !h.shots, 'brand：hook 每句給 shot（一個鏡頭）或 shots（2–3 個鏡頭，平分這句的時間），二選一')).min(1).max(5),
  /** the wall of pictures after the hook: photos (photo source ids) for its tiles, a count that climbs */
  wall: z.object({ tiles: z.array(z.string()).min(6), count: z.number().int().positive().optional(), label: z.string().default(''), text: z.string().optional() }).optional(),
  /** the company's own 3D beat (an fx with three: true written for this film), between the wall and what they do */
  scene: z.object({ type: z.string().regex(/^fx\./), bars: z.number().min(1).max(8).default(4), params: z.record(z.unknown()).default({}) }).optional(),
  /** what they do: 3–5 beats, a line each over a shot, small glass tags; `show` puts a block over the shot that shows what the line says */
  beats: z.array(z.object({
    line: z.string(), shot: Shot, tags: z.array(z.string()).default([]),
    show: z.object({ type: z.string(), params: z.record(z.unknown()).default({}) }).optional(),
  })).min(2).max(6),
  /** numbers and facts from the user's own text only; empty: the part is left out */
  proof: z.array(z.object({ big: z.string().optional(), label: z.string().default(''), line: z.string().optional() })).max(3).default([]),
  weAre: z.object({ text: z.string(), shot: Shot.optional() }),
  logo: z.object({ file: z.string().optional(), name: z.string(), tagline: z.string().default(''), url: z.string().default(''), split: z.number().int().min(0).default(0) }),
  style: z.enum(['real-3d', 'cinemascope']).default('real-3d'),
  theme: ThemeSchema.optional(),
});
export type BrandContent = z.input<typeof Content>;
type X = z.output<typeof Content>;
type S = z.output<typeof Shot>;
const hookShots = (x: X): S[] => x.hook.flatMap((h) => h.shots ?? [h.shot!]);

/** the footage rules (spec §4): every main shot different, a source at most twice and 3 s apart, enough distinct sources, wall photos apart */
function checkFootage(c: Cut, x: X) {
  const main = [...hookShots(x), ...x.beats.map((b) => b.shot), ...(x.weAre.shot ? [x.weAre.shot] : [])];
  for (const s of main) if (!c.p.sources[s.src]) throw new Error(`brand：沒有素材「${s.src}」`);
  const bySrc = new Map<string, number[]>();
  for (const s of main) bySrc.set(s.src, [...(bySrc.get(s.src) ?? []), s.from]);
  for (const [src, froms] of bySrc) {
    const dup = froms.find((f, i) => froms.indexOf(f) !== i);
    if (dup !== undefined) throw new Error(`brand：${src} 的 ${dup} 秒用了兩次（主片同一段素材的同一個入點不重複）`);
    if (froms.length > 2) throw new Error(`brand：${src} 用了 ${froms.length} 次（同一段素材最多用兩次），換別段素材`);
    if (froms.length === 2 && Math.abs(froms[0] - froms[1]) < 3) throw new Error(`brand：${src} 的兩次入點（${froms[0]} 秒、${froms[1]} 秒）要相隔 3 秒以上`);
  }
  const need = hookShots(x).length + x.beats.length;
  if (bySrc.size < need) throw new Error(`brand：主片只有 ${bySrc.size} 段不同的素材，至少要 ${need} 段（還差 ${need - bySrc.size} 段不同的素材）：用 assets search 再找，不要重複`);
  for (const id of x.wall?.tiles ?? []) {
    if (c.p.sources[id]?.kind !== 'image') throw new Error(`brand：畫面牆的 ${id} 不是照片（格子用另外下載的照片：assets get pixabay:image-…）`);
    if (bySrc.has(id)) throw new Error(`brand：畫面牆的 ${id} 也用在主片（牆的格子用另外下載的照片）`);
  }
}

export const brand: Recipe<typeof Content> = {
  id: 'brand', label: '品牌形象片', doc: '公司的品牌形象片：鉤子短句配日常鏡頭、照片牆加往上數的數字、公司自己的 3D 段落、能力段（推進第一個鏡頭、毛玻璃標籤）、證明數字、我們是誰、3D 商標落在配樂高點',
  schema: Content,
  example: {
    hook: [
      { text: 'We film everything.', shots: [{ src: 'pixabay-video-1', from: 2 }, { src: 'pixabay-video-7', from: 1 }] },
      { text: 'Then it stays on our phones.', shots: [{ src: 'pixabay-video-2', from: 4 }, { src: 'pixabay-video-8', from: 0.5 }] },
    ],
    wall: { tiles: ['pixabay-image-1', 'pixabay-image-2', 'pixabay-image-3', 'pixabay-image-4', 'pixabay-image-5', 'pixabay-image-6'], count: 696, label: 'clips.', text: 'Still waiting to be edited.' },
    beats: [
      { line: 'It watches every clip.', shot: { src: 'pixabay-video-3', from: 2 }, tags: ['Street', 'Tram', 'Morning light'] },
      { line: 'Captions and music, on the beat.', shot: { src: 'pixabay-video-4', from: 1 } },
      { line: 'It checks its own work.', shot: { src: 'pixabay-video-5', from: 3 }, show: { type: 'common.tag', params: { look: 'glass', stack: true, check: 0.4, step: 0.56, x: 0.62, y: 0.3, size: 3.6, tags: 'No black frames, Captions match the speech, No clipped audio' } } },
    ],
    proof: [{ big: '90+', label: 'BUILT-IN EFFECTS AND SOUNDS' }],
    weAre: { text: 'We are Tellcut.', shot: { src: 'pixabay-video-6', from: 2 } },
    logo: { file: 'media/brand/logo.svg', name: 'Tellcut', tagline: 'Tell it. It cuts.', url: 'tellcut.app', split: 4 },
  },
  notes: [
    '時間都對在小節上（預設 cinematic 80 BPM，一小節 3 秒）：鉤子每句 1 小節、最後一句 1.5；牆 1.5；scene 給幾小節就幾小節；能力每段 1.5；證明 2；我們是 1 加 0.5 的拉遠；商標接著拉遠立刻出現、約 2.75 小節。60 秒左右＝鉤子 3–4 句、能力 4 段、證明 1–2 個。',
    '鉤子每句用 shots 給 2 個鏡頭（半小節一換，試做片的節奏），一句只有一個鏡頭時用 shot。',
    '素材規則（存檔前就檢查，不合就報錯）：主片（hook 的每個鏡頭、beats、weAre 的 shot）同一段素材的同一個入點不重複；同一段素材最多兩次、兩次入點相隔 3 秒以上；不同素材至少 hook 鏡頭數＋beats 段數（鉤子 4 句各 2 個＋能力 4 段＝12）；不夠就再找素材，不要重複。',
    'beats 的 show 在那一段的鏡頭上放一個積木，把這句話演出來（例如檢查清單用 common.tag 的 glass 加 stack、check 逐項打勾；字幕逐字亮起用 common.caption 的 fill＋words；或這支片自己的 fx），時間從那段開始後 0.9 秒到結束前 0.2 秒；每一段都只有一行字疊在素材上，看起來像幻燈片。',
    '畫面牆的 tiles 只能是照片，而且不能用在主片：assets get 一次拿多張 Pixabay 照片（pixabay:image-…），30–40 張最好；證明段的畫面球也用這些照片。',
    'beats 第一段的 shot.from 至少要半小節（80 BPM 是 1.5 秒）：前面那段素材給推進的 3D 畫框用；weAre 的 shot 後面也要留半小節給拉遠。',
    'proof 只放使用者自己文字裡的數字和事實（big 放數字，例如「90+」，label 是下面的小字；沒有數字的一句話放 line）；沒有就給空陣列，整段省略。',
    'scene 是為這家公司寫的 3D 專案積木（fx.*，three: true），先 c.fx(…) 載入；params 照它自己的參數。',
    'style cinemascope 在橫式片加 2.39 的電影黑邊，字放在下黑邊之上；直式片沒有黑邊。',
    '回傳 parts 的各段起訖秒數，之後可以用 c.update 微調（例如改某句字的時間）。',
  ],
  run(c: Cut, x) {
    if (x.theme) c.theme(x.theme);
    checkFootage(c, x);
    const B = 240 / x.bpm, beat = 60 / x.bpm, W = c.p.meta.width, H = c.p.meta.height;
    const scope = x.style === 'cinemascope' && W > H, bar = scope ? (1 - W / H / 2.39) / 2 : 0;
    if (x.beats[0].shot.from < 0.5 * B && c.p.sources[x.beats[0].shot.src]?.kind !== 'image') throw new Error(`brand：beats[0] 的 from 至少要 ${+(0.5 * B).toFixed(3)} 秒（前面那段素材給推進的 3D 畫框用）`);
    // the lines: bottom left, from a blur (headline look brand); above the bottom bar in cinemascope
    const line = (text: string, at: number, end: number) =>
      c.effect('common.headline', { at: at + 0.2, len: end - at - 0.2, look: 'brand', text, sub: '', size: 96, bg: 'none', ...(scope ? { y: +(1 - bar - 0.045).toFixed(4) } : {}) });
    const clip = (s: { src: string; from: number }, len: number) => c.clip(s.src, { from: s.from, len, sound: false });
    const parts: Record<string, [number, number]> = {}, curve: Array<[number, number]> = [[0, 0.8]];

    // the hook: a bar a line, the last one and a half; a line's shots share its time
    c.at(0);
    x.hook.forEach((h, i) => {
      const at = c.time, len = (i === x.hook.length - 1 ? 1.5 : 1) * B, shots = h.shots ?? [h.shot!];
      for (const s of shots) clip(s, len / shots.length);
      line(h.text, at, at + len);
    });
    const hookEnd = c.time;
    parts.hook = [0, hookEnd];
    curve.push([hookEnd - 0.4, 0.8], [hookEnd + 0.3, 0.62]);
    let t = hookEnd;
    if (x.wall) {
      c.effect('common.wall', { at: t, len: 1.5 * B, tiles: x.wall.tiles.join(','), push: 0, ...(x.wall.count ? { count: x.wall.count, countLabel: x.wall.label } : {}) });
      if (x.wall.text) c.effect('common.headline', { at: t + 1.1, len: 1.5 * B - 1.1, look: 'brand', text: x.wall.text, sub: '', size: 56, bg: 'none', ...(scope ? { y: +(1 - bar - 0.045).toFixed(4) } : {}) });
      c.sfx('common.air', { at: t, len: 1.6, gain: -14 });
      parts.wall = [t, t + 1.5 * B]; t += 1.5 * B;
    }
    if (x.scene) {
      c.effect(x.scene.type, { at: t, len: x.scene.bars * B, ...x.scene.params });
      parts.scene = [t, t + x.scene.bars * B]; t += x.scene.bars * B;
    }
    // what they do: a dolly into the first shot when a 3D part comes before it
    const dollyIn = !!(x.wall || x.scene);
    if (dollyIn) curve.push([t - 0.6, 0.55], [t, 0.82]);
    const beatsAt = t + (dollyIn ? 0.5 * B : 0);
    c.at(beatsAt);
    x.beats.forEach((b, i) => {
      const at = c.time, len = 1.5 * B, id = clip(b.shot, len);
      if (i === 0 && dollyIn) { c.dolly(id, { dir: 'in', len: 0.5 * B }); c.sfx('common.whoosh', { at: at - 0.5 * B, len: 0.6, dur: 0.6, gain: -14 }); }
      line(b.line, at, at + len);
      c.sfx('common.ding', { at, len: 1.2, step: i, scale: 'pentatonic', gain: -18 });
      if (b.tags.length) {
        // at least 48 px high: the block's default (1.8 % of the height) read as a footnote over the footage (tellcut-brand-film set 4.5)
        c.effect('common.tag', { at: at + 0.9, len: len - 1.1, look: 'glass', tags: b.tags.join(','), step: 0.75 * beat, size: Math.max(1.8, Math.ceil(48000 / c.p.meta.height) / 10) });
        b.tags.forEach((_, k) => c.sfx('common.tick', { at: at + 0.9 + k * 0.75 * beat, len: 0.05, gain: -16 }));
      }
      if (b.show) c.effect(b.show.type, { at: at + 0.9, len: len - 1.1, ...b.show.params });
    });
    const beatsEnd = c.time;
    parts.beats = [beatsAt, beatsEnd];
    curve.push([beatsAt, 1], [beatsAt + 1, 0.86], [beatsEnd, 0.86]);
    t = beatsEnd;
    // proof: the turning ball of the wall's photos under one big number or fact each
    if (x.proof.length) {
      const len = 2 * B, each = len / x.proof.length;
      const tiles = x.wall?.tiles.join(',') ?? [...hookShots(x), ...x.beats.map((b) => b.shot)].map((s) => `${s.src}@${s.from}`).join(',');
      // the words sit on the left: in a landscape frame the ball moves right to leave them room (the spike's layout)
      c.effect('common.wall', { at: t, len, look: 'sphere', tiles, ...(W > H ? { x: 0.68 } : {}) });
      x.proof.forEach((p, i) => {
        c.effect('common.headline', { at: t + i * each, len: each, look: 'proof', text: p.big ?? p.line ?? '', sub: p.label, size: 100, bg: 'none' });
        c.sfx('common.thud', { at: t + i * each, len: 0.4, gain: -12 });
      });
      parts.proof = [t, t + len];
      curve.push([t + 0.5, 0.74], [t + len, 0.74]);
      t += len;
    }
    // we are: a bar on its shot (or the last beat's shot, carried on), then a dolly out into the logo's space
    c.at(t);
    const last = x.beats[x.beats.length - 1].shot, weShot = x.weAre.shot ?? { src: last.src, from: last.from + 1.5 * B };
    const we = clip(weShot, B);
    line(x.weAre.text, t, t + B);
    c.dolly(we, { dir: 'out', len: 0.5 * B });
    parts.weAre = [t, t + 1.5 * B];
    t += 1.5 * B;
    // the logo: its mark pops from the logo's first frame (hit 0.75, the mark grows from hit - 0.75) as the spike's does when the last
    // footage ends; a later hit left the dark logo background empty for seconds after the dolly out. It stays two and a half bars
    const hit = t + 0.75, logoLen = 0.75 + 2.5 * B;
    c.effect('common.logo', { at: t, len: logoLen, logo: x.logo.file ?? '', name: x.logo.name, tagline: x.logo.tagline, url: x.logo.url, split: x.logo.split, hit: 0.75 });
    c.sfx('common.riser', { at: hit - 1.6, len: 1.6, dur: 1.6, gain: -14 });
    c.sfx('common.impact', { at: hit, len: 1.4, gain: -10 });
    c.sfx('common.shing', { at: hit, len: 1.2, gain: -12 });
    parts.logo = [t, t + logoLen];
    const total = t + logoLen;
    curve.push([hit - 2.2, 0.6], [hit - 0.05, 0.7], [hit + 0.05, 1], [total, 0.95]);
    // the whole film: a light warm tone, the spike's fine grain (grey noise by overlay at 7 %, spec §6.2-5), the letterbox in cinemascope
    c.effect('common.tone', { at: 0, len: total, color: '#ffd9b3', edge: '#140d08', amount: 0.18 });
    c.effect('common.film', { at: 0, len: total, layer: 'top', grain: 0.07, blend: 'overlay', vignette: 0.25, ...(scope ? { letterbox: 2.39 } : {}) });
    c.score(x.music, { bpm: x.bpm, key: x.key, seed: x.seed });
    // a point that would step back in time (no wall or scene: the hook runs straight into the beats) is dropped
    const level: Array<[number, number]> = [];
    for (const [a, g] of curve) { const at = +a.toFixed(4); if (!level.length || at >= level[level.length - 1][0]) level.push([at, g]); }
    c.level(level);
    c.at(total);
    return { duration: +total.toFixed(4), parts };
  },
};
