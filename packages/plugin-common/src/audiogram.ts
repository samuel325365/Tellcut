// common.audiogram — the sound of the speech drawn so a podcast with no picture still moves: a row of bars (now in the middle, the
// last second spreading outwards), a smooth wave flowing right to left, or a ring of bars round the show's cover; in the speaker's
// colour, with their name. The level comes from the source's analysis peaks (100 a second, MediaApi.peaks; an export's prepare copies
// them into cache/peaks), read at the source second the film moment plays: through the clip it hangs on (its source, in and speed, so
// trims and moves stay in step) or, not hung, through whichever audio-track clip plays then (a tightened talk of many clips too).
// draw(t) keeps no state from the frame before: the softness comes from a window of `smooth` seconds round the moment.
import { cachedTimes, clamp, cssCamel, h, rng, TIME_EPS, type ItemType, type Project, type SceneItem, type SourcePeaks, type Theme, type Times } from '@tellcut/engine';
import { isLight, mixHex, withAlpha } from './color.ts';
import { imagesReady, showStill, stillRef, windowEl, type Still, type Win } from './window.ts';

type Look = 'bars' | 'wave' | 'ring';
interface P {
  look: Look; source: string; at: number; speakers: unknown; names: unknown; colors: unknown;
  art: string; artSource: string; artT: number; x: number; y: number; w: number; h: number; gain: number; smooth: number; count: number; font: string;
  hold: number; arts: unknown; nameX: number; nameY: number; only: number; fadeIn: number; fadeOut: number;
}
/** `arts`: one window per cover file of the list, all loaded at build so a change of cover never shows a frame without it */
interface S { cv: HTMLCanvasElement; art: Win; arts: Map<string, Win>; pill: HTMLElement; data: Map<string, SourcePeaks>; waits: Map<string, Promise<void>> }

/** a stretch of film time that plays a source's sound: film second t is source second in + (t - start) × rate */
export interface Span { source: string; start: number; end: number; in: number; rate: number }

/** the bar height when silent (a share of the full height): a quiet moment still shows a line, not nothing */
const FLOOR = 0.06;
/** seconds between neighbouring bars (bars: from the middle out; ring: from the top round both sides), and the wave's span */
const STEP = 0.04, RING_STEP = 0.025, WAVE_SPAN = 1.5;


/** What the item listens to, as spans of film time. Hung on a clip with sound (`parent`): that clip. Else with `source` and `at` ≥ 0:
 *  the item's start is source second `at`. Else every unmuted audio-track clip (of `source` when given). null: the project has no
 *  sound clip at all — the block shows made-up levels (the gallery, a mock-up), as other blocks show a painted stand-in. */
export function soundSpans(item: SceneItem, p: { source: string; at: number }, project: Project, times: Times = cachedTimes(project)): Span[] | null {
  if (item.parent !== undefined) {
    const clip = project.tracks.flatMap((t) => t.items as Array<{ id: string; source?: unknown; in?: number; speed?: number; rate?: number }>).find((i) => i.id === item.parent);
    const tm = times.get(item.parent);
    if (clip && tm && typeof clip.source === 'string' && project.sources[clip.source] && project.sources[clip.source].kind !== 'image')
      return [{ source: clip.source, start: tm.start, end: tm.end, in: clip.in ?? 0, rate: clip.speed ?? clip.rate ?? 1 }];
  }
  if (p.source && p.at >= 0) return [{ source: p.source, start: times.get(item.id)?.start ?? 0, end: Infinity, in: p.at, rate: 1 }];
  const tracks = project.tracks.filter((t) => t.kind === 'audio');
  if (!tracks.some((t) => t.items.length) && !p.source) return null;
  const out: Span[] = [];
  for (const tr of tracks) {
    if (tr.muted) continue;
    for (const it of tr.items as Array<{ id: string; source: string; in: number; rate: number; muted?: boolean }>) {
      const tm = times.get(it.id);
      if (it.muted || !tm || (p.source && it.source !== p.source) || project.sources[it.source]?.kind === 'image') continue;
      out.push({ source: it.source, start: tm.start, end: tm.end, in: it.in, rate: it.rate });
    }
  }
  return out;
}

