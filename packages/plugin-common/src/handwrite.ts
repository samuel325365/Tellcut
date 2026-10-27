// common.handwrite — lines of text written on by hand, character by character, each at its own time: a handwritten subtitle that
// keeps pace with the narration ("start-end|sentence": the pen spreads the sentence over the time it is spoken), a letter that
// fills up line by line, or a taped paper note on the picture. The write-on of the baking-steps recipe card made general.
// `red` (fd-map's fx.nbCap) writes the words given in red and underlines them with a red pen as they are written.
import { abs, clamp, cssCamel, eOut3 as ease, h, type ItemType, textEm } from '@tellcut/engine';
import { charAt, drawTexts, handFamily, textLayer, wrapEm, writeTime, type TextLayer, type Txt } from './hand.ts';
import { canvasAt } from './inkline.ts';
import { inkStroke, wavePts } from './sketch.ts';
import { withAlpha } from './color.ts';

interface P {
  lines: string; mode: 'replace' | 'stack'; x: number; y: number; w: number; align: 'left' | 'center'; size: number; cps: number; tilt: number;
  paper: 'none' | 'note'; small: string; halo: number; font: string; color: string; note: string; tapeColor: string; red: string; redColor: string;
}
interface S { group: HTMLElement; note: HTMLElement; small: HTMLElement; tape: HTMLElement; txt: TextLayer; cv: HTMLCanvasElement }

/** where the words of `red` ("詞,詞") stand in a line: [from, to) character ranges, in order, not overlapping */
export function redMarks(text: string, red: string): Array<[number, number]> {
  const chars = [...String(text ?? '')], words = String(red ?? '').split(/[,，、\n]/).map((w) => w.trim()).filter(Boolean), out: Array<[number, number]> = [];
  for (const w of words) {
    const wc = [...w];
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
export const sentenceCps = (s: Sentence, cps: number) => (s.end !== null ? Math.max(1, [...s.text].length / Math.max(0.3, (s.end - s.start) * 0.9)) : cps);

/** replace mode: the sentence showing at `local` and how visible it is (it fades as the next one starts or after the item) */
export function currentSentence(list: Sentence[], local: number, dur: number): { i: number; alpha: number } {
  let i = -1;
  for (let k = 0; k < list.length; k++) if (list[k].start <= local) i = k;
  if (i < 0) return { i, alpha: 0 };
  const s = list[i], until = Math.min(i + 1 < list.length ? list[i + 1].start : dur, s.end !== null ? Math.max(s.end + 1.2, s.start + writeTime(s.text, 12)) : Infinity, dur);
  return { i, alpha: clamp((until - local) / 0.25) };
}

export const handwrite: ItemType<P, S> = {
  type: 'common.handwrite', label: '手寫字', category: 'text', kind: 'overlay',
  doc: '手寫字一筆一筆寫出來，每句有自己的時間：「秒-秒|句子」照旁白時間逐字寫出的手寫字幕（replace：一次一句）、像寫信一樣一行一行累積（stack），或貼在照片上的小紙條（paper: note，附一行小字）；red 列出的重點詞改用紅筆寫、寫到時紅筆在下面畫一道底線；明信片、日記、手帳、食譜',
  params: [
    { key: 'lines', label: '句子（每行「秒|文字」或「開始秒-結束秒|文字」；結束秒＝說完的時間）', type: 'text', default: '0.1-1.3|今天的風很溫柔\n1.5-2.7|我們沿著河邊慢慢走' },
    { key: 'mode', label: '換句方式（replace 一次一句、stack 一行一行累積）', type: 'enum', options: ['replace', 'stack'], default: 'replace' },
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
    { key: 'note', label: '紙條與光暈的紙色', type: 'color', default: '#fffaf0', theme: 'palette.paper' },
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
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * Math.min(W, H), lh = px * 1.45;
    const list = parseSentences(p.lines, p.cps), maxEm = (p.w * W) / px, note = p.paper === 'note', fam = handFamily(p.font);
    // the rows: the current sentence (replace) or all of them (stack), each wrapped; t0 and cps per row
    type Row = { text: string; t0: number; cps: number; alpha: number };
    const rows: Row[] = [];
    const add = (sn: Sentence, alpha: number, cap: number) => {
      const cps = sentenceCps(sn, p.cps);
      let before = 0;
      for (const ln of wrapEm(sn.text, maxEm).slice(0, cap)) { rows.push({ text: ln, t0: sn.start + before / cps, cps, alpha }); before += [...ln].length; }
    };
    if (p.mode === 'stack') for (const sn of list) add(sn, 1, 9);
    else { const c = currentSentence(list, local, dur); if (c.i >= 0) add(list[c.i], c.alpha, 3); }
    const out = p.mode === 'stack' || note ? clamp((dur - local) / 0.3) : 1;
    const widest = Math.max(1, ...rows.map((r) => textEm(r.text) * px)), blockH = Math.max(1, rows.length) * lh;
    const pad = note ? 28 * k : 0, smallH = note && p.small ? 46 * k : 0;
    const boxW = (note ? Math.max(widest, 260 * k) : widest) + 2 * pad, boxH = blockH + 2 * pad + smallH;
    const left = p.x * W - boxW / 2, top = p.y >= 0 ? p.y * H : (1 - theme.safe.bottom) * H - boxH;
    const slide = note ? ease(clamp(local / 0.4)) : 1;
    cssCamel(s.group, { left: `${left}px`, top: `${top + (1 - slide) * 30 * k}px`, width: `${boxW}px`, height: `${boxH}px`, transform: `rotate(${p.tilt}deg)`,
      opacity: String(Math.min(slide, out)), textShadow: !note && p.halo > 0 ? [0.04, 0.08, 0.14, 0.24].map((r) => `0 0 ${r * px}px ${withAlpha(p.note, p.halo)}`).join(', ') : 'none' });
    cssCamel(s.note, { display: note ? 'block' : 'none', left: '0', top: '0', width: '100%', height: '100%', background: p.note, boxShadow: `0 ${6 * k}px ${16 * k}px rgba(40,25,10,0.35)` });
    cssCamel(s.tape, { display: note ? 'block' : 'none', left: `${boxW / 2 - 60 * k}px`, top: `${-17 * k}px`, width: `${120 * k}px`, height: `${34 * k}px`, background: withAlpha(p.tapeColor, 0.85), transform: 'rotate(-3deg)' });
    s.small.textContent = p.small;
    cssCamel(s.small, { display: note && p.small ? 'block' : 'none', left: `${pad}px`, top: `${pad * 0.7}px`, fontSize: `${28 * k}px`, fontFamily: fam, color: withAlpha(p.color, 0.62) });
    const T: Txt[] = rows.map((r, i) => ({ text: r.text, x: p.align === 'left' ? pad : boxW / 2, y: pad + smallH + i * lh + px * 1.12, px, color: p.color, family: fam,
      align: p.align === 'left' ? 'left' : 'center', t0: r.t0, cps: r.cps, alpha: r.alpha, marks: redMarks(r.text, p.red), markColor: p.redColor }));
    drawTexts(s.txt, T, local, 1);
    underline(s, T, local, k, boxW, boxH, p.redColor);
  },
};

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
