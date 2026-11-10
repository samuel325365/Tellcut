// common.quiz — a game-show quiz question on a paper card, from the quiz acceptance film's fx.quizcard. A tab on the card's top
// edge holds the question number and difficulty stars; the question types in over the narration; the option rows pop in one by
// one; at `reveal` the wrong rows get a red cross and grey out, the right row turns green and glows, then the wrong rows fold
// away (the answer row slides up into the first slot) and a badge pops onto it (an emoji or word, or a picture from a source:
// a flag, a product). An optional fact chip (a big number and its source) drops in above the card after the reveal.
// All DOM text; times are seconds from the item's start. Sized by the short side (k = min(W, H) / 1080), kept in the safe area.
import { clamp, cssCamel, h, type ItemType } from '@tellcut/engine';
import { EMOJI_STACK, fitPx } from './text.ts';
import { imagesReady } from './window.ts';
import { withAlpha } from './color.ts';

interface P {
  no: string; stars: number; question: string; qt: string; options: string; letters: string; shows: string; answer: number; reveal: number;
  badge: string; badgeSource: string; fact: string; factSub: string; factAt: number; factY: number;
  x: number; y: number; w: number; font: string; tab: string; good: string; bad: string; hl: string; ink: string; paper: string;
}
interface Row { r: HTMLElement; badge: HTMLElement; label: HTMLElement; bars: HTMLElement[]; mark: HTMLElement | null; img: HTMLImageElement | null }
interface S { wrap: HTMLElement; card: HTMLElement; qText: HTMLElement; qGhost: HTMLElement; chars: string[]; rows: Row[]; fact: HTMLElement | null; key: string; imgs: HTMLImageElement[] }

/** the card's parts in design px (× k): the question line's top and height, an option row's height and the gap between rows */
const Q_TOP = 34, Q_H = 80, ROW_H = 92, GAP = 14, ROW0 = Q_TOP + Q_H + 20, FOOT = 40, TAB = 62;
const nums = (s: string) => String(s ?? '').split(',').map((x) => parseFloat(x)).filter((x) => Number.isFinite(x));
const bar = (s: string) => String(s ?? '').split('|').map((x) => x.trim());

/** the options (at most six; blanks dropped) */
export const quizOptions = (s: string) => bar(s).filter(Boolean).slice(0, 6);
/** the card's full height (design px) with n option rows */
export const quizHeight = (n: number) => ROW0 + n * (ROW_H + GAP) - GAP + FOOT;
/** the question's typing span [start, end] (s): "start,end", else 0.2–1.4 */
export function typeSpan(qt: string): [number, number] { const v = nums(qt); return v.length >= 2 ? [v[0], Math.max(v[0], v[1])] : [0.2, 1.4]; }
/** when each option pops in: `shows` (comma-separated s), the missing ones 0.45 s apart from 0.25 s after the question is typed */
export function showTimes(shows: string, n: number, qt: string): number[] {
  const v = nums(shows), end = typeSpan(qt)[1];
  return Array.from({ length: n }, (_, i) => v[i] ?? end + 0.25 + i * 0.45);
}
/** a row at t: how far it has popped in, the cross (wrong rows, from the reveal), the green (the answer, from reveal + 0.35 s),
 *  and how much of it stays (wrong rows fold away from reveal + 1.3 s) */
export function rowState(t: number, at: number, right: boolean, reveal: number, spring: (x: number) => number, inOut: (x: number) => number) {
  const pop = t < at ? 0 : spring(t - at), fold = inOut(clamp((t - reveal - 1.3) / 0.45));
  return { pop, cross: right ? 0 : clamp((t - reveal) / 0.22), good: right ? clamp((t - reveal - 0.35) / 0.2) : 0, keep: right ? 1 : 1 - fold, grow: t < at ? 0 : clamp((t - at) / 0.25) };
}