/** the source second film time `t` plays, or null when none of the spans plays then */
export function sourceAt(spans: Span[], t: number): { source: string; s: number } | null {
  const sp = spans.find((x) => t >= x.start - TIME_EPS && t < x.end - TIME_EPS);
  return sp ? { source: sp.source, s: sp.in + (t - sp.start) * sp.rate } : null;
}

const fullOf = new WeakMap<SourcePeaks, number>();
/** what counts as full: the 95th percentile of the source's peaks (a cough or a clap above it does not shrink everything else), the
 *  loudest peak when that is 0; worked out once per source */
export function fullScale(d: SourcePeaks): number {
  let f = fullOf.get(d);
  if (f === undefined) {
    const v = d.peaks.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    f = v.length ? v[Math.floor(0.95 * (v.length - 1))] || v[v.length - 1] : 0;
    fullOf.set(d, f);
  }
  return f;
}

/** 0..1: the root mean square of the peaks within `smooth` seconds of source second `s`, against fullScale, times `gain` */
export function levelAt(d: SourcePeaks | null | undefined, s: number, smooth: number, gain = 1): number {
  if (!d || !d.peaks.length || !Number.isFinite(s)) return 0;
  const full = fullScale(d);
  if (!(full > 0)) return 0;
  const a = Math.round((s - smooth) * d.rate), b = Math.round((s + smooth) * d.rate);
  let sum = 0;
  for (let i = a; i <= b; i++) { const v = i >= 0 && i < d.peaks.length ? d.peaks[i] || 0 : 0; sum += v * v; }
  return clamp((Math.sqrt(sum / (b - a + 1)) / full) * gain);
}

/** who speaks at source second `s` in `[[from, to, who], …]` (c.speechCaptions' speakers): the latest turn that has begun and not
 *  ended, so at a change the new speaker has it at once; 0 = nobody listed */
export function speakerAt(speakers: unknown, s: number): number {
  if (!Array.isArray(speakers)) return 0;
  let who = 0, from = -Infinity;
  for (const x of speakers) {
    if (!Array.isArray(x) || x.length < 3) continue;
    const [a, b, w] = x.map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(w) && s >= a && s < b && a >= from) { who = w; from = a; }
  }
  return who;
}

/** Who speaks at film time `t` (`whoAt` gives it at any film time), holding the last speaker through a gap shorter than `hold`
 *  seconds — no sound between two c.audio pieces, or nobody listed between two turns — so the colour does not flash back to the
 *  idle one and the name tag stays; 0 = no holding. A gap at the end (nobody after it) is not held. Looked for in 1/50 s steps. */
export function heldSpeaker(whoAt: (u: number) => number, t: number, hold: number): number {
  const now = whoAt(t);
  if (now || !(hold > 0)) return now;
  const step = 0.02;
  let back = -1, last = 0;
  for (let d = step; d < hold; d += step) { const w = whoAt(t - d); if (w) { back = d; last = w; break; } }
  if (back < 0) return 0;
  for (let d = step; back + d < hold; d += step) if (whoAt(t + d)) return last;
  return 0;
}

/** the cover file for source second `s` in `[[from, to, file], …]` (the arts param, source seconds like speakers): the latest entry
 *  begun and not ended; '' = none */
export function artAt(arts: unknown, s: number): string {
  if (!Array.isArray(arts)) return '';
  let file = '', from = -Infinity;
  for (const x of arts) {
    if (!Array.isArray(x) || x.length < 3) continue;
    const a = Number(x[0]), b = Number(x[1]), f = typeof x[2] === 'string' ? x[2].trim() : '';
    if (f && Number.isFinite(a) && Number.isFinite(b) && s >= a && s < b && a >= from) { file = f; from = a; }
  }
  return file;
}
/** every cover file the arts list names, once */
const artFiles = (arts: unknown): string[] =>
  Array.isArray(arts) ? [...new Set(arts.filter((x) => Array.isArray(x) && typeof x[2] === 'string' && x[2].trim()).map((x) => (x[2] as string).trim()))] : [];

