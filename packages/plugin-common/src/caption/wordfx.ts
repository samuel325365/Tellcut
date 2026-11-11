// Word effects: the caption drawn one span a word (a word broken over two lines is two spans), each word timed by `words` (the
// transcript's, [seconds, visible characters said by then]) or, for a caption typed by hand, spread evenly over its length.
// What the effects do: color (the word being said takes the highlight and grows a little), box (a block slides behind it), one
// (only it is shown), pop (each word pops in when said), fill (dim until said), underline (a bar draws under it), type (words
// typed as said, with a caret), wave (the characters bob gently). A look styles the words through its word() parts.
import { clamp, cssCamel, eBack, eOut3, h, lerp, prog } from '@tellcut/engine';
import type { Run } from '../markup.ts';
import { charPopAt } from './words.ts';
import { wordIn } from './anim.ts';
import type { Css, WordStyle } from './types.ts';

export const WORD_FX = ['auto', 'none', 'color', 'box', 'one', 'pop', 'fill', 'underline', 'type', 'wave'] as const;

/** one word: its visible characters [a, b) and the second it is said */
export interface Word { a: number; b: number; t: number }

/** `words` steps as words (the last one reaching the end of the line); a word's leading spaces go to the word before, so a word
 *  that grows or moves never covers the space in front of it (`plain`: the caption's visible text) */
export function wordsOf(steps: Array<[number, number]>, total: number, plain = ''): Word[] {
  const out = steps.map((s, k) => ({ a: k ? steps[k - 1][1] : 0, b: s[1], t: s[0] })).filter((w) => w.b > w.a);
  if (out.length && out[out.length - 1].b < total) out[out.length - 1].b = total;
  const cs = [...plain];
  for (let k = 1; k < out.length; k++) {
    let a = out[k].a;
    while (a < out[k].b - 1 && /\s/.test(cs[a] ?? '')) a++;
    out[k].a = a; out[k - 1].b = a;
  }
  return out;
}

// pinned to the locale the engine's line breaking uses (text.ts): with the default locale the words could come out differently on a
// machine in another language, and with them the even timing of every caption typed by hand
const SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh-Hant', { granularity: 'word' }) : null;

/** words for a caption without word times: the visible text cut into words (Intl.Segmenter: Chinese and Japanese into words too,
 *  punctuation and spaces kept with the word before), said one after another from 0.15 s to 0.5 s before the end, each taking time
 *  by its length */
export function evenWords(plain: string, dur: number): Word[] {
  const chars = [...plain], pieces: Array<[number, number]> = [];
  let i = 0;
  const seg = SEGMENTER;
  const parts: Array<{ text: string; word: boolean }> = seg ? [...seg.segment(plain)].map((s) => ({ text: s.segment, word: !!s.isWordLike })) : plain.split(/(\s+)/).map((t) => ({ text: t, word: !/^\s*$/.test(t) }));
  for (const p of parts) {
    const n = [...p.text].length;
    if (!n) continue;
    if (!p.word && pieces.length) pieces[pieces.length - 1][1] += n;
    else pieces.push([i, i + n]);
    i += n;
  }
  if (!pieces.length) return [];
  pieces[pieces.length - 1][1] = chars.length;
  const solid = (a: number, b: number) => chars.slice(a, b).filter((c) => !/\s/.test(c)).length || 1;
  const total = pieces.reduce((s, [a, b]) => s + solid(a, b), 0), from = Math.min(0.15, dur * 0.1), to = Math.max(from, dur - 0.5);
  let done = 0;
  return pieces.map(([a, b]) => { const t = from + ((to - from) * done) / total; done += solid(a, b); return { a, b, t }; });
}

export interface WordBox {
  el: HTMLElement; key: string;
  lines: HTMLElement[];
  /** per word, its spans (two when a line break cuts it) */
  spans: HTMLElement[][];
  /** every visible character's span, in order, and the index of its word */
  chars: HTMLElement[]; wordOf: number[];
  /** the characters that are 【highlighted】 in the text */
  marked: boolean[];
  box: HTMLElement; caret: HTMLElement;
}

export function wordBox(parent: HTMLElement): WordBox {
  const el = h('div', null, null, parent);
  const box = h('div', null, null, null as any), caret = h('span', null, null, null as any);
  cssCamel(box, { position: 'absolute', zIndex: '0', pointerEvents: 'none' });
  caret.textContent = '|';
  cssCamel(caret, { display: 'inline-block', marginLeft: '0.04em', fontWeight: '400' });
  return { el, key: '', lines: [], spans: [], chars: [], wordOf: [], marked: [], box, caret };
}