export const quiz: ItemType<P, S> = {
  type: 'common.quiz', label: '測驗題卡', category: 'card', kind: 'overlay',
  doc: '綜藝節目感的測驗題卡（紙卡、粗黑框）：卡片上緣一個題號籤（no）加難度星（stars 1–5）；題目（question）在 qt「開始,結束」秒之間逐字打出來；選項（options 用 | 分開，2–6 個，letters 是前面的字母）照 shows 的秒數一個個彈進來、卡片跟著長高；reveal 秒揭曉：錯的打紅叉變灰、答案（answer，從 0 算）變綠發光，接著錯的收起來、答案滑到第一列，右端彈出徽章（badge 一個 emoji 或字，badgeSource 用素材的一格當圖：國旗、商品照）；fact 是揭曉後掉在卡片上方的數字小卡（factSub 出處）；y -1 讓整張卡（全部選項都在時）的下緣貼齊下方安全區；益智問答、猜猜看、冷知識、選擇題；音效配 common.pop（選項彈入）、common.buzz（打叉）、common.ding（答對），倒數用 common.countdown',
  params: [
    { key: 'no', label: '題號籤的字', type: 'string', default: '第 1 題' },
    { key: 'stars', label: '難度星（0–5；0＝不畫星星）', type: 'number', min: 0, max: 5, step: 1, default: 1 },
    { key: 'question', label: '題目', type: 'string', default: '彩虹有幾種顏色？' },
    { key: 'qt', label: '題目逐字打出來（開始,結束 秒）', type: 'string', default: '0.2,1.2' },
    { key: 'options', label: '選項（| 分開，2–6 個）', type: 'string', default: '五種|七種|九種' },
    { key: 'letters', label: '選項前的字母（| 分開）', type: 'string', default: 'A|B|C|D|E|F' },
    { key: 'shows', label: '每個選項彈入的秒數（逗號分開；空＝題目打完後每 0.45 秒一個）', type: 'string', default: '' },
    { key: 'answer', label: '答案是第幾個選項（從 0 算）', type: 'number', min: 0, max: 5, step: 1, default: 1 },
    { key: 'reveal', label: '揭曉（秒）', type: 'number', min: 0, max: 120, step: 0.01, default: 3 },
    { key: 'badge', label: '答案列右端的徽章（揭曉後彈出；一個 emoji 或幾個字，空＝沒有）', type: 'string', default: '' },
    { key: 'badgeSource', label: '徽章改用素材的一格（國旗、商品照；空＝用 badge 的字）', type: 'source-ref', default: '' },
    { key: 'fact', label: '數字小卡的大字（空＝沒有）', type: 'string', default: '' },
    { key: 'factSub', label: '數字小卡的出處', type: 'string', default: '' },
    { key: 'factAt', label: '數字小卡出現（揭曉後幾秒）', type: 'number', min: 0, max: 10, step: 0.1, default: 1.2 },
    { key: 'factY', label: '數字小卡上緣（畫面高比例；-1＝卡片上方）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'x', label: '卡片中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '卡片上緣（畫面高比例；-1＝選項都在時下緣貼齊下方安全區）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '卡片寬（畫面短邊的比例）', type: 'number', min: 0.4, max: 1.6, step: 0.01, default: 0.85 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'tab', label: '題號籤顏色', type: 'color', default: '#d0603a', theme: 'palette.accent' },
    { key: 'good', label: '答對的顏色', type: 'color', default: '#2f8f6b', theme: 'palette.accent2' },
    { key: 'bad', label: '打叉的顏色', type: 'color', default: '#d64032' },
    { key: 'hl', label: '星星顏色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
    { key: 'ink', label: '字與框', type: 'color', default: '#2b2118', theme: 'palette.ink' },
    { key: 'paper', label: '紙色', type: 'color', default: '#fbf5e8', theme: 'palette.paper' },
  ],
  media(item) {
    const src = (item.params as Partial<P>).badgeSource;
    return { videos: [], stills: src ? [{ source: src, t: 0, w: 480 }] : [] };
  },
  build(ctx) {
    const wrap = h('div', null, null, ctx.root);
    cssCamel(wrap, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const s: S = { wrap, card: wrap, qText: wrap, qGhost: wrap, chars: [], rows: [], fact: null, key: '', imgs: [] };
    quiz.draw(ctx, s);   // builds the card now, so ready() can wait for the badge picture
    return s;
  },
  ready: (s) => imagesReady(s.imgs),
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t, dur, motion } = ctx, S0 = Math.min(W, H), k = S0 / 1080;
    const opts = quizOptions(p.options), n = opts.length;
    const cw = Math.min(p.w * S0, W * (1 - 2 * theme.safe.side));
    const key = JSON.stringify(p) + `|${W}x${H}`;
    if (s.key !== key) { s.key = key; layout(ctx, s, opts, cw, k); }
    const sp = (d: number, b: number) => motion.spring({ duration: d, bounce: b });
    const left = clamp(p.x * W - cw / 2, theme.safe.side * W, (1 - theme.safe.side) * W - cw);
    const top = p.y >= 0 ? p.y * H : (1 - theme.safe.bottom) * H - quizHeight(n) * k;
    // the card in and out
    const inK = sp(0.5, 0.3)(t), outK = clamp((dur - t) / 0.3);
    // the question typing (the rest of it stays in place, transparent, so the line never shifts)
    const [q0, q1] = typeSpan(p.qt), shown = Math.round(clamp((t - q0) / Math.max(0.05, q1 - q0)) * s.chars.length);
    s.qText.textContent = s.chars.slice(0, shown).join('');
    s.qGhost.textContent = s.chars.slice(shown).join('');
    // the rows
    const shows = showTimes(p.shows, n, p.qt), R = p.reveal, a = clamp(Math.round(p.answer), 0, Math.max(0, n - 1));
    let y = ROW0 * k;
    s.rows.forEach((row, i) => {
      const right = i === a, st = rowState(t, shows[i], right, R, sp(0.4, 0.45), motion.ease.inOut);
      const glow = right && t > R + 0.35 ? 0.5 + 0.5 * Math.sin((t - R - 0.35) * 6) : 0, crossK = motion.ease.out(st.cross);
      const sc = (0.6 + 0.4 * st.pop) * (right ? 1 + 0.05 * motion.ease.out(st.good) : 1) * (0.85 + 0.15 * st.keep);
      cssCamel(row.r, { top: `${y}px`, opacity: String(clamp(st.pop) * (right ? 1 : (1 - 0.55 * crossK) * st.keep)), transform: `scale(${sc})`,
        background: right ? motion.mix('#ffffff', p.good, st.good) : motion.mix('#ffffff', '#d9d2c4', crossK),
        boxShadow: st.good > 0 ? `0 0 ${(18 + 18 * glow) * k}px ${(4 + 6 * glow) * k}px ${withAlpha(p.good, 0.67)}` : 'none' });
      cssCamel(row.label, { color: right ? motion.mix(p.ink, '#ffffff', st.good) : p.ink });
      cssCamel(row.badge, { background: right ? motion.mix(p.ink, '#ffffff', st.good) : p.ink, color: right ? motion.mix(p.paper, p.good, st.good) : p.paper });
      row.bars.forEach((b, j) => {
        const kk = clamp((t - R - j * 0.08) / 0.18);
        cssCamel(b, { transform: `rotate(${j ? -45 : 45}deg) scaleX(${right ? 0 : motion.ease.out(kk)})` });
      });
      if (row.mark) {
        const fk = t < R + 0.6 ? 0 : sp(0.45, 0.4)(t - R - 0.6);
        cssCamel(row.mark, { opacity: String(clamp(fk)), transform: `scale(${0.4 + 0.6 * fk}) rotate(${(1 - fk) * -12}deg)` });
      }
      // the card grows as each row arrives; the rows above the answer shrink with `keep`, so the answer slides up by itself
      y += (ROW_H + GAP) * k * st.keep * motion.ease.out(st.grow);
    });
    cssCamel(s.card, { left: `${left}px`, top: `${top}px`, width: `${cw}px`, height: `${y - GAP * k + FOOT * k}px`, opacity: String(clamp(t / 0.15) * outK),
      transform: `translateY(${(1 - inK) * 120 * k}px) scale(${0.9 + 0.1 * inK})` });
    if (s.fact) {
      const fk = t < R + p.factAt ? 0 : sp(0.5, 0.35)(t - R - p.factAt);
      cssCamel(s.fact, { top: p.factY >= 0 ? `${p.factY * H}px` : `${top - (TAB + 40) * k}px`, opacity: String(clamp(fk * 1.5) * outK),
        transform: `translateX(-50%) translateY(${p.factY >= 0 ? 0 : -100}%) translateY(${(1 - fk) * -60 * k}px) scale(${0.7 + 0.3 * fk})` });
    }
  },
};

/** build the card's elements (again whenever a parameter or the frame size changes) */
function layout(ctx: Parameters<typeof quiz.draw>[0], s: S, opts: string[], cw: number, k: number) {
  const p = ctx.params, X = (v: number) => `${v * k}px`, font = `'${p.font}', 'Noto Sans TC', ${EMOJI_STACK}, sans-serif`;
  s.wrap.innerHTML = '';
  cssCamel(s.wrap, { fontFamily: font });
  const card = h('div', null, null, s.wrap);
  cssCamel(card, { position: 'absolute', boxSizing: 'border-box', border: `${6 * k}px solid ${p.ink}`, borderRadius: X(30), background: p.paper, boxShadow: `${10 * k}px ${12 * k}px 0 ${withAlpha(p.ink, 0.2)}`, transformOrigin: '50% 0%' });
  // the tab on the card's top edge: the number and the stars
  const tab = h('div', null, null, card);
  cssCamel(tab, { position: 'absolute', left: X(28), top: X(-TAB), height: X(70), padding: `0 ${X(26)}`, display: 'flex', alignItems: 'center', gap: X(18), background: p.tab,
    border: `${6 * k}px solid ${p.ink}`, borderRadius: X(20), color: '#ffffff', fontWeight: '900', fontSize: X(48), lineHeight: '1', whiteSpace: 'pre', boxSizing: 'border-box' });
  const no = h('span', null, null, tab); no.textContent = p.no;
  const n = clamp(Math.round(p.stars), 0, 5);
  if (n > 0) {
    const stars = h('span', null, null, tab); cssCamel(stars, { letterSpacing: X(2), fontSize: X(44) });
    const on = h('span', null, null, stars); on.textContent = '★'.repeat(n); cssCamel(on, { color: p.hl, webkitTextStroke: `${2 * k}px ${p.ink}` });
    const off = h('span', null, null, stars); off.textContent = '★'.repeat(5 - n); cssCamel(off, { color: '#ffffff55' });
  }
  if (!p.no && !n) cssCamel(tab, { display: 'none' });
  // the question on one line, shrunk to fit the card
  const q = h('div', null, null, card), room = cw - 68 * k - 12 * k;
  cssCamel(q, { position: 'absolute', left: X(34), right: X(34), top: X(Q_TOP), height: X(Q_H), fontWeight: '700', fontSize: `${fitPx(p.question, 62 * k, room)}px`, lineHeight: X(Q_H), color: p.ink, whiteSpace: 'pre' });
  const qText = h('span', null, null, q), qGhost = h('span', null, null, q); cssCamel(qGhost, { opacity: '0' });
  // the option rows; the answer row carries the badge
  const lets = bar(p.letters), a = clamp(Math.round(p.answer), 0, Math.max(0, opts.length - 1));
  const pic = p.badgeSource ? ctx.media.stillUrl({ source: p.badgeSource, t: 0, w: 480 }) : '', hasMark = !!pic || !!p.badge;
  s.imgs = [];
  const rows: Row[] = opts.map((txt, i) => {
    const r = h('div', null, null, card);
    cssCamel(r, { position: 'absolute', left: X(30), right: X(30), height: X(ROW_H), boxSizing: 'border-box', border: `${5 * k}px solid ${p.ink}`, borderRadius: X(22), background: '#ffffff',
      display: 'flex', alignItems: 'center', transformOrigin: '50% 50%', overflow: 'hidden' });
    const badge = h('div', null, null, r); badge.textContent = lets[i] ?? '';
    cssCamel(badge, { position: 'relative', flex: 'none', width: X(66), height: X(66), margin: `0 ${X(22)} 0 ${X(12)}`, borderRadius: '50%', fontWeight: '900', fontSize: X(48), lineHeight: X(66), textAlign: 'center' });
    const label = h('div', null, null, r); label.textContent = txt;
    const lroom = cw - 60 * k - 110 * k - (hasMark && i === a ? 120 * k : 20 * k);
    cssCamel(label, { flex: '1', fontWeight: '700', fontSize: `${fitPx(txt, 56 * k, lroom)}px`, whiteSpace: 'pre', lineHeight: '1' });
    let mark: HTMLElement | null = null, img: HTMLImageElement | null = null;
    if (i === a && pic) {
      img = document.createElement('img'); r.appendChild(img); mark = img; img.src = pic; s.imgs.push(img);
      cssCamel(img, { flex: 'none', height: X(62), marginRight: X(18), border: `${4 * k}px solid ${p.ink}`, borderRadius: X(8), opacity: '0' });
    } else if (i === a && p.badge) {
      mark = h('div', null, null, r); mark.textContent = p.badge;
      cssCamel(mark, { flex: 'none', marginRight: X(18), padding: `0 ${X(14)}`, height: X(62), display: 'flex', alignItems: 'center', boxSizing: 'border-box', borderRadius: X(31),
        background: '#ffffff', border: `${4 * k}px solid ${p.ink}`, color: p.ink, fontWeight: '900', fontSize: X(40), lineHeight: '1', whiteSpace: 'pre', opacity: '0' });
    }
    // the red cross over the letter: two bars
    const cross = h('div', null, null, r);
    cssCamel(cross, { position: 'absolute', left: X(4), top: X(4), width: X(84), height: X(84), pointerEvents: 'none' });
    const bars = [45, -45].map((deg) => {
      const b = h('div', null, null, cross);
      cssCamel(b, { position: 'absolute', left: X(-2), top: X(36), width: X(88), height: X(14), borderRadius: X(7), background: p.bad, transformOrigin: '50% 50%', transform: `rotate(${deg}deg) scaleX(0)` });
      return b;
    });
    return { r, badge, label, bars, mark, img };
  });
  // the fact chip above the card
  let fact: HTMLElement | null = null;
  if (p.fact) {
    fact = h('div', null, null, s.wrap);
    cssCamel(fact, { position: 'absolute', left: `${clamp(p.x, 0.2, 0.8) * ctx.W}px`, padding: `${X(14)} ${X(36)} ${X(12)}`, background: p.paper, border: `${6 * k}px solid ${p.ink}`, borderRadius: X(24),
      boxShadow: `${8 * k}px ${10 * k}px 0 ${withAlpha(p.ink, 0.2)}`, textAlign: 'center', whiteSpace: 'pre' });
    const big = h('div', null, null, fact); big.textContent = p.fact; cssCamel(big, { fontWeight: '900', fontSize: X(68), lineHeight: '1.1', color: p.ink });
    if (p.factSub) { const sub = h('div', null, null, fact); sub.textContent = p.factSub; cssCamel(sub, { fontWeight: '500', fontSize: X(32), lineHeight: '1.3', color: withAlpha(p.ink, 0.69) }); }
  }
  Object.assign(s, { card, qText, qGhost, chars: [...String(p.question ?? '')], rows, fact });
}