/** the source second heard at film time `t`, else the last one heard before it (the end of the latest span that has ended): a gap
 *  keeps the cover it had */
export function heardAt(spans: Span[], t: number): { source: string; s: number } | null {
  const now = sourceAt(spans, t);
  if (now) return now;
  let best: Span | null = null;
  for (const sp of spans) if (sp.end <= t + TIME_EPS && Number.isFinite(sp.end) && (!best || sp.end > best.end)) best = sp;
  return best ? { source: best.source, s: best.in + (best.end - best.start) * best.rate } : null;
}

/** speaker `who`'s colour: colors[who] when given, else the theme's accent (nobody and the first), accent2, hl, then round again */
export function speakerColor(who: number, colors: unknown, theme: Pick<Theme, 'palette'>): string {
  const own = Array.isArray(colors) ? colors[who] : undefined;
  if (typeof own === 'string' && own.trim()) return own.trim();
  const { accent, accent2, hl } = theme.palette;
  return who <= 1 ? accent : [accent, accent2, hl][(who - 1) % 3];
}

/** made-up speech levels, 100 a second, the same every time: phrases of syllables with breaths between (12 s, played round) */
export const DEMO: SourcePeaks = (() => {
  const r = rng(20261031), rate = 100, n = 12 * rate, peaks: number[] = Array(n).fill(0);
  let i = 0;
  while (i < n) {
    const phraseEnd = Math.min(n, i + Math.round((1.1 + 1.5 * r()) * rate));
    while (i < phraseEnd) {
      const len = Math.round((0.11 + 0.12 * r()) * rate), amp = 0.4 + 0.6 * r();
      for (let j = 0; j < len && i + j < n; j++) peaks[i + j] = +Math.min(1, amp * Math.sin((Math.PI * (j + 0.5)) / len) ** 0.7 + 0.03 * r()).toFixed(3);
      i += len;
    }
    const pause = Math.round((0.25 + 0.4 * r()) * rate);
    for (let j = 0; j < pause && i < n; j++, i++) peaks[i] = +(0.02 * r()).toFixed(3);
  }
  return { rate, peaks };
})();
const DEMO_LEN = DEMO.peaks.length / DEMO.rate;

/** where the block sits, in px: the box's centre and size; -1 = the look's own default (9:16: the waveform just above the lower
 *  third, where captions go; the ring centred a little high) */
function layout(p: P, W: number, H: number) {
  const ring = p.look === 'ring';
  const y = p.y >= 0 ? p.y : ring ? 0.4 : 0.6, w = p.w > 0 ? p.w : ring ? 0.8 : 0.84, hh = p.h > 0 ? p.h : ring ? 0.45 : 0.12;
  return { cx: p.x * W, cy: y * H, bw: w * W, bh: hh * H };
}

/** a canvas of w × h px at (x, y); null where there is no 2D context (jsdom) */
function canvasBox(cv: HTMLCanvasElement, x: number, y: number, w: number, hh: number): CanvasRenderingContext2D | null {
  const cw = Math.max(1, Math.round(w)), ch = Math.max(1, Math.round(hh));
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cssCamel(cv, { left: `${x.toFixed(2)}px`, top: `${y.toFixed(2)}px`, width: `${cw}px`, height: `${ch}px` });
  const g = cv.getContext('2d');
  g?.clearRect(0, 0, cw, ch);
  return g;
}

/** ask the media pool for a source's peaks once; a preview with none yet asks again later (an analysis may finish meanwhile) */
function ask(media: { peaks?(source: string): Promise<SourcePeaks | null> }, s: S, source: string) {
  if (s.data.has(source) || s.waits.has(source) || !media.peaks) return;
  const w = media.peaks(source).then((d) => { if (d) s.data.set(source, d); else s.waits.delete(source); }, (e) => { s.waits.delete(source); throw e; });
  w.catch(() => {});   // the rejection is ready()'s to report (an export fails); a later ask from draw() must not go unhandled
  s.waits.set(source, w);
}

