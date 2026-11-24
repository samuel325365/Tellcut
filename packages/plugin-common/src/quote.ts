// common.quote — the pull quote, from the podcast-quote short (fx.quote and fx.endcard).
// mode words: the kinetic quote. The video sits in a small window (`win`, the clip's frame) at the top right; beside it a big accent
// quote mark and who said it; below, the lines of `text` come in word by word on the times they are said (`times`, or spread over
// the item when not given). The hit line (the punchline, the last one by default) slams: big, from 2.3× with an overshoot, a shake
// of the whole quote, a glow of the accent colour, and the lines above it step back. `pre` puts dim words on the lines from the
// start and `ghost` shows the hit line faintly before it lands — a teaser at the top of a film.
// mode card: the closing card on an opaque ground — the quote mark, the lines rising one by one (before the hit line muted, the hit
// line in the accent colour), a dash and who said it, a small line at the foot.
// 2026-11-24: mode type (the quote typed out character by character in fixed-width cells behind a block cursor) and mode block (every
// line sized to one width and stacked into a solid block of type, the lines landing one after another).
import { abs, clamp, cssCamel, eBack, eOut3, h, type ItemType, prog, textEm } from '@tellcut/engine';
import { nl } from './text.ts';
import { charKinds } from './markup.ts';
import { withAlpha } from './color.ts';
import { wordsLang } from './words.ts';

interface P {
  mode: 'words' | 'card' | 'type' | 'block'; text: string; times: number[]; hit: number; pre: string; ghost: boolean; sizes: string; serif: string; y: number;
  win: number[]; who: string; kicker: string; font: string; serifFont: string; color: string; accent: string; muted: string; bg: string;
}
interface Tok { el: HTMLElement; line: number; t: number }
interface S { bg: HTMLElement; wrap: HTMLElement; mark: HTMLElement; who: HTMLElement; whoKick: HTMLElement; whoName: HTMLElement; dash: HTMLElement; credit: HTMLElement; foot: HTMLElement; body: HTMLElement; flash: HTMLElement; rows: HTMLElement[]; toks: Tok[]; key: string;
  /** modes type and block: their own layer (the rows, a character a span for type, the cursor, the kicker above and who said it
   *  below), built again when the lines change */
  alt: HTMLElement; altRows: HTMLElement[]; altChars: HTMLElement[][]; altKey: string; cursor: HTMLElement; altKick: HTMLElement; altBy: HTMLElement }

const back = (x: number) => eBack(clamp(x), 2.2);
const latin = /[A-Za-z0-9'’]$/, latinStart = /^[A-Za-z0-9]/;

/** the lines of `text` ("\n", or a typed "\\n") and their words (split by spaces or /); a blank line stays, empty */
export function quoteLines(text: string): string[][] {
  return nl(text).split('\n').map((l) => l.split(/[\s/]+/).filter(Boolean));
}

/** a line's words as drawn: a no-break space between two Latin words, none next to Chinese or Japanese ones. The room each line
 *  is fitted to is measured on these same pieces, so an English line counts the spaces it is drawn with. */
export function quotePieces(words: string[]): string[] {
  return words.map((w, i) => (i > 0 && latin.test(words[i - 1]) && latinStart.test(w) ? ' ' : '') + w);
}

/** the hit line: `hit` when it names a line, else the last line with words */
export function quoteHit(lines: string[][], hit: number): number {
  if (hit >= 0 && hit < lines.length) return Math.round(hit);
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].length) return i;
  return -1;
}

/** when each word comes in (seconds from the item's start, in reading order): `times` when it has one for every word; else the words
 *  before the hit line spread from 0.25 s to 55 % of the item (0.3 s apart at most), the hit line at 62 % (or 0.35 s after them),
 *  a word every 0.12 s, and anything after it 0.4 s later */
export function quoteTimes(lines: string[][], times: unknown, hit: number, dur: number): number[] {
  const n = lines.reduce((a, l) => a + l.length, 0);
  if (Array.isArray(times) && times.length >= n && times.slice(0, n).every((x) => Number.isFinite(x))) return (times as number[]).slice(0, n);
  const before = lines.slice(0, Math.max(0, hit)).reduce((a, l) => a + l.length, 0);
  const step = before > 1 ? Math.min(0.3, Math.max(0.05, (0.55 * dur - 0.25) / (before - 1))) : 0;
  const out: number[] = [];
  let i = 0, j = 0, last = 0.25;
  const hitAt = Math.max(0.62 * dur, before ? 0.25 + (before - 1) * step + 0.35 : 0.25);
  lines.forEach((l, li) => l.forEach(() => {
    const t = li < hit || hit < 0 ? 0.25 + i++ * step : li === hit ? hitAt + j++ * 0.12 : last + 0.4;
    last = t; out.push(Math.round(t * 1000) / 1000);
  }));
  return out;
}

