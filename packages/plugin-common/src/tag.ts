// common.tag — a row of small pill tags ("500碗認證", "傳奇小吃"): short facts that sit under a title.
// look "label" (from the uk-beat short's fx.tag): square blocks joined edge to edge — the place on ink with an accent edge, the date on
// the highlight colour — wiped in from the left within a beat.
// look "tape" (fd-map's fx.nbTop store tags): every tag handwritten onto its own strip of cream paper tape, a highlighter stroke
// growing under the words as they are written, `no` circled in red pen at the left of the first one; the strips land with a bounce.
// look "pin" (t2-map's fx.tag and the atlas pins): a teardrop map pin drops onto (x, y) — its tip — with a label card above it
// (the first tag, the second a small line under it); `check` ticks the pin's head at that second.
// look "day" (the todo-vlog short's fx.daystamp): a torn paper label at (x, y) with a strip of tape on its corner — the first tag big in an
// italic serif ("Day 2"), underlined in the accent pen, the second handwritten under it (a time, the weather); it pops in with a turn.
// look "glass" (the brand film): frosted panels one after another; `stack` puts them in a column, `check` ticks each one in the accent
// colour that many seconds after it appears (the spike's "It checks its own work." list).
import { clamp, cssCamel, eBack, eOut3, h, prog, rng, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas, penPath } from './inkline.ts';
import { handCircle, handFamily, tape } from './hand.ts';
import { mapPin } from './geo.ts';
import { withAlpha } from './color.ts';

interface P { tags: string; x: number; y: number; size: number; gap: number; font: string; ink: string; c1: string; c2: string; c3: string; look: 'pill' | 'label' | 'tape' | 'pin' | 'glass' | 'day'; no: string; check: number; handFont: string; step: number; stack: boolean }
interface Strip { el: HTMLElement; cv: HTMLCanvasElement; txt: HTMLElement; sub: HTMLElement }
interface S { row: HTMLElement; pills: HTMLElement[]; marks: HTMLElement[]; key: string; wrap: HTMLElement; strips: Strip[]; skey: string; pin: HTMLCanvasElement }

/** look tape: when strip i lands (0.12 s apart) and how far its words are written (12 characters a second after 0.15 s) */
export function tapeTimes(i: number, chars: number, local: number) {
  const t0 = i * 0.12;
  return { land: prog(local, t0, t0 + 0.22), write: chars ? clamp((local - t0 - 0.15) / (chars / 12)) : 1, hl: prog(local, t0 + 0.15, t0 + 0.45) };
}
/** look pin: the pin's drop (0–1, eased over 0.4 s) and the label's pop (from 0.2 s over 0.4 s, overshooting) */
export const pinTimes = (local: number, check: number) => ({ drop: eOut3(prog(local, 0, 0.4)), label: eBack(prog(local, 0.2, 0.6), 1.9), check: check >= 0 ? eOut3(prog(local, check, check + 0.35)) : 0 });