/** Fill the box with `lines` (laid out by layoutMarkup, `starts` its lines' first visible characters), one span a word fragment
 *  and one a character inside it; nothing is touched when the same lines come again. */
export function setWords(wb: WordBox, lines: Run[][], starts: number[], words: Word[]) {
  const key = JSON.stringify([lines, starts, words.map((w) => [w.a, w.b])]);
  if (key === wb.key) return;
  wb.key = key; wb.el.innerHTML = ''; wb.lines = []; wb.spans = words.map(() => []); wb.chars = []; wb.wordOf = []; wb.marked = [];
  const wordAt = (g: number) => { const k = words.findIndex((w) => g >= w.a && g < w.b); return k < 0 ? (g < (words[0]?.a ?? 0) ? 0 : words.length - 1) : k; };
  lines.forEach((runs, li) => {
    const line = h('div', null, null, wb.el);
    cssCamel(line, { position: 'relative' });
    wb.lines.push(line);
    let g = starts[li] ?? 0, cur = -1, span: HTMLElement | null = null;
    for (const r of runs) for (const c of r.t) {
      const k = Math.max(0, wordAt(g));
      if (k !== cur || !span) {
        span = h('span', null, null, line);
        cssCamel(span, { display: 'inline-block', whiteSpace: 'pre', position: 'relative', zIndex: '1' });
        if (wb.spans[k]) wb.spans[k].push(span);
        cur = k;
      }
      const ch = h('span', null, null, span);
      ch.textContent = c;
      cssCamel(ch, { display: 'inline-block', whiteSpace: 'pre' });
      wb.chars.push(ch); wb.wordOf.push(k); wb.marked.push(r.kind === 'hl');
      g++;
    }
    if (!runs.length) line.innerHTML = '&nbsp;';
  });
}

const merge = (...xs: Array<Css | undefined | false>): Css => Object.assign({}, ...xs.filter(Boolean));
const keysOf = (s: WordStyle) => new Set([s.base, s.hot, s.dim, s.onbox].flatMap((x) => Object.keys(x ?? {})));