/** the size of each line in px at 1080: `sizes` ("60,118,…"), else the hit line 232 (card 92) and the others 118 (card 64) */
export function quoteSizes(sizes: string, count: number, hit: number, card: boolean): number[] {
  const given = String(sizes ?? '').split(/[,，\s]+/).filter(Boolean).map(Number);
  return Array.from({ length: count }, (_, i) => (Number.isFinite(given[i]) && given[i] > 0 ? given[i] : i === hit ? (card ? 92 : 232) : card ? 64 : 118));
}

/** the big opening mark: an English quote opens with a curly quote, a Chinese or Japanese one with a corner bracket */
export const quoteMark = (lang: string) => (lang === 'en' ? '“' : '「');

export const quote: ItemType<P, S> = {
  type: 'common.quote', label: '金句字卡', category: 'text', kind: 'overlay',
  doc: '金句字卡：一段金句（text，一行一行）、說話人（who）和一行小字（kicker），最狠的那行（hit，預設最後一行）用主色（accent）；mode 選它怎麼出現；Podcast、訪談、演講、告白的金句',
  variants: { param: 'mode', list: [
    { value: 'words', label: '逐詞金句', doc: '動態金句：影片縮成右上小窗（win），左邊大引號＋說話人，下面一行行字照講話時間逐詞跳出（times；不給就平均排開），hit 那行放大砸下、整段震一下、主色光一閃、前面幾行變暗；pre 讓幾行先放暗色預告字、ghost 讓那行先淡淡出現（片頭預告）；sizes、serif 調每行字級和明體' },
    { value: 'card', label: '收尾金句卡', doc: '不透明的收尾金句卡（bg 底色）：大引號、幾行字一行行浮上來（hit 那行主色、之前的灰）、一條短線加出處（who）、最下面一行小字（kicker）；sizes、serif 調每行字級和明體' },
    { value: 'type', label: '打字機', doc: '打字機：整段字靠左排成一塊放在畫面中間，每個字一樣寬、一個一個打出來（打完約在片長六成），最後一個字後面一個主色的方塊游標，打字時亮著、打完一閃一閃；【詞】（沒有就 hit 那行）用主色，kicker 在上面、who 打完才出現在下面，y 是第一行上緣（-1＝置中）；告白、像聊天的一句話、定義' },
    { value: 'block', label: '等寬堆疊', doc: '等寬堆疊的大字：每一行縮放成一樣寬（短的行特別大、長的行小），緊緊疊成一整塊，一行接一行砸下來；【詞】（沒有就 hit 那行）用主色，行尾的，。拿掉，kicker 在上面、who 最後出現在下面，y 是第一行上緣（-1＝置中）；宣言、口號、開場一句話，字就是畫面' },
  ] },
  params: [
    { key: 'mode', label: '樣式', type: 'enum', options: ['words', 'card', 'type', 'block'], default: 'words' },
    { key: 'text', label: '金句（一行一行；words 的詞用空白或 / 分開；type、block 的【詞】用主色）', type: 'text', default: '但 如果 今天\n你 討厭 早起，\n你 又 沒有 理由，\n那 就 別起。\n去睡吧' },
    { key: 'times', label: '每個詞出現的秒數（相對開始，照順序；空＝自動排開）', type: 'json', default: [] },
    { key: 'hit', label: '砸下來的那行（從 0 數；-1＝最後一行；type、block 是主色的那行）', type: 'number', min: -1, max: 20, step: 1, default: -1 },
    { key: 'pre', label: '一開始就在的暗色預告字（一行對一行，空行＝沒有）', type: 'text', default: '' },
    { key: 'ghost', label: '砸下來的那行先淡淡出現（預告）', type: 'bool', default: false },
    { key: 'sizes', label: '每行字級（以 1080 短邊計的 px，逗號分開；空＝自動）', type: 'string', default: '' },
    { key: 'serif', label: '用明體的行（從 0 數，逗號分開；空＝沒有）', type: 'string', default: '' },
    { key: 'y', label: '第一行上緣（畫面高比例；-1＝小窗下面／卡片中間偏上／type、block 置中）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'win', label: '影片小窗 [x, y, 寬, 高]（畫面比例，等於影片的 frame；words）', type: 'json', default: [0.574, 0.13, 0.352, 0.203] },
    { key: 'who', label: '說話人（words：小窗左邊；card：短線後的出處；type、block：字下面）', type: 'string', default: 'Mia｜睡眠教練' },
    { key: 'kicker', label: '小字（words：說話人上面；card：最下面一行；type、block：字上面）', type: 'string', default: '她的答案' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'serifFont', label: '明體字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'color', label: '字色', type: 'color', default: '#f4ecdc', theme: 'palette.paper' },
    { key: 'accent', label: '主色（引號、砸下來的那行、光、type 的游標）', type: 'color', default: '#ff4f2a', theme: 'palette.accent' },
    { key: 'muted', label: '小字與變暗的字', type: 'color', default: '#8d8478' },
    { key: 'bg', label: '卡片底色（card）', type: 'color', default: '#121015', theme: 'palette.ink' },
  ],
  build(ctx) {
    const bg = abs(ctx.root, { inset: '0' }), wrap = abs(ctx.root, { inset: '0' }), mark = abs(wrap, { lineHeight: '1', fontWeight: '900' });
    mark.textContent = '「';
    const who = abs(wrap), whoKick = h('div', null, null, who), whoName = h('div', null, null, who);
    const credit = abs(wrap, { display: 'flex', alignItems: 'center', whiteSpace: 'pre' }), dash = h('div', null, null, credit), creditText = h('div', null, null, credit);
    const body = abs(wrap, { inset: '0', willChange: 'transform' }), flash = abs(wrap, { inset: '0', pointerEvents: 'none', opacity: '0' }), foot = abs(wrap, { whiteSpace: 'pre' });
    for (const e of [whoKick, whoName]) cssCamel(e, { whiteSpace: 'pre' });
    const alt = abs(ctx.root, { inset: '0', display: 'none' }), altKick = abs(alt, { whiteSpace: 'pre' }), altBy = abs(alt, { whiteSpace: 'pre' }), cursor = abs(alt);
    return { bg, wrap, mark, who, whoKick, whoName, dash, credit: creditText, foot, body, flash, rows: [], toks: [], key: '', alt, altRows: [], altChars: [], altKey: '', cursor, altKick, altBy };
  },
  draw(ctx, s) {
    if (ctx.params.mode === 'type' || ctx.params.mode === 'block') { drawAlt(ctx, s); return; }
    cssCamel(s.alt, { display: 'none' }); cssCamel(s.wrap, { display: '' });
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, card = p.mode === 'card';
    const lines = quoteLines(p.text), hit = quoteHit(lines, p.hit), times = quoteTimes(lines, p.times, hit, dur), pre = nl(p.pre).split('\n');
    const serif = new Set(String(p.serif ?? '').split(/[,，\s]+/).filter(Boolean).map(Number));
    const sans = `'${p.font}', 'Noto Sans TC', sans-serif`, serifFace = `'${p.serifFont}', 'Noto Serif TC', serif`;
    s.mark.textContent = quoteMark(wordsLang([p.text, p.pre], ctx));
    const key = JSON.stringify([lines, pre, card]);
    if (s.key !== key) {   // the rows and words are rebuilt only when the text changes
      s.key = key;
      for (const r of s.rows) r.remove();
      s.toks = [];
      let n = 0;
      s.rows = lines.map((words, li) => {
        const row = h('div', null, null, s.body);
        cssCamel(row, { position: 'absolute', whiteSpace: 'nowrap', lineHeight: '1.1' });
        if (!card && pre[li]) { const sp = h('span', null, null, row); sp.textContent = pre[li]; cssCamel(sp, { opacity: '0.5' }); }
        quotePieces(words).forEach((w) => {
          const sp = h('span', null, null, row);
          sp.textContent = w;
          cssCamel(sp, { display: 'inline-block', transformOrigin: '50% 80%' });
          s.toks.push({ el: sp, line: li, t: 0 });
          n++;
        });
        return row;
      });
    }
    s.toks.forEach((tk, i) => { tk.t = times[i] ?? 0; });
    // the layout: lines stacked from the top, shrunk to the room across and (all together) to the safe area down
    const side = theme.safe.side * W, room = W - 2 * side, win = Array.isArray(p.win) && p.win.length === 4 ? p.win.map(Number) : [0.574, 0.13, 0.352, 0.203];
    const [wx, wy, ww, wh] = [win[0] * W, win[1] * H, win[2] * W, win[3] * H];
    const top = p.y >= 0 ? p.y * H : card ? 0.396 * H : wy + wh + 60 * k, gap = (card ? 18 : 22) * k;
    let sizes = quoteSizes(p.sizes, lines.length, hit, card).map((x, i) => Math.min(x * k, room / Math.max(0.5, textEm(quotePieces(lines[i]).join('') + (pre[i] && !card ? pre[i] : '')))));
    const extra = card ? (p.who ? 40 * k + 46 * k : 0) : 0, total = sizes.reduce((a, x) => a + x * 1.1 + gap, -gap) + extra, avail = (1 - theme.safe.bottom) * H - top - (card ? 60 * k : 0);
    if (total > avail && total > 0) sizes = sizes.map((x) => (x * avail) / total);
    let y = top;
    const rowTop = s.rows.map((row, i) => {
      const at = y; y += sizes[i] * 1.1 + gap;
      cssCamel(row, { left: `${side}px`, top: `${at}px`, fontSize: `${sizes[i].toFixed(2)}px`, fontFamily: serif.has(i) ? serifFace : sans, fontWeight: '900',
        color: card ? (i === hit ? p.accent : i < hit ? p.muted : p.color) : i === hit ? p.accent : p.color, transformOrigin: '0% 60%' });
      return at;
    });
    const bottom = y - gap;
    // the ground (card only) and the quote mark
    cssCamel(s.bg, { display: card ? 'block' : 'none', background: `radial-gradient(120% 70% at 50% 30%, ${withAlpha(p.accent, 0.07)} 0%, rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.35)), ${p.bg}` });
    const m = eOut3(prog(local, 0, 0.3));
    cssCamel(s.mark, { left: `${side - 20 * k}px`, top: `${card ? top - 290 * k : wy - 70 * k}px`, fontSize: `${300 * k}px`, fontFamily: serifFace, color: p.accent,
      opacity: String(m), transform: card ? 'none' : `translateY(${((1 - m) * 40 * k).toFixed(2)}px)` });
    if (card) { drawCard(ctx, s, k, side, bottom); return; }
    // words: who said it beside the window, the words, the slam
    cssCamel(s.who, { display: 'block', left: `${side}px`, top: `${Math.max(wy + wh - 120 * k, wy + 160 * k)}px`, width: `${Math.max(100 * k, wx - side - 40 * k)}px`, fontFamily: sans, opacity: String(eOut3(prog(local, 0.05, 0.3))) });
    s.whoKick.textContent = p.kicker; s.whoName.textContent = p.who;
    cssCamel(s.whoKick, { color: p.muted, fontSize: `${26 * k}px`, fontWeight: '700', letterSpacing: `${3 * k}px`, lineHeight: '1.3' });
    cssCamel(s.whoName, { marginTop: `${6 * k}px`, color: p.color, fontSize: `${44 * k}px`, fontWeight: '900', lineHeight: '1.2' });
    for (const e of [s.credit.parentElement!, s.foot]) cssCamel(e, { display: 'none' });
    cssCamel(s.wrap, { opacity: String(prog(dur - local, 0, 0.08)) });
    const ghost = withAlpha(p.accent, 0.2), hitTimes = s.toks.filter((x) => x.line === hit).map((x) => x.t), slamAt = hitTimes.length ? Math.min(...hitTimes) : Infinity;
    for (const tk of s.toks) {
      const u = local - tk.t;
      if (tk.line === hit) {   // from 2.3× down to 1× with an overshoot; a ghost line fills in from its faint copy
        const a = prog(u, 0, 0.14), sc = u < 0 ? 1 : 1 + 1.3 * (1 - back(a)) * (a < 1 ? 1 : 0);
        cssCamel(tk.el, { opacity: p.ghost ? '1' : String(prog(u, 0, 0.04)), transform: `scale(${(u < 0 ? 1 : Math.max(0.9, sc)).toFixed(3)})`, color: p.ghost && u < 0 ? ghost : p.accent });
      } else {
        const a = prog(u, 0, 0.16);
        cssCamel(tk.el, { opacity: String(prog(u, 0, 0.06)), transform: `translateY(${((1 - back(a)) * 36 * k).toFixed(2)}px) scale(${(1 + 0.18 * (1 - eOut3(a))).toFixed(3)})` });
      }
    }
    // after the slam: the other lines step back, the quote shakes once, the glow flashes
    const v = local - slamAt;
    s.rows.forEach((r, i) => cssCamel(r, { opacity: i === hit ? '1' : String(1 - 0.55 * eOut3(prog(v, 0, 0.25))) }));
    const q = v / 0.4, amp = q >= 0 && q <= 1 ? 14 * k * (1 - q) : 0;
    // no hit line (empty text): q is −∞, and 0 × sin(−∞) would be NaN
    cssCamel(s.body, { transform: `translate(${(amp ? amp * Math.sin(q * 71) : 0).toFixed(2)}px,${(amp ? amp * Math.cos(q * 53) : 0).toFixed(2)}px)` });
    const gy = hit >= 0 ? ((rowTop[hit] + sizes[hit] * 0.55) / H) * 100 : 72;
    cssCamel(s.flash, { display: 'block', background: `radial-gradient(70% 40% at 40% ${gy.toFixed(1)}%, ${withAlpha(p.accent, 0.55)}, ${withAlpha(p.accent, 0)} 70%)`,
      opacity: String(v < 0 ? 0 : Math.max(0, 1 - v / 0.5) * prog(v, 0, 0.03)) });
  },
};

/** mode card: the lines, then the credit and the foot line, rising one by one */
function drawCard(ctx: Parameters<typeof quote.draw>[0], s: S, k: number, side: number, bottom: number) {
  const p = ctx.params, { H, theme, local } = ctx, f = prog(local, 0, 0.2), sans = `'${p.font}', 'Noto Sans TC', sans-serif`;
  cssCamel(s.wrap, { opacity: '1' }); cssCamel(s.body, { transform: 'none' }); cssCamel(s.flash, { display: 'none' }); cssCamel(s.who, { display: 'none' });
  for (const tk of s.toks) cssCamel(tk.el, { opacity: '1', transform: 'none', color: '' });
  s.credit.textContent = p.who; s.foot.textContent = p.kicker;
  const box = s.credit.parentElement!;
  cssCamel(box, { display: p.who ? 'flex' : 'none', left: `${side}px`, top: `${bottom + 40 * k}px`, gap: `${16 * k}px`, fontFamily: sans, color: p.color, fontSize: `${36 * k}px`, fontWeight: '700' });
  cssCamel(s.dash, { width: `${60 * k}px`, height: `${4 * k}px`, background: p.accent });
  cssCamel(s.foot, { display: p.kicker ? 'block' : 'none', left: `${side}px`, top: `${(1 - theme.safe.bottom) * H - 40 * k}px`, fontFamily: sans, color: p.muted, fontSize: `${28 * k}px`, fontWeight: '700', letterSpacing: `${3 * k}px` });
  [...s.rows, box, s.foot].forEach((r, i) => {
    const a = eOut3(prog(local, 0.12 + i * 0.14, 0.5 + i * 0.14));
    cssCamel(r, { opacity: String(a * f), transform: `translateY(${((1 - a) * 40 * k).toFixed(2)}px)` });
  });
}

/** a character of modes type and block, and whether it takes the accent colour */
export interface QChar { c: string; hl: boolean }

/** modes type and block: the quote's lines as characters (the words joined as quotePieces draws them), each marked when it takes the
 *  accent: the 【marked】 ones when the text has any, else every character of the hit line. `block` also drops the empty lines and a
 *  line's closing Chinese comma or full stop, so the solid block ends on a letter. */
export function quoteChars(text: string, hit: number, block = false): QChar[][] {
  const words = quoteLines(text), marked = /【[^】]*】/.test(nl(text)), at = quoteHit(words, hit);
  // the words joined as quotePieces joins them, a marked word counting as the letters inside its brackets ("stay 【foolish】" keeps its space)
  const bare = (w: string) => w.replace(/[【】{}]/g, '');
  const joined = (ws: string[]) => ws.map((w, i) => (i > 0 && latin.test(bare(ws[i - 1])) && latinStart.test(bare(w)) ? ' ' : '') + w).join('');
  const lines = words.map((w, i) => charKinds(joined(w)).map((x): QChar => ({ c: x.c, hl: marked ? x.kind === 'hl' : i === at })));
  if (!block) return lines;
  return lines.map((l) => { const out = [...l]; while (out.length && /[，。、；：]/.test(out[out.length - 1].c)) out.pop(); return out; }).filter((l) => l.length);
}

/** mode type: the width of a character's cell in em: a Chinese or Japanese one (or any full-width form) 1, anything else 0.6, so
 *  every Latin letter takes the same room like a typewriter's */
export const typeCell = (c: string) => (/[⺀-鿿가-힯豈-﫿︰-﹏＀-￯]/.test(c) ? 1 : 0.6);

/** mode type: when typing starts (s) */
export const TYPE_START = 0.35;
/** mode type: when each character of each line (of `lens` characters) is typed, in s from the item's start: from TYPE_START one every
 *  `step` s, a line break costing four characters' time; `step` is set so the last one is typed at 60 % of the item, kept between
 *  0.03 s (never a blur) and 0.1 s (a short quote is not crawled out). `done`: when the last one is typed */
export function typeTimes(lens: number[], dur: number): { at: number[][]; step: number; done: number } {
  const n = lens.reduce((a, x) => a + x, 0), units = Math.max(0, n - 1) + 4 * Math.max(0, lens.length - 1);
  const step = units > 0 ? Math.min(0.1, Math.max(0.03, (0.6 * dur - TYPE_START) / units)) : 0.06;
  let u = 0, done = TYPE_START;
  const at = lens.map((len, i) => {
    if (i) u += 4;
    return Array.from({ length: len }, () => { done = Math.round((TYPE_START + step * u++) * 1e6) / 1e6; return done; });
  });
  return { at, step, done };
}

/** mode type at `local`: the line the cursor is on and how many characters along it is (after the last one typed; at the start of
 *  the next line from two steps before its first character), and whether it shows: steady while typing, blinking (on, then off,
 *  0.53 s each) before and after */
export function typeCursor(at: number[][], step: number, done: number, local: number): { line: number; col: number; on: boolean } {
  let line = 0, col = 0;
  at.forEach((ts, i) => ts.forEach((t, j) => { if (local >= t) { line = i; col = j + 1; } }));
  if (col === (at[line]?.length ?? 0)) for (let i = line + 1; i < at.length; i++) if (at[i].length) { if (local >= at[i][0] - 2 * step) { line = i; col = 0; } break; }
  const typing = local >= TYPE_START && local < done + step;
  const blink = (u: number) => Math.floor(u / 0.53) % 2 === 0;
  return { line, col, on: typing || blink(local < TYPE_START ? local : local - done - step) };
}

/** a line's ink at 100 px in mode block's face (px): how wide it is, how far it reaches left of the pen (negative: it starts right of
 *  it), how far it rises above and drops below the baseline, and the face's ascent and descent (where the baseline sits in a line box) */
export interface Ink { w: number; left: number; up: number; down: number; asc: number; desc: number }
let measurer: CanvasRenderingContext2D | null | undefined;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** the measure of mode block (an object, so a test can stand in for the canvas): the real ink where there is a 2D context, the
 *  estimate (Chinese 1 em wide, others 0.55; CJK ascent and descent) where there is none */
export const quoteMeasure = {
  ink(text: string, face: string): Ink {
    if (measurer === undefined) { try { measurer = document.createElement('canvas').getContext('2d'); } catch { measurer = null; } }
    const est: Ink = { w: textEm(text) * 100, left: 0, up: 88, down: 12, asc: 116, desc: 29 };
    if (!measurer) return est;
    measurer.font = `900 100px ${face}`;
    const m = measurer.measureText(text), l = num(m.actualBoundingBoxLeft, NaN), r = num(m.actualBoundingBoxRight, NaN), ink = Number.isFinite(l + r) && l + r > 0;
    return { w: ink ? l + r : num(m.width, 0) || est.w, left: ink ? l : 0, up: num(m.actualBoundingBoxAscent, est.up), down: num(m.actualBoundingBoxDescent, est.down),
      asc: num(m.fontBoundingBoxAscent, est.asc), desc: num(m.fontBoundingBoxDescent, est.desc) };
  },
  /** how wide a character is drawn (em) in `face` at `weight`; the estimate (textEm) where there is no 2D context */
  advance(c: string, face: string, weight: number): number {
    if (measurer === undefined) { try { measurer = document.createElement('canvas').getContext('2d'); } catch { measurer = null; } }
    if (!measurer) return textEm(c);
    measurer.font = `${weight} 100px ${face}`;
    return num(measurer.measureText(c).width, 0) / 100 || textEm(c);
  },
};

/** mode block: how wide the block is (the room across, or less so the stack fits `tall`) and, for every line, the font size (px)
 *  that makes its ink exactly that wide and where its ink's top sits below the block's top (lines a gap of `gap` × the width apart) */
export function blockFit(inks: Ink[], room: number, tall: number, gap = 0.03): { width: number; height: number; rows: Array<{ fs: number; top: number }> } {
  const ratio = inks.map((m) => (m.up + m.down) / Math.max(1e-6, m.w));
  const sum = ratio.reduce((a, x) => a + x, 0) + gap * Math.max(0, inks.length - 1);
  const width = Math.max(0, Math.min(room, sum > 0 ? tall / sum : room));
  let y = 0;
  const rows = inks.map((m, i) => { const top = y; y += (ratio[i] + gap) * width; return { fs: (width * 100) / Math.max(1e-6, m.w), top }; });
  return { width, height: Math.max(0, y - gap * width), rows };
}

/** mode block: when line i of n lands (s): one after another from 0.1 s, 0.12–0.3 s apart, the last by about half the item */
export const blockLand = (i: number, n: number, dur: number) => 0.1 + i * Math.min(0.3, Math.max(0.12, (0.45 * dur) / Math.max(1, n)));

/** modes type and block: their own layer; the words, card and the quote mark stay hidden */
function drawAlt(ctx: Parameters<typeof quote.draw>[0], s: S) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, block = p.mode === 'block';
  cssCamel(s.wrap, { display: 'none' }); cssCamel(s.bg, { display: 'none' });
  cssCamel(s.alt, { display: 'block', opacity: String(prog(dur - local, 0, 0.2)) });
  const lines = quoteChars(p.text, p.hit, block), face = `'${p.font}', 'Noto Sans TC', sans-serif`;
  const key = JSON.stringify([p.mode, lines]);
  if (s.altKey !== key) {   // the rows are built again only when the text (or the mode) changes
    s.altKey = key;
    for (const r of s.altRows) r.remove();
    s.altChars = [];
    s.altRows = lines.map((l) => {
      const row = abs(s.alt, { whiteSpace: 'pre', lineHeight: block ? '1' : '1.2' }), spans: HTMLElement[] = [];
      if (block) {   // a span a run of one colour
        for (const ch of l) {
          const last = spans[spans.length - 1];
          if (last && (last.dataset.hl === '1') === ch.hl) last.textContent += ch.c;
          else { const sp = h('span', null, null, row); sp.textContent = ch.c; sp.dataset.hl = ch.hl ? '1' : '0'; spans.push(sp); }
        }
      } else for (const ch of l) {   // a span a character, each in a cell of its own width
        const sp = h('span', null, null, row);
        sp.textContent = ch.c; sp.dataset.hl = ch.hl ? '1' : '0';
        cssCamel(sp, { display: 'inline-block', width: `${typeCell(ch.c)}em`, textAlign: 'center', whiteSpace: 'pre' });
        spans.push(sp);
      }
      s.altChars.push(spans);
      return row;
    });
    s.alt.appendChild(s.cursor);   // over the rows
  }
  for (const spans of s.altChars) for (const sp of spans) cssCamel(sp, { color: sp.dataset.hl === '1' ? p.accent : '' });
  const side = theme.safe.side * W, room = W - 2 * side, kickH = p.kicker ? 64 * k : 0, byH = p.who ? 76 * k : 0;
  const tall = (1 - theme.safe.top - theme.safe.bottom) * H - kickH - byH;
  const small = { fontFamily: face, color: p.muted, fontSize: `${34 * k}px`, fontWeight: '700', letterSpacing: `${3 * k}px`, lineHeight: '1.2' };
  s.altKick.textContent = p.kicker; s.altBy.textContent = p.who ? `— ${p.who}` : '';
  if (block) drawBlock(ctx, s, lines, face, room, tall, kickH, byH, small);
  else drawType(ctx, s, lines, face, room, tall, kickH, byH, small);
}

/** where the stack's top goes: `y` when set, else the stack (with the kicker above and who said it below) centred in the safe area */
const stackTop = (y: number, H: number, safe: { top: number; bottom: number }, kickH: number, body: number, byH: number) =>
  y >= 0 ? y * H : safe.top * H + ((1 - safe.top - safe.bottom) * H - kickH - body - byH) / 2 + kickH;

/** mode type: the rows in fixed cells, the characters typed so far, the block cursor, the kicker and (once typed) who said it */
function drawType(ctx: Parameters<typeof quote.draw>[0], s: S, lines: QChar[][], face: string, room: number, tall: number, kickH: number, byH: number, small: Record<string, string>) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, lead = 1.5;
  const ems = lines.map((l) => l.reduce((a, ch) => a + typeCell(ch.c), 0)), widest = Math.max(1, ...ems);
  const fs = Math.min(80 * k, room / (widest + 0.7), tall / (lines.length * lead));
  const left = (W - widest * fs) / 2, body = ((lines.length - 1) * lead + 1.2) * fs, top = stackTop(p.y, H, theme.safe, kickH, body, byH);
  const { at, step, done } = typeTimes(lines.map((l) => l.length), dur);
  s.altRows.forEach((row, i) => cssCamel(row, { left: `${left.toFixed(2)}px`, top: `${(top + i * lead * fs).toFixed(2)}px`, fontFamily: face, fontSize: `${fs.toFixed(2)}px`, fontWeight: '700', color: p.color }));
  // a Latin letter wider than its cell (m, W) is narrowed to fit it, like a typewriter's face
  s.altChars.forEach((spans, i) => spans.forEach((sp, j) => {
    const c = lines[i][j].c, w = typeCell(c) < 1 ? quoteMeasure.advance(c, face, 700) : 0;
    cssCamel(sp, { visibility: local >= at[i][j] ? 'visible' : 'hidden', transform: w > 0.56 ? `scaleX(${(0.56 / w).toFixed(3)})` : 'none' });
  }));
  const c = typeCursor(at, step, done, local), cx = (lines[c.line] ?? []).slice(0, c.col).reduce((a, ch) => a + typeCell(ch.c), 0);
  cssCamel(s.cursor, { display: lines.length ? 'block' : 'none', left: `${(left + (cx + 0.06) * fs).toFixed(2)}px`, top: `${(top + c.line * lead * fs + 0.14 * fs).toFixed(2)}px`,
    width: `${(0.52 * fs).toFixed(2)}px`, height: `${(1.02 * fs).toFixed(2)}px`, background: p.accent, opacity: c.on ? '0.92' : '0' });
  cssCamel(s.altKick, { ...small, display: p.kicker ? 'block' : 'none', left: `${left.toFixed(2)}px`, top: `${(top - kickH).toFixed(2)}px`, opacity: String(eOut3(prog(local, 0, 0.3))) });
  const by = eOut3(prog(local, done + 0.2, done + 0.5));
  cssCamel(s.altBy, { ...small, display: p.who ? 'block' : 'none', left: `${left.toFixed(2)}px`, top: `${(top + body + 30 * k).toFixed(2)}px`, opacity: String(by), transform: `translateY(${((1 - by) * 16 * k).toFixed(2)}px)` });
}

