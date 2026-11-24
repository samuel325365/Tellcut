// common.handwrite — lines of text written on by hand, character by character, each at its own time: a handwritten subtitle that
// keeps pace with the narration ("start-end|sentence": the pen spreads the sentence over the time it is spoken), a letter that
// fills up line by line, or a taped paper note on the picture. The write-on of the baking-steps recipe card made general.
// `red` (fd-map's fx.nbCap) writes the words given in red and underlines them with a red pen as they are written.
// In replace mode a "start-end" line stays `hold` seconds (1.2) after its end, then fades out over 0.25 s (sooner when the next line starts).
// 2026-11-24: `look` picks the pen. pen is the drawing it always had; chalk, marker and crayon are drawn with the same DOM letters
// (check still measures them): chalk and crayon put an SVG filter of the item's own on the text layer (a fixed noise roughens the
// edges and knocks specks out of the letters, so the grain is the same every frame), marker draws a highlighter band on a canvas
// under each row that follows the writing, crayon also writes each sentence in the next of a few crayon colours.
import { abs, clamp, cssCamel, eOut3 as ease, h, type ItemType, rng, textEm } from '@tellcut/engine';
import { charAt, drawTexts, handFamily, textLayer, wrapEm, writeTime, type TextLayer, type Txt } from './hand.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { inkStroke, wavePts } from './sketch.ts';
import { mixHex, withAlpha } from './color.ts';
import { graphemes } from './text.ts';

export type HandLook = 'pen' | 'chalk' | 'marker' | 'crayon';
interface P {
  lines: string; mode: 'replace' | 'stack'; look: HandLook; x: number; y: number; w: number; align: 'left' | 'center'; size: number; cps: number; tilt: number;
  paper: 'none' | 'note'; small: string; halo: number; hold: number; font: string; color: string; note: string; hl: string; tapeColor: string; red: string; redColor: string;
}
/** `band` (marker's highlighter) and `fx` (chalk's and crayon's filter) are made the first time a look needs them: pen's DOM stays
 *  what it always was */
interface S { group: HTMLElement; note: HTMLElement; small: HTMLElement; tape: HTMLElement; txt: TextLayer; cv: HTMLCanvasElement; band?: HTMLCanvasElement; fx?: { svg: SVGSVGElement; id: string; key: string } }

/** crayon: the colours the sentences are written in, in turn: the block's ink first, then a fixed set of crayons (blue, green,
 *  orange, purple; the block's other colours are a paper, a tape and the red pen, none of them a crayon of its own) */
export const CRAYONS = ['#2f6fd0', '#2e9a4c', '#ee8418', '#8b4fc8'];
export const crayonColor = (ink: string, i: number) => (i % (CRAYONS.length + 1) === 0 ? ink : CRAYONS[(i % (CRAYONS.length + 1)) - 1]);

