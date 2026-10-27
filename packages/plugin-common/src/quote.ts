// common.quote — the pull quote, from the podcast-quote short (fx.quote and fx.endcard).
// mode words: the kinetic quote. The video sits in a small window (`win`, the clip's frame) at the top right; beside it a big accent
// quote mark and who said it; below, the lines of `text` come in word by word on the times they are said (`times`, or spread over
// the item when not given). The hit line (the punchline, the last one by default) slams: big, from 2.3× with an overshoot, a shake
// of the whole quote, a glow of the accent colour, and the lines above it step back. `pre` puts dim words on the lines from the
// start and `ghost` shows the hit line faintly before it lands — a teaser at the top of a film.
// mode card: the closing card on an opaque ground — the quote mark, the lines rising one by one (before the hit line muted, the hit
// line in the accent colour), a dash and who said it, a small line at the foot.
import { abs, clamp, cssCamel, eBack, eOut3, h, type ItemType, prog, textEm } from '@tellcut/engine';
import { nl } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  mode: 'words' | 'card'; text: string; times: number[]; hit: number; pre: string; ghost: boolean; sizes: string; serif: string; y: number;
  win: number[]; who: string; kicker: string; font: string; serifFont: string; color: string; accent: string; muted: string; bg: string;
}
interface Tok { el: HTMLElement; line: number; t: number }
interface S { bg: HTMLElement; wrap: HTMLElement; mark: HTMLElement; who: HTMLElement; whoKick: HTMLElement; whoName: HTMLElement; dash: HTMLElement; credit: HTMLElement; foot: HTMLElement; body: HTMLElement; flash: HTMLElement; rows: HTMLElement[]; toks: Tok[]; key: string }

const back = (x: number) => eBack(clamp(x), 2.2);
const latin = /[A-Za-z0-9'’]$/, latinStart = /^[A-Za-z0-9]/;

/** the lines of `text` ("\n", or a typed "\\n") and their words (split by spaces or /); a blank line stays, empty */
export function quoteLines(text: string): string[][] {
  return nl(text).split('\n').map((l) => l.split(/[\s/]+/).filter(Boolean));
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

export const quote: ItemType<P, S> = {
  type: 'common.quote', label: '金句字卡', category: 'text', kind: 'overlay',
  doc: '金句字卡：mode words 是動態金句——影片縮成右上小窗（win），左邊大引號＋說話人，下面一行行字照講話時間逐詞跳出（times；不給就平均排開），最狠的那行（hit，預設最後一行）放大砸下、整段震一下、主色光一閃、前面幾行變暗；pre 讓幾行先放暗色預告字、ghost 讓最後一行先淡淡出現（片頭預告）；mode card 是不透明的收尾金句卡：大引號、幾行字一行行浮上來（hit 那行主色、之前的灰）、一條短線加出處、最下面一行小字；Podcast、訪談、演講的金句',
  params: [
    { key: 'mode', label: '樣式（words 逐詞動態金句、card 收尾金句卡）', type: 'enum', options: ['words', 'card'], default: 'words' },
    { key: 'text', label: '金句（一行一行；words 的詞用空白或 / 分開）', type: 'text', default: '但 如果 今天\n你 討厭 早起，\n你 又 沒有 理由，\n那 就 別起。\n去睡吧' },
    { key: 'times', label: '每個詞出現的秒數（相對開始，照順序；空＝自動排開）', type: 'json', default: [] },
    { key: 'hit', label: '砸下來的那行（從 0 數；-1＝最後一行）', type: 'number', min: -1, max: 20, step: 1, default: -1 },
    { key: 'pre', label: '一開始就在的暗色預告字（一行對一行，空行＝沒有）', type: 'text', default: '' },
    { key: 'ghost', label: '砸下來的那行先淡淡出現（預告）', type: 'bool', default: false },
    { key: 'sizes', label: '每行字級（以 1080 寬計的 px，逗號分開；空＝自動）', type: 'string', default: '60,118,118,96,232' },
    { key: 'serif', label: '用明體的行（從 0 數，逗號分開）', type: 'string', default: '3' },
    { key: 'y', label: '第一行上緣（畫面高比例；-1＝小窗下面／卡片中間偏上）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'win', label: '影片小窗 [x, y, 寬, 高]（畫面比例，等於影片的 frame；words）', type: 'json', default: [0.574, 0.13, 0.352, 0.203] },
    { key: 'who', label: '說話人（words：小窗左邊；card：短線後的出處）', type: 'string', default: 'Mia｜睡眠教練' },
    { key: 'kicker', label: '小字（words：說話人上面；card：最下面一行）', type: 'string', default: '她的答案' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'serifFont', label: '明體字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'color', label: '字色', type: 'color', default: '#f4ecdc', theme: 'palette.paper' },
    { key: 'accent', label: '主色（引號、砸下來的那行、光）', type: 'color', default: '#ff4f2a', theme: 'palette.accent' },
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
    return { bg, wrap, mark, who, whoKick, whoName, dash, credit: creditText, foot, body, flash, rows: [], toks: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, card = p.mode === 'card';
    const lines = quoteLines(p.text), hit = quoteHit(lines, p.hit), times = quoteTimes(lines, p.times, hit, dur), pre = nl(p.pre).split('\n');
    const serif = new Set(String(p.serif ?? '').split(/[,，\s]+/).filter(Boolean).map(Number));
    const sans = `'${p.font}', 'Noto Sans TC', sans-serif`, serifFace = `'${p.serifFont}', 'Noto Serif TC', serif`;
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
        words.forEach((w, wi) => {
          const sp = h('span', null, null, row);
          sp.textContent = (wi > 0 && latin.test(words[wi - 1]) && latinStart.test(w) ? ' ' : '') + w;
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
    let sizes = quoteSizes(p.sizes, lines.length, hit, card).map((x, i) => Math.min(x * k, room / Math.max(0.5, textEm(lines[i].join('') + (pre[i] && !card ? pre[i] : '')))));
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
