// Recipe `montage`: shots cut on the beat of generated music (a wedding, a trip remembered). Every shot is a whole number of beats; each
// section of four shots begins with a flash and a whoosh; a title and a few big word cards; film grain over everything.
// How long a shot holds comes from the mood, and the four shots of a section run long, short, longer, long, so it never plays
// like a slideshow of equal holds (montage craft from OpenMontage's documentary pipeline); hero shots hold twice as long, and
// the music can drop out for a breath at the peak.
import { z } from 'zod';
import type { Cut } from '../cut.ts';
import { ThemeSchema, type Recipe } from './types.ts';

const Content = z.object({
  shots: z.array(z.object({ src: z.string(), from: z.number().min(0).optional(), focus: z.number().min(0).max(1).optional(), beats: z.number().int().positive().optional(),
    /** a shot that carries the film: it holds two bases */ hero: z.boolean().default(false),
    /** keep this shot's own sound (laughter, waves) at this gain in dB; none: silent under the music */ sound: z.number().max(12).optional() })).min(2),
  title: z.union([z.string(), z.object({ text: z.string(), size: z.number().positive().optional() })]).optional(),
  /** big word cards on the shot that starts at that index */
  cards: z.array(z.object({ shot: z.number().int().min(0), text: z.string() })).default([]),
  music: z.string().default('pluck'), bpm: z.number().min(40).max(200).optional(), seed: z.number().optional(),
  /** beats per shot when a shot does not say (none: from the mood) */
  beats: z.number().int().positive().optional(),
  /** how long shots hold: gentle ≈ 3.5 s, steady ≈ 2.5 s, lively ≈ 1.6 s, urgent ≈ 1 s (whole beats) */
  mood: z.enum(['gentle', 'steady', 'lively', 'urgent']).default('steady'),
  /** varied: the four shots of a section hold about 1, ½, 1½, 1 times the base (a section still lasts four bases); even: all the
   *  same. Default: varied, or even when `beats` is given (the old behaviour) */
  rhythm: z.enum(['varied', 'even']).optional(),
  /** the music drops out for two beats as this shot starts (the emotional peak; give it hero) */
  drop: z.number().int().min(0).optional(),
  film: z.boolean().default(true), flash: z.boolean().default(true),
  end: z.array(z.string()).optional(),
  theme: ThemeSchema.optional(),
});
export type MontageContent = z.input<typeof Content>;
/** seconds a shot holds, by mood */
const HOLD = { gentle: 3.5, steady: 2.5, lively: 1.6, urgent: 1 } as const;
/** a section's four shots in beats: long, short, longer, long — together exactly four of the base, so sections stay on the bar */
const varied = (base: number) => { const short = Math.max(1, Math.round(base / 2)); return [base, short, 2 * base - short, base]; };