/** mode block: every line at the size that makes its ink the block's width, stacked tight, each landing in turn (pressed down from
 *  1.5× with a small overshoot), the kicker above, who said it below once the last has landed */
function drawBlock(ctx: Parameters<typeof quote.draw>[0], s: S, lines: QChar[][], face: string, room: number, tall: number, kickH: number, byH: number, small: Record<string, string>) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080;
  const inks = lines.map((l) => quoteMeasure.ink(l.map((ch) => ch.c).join(''), face)), fit = blockFit(inks, room, tall);
  const left = (W - fit.width) / 2, top = stackTop(p.y, H, theme.safe, kickH, fit.height, byH), n = lines.length;
  s.altRows.forEach((row, i) => {
    const m = inks[i], { fs, top: y } = fit.rows[i], sc = fs / 100;
    // the line box is fs tall (line-height 1): its baseline sits half the face's ascent minus descent below the middle
    const rowTop = top + y + m.up * sc - fs / 2 - ((m.asc - m.desc) * sc) / 2;
    const q = prog(local, blockLand(i, n, dur), blockLand(i, n, dur) + 0.3);
    cssCamel(row, { left: `${(left + m.left * sc).toFixed(2)}px`, top: `${rowTop.toFixed(2)}px`, fontFamily: face, fontSize: `${fs.toFixed(2)}px`, fontWeight: '900', color: p.color,
      transformOrigin: `${(-m.left * sc + fit.width / 2).toFixed(2)}px 50%`, opacity: String(clamp(q * 3)), transform: `scale(${(1.5 - 0.5 * eBack(q, 1.6)).toFixed(4)})` });
  });
  cssCamel(s.cursor, { display: 'none' });
  cssCamel(s.altKick, { ...small, display: p.kicker ? 'block' : 'none', left: `${left.toFixed(2)}px`, top: `${(top - kickH).toFixed(2)}px`, opacity: String(eOut3(prog(local, 0, 0.3))) });
  const end = blockLand(n - 1, n, dur) + 0.3, by = eOut3(prog(local, end, end + 0.3));
  cssCamel(s.altBy, { ...small, display: p.who ? 'block' : 'none', left: `${left.toFixed(2)}px`, top: `${(top + fit.height + 34 * k).toFixed(2)}px`, opacity: String(by), transform: `translateY(${((1 - by) * 16 * k).toFixed(2)}px)` });
}
