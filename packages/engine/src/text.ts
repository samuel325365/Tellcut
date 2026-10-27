// Generic text overlays for every project (spec 2026-10-14 §6): title, caption, lower third, end card.
// Plain DOM text styled with CSS. Line widths are estimated (CJK 1 em, other characters 0.55 em), so the preview and the
// export wrap the same way whatever fonts the machine has. Position and size come from the item transform as for any overlay.
// The project theme gives the fonts and the margins: captions sit on the bottom safe margin, the lower third above them.
import type { ItemType, ParamDef } from './plugin.ts';
import { clamp, cssCamel, eOut3, h } from './util.ts';

export const TEXT_FONTS = ['Noto Sans TC', 'Noto Serif TC', 'Noto Sans JP', 'Microsoft JhengHei', 'DFKai-SB'];
const ANIMS = ['none', 'fade', 'rise', 'slide', 'typewriter'];

const wide = (c: string) => /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/.test(c);
/** Estimated width of a line in em. */
export const textEm = (s: string) => Math.round([...s].reduce((w, c) => w + (wide(c) ? 1 : 0.55), 0) * 1000) / 1000;

const LATIN = /^[A-Za-z0-9'’.,!?:;-]+$/, BLEEP = /^[＊＃％＠＆]+$/;
/** characters that never start a line on their own: particles (的 了 嗎…) and the measure words after 這一／那一 (側 邊…) */
const NO_START = /^[的了著過嗎呢吧啊呀啦喔哦嘛們側邊面裡]$/;
/** a word too wide for any line, in pieces: its characters, a no-start character kept with the one before it */
const pieces = (t: string) => [...t].reduce<string[]>((out, c) => { if (out.length && NO_START.test(c)) out[out.length - 1] += c; else out.push(c); return out; }, []);
// word boundaries for Chinese (toolkit phase 5): 咖啡色, 火車 stay whole; the browser and Node both have it (ICU)
const SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh-Hant', { granularity: 'word' }) : null;

/** The pieces a line may break between: Chinese words, Latin words (with the space after them), runs of bleep symbols. */
export function lineTokens(para: string): string[] {
  if (!SEGMENTER) return para.match(/[A-Za-z0-9'’.,!?:;-]+\s*|[＊＃％＠＆]+|\s+|./gu) ?? [];   // CJK between any two characters
  const out: string[] = [];
  for (const { segment } of SEGMENTER.segment(para)) {
    const last = out.length ? out[out.length - 1] : undefined;
    const glue = last !== undefined && (
      (/^\s+$/.test(segment) && !/\s$/.test(last))                    // a space rides on the word before it
      || (LATIN.test(segment) && LATIN.test(last))                    // 2025.07.14, don't: one piece
      || (BLEEP.test(segment) && BLEEP.test(last))                    // a bleep stays whole
      || (NO_START.test(segment) && !/\s$/.test(last)));              // 小的, 這一側, 吃飽了: not 小／的 across lines
    if (glue) out[out.length - 1] = last + segment; else out.push(segment);
  }
  // a word longer than any line can be may still break inside it
  return out;
}

function wrap(text: string, em: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    // whole words where possible; one wider than the line breaks between its characters
    for (const tok of lineTokens(para).flatMap((t) => (textEm(t.trimEnd()) > em && !BLEEP.test(t) ? pieces(t) : [t]))) {
      // a closing mark never starts a line (it hangs past the edge by a hair); a run of bleep symbols stays whole
      if (line.trim() && !/^[，。！？、；：）」』】》…]/.test(tok) && textEm((line + tok).trimEnd()) > em) { out.push(line.trimEnd()); line = tok.trimStart(); } else line += tok;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Lines of `text` in a box `boxEm` wide; above maxLines the font shrinks in 5 % steps down to minScale. */
export function fitLines(text: string, boxEm: number, maxLines: number, minScale = 0.7): { lines: string[]; scale: number } {
  for (let k = 0; ; k++) {
    const scale = Math.max(minScale, 1 - k * 0.05), lines = wrap(text, boxEm / scale);
    if (lines.length <= maxLines || scale <= minScale) return { lines: balance(text, lines, boxEm / scale), scale: Math.round(scale * 100) / 100 };
  }
}

/** The narrowest box that still gives the same number of lines: lines of even length, no lone word left at the end. */
function balance(text: string, lines: string[], em: number): string[] {
  if (lines.length < 2) return lines;
  let lo = 0, hi = em;
  for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (wrap(text, mid).length <= lines.length) hi = mid; else lo = mid; }
  return wrap(text, hi);
}

export interface Anim { animIn: string; animOut: string; animDur: number }
/** Opacity, offset (px) and the typed share of a text block at `local` within `dur`. */
export function animState(p: Anim, local: number, dur: number, W: number, H: number) {
  const d = Math.max(0, Math.min(p.animDur, dur / 2));
  const a = d > 0 ? eOut3(clamp(local / d)) : 1, b = d > 0 ? eOut3(clamp((dur - local) / d)) : 1;
  const shift = (anim: string, k: number): [number, number] => (anim === 'rise' ? [0, (1 - k) * H * 0.04] : anim === 'slide' ? [-(1 - k) * W * 0.06, 0] : [0, 0]);
  const [x1, y1] = shift(p.animIn, a), [x2, y2] = shift(p.animOut, b);
  const inA = p.animIn === 'none' || p.animIn === 'typewriter' ? 1 : a, outB = p.animOut === 'none' ? 1 : b;
  return { opacity: Math.round(Math.min(inA, outB) * 1000) / 1000, x: x1 + x2, y: y1 + y2, typed: p.animIn === 'typewriter' ? (d > 0 ? clamp(local / d) : 1) : 1 };
}
const typedText = (s: string, share: number) => { const cs = [...s]; return cs.slice(0, Math.ceil(cs.length * share)).join(''); };

interface TextP extends Anim { text: string; font: string; size: number; color: string }
const common = (size: number, animIn = 'fade', font: 'display' | 'body' = 'display'): ParamDef[] => [
  { key: 'font', label: '字型', type: 'enum', options: TEXT_FONTS, default: 'Noto Sans TC', theme: `fonts.${font}` },
  { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 1, max: 30, step: 0.5, default: size },
  { key: 'color', label: '文字顏色', type: 'color', default: '#ffffff' },
  { key: 'animIn', label: '進場', type: 'enum', options: ANIMS, default: animIn },
  { key: 'animOut', label: '出場', type: 'enum', options: ANIMS.filter((a) => a !== 'typewriter'), default: 'fade' },
  { key: 'animDur', label: '動畫長度 (s)', type: 'number', min: 0, max: 3, step: 0.05, default: 0.4 },
];
const font = (p: TextP, H: number, scale = 1, weight = '700') => ({
  fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${((p.size / 100) * H * scale).toFixed(2)}px`, fontWeight: weight,
  color: p.color, lineHeight: '1.25', whiteSpace: 'pre', textAlign: 'center',
});
const boxEm = (p: TextP, H: number, widthPx: number) => widthPx / ((p.size / 100) * H);
/** a share of the frame as a CSS percentage (0.22 → "22%") */
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
/** the room two caption lines take above the bottom safe margin: the lower third keeps above it */
const CAPTION_ZONE = 0.14;
const textEl = (parent: HTMLElement) => h('div', null, null, parent);

type TitleP = TextP & { sub: string };
const title: ItemType<TitleP, { box: HTMLElement; main: HTMLElement; sub: HTMLElement }> = {
  type: 'core.title', label: '片名', kind: 'overlay', doc: '畫面中央的大標題，可加一行副標；片頭、章節開場',
  params: [{ key: 'text', label: '文字', type: 'text', default: '片名' }, { key: 'sub', label: '副標', type: 'string', default: '' }, ...common(8, 'rise')],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', left: '0', right: '0', top: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2em', textShadow: '0 2px 14px rgba(0,0,0,.65)' });
    return { box, main: textEl(box), sub: h('div', null, null, box) };
  },
  draw(ctx, s) {
    const p = ctx.params, st = animState(p, ctx.local, ctx.dur, ctx.W, ctx.H), fit = fitLines(p.text, boxEm(p, ctx.H, ctx.W * 0.9), 2);
    cssCamel(s.box, { opacity: String(st.opacity), transform: `translate(${st.x}px, calc(-50% + ${st.y}px))` });
    cssCamel(s.main, font(p, ctx.H, fit.scale));
    s.main.textContent = typedText(fit.lines.join('\n'), st.typed);
    cssCamel(s.sub, { ...font(p, ctx.H, 0.45, '400'), display: p.sub ? '' : 'none' });
    s.sub.textContent = p.sub;
  },
};

type BoxP = TextP & { background: string };
const caption: ItemType<BoxP, { box: HTMLElement; main: HTMLElement }> = {
  type: 'core.caption', label: '字幕', kind: 'overlay', doc: '畫面下方一句字幕（可換行、可加底色）；講話字幕、旁白、說明',
  params: [{ key: 'text', label: '文字', type: 'text', default: '字幕' },
    { key: 'background', label: '底色（CSS 顏色，空白＝無）', type: 'string', default: 'rgba(0,0,0,0.55)' }, ...common(4.5, 'fade', 'body')],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', left: '50%', borderRadius: '0.3em', padding: '0.15em 0.6em' });
    return { box, main: textEl(box) };
  },
  draw(ctx, s) {
    const p = ctx.params, st = animState(p, ctx.local, ctx.dur, ctx.W, ctx.H), fit = fitLines(p.text, boxEm(p, ctx.H, ctx.W * 0.84), 2);
    cssCamel(s.box, { bottom: pct(ctx.theme.safe.bottom), opacity: String(st.opacity), transform: `translate(calc(-50% + ${st.x}px), ${st.y}px)`, background: p.background || 'transparent', fontSize: `${((p.size / 100) * ctx.H * fit.scale).toFixed(2)}px` });
    cssCamel(s.main, font(p, ctx.H, fit.scale, '500'));
    s.main.textContent = typedText(fit.lines.join('\n'), st.typed);
  },
};

type LowerP = BoxP & { sub: string; accent: string };
const lowerThird: ItemType<LowerP, { box: HTMLElement; main: HTMLElement; sub: HTMLElement }> = {
  type: 'core.lowerThird', label: '標註', kind: 'overlay', doc: '左下角主標＋副標加色條；地點、人名、時間',
  params: [{ key: 'text', label: '主標', type: 'string', default: '地點' }, { key: 'sub', label: '副標', type: 'string', default: '' },
    { key: 'accent', label: '色條', type: 'color', default: '#ffd60a', theme: 'palette.hl' }, { key: 'background', label: '底色（CSS 顏色，空白＝無）', type: 'string', default: 'rgba(0,0,0,0.45)' }, ...common(4, 'slide', 'body')],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', padding: '0.3em 0.8em 0.3em 0.7em', borderLeftStyle: 'solid', borderLeftWidth: '0.18em', textAlign: 'left' });
    return { box, main: textEl(box), sub: h('div', null, null, box) };
  },
  draw(ctx, s) {
    const p = ctx.params, st = animState(p, ctx.local, ctx.dur, ctx.W, ctx.H);
    cssCamel(s.box, { left: pct(ctx.theme.safe.side), bottom: pct(ctx.theme.safe.bottom + CAPTION_ZONE), opacity: String(st.opacity), transform: `translate(${st.x}px, ${st.y}px)`, background: p.background || 'transparent', borderLeftColor: p.accent, fontSize: `${((p.size / 100) * ctx.H).toFixed(2)}px` });
    cssCamel(s.main, { ...font(p, ctx.H), textAlign: 'left' });
    s.main.textContent = typedText(p.text, st.typed);
    cssCamel(s.sub, { ...font(p, ctx.H, 0.62, '400'), textAlign: 'left', display: p.sub ? '' : 'none' });
    s.sub.textContent = p.sub;
  },
};

const endCard: ItemType<TextP & { stagger: number }, { box: HTMLElement; rows: HTMLElement[]; text: string }> = {
  type: 'core.endCard', label: '片尾字卡', kind: 'overlay', doc: '片尾多行文字逐行出現（每行一筆）；感謝、工作人員、日期',
  params: [{ key: 'text', label: '內容（每行一筆）', type: 'text', default: '感謝觀看' }, { key: 'stagger', label: '逐行間隔 (s)', type: 'number', min: 0, max: 2, step: 0.05, default: 0.3 }, ...common(4.5)],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', left: '0', right: '0', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45em' });
    return { box, rows: [], text: '' };
  },
  draw(ctx, s) {
    const p = ctx.params;
    if (s.text !== p.text) {   // rebuild the rows only when the text changed
      s.box.innerHTML = '';
      s.rows = p.text.split('\n').map((line) => { const r = h('div', null, null, s.box); r.dataset.line = ''; r.textContent = line; return r; });
      s.text = p.text;
    }
    const out = animState({ ...p, animIn: 'none' }, ctx.local, ctx.dur, ctx.W, ctx.H).opacity;
    s.rows.forEach((r, i) => {
      const st = animState({ ...p, animOut: 'none' }, ctx.local - i * p.stagger, ctx.dur, ctx.W, ctx.H);
      cssCamel(r, { ...font(p, ctx.H, i === 0 ? 1.3 : 1, i === 0 ? '700' : '400'), opacity: String(Math.round(Math.min(ctx.local < i * p.stagger ? 0 : st.opacity, out) * 1000) / 1000), transform: `translate(${st.x}px, ${st.y}px)` });
    });
  },
};

export const textTypes = [title, caption, lowerThird, endCard] as ItemType[];