export const montage: Recipe<typeof Content> = {
  id: 'montage', label: '配樂剪輯', doc: '鏡頭剪在配樂的拍子上：每四個鏡頭一段、段落開頭閃白加咻聲、片名與大字卡、底片質感；婚禮、旅行回憶、活動紀錄',
  schema: Content,
  example: {
    title: '我們的夏天', music: 'pluck', mood: 'steady',
    shots: [{ src: 'video1', from: 2 }, { src: 'video2', from: 10, sound: -14 }, { src: 'photo1' }, { src: 'video3', from: 5, hero: true }],
    cards: [{ shot: 2, text: '【最好的】一天' }], drop: 3, end: ['2025 夏天'],
  },
  notes: [
    '片長＝所有鏡頭的拍數 × 每拍秒數（60 / bpm），再加片尾卡（end）8 拍。',
    'mood 決定每個鏡頭大約停多久（gentle 3.5 秒、steady 2.5、lively 1.6、urgent 1），換成整數拍；rhythm 預設 varied：每四個鏡頭照大約「1、½、1½、1」倍長短交錯（一段的總長不變，仍對在小節上），不要全部一樣長（像幻燈片）。給了 beats 時預設 even。',
    'hero: true 的鏡頭停兩個基本長度（排在較長的位置時取較長的），留給整支片最重要的畫面；drop 給那個鏡頭的索引，配樂在它開始時空兩拍（情緒高點的留白）。',
    '鏡頭的 sound 給 dB（例如 -14）就保留它自己的聲音（笑聲、浪聲）；沒給就只有配樂。',
    '相鄰兩個鏡頭不要是同一支素材的相鄰位置（看起來像跳接），也不要連續同樣的主體和景別；存檔時會提醒前者。',
    'cards 的 shot 是鏡頭的索引，從 0 開始算（第一個鏡頭是 0）。',
    'title 可以是字串，或 { text, size }（size 是字級，畫面高的 %，預設 9；長片名可調小）；換行寫 \\n。',
    '鏡頭的 beats 可以個別指定（例如最後一個 8 拍），會蓋過 mood、rhythm 和 hero。',
  ],
  run(c: Cut, x) {
    if (x.theme) c.theme(x.theme);
    const bpm = x.bpm ?? c.bpmOf(x.music);
    if (!bpm) throw new Error(`沒有「${x.music}」這個配樂風格（npm run score -- --styles），或給 bpm`);
    c.score(x.music, { bpm, seed: x.seed });
    const beat = 60 / bpm, starts: number[] = [], holds: number[] = [];
    // the base hold in whole beats: the nearest of 1, 2, 3, 4, 6, 8 beats to the mood's seconds
    const base = x.beats ?? [1, 2, 3, 4, 6, 8].reduce((a, b) => (Math.abs(b * beat - HOLD[x.mood]) < Math.abs(a * beat - HOLD[x.mood]) ? b : a));
    c.at(0);
    const pattern = (x.rhythm ?? (x.beats ? 'even' : 'varied')) === 'varied' ? varied(base) : [base, base, base, base];
    for (const [i, s] of x.shots.entries()) {
      const n = s.beats ?? (s.hero ? Math.max(pattern[i % 4], 2 * base) : pattern[i % 4]);   // a hero holds two bases, or its longer slot
      const at = c.time, len = n * beat;
      starts.push(at); holds.push(n);
      const prev = x.shots[i - 1];
      if (prev && prev.src === s.src && Math.abs((prev.from ?? 0) - (s.from ?? 0)) < 15) c.notes.push(`montage：第 ${i - 1}、${i} 個鏡頭都是 ${s.src} 相鄰的位置（${prev.from ?? 0} 秒、${s.from ?? 0} 秒），接在一起像跳接；中間插別的鏡頭或換一段`);
      c.clip(s.src, { from: s.from ?? 0, len, sound: s.sound !== undefined, gain: s.sound, avoidBurned: true, ...(s.focus !== undefined ? { crop: { from: { x: s.focus, y: 0.5, zoom: 1 }, to: { x: s.focus, y: 0.5, zoom: 1.08 } } } : {}) });
      if (x.flash && i > 0 && i % 4 === 0) {
        c.effect('core.flash', { at, len: 0.35, layer: 'top', peak: 0.7, fall: 0.3 });
        c.sfx('common.whoosh', { at: Math.max(0, at - 0.3), len: 0.5, gain: -12 });
      }
    }
    if (x.title) {
      const t = typeof x.title === 'string' ? { text: x.title } : x.title;
      c.effect('common.slam', { at: 0.15, len: Math.min(starts[1] ?? 3, 3) - 0.2, text: t.text, tilt: 0, ...(t.size ? { size: t.size } : {}) });
    }
    for (const card of x.cards) {
      const at = starts[card.shot];
      if (at === undefined) throw new Error(`cards 的 shot ${card.shot} 不存在（只有 ${x.shots.length} 個鏡頭）`);
      c.effect('common.slam', { at: at + 0.05, len: holds[card.shot] * beat - 0.1, text: card.text });
      c.sfx('common.impact', { at: at + 0.05, len: 1.4, gain: -12 });
    }
    if (x.drop !== undefined) {
      if (starts[x.drop] === undefined) throw new Error(`drop ${x.drop} 不存在（只有 ${x.shots.length} 個鏡頭）`);
      c.dip(starts[x.drop], { len: 2 * beat, db: -18 });
    }
    const endLen = x.end?.length ? 4 * beat * 2 : 0, total = c.time + endLen;
    if (x.end?.length) c.endCard(x.end, { len: endLen });
    // the grain covers the end card too
    if (x.film) c.effect('common.film', { at: 0, len: Math.max(total, 1), layer: 'top', grain: 0.35, vignette: 0.4 });
    return { shots: x.shots.length, beat: +beat.toFixed(4), cuts: starts.map((t) => +t.toFixed(3)), beats: holds };
  },
};