/** what a word effect draws at `local` (the caption's own seconds) of `dur`, with the look's word styles `ws` */
export function drawWords(wb: WordBox, o: { fx: string; words: Word[]; local: number; dur: number; fs: number; ws: WordStyle; animIn: string; boxColor: string }) {
  const { fx, words, local, ws } = o, n = words.length;
  // the word being said: the last whose time has come (-1 before the first)
  let now = -1;
  words.forEach((w, k) => { if (local >= w.t - 1e-6) now = k; });
  // what a look or an effect may have set on a word, cleared before this frame's (the underline's bar included)
  const reset = Object.fromEntries([...keysOf(ws), 'backgroundImage', 'backgroundRepeat', 'backgroundPosition', 'backgroundSize'].map((k) => [k, ''])) as Css;
  const typedTo = fx === 'type' ? typedCount(words, local) : Infinity;
  // characters first (their own looks change the words' widths, which the words below measure): 【marked】 ones hot, typed ones shown, the wave, an entrance that pops them
  wb.chars.forEach((ch, i) => {
    const css: Css = { ...(wb.marked[i] ? merge(reset, ws.hot) : {}), ...(ws.char ? ws.char(i, ch.textContent ?? '') : {}) };
    let op = 1, y = 0, sc = 1;
    if (fx === 'type') op = i < typedTo ? 1 : 0;
    if (fx === 'wave') y = Math.sin(2 * Math.PI * (local * 0.9 - i * 0.11)) * 0.07 * o.fs;
    if (o.animIn === 'pop') { const c = charPopAt(i, wb.chars.length, local); op *= c.opacity; y += c.rise * 0.32 * o.fs; sc = c.scale; }
    const moved = y || sc !== 1 ? `translateY(${y.toFixed(2)}px) scale(${sc.toFixed(4)})` : '';
    cssCamel(ch, { ...css, opacity: op === 1 ? '' : op.toFixed(3), transform: [css.transform, moved].filter(Boolean).join(' ') });
  });
  words.forEach((w, k) => {
    const said = local >= w.t - 1e-6, isNow = k === now, q = prog(local, w.t, w.t + 0.22);
    let op = 1, y = 0, x = 0, sc = 1, rot = 0, show = true, hot = false, dim = false, onbox = false;
    const a = wordIn(o.animIn, k, n, local, o.fs);
    op *= a.opacity; x += a.x; y += a.y; rot += a.rot;
    switch (fx) {
      case 'color': if (isNow) { hot = true; sc = 1 + 0.14 * eBack(prog(local, w.t, w.t + 0.14), 2); } break;
      case 'box': onbox = isNow; break;
      case 'one': show = isNow; if (isNow) { const p = prog(local, w.t, w.t + 0.16); sc = 0.55 + 0.45 * eBack(p, 2); op *= clamp(p * 4); } break;
      case 'pop': op *= clamp(q * 4); sc = said ? 0.4 + 0.6 * eBack(q, 2.2) : 0.4; y += (1 - eOut3(q)) * 0.35 * o.fs; break;
      case 'fill': { const f = prog(local, w.t - 0.03, w.t + 0.1); op *= 0.3 + 0.7 * f; dim = f < 0.5; break; }
      case 'type': show = said; break;
    }
    const css = merge(reset, ws.base, hot && ws.hot, dim && ws.dim, onbox && (ws.onbox ?? {}));
    for (const sp of wb.spans[k] ?? []) {
      // a word grown past its size makes room for itself, so it never covers the space beside it (one word at a time has none)
      const room = sc > 1 && fx !== 'one' ? `${(((sc - 1) * sp.offsetWidth) / 2).toFixed(1)}px` : '';
      cssCamel(sp, { ...css, display: show ? 'inline-block' : 'none', opacity: op.toFixed(3), marginLeft: room, marginRight: room,
        transform: x || y || sc !== 1 || rot ? `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sc.toFixed(4)}) rotate(${rot.toFixed(2)}deg)` : '',
        ...(fx === 'underline' ? underline(w, words[k + 1], local, o.boxColor) : {}) });
    }
  });
  // lines with nothing shown (one word at a time) take no room
  wb.lines.forEach((line) => { const any = [...line.children].some((c) => c !== wb.box && (c as HTMLElement).style.display !== 'none'); cssCamel(line, { display: any ? '' : 'none' }); });
  // the caret after the last typed character
  if (fx === 'type') {
    const last = wb.chars[Math.min(typedTo, wb.chars.length) - 1];
    if (last && last.parentElement) last.parentElement.insertBefore(wb.caret, last.nextSibling);
    const typing = typedTo < wb.chars.length;
    cssCamel(wb.caret, { display: last ? 'inline-block' : 'none', opacity: typing || Math.floor(local * 2.5) % 2 === 0 ? '1' : '0' });
  } else if (wb.caret.parentElement) wb.caret.remove();
  // the box behind the word being said, sliding from the word before over 0.13 s
  if (fx === 'box' && now >= 0) {
    const cur = wb.spans[now]?.[0], prev = now ? wb.spans[now - 1]?.[0] : cur;
    if (cur && cur.parentElement) {
      if (wb.box.parentElement !== cur.parentElement) cur.parentElement.insertBefore(wb.box, cur.parentElement.firstChild);
      const r = (e: HTMLElement) => [e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight];
      const same = prev && prev.parentElement === cur.parentElement, m = eOut3(prog(local, words[now].t, words[now].t + 0.13));
      const [bx, by, bw, bh] = r(cur).map((v, j) => (same ? lerp(r(prev!)[j], v, m) : v));
      const px = 0.1 * o.fs, py = 0.02 * o.fs, s0 = now ? 1 : 0.6 + 0.4 * eBack(m, 2);
      cssCamel(wb.box, { display: 'block', opacity: String(now ? 1 : clamp(m * 3)), left: `${(bx - px).toFixed(1)}px`, top: `${(by - py).toFixed(1)}px`, width: `${(bw + 2 * px).toFixed(1)}px`, height: `${(bh + 2 * py).toFixed(1)}px`,
        borderRadius: `${(0.16 * o.fs).toFixed(1)}px`, background: o.boxColor, transform: `scale(${s0.toFixed(4)}) rotate(-1.5deg)` });
    }
  } else cssCamel(wb.box, { display: 'none' });
}

/** how many characters `type` has typed at `local`: each word's characters over its time (until the next word, 0.3 s at most) */
function typedCount(words: Word[], local: number): number {
  let n = 0;
  words.forEach((w, k) => {
    const next = words[k + 1]?.t ?? w.t + 0.3, span = Math.max(0.05, Math.min(0.3, next - w.t));
    n += Math.round((w.b - w.a) * clamp((local - w.t) / span));
  });
  return n;
}

/** underline: a bar in the highlight colour drawn under the word as it is said (over its time, 0.4 s at most), staying */
function underline(w: Word, next: Word | undefined, local: number, color: string): Css {
  const span = Math.max(0.1, Math.min(0.4, (next?.t ?? w.t + 0.4) - w.t)), p = clamp((local - w.t) / span);
  return { backgroundImage: `linear-gradient(${color}, ${color})`, backgroundRepeat: 'no-repeat', backgroundPosition: '0 96%', backgroundSize: `${(eOut3(p) * 100).toFixed(1)}% 0.12em` };
}