export const tag: ItemType<P, S> = {
  type: 'common.tag', label: '膠囊標籤', category: 'chapter', kind: 'overlay',
  doc: '一排小膠囊標籤（逗號分隔），一個接一個彈出；標題下面的重點小字：認證、類型、價位、距離；look: label 是方塊相連的地點＋日期標籤（深底白字加強調色邊、螢光底日期），一拍內從左刷進來；look: tape 是紙膠帶標籤：每個標籤用手寫字寫在一條米色紙膠帶上、字底下長出一道螢光筆，no 用紅筆圈在第一條左邊（店號、站號），膠帶彈一下貼上（筆記本、手帳、散步地圖）；look: pin 是圖釘標籤：一根水滴形圖釘落在 x、y（釘尖），上方一張標籤卡（第一個標籤，第二個是下面一行小字），check 那一秒在圖釘頭上打勾（地圖、到過的地方、景點）；look: glass 是毛玻璃標籤（品牌片），stack 直排，check 每個標籤出現後幾秒打上主色的勾（檢查清單、做到的事）；look: day 是手帳的日期標：x、y 一張撕邊小紙條，角上貼一段膠帶，第一個標籤是斜體大字（Day 2、07:30），筆畫一道底線，第二個是手寫小字（天氣、地點），彈一下轉正貼上（vlog 的第幾天、一天的時間軸、旅行日記）',
  params: [
    { key: 'tags', label: '標籤（用逗號分隔）', type: 'string', default: '標籤一,標籤二' },
    { key: 'x', label: '左邊 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.06 },
    { key: 'y', label: '上緣 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.14 },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 0.8, max: 6, step: 0.1, default: 1.8 },
    { key: 'gap', label: '間距（字級倍數）', type: 'number', min: 0, max: 2, step: 0.05, default: 0.4 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'ink', label: '外框與字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'c1', label: '膠囊顏色一', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'c2', label: '膠囊顏色二', type: 'color', default: '#2ec4b6', theme: 'palette.accent2' },
    { key: 'c3', label: '膠囊顏色三', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'look', label: '樣子（pill 膠囊、label 方塊相連的地點日期標籤、tape 紙膠帶手寫標籤、pin 圖釘標籤、glass 毛玻璃標籤、day 手帳日期標：撕邊小紙條上第一個標籤是斜體大字、第二個是手寫小字）', type: 'enum', options: ['pill', 'label', 'tape', 'pin', 'glass', 'day'], default: 'pill' },
    { key: 'no', label: '紅筆圈起來的號碼（tape：第一條膠帶左邊；空＝沒有）', type: 'string', default: '' },
    { key: 'check', label: '打勾的秒數（pin：相對項目開始；glass：每個標籤出現後幾秒；-1＝不打勾）', type: 'number', min: -1, max: 60, step: 0.05, default: -1 },
    { key: 'step', label: '一個接一個出現的間隔（秒；glass）', type: 'number', min: 0.02, max: 3, step: 0.01, default: 0.12 },
    { key: 'stack', label: '直排（glass；一個在一個下面）', type: 'bool', default: false },
    { key: 'handFont', label: '手寫字型（tape、pin、day）', type: 'string', default: 'LXGW WenKai TC' },
  ],
  build(ctx) {
    const row = h('div', null, null, ctx.root), wrap = h('div', null, null, ctx.root), pin = h('canvas', null, null, wrap) as HTMLCanvasElement;
    cssCamel(row, { position: 'absolute', display: 'flex', alignItems: 'center', whiteSpace: 'pre', fontWeight: '900' });
    cssCamel(wrap, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none', pointerEvents: 'none' });
    cssCamel(pin, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    return { row, pills: [], marks: [], key: '', wrap, strips: [], skey: '', pin };
  },
  hide(s) { freeCanvas(s.pin, ...s.strips.map((x) => x.cv)); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * H;
    const extra = p.look === 'tape' || p.look === 'pin' || p.look === 'day';
    cssCamel(s.wrap, { display: extra ? 'block' : 'none' });
    if (extra) { cssCamel(s.row, { display: 'none' }); if (p.look === 'tape') drawTape(ctx, s, k, px); else if (p.look === 'day') drawDay(ctx, s, px); else drawPin(ctx, s, k, px); return; }
    cssCamel(s.row, { display: 'flex' });
    const ticks = p.look === 'glass' && p.check >= 0, key = `${ticks ? 'v' : ''}|${p.tags}`;
    if (s.key !== key) {   // rebuild the pills only when the list (or whether they are ticked) changed
      s.key = key;
      s.row.innerHTML = '';
      s.marks = [];
      s.pills = p.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean).map((t) => {
        const e = h('div', null, null, s.row);
        if (ticks) {   // an empty circle before the words (no text of its own, so the pill's text stays the tag), a tick drawn by two borders
          const m = h('span', null, null, e), v = h('span', null, null, m);
          cssCamel(m, { display: 'inline-block', position: 'relative', width: '1em', height: '1em', borderRadius: '50%', marginRight: '0.55em', verticalAlign: '-0.16em', boxSizing: 'border-box' });
          cssCamel(v, { position: 'absolute', left: '0.34em', top: '0.17em', width: '0.26em', height: '0.5em', borderRight: '0.12em solid #ffffff', borderBottom: '0.12em solid #ffffff', transform: 'rotate(45deg)' });
          s.marks.push(m);
        }
        e.append(t);
        return e;
      });
    }
    const colors = [p.c1, p.c2, p.c3], out = 1 - prog(ctx.local, ctx.dur - 0.2, ctx.dur);
    if (p.look === 'label') {
      // joined blocks: the first on ink with an accent edge, then the highlight colour, then the second accent; wiped in from the left
      const w = eOut3(prog(ctx.local, 0, 0.1));
      cssCamel(s.row, { left: `${p.x * W}px`, top: `${p.y * H}px`, fontSize: `${px}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, gap: '0', opacity: String(out), flexDirection: 'row',
        alignItems: 'stretch', boxShadow: `0 ${5 * k}px ${16 * k}px rgba(0,0,0,.35)`, transform: `translateX(${((1 - w) * -60 * k).toFixed(2)}px)`, clipPath: `inset(0 ${((1 - w) * 100).toFixed(2)}% 0 0)` });
      s.pills.forEach((e, i) => {
        const bg = i === 0 ? p.ink : [p.c3, p.c2][(i - 1) % 2];
        cssCamel(e, { background: bg, color: i === 0 ? '#ffffff' : p.ink, padding: '0 0.46em', lineHeight: '1.6', borderRadius: '0', border: 'none',
          borderLeft: i === 0 ? `${0.19 * px}px solid ${p.c1}` : 'none', fontWeight: i === 0 ? '900' : '700', fontSize: i === 0 ? '1em' : '0.82em', display: 'flex', alignItems: 'center', transform: 'none', opacity: '1' });
      });
      return;
    }
    cssCamel(s.row, { alignItems: 'center', boxShadow: 'none', transform: 'none', clipPath: 'none', flexDirection: 'row' });
    if (p.look === 'glass') {
      // frosted panels (the brand film): the picture under each one blurred, a dark veil, a hairline edge; one after another
      cssCamel(s.row, { left: `${p.x * W}px`, top: `${p.y * H}px`, fontSize: `${px}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, gap: `${p.gap}em`, opacity: String(out),
        flexDirection: p.stack ? 'column' : 'row', alignItems: p.stack ? 'flex-start' : 'center' });
      s.pills.forEach((e, i) => {
        const a = eOut3(prog(ctx.local, i * p.step, i * p.step + 0.35));
        cssCamel(e, { lineHeight: '', display: '', alignItems: '', background: 'rgba(14,16,22,0.38)', color: '#ffffff', fontWeight: '500', fontSize: '0.8em',
          padding: '0.35em 0.85em', borderRadius: '0.45em', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(12px)', webkitBackdropFilter: 'blur(12px)',
          boxShadow: `0 ${6 * k}px ${18 * k}px rgba(0,0,0,0.25)`, opacity: String(a), transform: `translateY(${((1 - a) * 10 * k).toFixed(2)}px)` });
        const m = s.marks[i];
        if (!m) return;
        const v = eOut3(prog(ctx.local, i * p.step + p.check, i * p.step + p.check + 0.25));
        m.dataset.tick = v.toFixed(3);
        cssCamel(m, { background: v > 0 ? withAlpha(p.c1, v) : 'transparent', border: `${Math.max(1, 2 * k)}px solid ${v > 0.5 ? p.c1 : 'rgba(255,255,255,0.55)'}` });
        cssCamel(m.firstElementChild as HTMLElement, { opacity: String(v), transform: `rotate(45deg) scale(${(0.4 + 0.6 * v).toFixed(3)})` });
      });
      return;
    }
    cssCamel(s.row, { left: `${p.x * W}px`, top: `${p.y * H}px`, fontSize: `${px}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, gap: `${p.gap}em`, opacity: String(out) });
    s.pills.forEach((e, i) => {
      const pop = eBack(prog(ctx.local, i * 0.1, i * 0.1 + 0.25), 2);
      const bg = colors[i % 3], dark = i % 3 === 2 || i % 3 === 1;
      cssCamel(e, { lineHeight: '', fontSize: '', fontWeight: '', display: '', alignItems: '', background: bg, color: dark ? p.ink : '#ffffff', padding: '0.12em 0.7em', borderRadius: '999px', border: `${theme.stroke * 0.35 * k}px solid ${p.ink}`, transform: `scale(${pop})`, opacity: String(Math.min(1, pop * 3)) });
    });
  },
};

type Ctx = Parameters<typeof tag.draw>[0];
const listOf = (s: string) => String(s ?? '').split(/[,，]/).map((t) => t.trim()).filter(Boolean);

/** the strips of tape (or the pin's label card), rebuilt only when the look or the tags change */
function strips(s: S, key: string, n: number, pin: boolean) {
  if (s.skey === key) return;
  s.skey = key;
  for (const st of s.strips) st.el.remove();
  s.strips = Array.from({ length: n }, () => {
    const el = h('div', null, null, s.wrap), cv = h('canvas', null, null, el) as HTMLCanvasElement, txt = h('div', null, null, el), sub = h('div', null, null, el);
    cssCamel(el, { position: 'absolute', whiteSpace: 'pre' });
    cssCamel(cv, { position: 'absolute', display: pin ? 'none' : 'block' });
    for (const e of [txt, sub]) cssCamel(e, pin ? { position: 'relative', textAlign: 'center', lineHeight: '1.25' } : { position: 'absolute', top: '50%', lineHeight: '1', transform: 'translateY(-52%)' });
    return { el, cv, txt, sub };
  });
}

/** look tape: one strip a tag, stacked down from (x, y), tilted in turn; the words written left to right, the highlighter under them */
function drawTape(ctx: Ctx, s: S, k: number, px: number) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, tags = listOf(p.tags), fam = handFamily(p.handFont);
  strips(s, `tape|${p.tags}`, tags.length, false);
  cssCamel(s.pin, { display: 'none' });
  const out = 1 - prog(local, dur - 0.15, dur), th = 1.5 * px, m = 0.5 * px;
  let top = p.y * H;
  tags.forEach((t, i) => {
    const st = s.strips[i], no = i === 0 ? String(p.no ?? '') : '', tm = tapeTimes(i, [...t].length, local), padL = (no ? 1.6 : 0.55) * px;
    st.txt.textContent = t; st.sub.textContent = no;
    cssCamel(st.txt, { left: `${padL}px`, fontFamily: fam, fontSize: `${px}px`, fontWeight: '700', color: p.ink, clipPath: `inset(-20% ${((1 - tm.write) * 100).toFixed(2)}% -20% -5%)` });
    cssCamel(st.sub, { display: no ? 'block' : 'none', left: `${0.8 * px}px`, fontFamily: fam, fontSize: `${0.8 * px}px`, fontWeight: '700', color: p.c1, transform: 'translate(-50%, -52%)', opacity: String(clamp(tm.land * 2)) });
    const tw = st.txt.offsetWidth, w = padL + tw + 0.6 * px;
    cssCamel(st.el, { left: `${p.x * W}px`, top: `${top}px`, width: `${w}px`, height: `${th}px`, opacity: String(out * clamp(tm.land * 1.5)),
      transformOrigin: '0 50%', transform: `rotate(${i % 2 ? 1.4 : -2.6}deg) scale(${(0.85 + 0.15 * eBack(tm.land, 2.2)).toFixed(4)})` });
    cssCamel(st.cv, { left: `${-m}px`, top: `${-m}px`, width: `${w + 2 * m}px`, height: `${th + 2 * m}px`, filter: `drop-shadow(0 ${2 * k}px ${4 * k}px rgba(0,0,0,0.22))` });
    const g = canvasAt(st.cv, w + 2 * m, th + 2 * m);
    g.save(); g.translate(m, m);
    tape(g, w / 2, th / 2, w, th, 0, withAlpha(theme.palette.paper, 0.96), 5 + i);
    g.fillStyle = withAlpha(p.c3, 0.55); g.fillRect(padL - 0.08 * px, th * 0.5, (tw + 0.16 * px) * tm.hl, th * 0.3);
    if (no) { g.strokeStyle = p.c1; g.lineWidth = 0.075 * px; g.lineCap = 'round'; handCircle(g, 0.8 * px, th / 2, 0.5 * px, clamp((local - i * 0.12 - 0.05) / 0.25), 9 + i); }
    g.restore();
    top += th + p.gap * px;
  });
}

/** look pin: the pin drops onto its tip at (x, y), the label card pops up above it, the head ticked at `check` */
function drawPin(ctx: Ctx, s: S, k: number, px: number) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, [label = '', sub = ''] = listOf(p.tags), fam = handFamily(p.handFont);
  strips(s, `pin|${p.tags}`, 1, true);
  const tm = pinTimes(local, p.check ?? -1), out = 1 - prog(local, dur - 0.3, dur), x = p.x * W, y = p.y * H, ps = 2.6 * px, drop = (1 - tm.drop) * -120 * k;
  cssCamel(s.pin, { display: 'block', opacity: String(out * clamp(local / 0.1)) });
  const g = canvasAt(s.pin, W, H);
  mapPin(g, x, y + drop, ps, p.c1, { check: tm.check });
  const st = s.strips[0];
  st.txt.textContent = label; st.sub.textContent = sub;
  cssCamel(st.txt, { fontFamily: fam, fontSize: `${px}px`, fontWeight: '700', color: p.ink });
  cssCamel(st.sub, { display: sub ? 'block' : 'none', fontFamily: fam, fontSize: `${0.62 * px}px`, fontWeight: '700', color: p.c1 });
  cssCamel(st.el, { display: label && tm.label > 0 ? 'block' : 'none', left: `${x}px`, top: `${y + drop - ps - 14 * k}px`, padding: `${0.16 * px}px ${0.45 * px}px ${0.24 * px}px`,
    background: `linear-gradient(${p.c1}, ${p.c1}) ${0.3 * px}px calc(100% - ${0.12 * px}px) / calc(100% - ${0.6 * px}px) ${0.06 * px}px no-repeat, ${theme.palette.paper}`,
    border: `${Math.max(2, 0.06 * px)}px solid ${p.ink}`, borderRadius: `${0.3 * px}px`, boxShadow: `${4 * k}px ${6 * k}px 0 rgba(0,0,0,0.25)`,
    opacity: String(out), transformOrigin: '50% 100%', transform: `translate(-50%, -100%) scale(${Math.max(0, tm.label).toFixed(4)})` });
}

/** look day: how far the label has popped in (0.34 s, overshooting), the underline drawn (from 0.2 s over 0.3 s) and the fade at the end */
export const dayTimes = (local: number, dur: number) => ({ pop: eBack(prog(local, 0, 0.34), 1.5), line: prog(local, 0.2, 0.5), out: prog(local, dur - 0.25, dur) });

/** look day: the torn label at (x, y), the first tag big in an italic serif, the second handwritten under it, a strip of tape on the
 *  corner; the sizes are the original's at 1080 × 1920, scaled by the size param (1.8 % of the frame height = as made) */
function drawDay(ctx: Ctx, s: S, px: number) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, [big = '', sub = ''] = listOf(p.tags), q = px / 34.56, tm = dayTimes(local, dur);
  strips(s, `day|${p.tags}`, 1, false);
  cssCamel(s.pin, { display: 'none' });
  const st = s.strips[0];
  st.txt.textContent = big; st.sub.textContent = sub;
  cssCamel(st.txt, { left: `${26 * q}px`, top: `${12 * q}px`, transform: 'none', fontFamily: `'Playfair Display', '${p.font}', 'Noto Serif TC', serif`, fontStyle: 'italic',
    fontSize: `${64 * q}px`, fontWeight: '700', color: p.ink, clipPath: 'none' });
  cssCamel(st.sub, { display: sub ? 'block' : 'none', left: `${28 * q}px`, top: `${92 * q}px`, transform: 'none', fontFamily: handFamily(p.handFont), fontSize: `${48 * q}px`,
    fontWeight: '400', color: p.ink, opacity: '1' });
  const dw = st.txt.offsetWidth, w = Math.max(dw, sub ? st.sub.offsetWidth : 0) + 56 * q, hh = (sub ? 150 : 96) * q, m = 40 * q, sc = 0.7 + 0.3 * tm.pop;
  cssCamel(st.el, { display: tm.out >= 1 ? 'none' : 'block', left: `${p.x * W + 10 * q}px`, top: `${p.y * H}px`, width: `${w}px`, height: `${hh}px`, opacity: String(1 - tm.out),
    transformOrigin: '0 50%', transform: `scale(${sc.toFixed(4)}) rotate(${(-0.045 * tm.pop - 0.2 * (1 - tm.pop)).toFixed(4)}rad)` });
  cssCamel(st.cv, { display: 'block', left: `${-m}px`, top: `${-m}px`, width: `${w + 2 * m}px`, height: `${hh + 2 * m}px`, filter: 'none' });
  const g = canvasAt(st.cv, w + 2 * m, hh + 2 * m);
  g.save(); g.translate(m, m);
  // the label, its right edge torn, a soft shadow under it
  g.save(); g.shadowColor = 'rgba(35,22,12,0.35)'; g.shadowBlur = 22 * q; g.shadowOffsetY = 8 * q; g.fillStyle = theme.palette.paper;
  const r = rng(7); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0);
  for (let y = 0; y <= hh; y += 10 * q) g.lineTo(w - r() * 7 * q, y);
  g.lineTo(0, hh); g.closePath(); g.fill(); g.restore();
  tape(g, 22 * q, 6 * q, 70 * q, 26 * q, -0.6, withAlpha(p.c1, 0.55), 7);
  // the underline under the big word, in the accent pen
  if (tm.line > 0) penPath(g, [[28 * q, 86 * q], [28 * q + dw * 0.5, 82 * q], [28 * q + dw, 87 * q]], 5 * q, p.c1, 4, tm.line);
  g.restore();
}