/** filter ids are document-wide and two items (or two stages) may show at once: one id an instance */
let seq = 0;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** the SVG filter of chalk or crayon for letters `px` high (the grain and the roughness follow the letters' size, so a small line
 *  is as rough as a big one): a slow fixed noise pushes the edges about, and a fine one, as a mask, knocks specks out of the letters
 *  (chalk: many, and a grain finer along the line than across it, a little uneven in strength; crayon: fewer, in streaks along the
 *  line like wax over the paper's tooth). The noise is seeded, never per frame. */
export function handFilter(id: string, look: 'chalk' | 'crayon', px: number): string {
  const u = Math.max(0.2, px / 60), f = (v: number) => +(v / u).toFixed(4), s = (v: number) => +(v * u).toFixed(3);
  const c = look === 'chalk'
    ? { edge: f(0.09), push: s(2.6), grain: `${f(0.75)} ${f(0.42)}`, mask: '0 0 0 -5.2 3.55' }
    : { edge: f(0.16), push: s(3.2), grain: `${f(0.26)} ${f(0.55)}`, mask: '0 0 0 -5.5 3.95' };
  return `<filter id="${id}" x="-15%" y="-60%" width="130%" height="220%" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${c.edge}" numOctaves="2" seed="${look === 'chalk' ? 7 : 23}" result="w"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="w" scale="${c.push}" xChannelSelector="R" yChannelSelector="G" result="d"/>`
    + `<feTurbulence type="fractalNoise" baseFrequency="${c.grain}" numOctaves="2" seed="${look === 'chalk' ? 11 : 31}" result="g"/>`
    + `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${c.mask}" result="m"/>`
    + `<feComposite in="d" in2="m" operator="in"/></filter>`;
}

/** where the words of `red` ("詞,詞") stand in a line: [from, to) ranges of letters (graphemes, as drawTexts makes its spans), in
 *  order, not overlapping */
export function redMarks(text: string, red: string): Array<[number, number]> {
  const chars = graphemes(text), words = String(red ?? '').split(/[,，、\n]/).map((w) => w.trim()).filter(Boolean), out: Array<[number, number]> = [];
  for (const w of words) {
    const wc = graphemes(w);
    for (let i = 0; i + wc.length <= chars.length; i++) {
      if (wc.every((c, j) => chars[i + j] === c) && !out.some(([a, b]) => i < b && i + wc.length > a)) out.push([i, i + wc.length]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export interface Sentence { start: number; end: number | null; text: string }
/** "秒|文字" or "秒-秒|文字" a line (the second time: when it has been said); a line without a time follows the one before */
export function parseSentences(s: string, cps = 12): Sentence[] {
  const out: Sentence[] = [];
  let next = 0.2;
  for (const raw of String(s ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*\|(.*)$/.exec(line);
    const start = m ? Number(m[1]) : next, end = m && m[2] !== undefined ? Number(m[2]) : null, text = (m ? m[3] : line).trim();
    out.push({ start, end: end !== null && end > start ? end : null, text });
    next = (end ?? start + writeTime(text, cps)) + 0.3;
  }
  return out;
}

/** a sentence's pen speed: spread over 90 % of its spoken time when that is given, else `cps` */
export const sentenceCps = (s: Sentence, cps: number) => (s.end !== null ? Math.max(1, graphemes(s.text).length / Math.max(0.3, (s.end - s.start) * 0.9)) : cps);

/** replace mode: the sentence showing at `local` and how visible it is: it fades out over 0.25 s before the next one starts, the item
 *  ends, or (a sentence with an end time) `hold` seconds after its end, but not before it has been written */
export function currentSentence(list: Sentence[], local: number, dur: number, hold = 1.2): { i: number; alpha: number } {
  let i = -1;
  for (let k = 0; k < list.length; k++) if (list[k].start <= local) i = k;
  if (i < 0) return { i, alpha: 0 };
  const s = list[i], until = Math.min(i + 1 < list.length ? list[i + 1].start : dur, s.end !== null ? Math.max(s.end + Math.max(0, hold ?? 1.2), s.start + writeTime(s.text, 12)) : Infinity, dur);
  return { i, alpha: clamp((until - local) / 0.25) };
}

export const handwrite: ItemType<P, S> = {
  type: 'common.handwrite', label: '手寫字', category: 'text', kind: 'overlay',
  doc: '手寫字一筆一筆寫出來，每句有自己的時間：「秒-秒|句子」照旁白時間逐字寫出的手寫字幕（replace：一次一句；寫了結束秒的句子在結束秒後 hold 秒（預設 1.2）開始淡出，下一句先到就先換）、像寫信一樣一行一行累積（stack），或貼在照片上的小紙條（paper: note，附一行小字）；look 選筆（鋼筆、粉筆、螢光筆、蠟筆）；red 列出的重點詞改用紅筆寫、寫到時紅筆在下面畫一道底線；明信片、日記、手帳、食譜',
  variants: { param: 'look', list: [
    { value: 'pen', label: '鋼筆', doc: '細細的墨色鋼筆字一個一個寫出來，後面一圈 note 紙色的光暈讓字在影片上也看得清楚；字幕、明信片、日記、手帳都搭' },
    { value: 'chalk', label: '粉筆', doc: '粗糙帶顆粒、深淺不勻的粉筆字，用 note 紙色寫、後面一層淡淡的粉塵，在深色畫面上像黑板（paper: note 時紙條變成 color 色的小黑板）；食譜、上課、菜單' },
    { value: 'marker', label: '螢光筆', doc: '每行寫到哪，後面就跟著刷出一道微斜、兩頭毛毛的半透明螢光筆底帶，字還是 color 墨色；重點、筆記、讀書 vlog；只有它讀 hl（螢光筆顏色）' },
    { value: 'crayon', label: '蠟筆', doc: '粗粗的、邊緣破碎帶蠟紋的蠟筆字，每句換一支顏色：第一句用 color，之後輪流藍、綠、橘、紫（固定的一組蠟筆色）；小孩、家庭、塗鴉日記' },
  ] },
  params: [
    { key: 'lines', label: '句子（每行「秒|文字」或「開始秒-結束秒|文字」；結束秒＝說完的時間）', type: 'text', default: '0.1-1.3|今天的風很溫柔\n1.5-2.7|我們沿著河邊慢慢走' },
    { key: 'mode', label: '換句方式（replace 一次一句、stack 一行一行累積）', type: 'enum', options: ['replace', 'stack'], default: 'replace' },
    { key: 'look', label: '筆', type: 'enum', options: ['pen', 'chalk', 'marker', 'crayon'], default: 'pen' },
    { key: 'hold', label: '說完後留多久（秒；replace 模式下有結束秒的句子，結束秒後這麼久才淡出）', type: 'number', min: 0, max: 30, step: 0.1, default: 1.2 },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '上緣（畫面高比例；-1＝下緣貼齊下方安全區）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '最大寬度（畫面寬比例，超過就換行）', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.76 },
    { key: 'align', label: '對齊', type: 'enum', options: ['center', 'left'], default: 'center' },
    { key: 'size', label: '字級（畫面短邊 %）', type: 'number', min: 1, max: 15, step: 0.1, default: 5.6 },
    { key: 'cps', label: '沒給結束秒時每秒寫幾個字', type: 'number', min: 1, max: 60, step: 0.5, default: 12 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -15, max: 15, step: 0.1, default: 0 },
    { key: 'paper', label: '底（none 直接寫在畫面上、note 貼膠帶的小紙條）', type: 'enum', options: ['none', 'note'], default: 'none' },
    { key: 'small', label: '紙條上的一行小字（note）', type: 'string', default: '' },
    { key: 'halo', label: '字後面的紙色光暈（0–1，直接寫在影片上時讓字看得清楚）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: 'font', label: '手寫字型', type: 'string', default: 'LXGW WenKai TC' },
    { key: 'color', label: '墨色', type: 'color', default: '#4a3a2e', theme: 'palette.ink' },
    { key: 'note', label: '紙條與光暈的紙色（chalk 用它寫字）', type: 'color', default: '#fffaf0', theme: 'palette.paper' },
    { key: 'hl', label: '螢光筆顏色（marker）', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'tapeColor', label: '紙膠帶顏色', type: 'color', default: '#e8b0a0' },
    { key: 'red', label: '紅筆的重點詞（逗號分隔；寫到時加紅筆底線）', type: 'string', default: '' },
    { key: 'redColor', label: '紅筆顏色', type: 'color', default: '#d62f2f' },
  ],
  build(ctx) {
    const group = abs(ctx.root), note = abs(group), small = abs(group), txt = textLayer(group), tape = abs(group);
    cssCamel(small, { whiteSpace: 'pre', lineHeight: '1.2' });
    const cv = h('canvas', null, null, group) as HTMLCanvasElement;
    cssCamel(cv, { position: 'absolute', display: 'none', pointerEvents: 'none' });
    return { group, note, small, tape, txt, cv };
  },
  hide(s) { freeCanvas(s.cv, s.band); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * Math.min(W, H), lh = px * 1.45;
    const list = parseSentences(p.lines, p.cps), maxEm = (p.w * W) / px, note = p.paper === 'note', fam = handFamily(p.font);
    // the rows: the current sentence (replace) or all of them (stack), each wrapped; t0 and cps per row
    type Row = { text: string; t0: number; cps: number; alpha: number; n: number };
    const rows: Row[] = [];
    const add = (sn: Sentence, alpha: number, cap: number, n: number) => {
      const cps = sentenceCps(sn, p.cps);
      let before = 0;
      for (const ln of wrapEm(sn.text, maxEm).slice(0, cap)) { rows.push({ text: ln, t0: sn.start + before / cps, cps, alpha, n }); before += graphemes(ln).length; }
    };
    if (p.mode === 'stack') list.forEach((sn, n) => add(sn, 1, 9, n));
    else { const c = currentSentence(list, local, dur, p.hold); if (c.i >= 0) add(list[c.i], c.alpha, 3, c.i); }
    const look: HandLook = p.look === 'chalk' || p.look === 'marker' || p.look === 'crayon' ? p.look : 'pen';
    const chalk = look === 'chalk', crayon = look === 'crayon';
    // chalk writes in the paper colour (on a note, the note turns into a little board of the ink colour); its red is a chalk pink
    const ink = chalk ? p.note : p.color, redInk = chalk ? mixHex(p.redColor, '#ffffff', 0.35) : p.redColor;
    const out = p.mode === 'stack' || note ? clamp((dur - local) / 0.3) : 1;
    const widest = Math.max(1, ...rows.map((r) => textEm(r.text) * px)), blockH = Math.max(1, rows.length) * lh;
    const pad = note ? 28 * k : 0, smallH = note && p.small ? 46 * k : 0;
    const boxW = (note ? Math.max(widest, 260 * k) : widest) + 2 * pad, boxH = blockH + 2 * pad + smallH;
    const left = p.x * W - boxW / 2, top = p.y >= 0 ? p.y * H : (1 - theme.safe.bottom) * H - boxH;
    const slide = note ? ease(clamp(local / 0.4)) : 1;
    // the halo: pen's (and marker's) a glow of paper; chalk's a faint dust of itself over a soft dark shade, grained with the letters;
    // crayon's the paper glow again, but as drop-shadows after its filter (through it, the glow came out blotchy)
    const glow = !note && p.halo > 0 && crayon ? ` drop-shadow(0 0 ${(0.05 * px).toFixed(2)}px ${withAlpha(p.note, p.halo)}) drop-shadow(0 0 ${(0.14 * px).toFixed(2)}px ${withAlpha(p.note, 0.8 * p.halo)})` : '';
    const halo = note || p.halo <= 0 || crayon ? 'none' : chalk
      ? [`0 ${0.03 * px}px ${0.12 * px}px rgba(0,0,0,${(0.45 * p.halo).toFixed(3)})`, ...[0.05, 0.16, 0.34].map((r, i) => `0 0 ${r * px}px ${withAlpha(ink, [0.55, 0.28, 0.12][i] * p.halo)}`)].join(', ')
      // marker's letters all lie on the band: only the near part of the glow, else it clouds the band
      : (look === 'marker' ? [0.04, 0.08] : [0.04, 0.08, 0.14, 0.24]).map((r) => `0 0 ${r * px}px ${withAlpha(p.note, p.halo)}`).join(', ');
    cssCamel(s.group, { left: `${left}px`, top: `${top + (1 - slide) * 30 * k}px`, width: `${boxW}px`, height: `${boxH}px`, transform: `rotate(${p.tilt}deg)`,
      opacity: String(Math.min(slide, out)), textShadow: halo });
    cssCamel(s.note, { display: note ? 'block' : 'none', left: '0', top: '0', width: '100%', height: '100%', background: chalk ? p.color : p.note, boxShadow: `0 ${6 * k}px ${16 * k}px rgba(40,25,10,0.35)` });
    cssCamel(s.tape, { display: note ? 'block' : 'none', left: `${boxW / 2 - 60 * k}px`, top: `${-17 * k}px`, width: `${120 * k}px`, height: `${34 * k}px`, background: withAlpha(p.tapeColor, 0.85), transform: 'rotate(-3deg)' });
    s.small.textContent = p.small;
    cssCamel(s.small, { display: note && p.small ? 'block' : 'none', left: `${pad}px`, top: `${pad * 0.7}px`, fontSize: `${28 * k}px`, fontFamily: fam, color: withAlpha(ink, 0.62) });
    const T: Txt[] = rows.map((r, i) => ({ text: r.text, x: p.align === 'left' ? pad : boxW / 2, y: pad + smallH + i * lh + px * 1.12, px, color: crayon ? crayonColor(p.color, r.n) : ink, family: fam,
      align: p.align === 'left' ? 'left' : 'center', t0: r.t0, cps: r.cps, alpha: r.alpha, marks: redMarks(r.text, p.red), markColor: redInk, ...(crayon || chalk ? { weight: 700 } : {}) }));
    drawTexts(s.txt, T, local, 1);
    // crayon's heavier hand: a thin outline in the letters' own colour round the bold weight
    if (crayon) T.forEach((t, i) => { const b = s.txt.slots[i]?.box; if (b) cssCamel(b, { webkitTextStroke: `${(0.03 * px).toFixed(2)}px ${t.color}` }); });
    grain(s, look, px, ctx.item?.id, glow);
    band(s, look === 'marker' ? T : [], local, px, k, boxW, boxH, p.hl);
    underline(s, T, local, k, boxW, boxH, redInk);
  },
};

/** chalk's and crayon's filter on the text layer (made the first time, rewritten when the look or the letters' size changes); pen
 *  and marker have none. `after`: CSS filters applied after it (crayon's halo) */
function grain(s: S, look: HandLook, px: number, itemId: string | undefined, after: string) {
  if (look !== 'chalk' && look !== 'crayon') { if (s.fx) cssCamel(s.txt.el, { filter: '' }); return; }
  if (!s.fx) {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    s.group.insertBefore(svg, s.group.firstChild);
    s.fx = { svg, id: `tc-hand-${String(itemId ?? 'x').replace(/[^\w-]/g, '_')}-${++seq}`, key: '' };
  }
  const key = `${look}:${px.toFixed(2)}`;
  if (s.fx.key !== key) { s.fx.key = key; s.fx.svg.innerHTML = handFilter(s.fx.id, look, px); }
  cssCamel(s.txt.el, { filter: `url(#${s.fx.id})${after}` });
}

/** where marker's band lies under a row at `local`: from a little before its first letter to the pen (the edge of the letter being
 *  written; past the last letter by a little more once it is done), `[from, to]` along the row in the row's px, or null before the
 *  first letter. `lefts` / `widths` are the letters' places in the row, `em` the letter size. */
export function bandSpan(lefts: number[], widths: number[], local: number, t0: number, cps: number, em: number): [number, number] | null {
  let j = -1, q = 0;
  for (let c = 0; c < lefts.length; c++) { const pc = charAt(c, local, t0, cps); if (pc > 0) { j = c; q = pc; } }
  if (j < 0) return null;
  const last = lefts.length - 1, lead = 0.14 * em;
  return [lefts[0] - lead, lefts[j] + widths[j] * q + (j === last ? lead * q : 0)];
}

/** marker: a highlighter band under each row in `hl`, a little tilted, its edges not quite straight and its two ends ragged (fixed
 *  per row), wiped along behind the pen (bandSpan); the ink pools a little darker along its edges */
function band(s: S, T: Txt[], local: number, px: number, k: number, boxW: number, boxH: number, hl: string) {
  if (!T.length) { if (s.band) cssCamel(s.band, { display: 'none' }); return; }
  if (!s.band) {
    s.band = h('canvas', null, null, null) as HTMLCanvasElement;
    s.txt.el.parentElement!.insertBefore(s.band, s.txt.el);
    cssCamel(s.band, { position: 'absolute', pointerEvents: 'none' });
  }
  const m = 0.6 * px, g = canvasAt(s.band, boxW + 2 * m, boxH + 2 * m);
  cssCamel(s.band, { display: 'block', left: `${-m}px`, top: `${-m}px`, width: `${boxW + 2 * m}px`, height: `${boxH + 2 * m}px` });
  T.forEach((t, i) => {
    const slot = s.txt.slots[i];
    if (!slot || !slot.chars.length || (t.alpha ?? 1) <= 0) return;
    const box = slot.box, x0 = box.offsetLeft - (t.align === 'center' ? box.offsetWidth / 2 : t.align === 'right' ? box.offsetWidth : 0) + m, y0 = box.offsetTop + m;
    const span = bandSpan(slot.chars.map((c) => c.offsetLeft), slot.chars.map((c) => c.offsetWidth), local, t.t0 ?? -1e9, t.cps ?? 14, px);
    if (!span || span[1] - span[0] < 1) return;
    const xa = x0 + span[0], xb = x0 + span[1], ch = slot.chars[0], top = y0 + ch.offsetTop + 0.3 * px, bot = y0 + ch.offsetTop + 1.18 * px;
    const seed = 41 + i * 13, slope = -0.018 + 0.012 * (i % 2), r = rng(seed);
    const rag = Array.from({ length: 10 }, () => r() - 0.5);
    const yAt = (x: number, edge: number) => edge + (x - x0) * slope + Math.sin((x - x0) / px * 1.3 + seed + edge * 0.01) * 0.035 * px;
    const step = Math.max(4, 0.25 * px), n = Math.max(1, Math.ceil((xb - xa) / step));
    const topPts: Array<[number, number]> = [], botPts: Array<[number, number]> = [];
    for (let j = 0; j <= n; j++) { const x = xa + ((xb - xa) * j) / n; topPts.push([x, yAt(x, top)]); botPts.push([x, yAt(x, bot)]); }
    g.save(); g.globalAlpha = clamp(t.alpha ?? 1);
    g.beginPath();
    topPts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
    // the ragged pen-side end, then back along the bottom and up the ragged start
    for (let j = 1; j < 5; j++) { const f = j / 5, y = top + (bot - top) * f; g.lineTo(xb + rag[j] * 0.16 * px, yAt(xb, y)); }
    for (let j = botPts.length - 1; j >= 0; j--) g.lineTo(botPts[j][0], botPts[j][1]);
    for (let j = 4; j > 0; j--) { const f = j / 5, y = top + (bot - top) * f; g.lineTo(xa + rag[5 + j] * 0.16 * px, yAt(xa, y)); }
    g.closePath();
    g.fillStyle = withAlpha(hl, 0.74); g.fill();
    g.lineWidth = 0.05 * px; g.strokeStyle = withAlpha(hl, 0.35); g.lineJoin = 'round';
    for (const pts of [topPts, botPts]) { g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x, y + (pts === topPts ? 1 : -1) * 0.02 * px) : g.moveTo(x, y))); g.stroke(); }
    g.restore();
  });
}

/** the red pen's underlines: under each marked word, drawn on as its characters are written (positions from the laid-out spans) */
function underline(s: S, T: Txt[], local: number, k: number, boxW: number, boxH: number, color: string) {
  const any = T.some((t) => t.marks?.length);
  cssCamel(s.cv, { display: any ? 'block' : 'none' });
  if (!any) return;
  const m = 30 * k, g = canvasAt(s.cv, boxW + 2 * m, boxH + 2 * m);
  cssCamel(s.cv, { left: `${-m}px`, top: `${-m}px`, width: `${boxW + 2 * m}px`, height: `${boxH + 2 * m}px` });
  T.forEach((t, i) => {
    const slot = s.txt.slots[i];
    if (!slot || !t.marks?.length || (t.alpha ?? 1) <= 0) return;
    const box = slot.box, x0 = box.offsetLeft - (t.align === 'center' ? box.offsetWidth / 2 : t.align === 'right' ? box.offsetWidth : 0) + m, y0 = box.offsetTop + m;
    for (const [a, b] of t.marks) {
      const first = slot.chars[a], last = slot.chars[b - 1];
      if (!first || !last) continue;
      let done = 0;
      for (let c = a; c < b; c++) done += t.t0 === undefined ? 1 : charAt(c, local, t.t0, t.cps ?? 14);
      const q = done / (b - a);
      if (q <= 0) continue;
      const xa = x0 + first.offsetLeft - 2 * k, xb = x0 + last.offsetLeft + last.offsetWidth + 2 * k, y = y0 + first.offsetTop + first.offsetHeight * 0.98;
      g.save(); g.globalAlpha = clamp(t.alpha ?? 1);
      inkStroke(g, wavePts(xa, y, xb, y + 3 * k, 2.2 * k, 1, 20), 'ballpoint', { w: 5 * k, color, seed: 5 + i * 7 + a, prog: q, u: k, overshoot: true });
      g.restore();
    }
  });
}