const artOf = (p: P): Still | null => (p.art ? { source: '', t: 0, file: p.art } : p.artSource ? { source: p.artSource, t: Number(p.artT) || 0 } : null);

export const audiogram: ItemType<P, S> = {
  type: 'common.audiogram', label: '音波動畫', category: 'number', kind: 'overlay',
  doc: '跟著講話聲音跳動的音波，Podcast／訪談只有聲音時撐住畫面：look bars 一排上下對稱的長條（中間是現在，往兩側是剛剛）、wave 最近 1.5 秒的音量從右往左流過的平滑曲線、ring 圓形封面四周一圈放射長條（封面跟著音量微微放大）；聲音從素材的分析讀：整段放一個項目，跟著時間軸上音軌正在播的講話（tighten 剪過也對得上；有別的音軌片段時 source 指定素材），只屬於一段片段時掛在那段上：c.attach(c.effect(\'common.audiogram\', { at, len, look }), clipId)，修剪、移動都對得上；at 固定對上 source 的第幾秒；speakers [[從, 到, 第幾位]]（素材秒數，跟 c.speechCaptions 同一種寫法）＋names [\'\', \'A\', \'B\']，換人那一刻音波顏色和名牌一起換（預設主題 accent、accent2，colors 蓋過）；hold 秒數：兩段聲音（或兩位講者）之間短於這麼久的空檔，顏色和名牌留在前一位，不閃回沒人時的顏色；only 第幾位：只在那位講者說話時跳，顏色和名牌固定是他的（兩個人各放一個音波時用）；封面 art（專案裡的檔案）或 artSource＋artT（素材的一格），ring 放在圓心，bars／wave 放在音波上方的圓角方塊；封面不是正方形時等比放大到蓋滿再從正中裁掉多的（ring 裁成圓、bars／wave 裁成正方形），重點要在圖的中間；arts [[從, 到, 檔案], …]（素材秒數，跟 speakers 同一種寫法）依時間換封面，沒對到的時間用 art；x y w h 位置大小；nameX nameY 名牌中心的位置；fadeIn fadeOut 淡入淡出秒數；gain 放大、smooth 平滑秒數；沒有任何音軌時畫示意的音量；背景、節目標題、字幕交給 common.backdrop、common.header、common.caption',
  params: [
    { key: 'look', label: '外觀（bars 一排長條，中間是現在；wave 最近 1.5 秒從右往左流過；ring 圓形封面四周一圈長條）', type: 'enum', options: ['bars', 'wave', 'ring'], default: 'bars' },
    { key: 'source', label: '聽哪個素材（空＝音軌上正在播的；掛在片段上時用那段片段）', type: 'source-ref', default: '' },
    { key: 'at', label: '開頭對上素材的第幾秒（要給 source；-1＝跟著時間軸上的片段）', type: 'number', min: -1, max: 36000, step: 0.1, default: -1 },
    { key: 'speakers', label: '誰在說話（[[從, 到, 第幾位], …]，素材秒數）', type: 'json', default: [] },
    { key: 'names', label: '名牌（[\'\', 第 1 位, 第 2 位…]；空＝不顯示）', type: 'json', default: [] },
    { key: 'colors', label: '顏色（[沒人時, 第 1 位, 第 2 位…]；空＝主題的 accent、accent2、hl）', type: 'json', default: [] },
    { key: 'art', label: '封面（專案裡的圖檔，例如 media/cover.jpg）', type: 'string', default: '' },
    { key: 'artSource', label: '封面用素材的一格（沒有 art 時）', type: 'source-ref', default: '' },
    { key: 'artT', label: '封面取素材的第幾秒', type: 'number', min: 0, max: 36000, step: 0.1, default: 0 },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例；-1＝自動：音波在下三分之一之上，ring 偏上）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'w', label: '寬（畫面寬比例；-1＝自動）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'h', label: '高（畫面高比例；-1＝自動）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'gain', label: '音量放大', type: 'number', min: 0.2, max: 4, step: 0.05, default: 1 },
    { key: 'smooth', label: '平滑（秒，音量取前後這麼久的均方根）', type: 'number', min: 0.01, max: 0.5, step: 0.01, default: 0.06 },
    { key: 'count', label: '長條數（0＝自動：bars 41、ring 72）', type: 'number', min: 0, max: 200, step: 1, default: 0 },
    { key: 'font', label: '名牌字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'hold', label: '空檔延用前一位（秒；兩段聲音或兩位講者之間短於這麼久的空檔，顏色和名牌留在前一位；0＝不延用）', type: 'number', min: 0, max: 5, step: 0.05, default: 0 },
    { key: 'only', label: '只跟一位講者（speakers 的第幾位：只在他說話時跳，顏色和名牌固定是他的；0＝跟所有人的聲音）', type: 'number', min: 0, max: 9, step: 1, default: 0 },
    { key: 'arts', label: '依時間換封面（[[從, 到, 檔案], …]，素材秒數；沒對到的時間用 art）', type: 'json', default: [] },
    { key: 'nameX', label: '名牌中心 x（畫面寬比例；-1＝自動：音波的中心）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'nameY', label: '名牌中心 y（畫面高比例；-1＝自動：bars／wave 在音波上方，ring 在圓的下方）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'fadeIn', label: '淡入（秒）', type: 'number', min: 0, max: 5, step: 0.05, default: 0 },
    { key: 'fadeOut', label: '淡出（秒）', type: 'number', min: 0, max: 5, step: 0.05, default: 0 },
  ],
  media(item, project) {
    const p = item.params as Partial<P>, spans = soundSpans(item, { source: p.source ?? '', at: Number(p.at ?? -1) }, project) ?? [];
    const art = !p.art && p.artSource ? [stillRef({ source: p.artSource, t: Number(p.artT) || 0 })] : [];
    return { videos: [], stills: art, peaks: [...new Set(spans.map((s) => s.source))] };
  },
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), art = windowEl(ctx.root);
    // the covers by time, each in a window of its own and loading from the start (hidden until its time)
    const arts = new Map(artFiles(ctx.params.arts).map((f) => { const w = windowEl(ctx.root); showStill(ctx.media, w, { source: '', t: 0, file: f }, 1, 1, 0); return [f, w] as const; }));
    const pill = h('div', null, null, ctx.root);
    cssCamel(cv, { position: 'absolute', pointerEvents: 'none' });
    cssCamel(pill, { position: 'absolute', whiteSpace: 'pre', fontWeight: '700', lineHeight: '1.2', borderRadius: '999px', transform: 'translate(-50%, 0)' });
    const s: S = { cv, art, arts, pill, data: new Map(), waits: new Map() };
    audiogram.draw(ctx, s);   // asks for the peaks and starts loading the cover, so ready() can wait for both
    return s;
  },
  ready: async (s) => { await Promise.all([...s.waits.values()]); await imagesReady([s.art.img, ...[...s.arts.values()].map((w) => w.img)]); },
  hide(s) { s.cv.width = 0; s.cv.height = 0; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, smooth = Math.max(0.005, Number(p.smooth) || 0.06), gain = Number(p.gain) || 1;
    const spans = soundSpans(ctx.item, { source: p.source, at: Number(p.at) }, ctx.project);
    for (const sp of spans ?? []) ask(ctx.media, s, sp.source);
    const t0 = ctx.t - ctx.local;
    // the source second film time u plays, and its level: from the made-up levels when there is nothing to listen to
    const at = (u: number): { source: string; s: number } | null => (spans ? sourceAt(spans, u) : { source: '', s: ((((u - t0) % DEMO_LEN) + DEMO_LEN) % DEMO_LEN) });
    // only: the level of that one speaker's turns, nothing while anyone else talks
    const only = Math.max(0, Math.round(Number(p.only) || 0));
    const level = (u: number) => {
      const x = at(u);
      if (!x || (only && speakerAt(p.speakers, x.s) !== only)) return 0;
      return levelAt(spans ? s.data.get(x.source) : DEMO, x.s, smooth, gain);
    };
    const amp = (u: number) => FLOOR + (1 - FLOOR) * level(u);
    const whoAt = (u: number) => { const x = at(u); return x ? speakerAt(p.speakers, x.s) : 0; };
    const who = only || heldSpeaker(whoAt, ctx.t, Number(p.hold) || 0), color = speakerColor(who, p.colors, theme);
    const { cx, cy, bw, bh } = layout(p, W, H);
    const fadeIn = Number(p.fadeIn) || 0, fadeOut = Number(p.fadeOut) || 0;
    const alpha = Math.min(fadeIn > 0 ? clamp(ctx.local / fadeIn) : 1, fadeOut > 0 ? clamp((ctx.dur - ctx.local) / fadeOut) : 1);
    // the cover: the arts entry for the source second heard (in a gap, the last one heard), else art / artSource
    const heard = spans ? heardAt(spans, ctx.t) : at(ctx.t), file = heard ? artAt(p.arts, heard.s) : '';
    const art: Still | null = file ? { source: '', t: 0, file } : artOf(p);
    let win = s.art;
    if (file) {
      win = s.arts.get(file) ?? (() => { const w = windowEl(ctx.root); ctx.root.insertBefore(w.box, s.pill); s.arts.set(file, w); return w; })();
    }
    for (const w of [s.art, ...s.arts.values()]) if (w !== win) cssCamel(w.box, { display: 'none' });
    cssCamel(s.cv, { opacity: alpha.toFixed(3) });
    let pillY: number, pillTop: boolean;
    if (p.look === 'ring') {
      const D = Math.min(bw, bh), R0 = D * 0.31, rIn = R0 + D * 0.04, n = Math.max(8, Math.round(p.count) || 72), lw = ((2 * Math.PI * rIn) / n) * 0.5;
      const maxLen = D / 2 - rIn - lw;
      const g = canvasBox(s.cv, cx - D / 2, cy - D / 2, D, D);
      if (g) {
        g.lineCap = 'round'; g.lineWidth = lw; g.strokeStyle = color;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (2 * Math.PI * i) / n, d = Math.min(i, n - i), len = Math.max(0.5, amp(ctx.t - d * RING_STEP) * maxLen);
          g.globalAlpha = 1 - 0.4 * (d / (n / 2));
          g.beginPath();
          g.moveTo(D / 2 + Math.cos(a) * rIn, D / 2 + Math.sin(a) * rIn);
          g.lineTo(D / 2 + Math.cos(a) * (rIn + len), D / 2 + Math.sin(a) * (rIn + len));
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      // the cover breathes with the voice (at most 6 % larger), ringed in the speaker's colour
      const grow = 1 + 0.06 * level(ctx.t);
      showStill(ctx.media, win, art, 2 * R0, 2 * R0, alpha);
      cssCamel(win.box, { left: `${cx - R0}px`, top: `${cy - R0}px`, borderRadius: '50%', display: alpha > 0 ? 'block' : 'none', transform: `scale(${grow.toFixed(4)})`,
        boxShadow: `0 0 0 ${(6 * k).toFixed(2)}px ${color}, 0 ${(14 * k).toFixed(2)}px ${(40 * k).toFixed(2)}px rgba(0,0,0,0.35)` });
      cssCamel(win.ph, { background: `radial-gradient(circle at 50% 38%, ${mixHex(color, '#ffffff', 0.25)} 0%, ${color} 45%, ${mixHex(color, '#000000', 0.55)} 100%)` });
      pillY = cy + D / 2 + 26 * k; pillTop = true;
    } else {
      const g = canvasBox(s.cv, cx - bw / 2, cy - bh / 2, bw, bh);
      if (g && p.look === 'wave') drawWave(g, bw, bh, color, (j) => amp(ctx.t - (1 - j) * WAVE_SPAN), k);
      else if (g) {
        const n = Math.max(3, Math.round(p.count) || 41) | 1, c = (n - 1) / 2, pitch = bw / n, bar = pitch * 0.6;
        g.fillStyle = color;
        for (let i = 0; i < n; i++) {
          const d = Math.abs(i - c), hh = Math.max(bar, amp(ctx.t - d * STEP) * bh);
          g.globalAlpha = 1 - 0.5 * (d / c);
          g.beginPath();
          g.roundRect(i * pitch + (pitch - bar) / 2, (bh - hh) / 2, bar, hh, bar / 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      // the cover in a rounded square above the waveform and the name
      const A = Math.min(bw * 0.55, H * 0.24), bottom = cy - bh / 2 - 96 * k;
      if (art) {
        showStill(ctx.media, win, art, A, A, alpha);
        cssCamel(win.box, { left: `${cx - A / 2}px`, top: `${bottom - A}px`, borderRadius: `${(theme.radius * k).toFixed(2)}px`, transform: 'none',
          boxShadow: `0 ${(14 * k).toFixed(2)}px ${(40 * k).toFixed(2)}px rgba(0,0,0,0.35)` });
      } else cssCamel(win.box, { display: 'none' });
      pillY = cy - bh / 2 - 22 * k; pillTop = false;
    }
    const name = Array.isArray(p.names) && typeof p.names[who] === 'string' ? p.names[who].trim() : '';
    s.pill.textContent = name;
    const light = isLight(color);
    // nameX / nameY: the tag's centre where asked (each on its own), else today's place
    const nx = Number(p.nameX), ny = Number(p.nameY), placed = ny >= 0;
    cssCamel(s.pill, { display: name && alpha > 0 ? 'block' : 'none', opacity: alpha.toFixed(3), left: `${nx >= 0 ? nx * W : cx}px`, top: `${placed ? ny * H : pillY}px`,
      transform: placed ? 'translate(-50%, -50%)' : pillTop ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      background: color, color: light ? '#141414' : '#ffffff', fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${(40 * k).toFixed(2)}px`,
      padding: `${(8 * k).toFixed(2)}px ${(28 * k).toFixed(2)}px`, letterSpacing: `${(1 * k).toFixed(2)}px`, boxShadow: `0 ${(6 * k).toFixed(2)}px ${(18 * k).toFixed(2)}px ${withAlpha('#000000', 0.25)}` });
  },
};

/** the wave: the level over the last WAVE_SPAN seconds as a ribbon mirrored about the middle (oldest at the left, fading in), its
 *  edges a smooth line through the midpoints; `amp(j)` is the height at j (0 = oldest, 1 = now) */
function drawWave(g: CanvasRenderingContext2D, bw: number, bh: number, color: string, amp: (j: number) => number, k: number) {
  const N = 96, lw = Math.max(2, 5 * k), half = (bh - lw) / 2;
  const pts = Array.from({ length: N }, (_, i) => { const j = i / (N - 1); return [lw / 2 + j * (bw - lw), amp(j) * half] as const; });
  const edge = (sign: 1 | -1, back: boolean) => {
    const q = back ? [...pts].reverse() : pts;
    if (!back) g.moveTo(q[0][0], bh / 2 - sign * q[0][1]); else g.lineTo(q[0][0], bh / 2 - sign * q[0][1]);
    for (let i = 1; i < q.length - 1; i++) {
      const mx = (q[i][0] + q[i + 1][0]) / 2, my = bh / 2 - sign * (q[i][1] + q[i + 1][1]) / 2;
      g.quadraticCurveTo(q[i][0], bh / 2 - sign * q[i][1], mx, my);
    }
    const last = q[q.length - 1];
    g.lineTo(last[0], bh / 2 - sign * last[1]);
  };
  g.beginPath(); edge(1, false); edge(-1, true); g.closePath();
  g.fillStyle = withAlpha(color, 0.3); g.fill();
  g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = color;
  g.beginPath(); edge(1, false); g.stroke();
  g.beginPath(); edge(-1, false); g.stroke();
  // now: a dot at the right end
  const [x, y] = pts[N - 1];
  g.fillStyle = color;
  g.beginPath(); g.arc(x, bh / 2 - y, lw * 1.2, 0, Math.PI * 2); g.fill();
  // the oldest end fades in
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, bw * 0.25, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade; g.fillRect(0, 0, bw, bh);
  g.globalCompositeOperation = 'source-over';
}
