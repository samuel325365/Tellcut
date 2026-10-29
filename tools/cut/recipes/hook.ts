// Recipe `hook`: a hook short cut from talk footage (zhongli food, podcast). Panel layout, an opening that lands hard, then segment by
// segment a numbered badge and tags over the clip, speech captions with highlighted and bleeped words, chapter dots, a call to action
// at the end, music under it all.
//
// The layout stacks top to bottom without overlaps: the badge with its top on the top safe margin (the app's account name covers the
// top 11.5 % of a 9:16 film), the tags under it, the panel under them down to 0.62, the chapter dots just under it, the captions above
// the short-video interface at the bottom.
import { z } from 'zod';
import { resolveTheme } from '@tellcut/engine';
import { panelFrame } from '@tellcut/plugin-common';
import type { Cut } from '../cut.ts';
import { ThemeSchema, type Recipe } from './types.ts';

const Frame = z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]);
const Segment = z.object({
  src: z.string(), from: z.number().min(0), len: z.number().positive(),
  badge: z.string().optional(), plate: z.string().optional(), tags: z.array(z.string()).optional(),
  /** words said in this stretch to highlight in the captions / to bleep (beep, sticker, the sound cut out) */
  highlight: z.array(z.string()).default([]), censor: z.array(z.string()).default([]),
  /** words the transcript misheard in this stretch: { 聽成的: 實際的 } */
  fix: z.record(z.string()).default({}),
  /** speech captions: true (all), false (none), or the sentences to keep (any caption containing one of these) */
  captions: z.union([z.boolean(), z.array(z.string())]).default(true), focus: z.number().min(0).max(1).optional(),
  /** the pauses in the speech cut out (c.tighten): a talk segment plays tight, the segment ends up shorter than len */
  tighten: z.boolean().default(true),
});
/** the badge's size (% of the short side) */
const BADGE = 12;
/** the chapter icons' size (common.progress iconSize): 1.4 read as specks in a thumbnail; the current one is 1.35 times this */
const ICONS = 2.2;
const Content = z.object({
  hook: z.object({ text: z.string(), kind: z.enum(['burst', 'slam']).default('burst'), len: z.number().positive().default(1.8), shake: z.boolean().default(false) }),
  segments: z.array(Segment).min(1),
  cta: z.string().optional(),
  /** the panel layout (true: the default frame), a frame of your own, or false for full-screen footage */
  panel: z.union([z.boolean(), z.object({ frame: Frame.optional(), radius: z.number().min(0).optional() })]).default(true),
  theme: ThemeSchema.optional(),
  music: z.union([z.string(), z.object({ style: z.string(), bpm: z.number().optional(), key: z.string().optional(), seed: z.number().optional(), gain: z.number().optional() })]).default('playful'),
  /** one emoji per segment for the chapter dots (cycled); none: plain dots */
  icons: z.string().optional(),
  captions: z.record(z.unknown()).default({ style: 'bubble' }),
  /** misheard words fixed in every segment's captions */
  fix: z.record(z.string()).default({}),
});
export type HookContent = z.input<typeof Content>;

export const hook: Recipe<typeof Content> = {
  id: 'hook', label: '鉤子短片', doc: '講話素材剪成的鉤子短片：面板版面、開場爆字、每段編號徽章與標籤、講話字幕（高亮、消音、改錯字）、章節點、結尾行動呼籲；美食、訪談、podcast',
  schema: Content,
  example: {
    hook: { text: '中壢人私藏\n【3 家】必吃', kind: 'burst' },
    segments: [
      { src: 'food', from: 94.5, len: 4, badge: 'No.1', plate: '阿桃的店', tags: ['500碗認證', '傳奇小吃'], highlight: ['鮮嫩'] },
      { src: 'food', from: 180, len: 4, badge: 'No.2', plate: '仁利菜包', censor: ['新珍香'], fix: { 肉蔥: '肉鬆' } },
    ],
    cta: '完整清單\n看【原片】', icons: '🍗,🥟', music: { style: 'playful', gain: -8 },
  },
  notes: [
    '版面由上到下不重疊：徽章與標籤（畫面高 0.05–0.13）→ 面板（預設 0.15–0.62）→ 章節點（面板正下方）→ 字幕（底部介面區之上）。',
    'panel 可以給 { frame: [x, y, 寬, 高] } 改面板位置；章節點會跟著貼在面板下方。',
    'censor 的詞要是那段真的有說出來的（以逐字稿為準）；逐字稿聽錯的字用 fix 修正字幕（不影響消音的比對）。',
    'cta 會蓋在最後一段的最後 2.2 秒。',
    '每段預設 tighten: true：講話中超過 0.6 秒的停頓縮成 0.3 秒，段落會比 len 短；要保留停頓（例如等笑點）就給 tighten: false。',
    'captions 可以給要留下的句子（例如 ["鮮嫩", "好香"]：只留含這些字的字幕）。',
    'c.recipe 會回傳每段產生的項目 id（segments[i].clip（剪停頓後的第一段）／pieces（全部）／badge／tags／captions／progress）：之後用 c.update(id, { params: { size: 5 } }) 或 { transform: { x, y, scale } } 微調任何一個（徽章、標籤、章節點掛在各段的 clip 上，給 start／end 時用相對那段 clip 的秒數）。',
  ],
  run(c: Cut, x) {
    if (x.theme) c.theme(x.theme);
    // the stack above is for a tall film (badge, tags, then the panel down to 0.62); another shape gets the panel frame made for it
    const { width, height } = c.p.meta, safeTop = resolveTheme(c.p.meta.theme, c.p.meta).safe.top;
    const tagsY = Math.round((safeTop + (BADGE / 100) * (Math.min(width, height) / height) + 0.004) * 1e4) / 1e4, panelY = tagsY + 0.036;
    const auto: [number, number, number, number] = height / width >= 1.5 ? [0.04, panelY, 0.92, Math.round((0.62 - panelY) * 1e4) / 1e4] : panelFrame(width, height);
    const frame = x.panel === false ? null : (x.panel === true ? undefined : x.panel.frame) ?? auto;
    if (frame) c.panel({ frame, radius: x.panel !== true && x.panel !== false ? x.panel.radius : undefined });
    // the dots just under the panel: icons are bigger, so their row's centre sits lower, the current one clear of the panel's edge
    const iconHalf = x.icons ? (12 * (Math.min(width, height) / 1080) * 3.2 * ICONS * 1.35) / 2 / height : 0;
    const dotsY = frame ? Math.min(0.9, Math.round((frame[1] + frame[3] + Math.max(0.035, 0.012 + iconHalf)) * 1e4) / 1e4) : -1;
    const n = x.segments.length;
    c.at(0);
    const clips: string[] = [], made: Array<Record<string, string | string[] | undefined>> = [];
    let firstLen = 0;
    for (const [i, s] of x.segments.entries()) {
      const start = c.time;
      if (i > 0) c.sfx('common.whoosh', { at: Math.max(0, start - 0.25), len: 0.5, gain: -10 });
      const whole = c.clip(s.src, { from: s.from, len: s.len, avoidBurned: true, ...(s.focus !== undefined ? { crop: { from: { x: s.focus, y: 0.5, zoom: 1 }, to: { x: s.focus, y: 0.5, zoom: 1.05 } } } : {}) });
      // the pauses cut out first: what hangs on the segment hangs on its first piece and lasts over all of them
      const pieces = s.tighten ? c.tighten(whole) : [whole], id = pieces[0];
      clips.push(id);
      const len = c.time - start;
      if (i === 0) firstLen = len;
      const ids: Record<string, string | string[] | undefined> = { clip: id, pieces };
      made.push(ids);
      // the segment's badge, tags and dot ride on its clip: a later edit of the main track carries them along
      if (s.badge || s.plate) ids.badge = c.attach(c.effect('common.badge', { at: start, len, label: s.badge ?? `${i + 1}`, plate: s.plate ?? '', size: BADGE }), id);
      if (s.tags?.length) { const lead = Math.min(0.3, len / 3); ids.tags = c.attach(c.effect('common.tag', { at: start + lead, len: len - lead, tags: s.tags.join(','), y: tagsY }), id); }   // a very short segment still gets its tags
      if (s.captions !== false) {
        const caps = c.speechCaptions(pieces, { type: 'common.caption', params: x.captions, highlight: s.highlight, censor: s.censor, fix: { ...x.fix, ...s.fix } });
        // keep only the chosen sentences: the others are taken off again
        const keep = Array.isArray(s.captions) ? s.captions : null;
        ids.captions = keep ? caps.filter((cid) => { const text = String(c.update(cid, {}).params?.text ?? '').replace(/[【】{}]/g, ''); if (keep.some((k) => text.includes(k))) return true; c.remove(cid); return false; }) : caps;
      }
      for (const w of s.censor) c.censorSpeech(pieces, w);
      ids.progress = c.attach(c.effect('common.progress', { at: start, len, mode: 'dots', position: 'bottom', y: dotsY, dots: n, step: i, ...(x.icons ? { icons: x.icons, iconSize: ICONS } : {}) }), id);
    }
    // the hook lands on the first segment: a jagged card or a slam, speed lines, an impact
    // the opening lasts no longer than the first segment really is (the source may have been shorter than asked, its pauses cut)
    const hl = Math.min(x.hook.len, firstLen), centre = frame ? frame[1] + frame[3] / 2 : 0.42;
    if (x.hook.kind === 'burst') {
      c.effect('common.speedlines', { at: 0.05, len: hl, y: centre });
      c.effect('common.burst', { at: 0.05, len: hl, text: x.hook.text, y: centre });
    } else c.effect('common.slam', { at: 0.05, len: hl, text: x.hook.text, y: centre });
    c.sfx('common.impact', { at: 0.05, len: 1.4, gain: -8 });
    if (x.hook.shake) c.shake(0.05, { dur: 0.45, px: 28 });   // the picture jolts with the impact
    if (x.cta) {
      const end = c.time, at = Math.max(0, end - 2.2);
      c.effect('common.burst', { at, len: end - at, text: x.cta, y: centre, size: 70 });
      c.sfx('common.pop', { at, len: 0.2, gain: -6 });
    }
    const m = typeof x.music === 'string' ? { style: x.music } : x.music;
    // -8 dB where nobody talks; under the speech it dips 10 dB more (measured: about 19 dB under the voice)
    c.score(m.style, { bpm: m.bpm, key: m.key, seed: m.seed, gain: m.gain ?? -8 });
    // every item it made, by segment, so a cut.ts can adjust any of them afterwards with c.update(id, { params, transform })
    return { segments: made, clips };
  },
};
