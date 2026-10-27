// common.duo — the split-screen frame of a two-person talk, from the podcast-versus short (fx.vsStage and fx.vsDesat in one block).
// Two panels, one above the other (dir v) or side by side (dir h), a header strip with a label chip and the topic, a caption band
// between them (below them for h) with an edge in each person's colour. `segs` says who speaks when: the one speaking is lit — a
// ring in their colour with a soft inner glow, their name chip filled, its three level bars moving — and the other panel goes grey
// and dark (a backdrop filter over the footage). Put each person's clip in their panel with frame = duoWindow('a' | 'b', params).
// mode solo (the amber-podcast short's fx.speakerFrame): one tall rounded window, one person in it at a time — its ring glows in the
// colour of whoever speaks (changing with the turns), the frame round it dark with a haze of both colours, a shade at the window's
// foot for captions, and each person's name chip in the window's top-left corner on their first turn.
import { abs, clamp, cssCamel, eOut3, h, type ItemType } from '@tellcut/engine';
import { lift, withAlpha } from './color.ts';
import { punch } from './window.ts';

type Rect = [number, number, number, number];
interface P {
  mode: 'split' | 'solo'; dir: 'v' | 'h'; segs: string; label: string; topic: string; nameA: string; roleA: string; nameB: string; roleB: string; top: number; band: number; foot: number;
  colorA: string; colorB: string; hl: string; ink: string; paper: string; dim: number; desat: number; font: string;
}
interface Tag { box: HTMLElement; fill: HTMLElement; bars: HTMLElement[]; name: HTMLElement; role: HTMLElement }
interface S { out: HTMLElement; bars: HTMLElement[]; edgeA: HTMLElement; edgeB: HTMLElement; head: HTMLElement; pill: HTMLElement; topic: HTMLElement; shade: HTMLElement[]; ring: HTMLElement[]; tags: Tag[] }

type LayoutOpts = { mode?: string; dir?: string; top?: number; band?: number; foot?: number };
/** solo: the window's side margin (a share of the frame width) */
export const SOLO_SIDE = 0.028;

/** the parts of the layout as screen fractions [x, y, w, h]: the two panels, the caption band and the header strip
 *  (solo: a and b are the same window, inset SOLO_SIDE from the sides, between the header and the band) */
export function duoLayout(o: LayoutOpts = {}): { a: Rect; b: Rect; band: Rect; head: Rect } {
  const top = o.top ?? 0.104, band = o.band ?? 0.078, foot = o.foot ?? 0.026, r = (x: number) => Math.round(x * 1e6) / 1e6;
  if (o.mode === 'solo') {
    const ph = r(1 - top - band - foot), win: Rect = [SOLO_SIDE, top, r(1 - 2 * SOLO_SIDE), ph];
    return { a: win, b: [...win], band: [0, r(top + ph), 1, band], head: [0, 0, 1, top] };
  }
  if (o.dir === 'h') {
    const ph = r(1 - top - band - foot);
    return { a: [0, top, 0.5, ph], b: [0.5, top, 0.5, ph], band: [0, r(top + ph), 1, band], head: [0, 0, 1, top] };
  }
  const ph = r((1 - top - band - foot) / 2);
  return { a: [0, top, 1, ph], band: [0, r(top + ph), 1, band], b: [0, r(top + ph + band), 1, ph], head: [0, 0, 1, top] };
}

/** the frame of person a's or b's clip (the same params as the common.duo item) */
export const duoWindow = (who: 'a' | 'b', o: LayoutOpts = {}): Rect => duoLayout(o)[who];

/** "from-to|who" turns (who: a, b or ab — also 1, 2, 12, both), one a line or comma-separated */
export function parseSegs(text: string): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = [];
  for (const part of String(text ?? '').split(/[\n,，]+/)) {
    const m = /^\s*([\d.]+)\s*[-–~]\s*([\d.]+)\s*\|\s*(\S+)\s*$/.exec(part);
    if (!m) continue;
    const w = m[3].toLowerCase(), who = w === '1' ? 'a' : w === '2' ? 'b' : w === '12' || w === 'both' || w === 'ba' ? 'ab' : w;
    if (['a', 'b', 'ab'].includes(who)) out.push([+m[1], +m[2], who]);
  }
  return out;
}

/** how much `who` (a or b) speaks at `t` (0–1), ramped over `ramp` s at the edges of each turn; ab lights both */
export function duoLevel(segs: Array<[number, number, string]>, who: 'a' | 'b', t: number, ramp = 0.14): number {
  let v = 0;
  for (const [s0, s1, w] of segs) if (w.includes(who)) v = Math.max(v, clamp((t - s0) / ramp + 1) * clamp((s1 - t) / ramp));
  return v;
}

/** solo: how far `who`'s name chip is in at `t` (0–1) — from the start of their first turn for up to 2.6 s, gone 0.05 s before that
 *  turn ends (so a chip never sits on the next person's shot) */
export function soloChip(segs: Array<[number, number, string]>, who: 'a' | 'b', t: number): number {
  let first: [number, number, string] | undefined;
  for (const sg of segs) if (sg[2].includes(who) && (!first || sg[0] < first[0])) first = sg;
  if (!first) return 0;
  const d = Math.min(2.6, first[1] - first[0] - 0.05), u = t - first[0];
  if (u < 0 || u >= d) return 0;
  return eOut3(clamp(u / 0.3)) * clamp((d - u) / 0.3);
}

export const duo: ItemType<P, S> = {
  type: 'common.duo', label: '雙人分割對談', category: 'frame', kind: 'overlay',
  doc: '兩個人的分割畫面框（上下 dir v，或左右 h）：頁首一個色塊小牌＋題目、兩格之間（左右時在下方）一條字幕帶、每格角落一個名牌；segs「起-迄|a／b／ab」說誰在說話：說話的那格亮起來（說話人顏色的外框＋內光、名牌填色、音量條在跳），另一格變灰變暗；兩人的片段 frame 用 duoWindow(\'a\'|\'b\', 同一組參數) 放進兩格；雙人訪談、Podcast、辯論、他說她說；配 common.versus、caption 的 point；mode solo 是單人鏡頭的 Podcast 切片：一個高高的圓角視窗一次一個人，外框光暈跟著說話的人換顏色（segs 決定），窗外深色底帶兩人顏色的霧，窗下緣一層給字幕的暗影（dim），每個人第一次說話時視窗左上角出名牌（最多 2.6 秒，那段說完前消失）；片段 frame 用 duoWindow(\'a\', 同一組參數)，字幕放窗下緣',
  params: [
    { key: 'mode', label: '樣式（split 兩格分割；solo 一格，一次一個人，外框跟著說話的人換顏色）', type: 'enum', options: ['split', 'solo'], default: 'split' },
    { key: 'segs', label: '誰在說（「起-迄|a／b／ab」，秒，相對開始；一行一段）', type: 'text', default: '0-1.3|a\n1.5-2.8|b' },
    { key: 'dir', label: '分割方向（v 上下、h 左右）', type: 'enum', options: ['v', 'h'], default: 'v' },
    { key: 'label', label: '頁首色塊小牌（ROUND 1；空＝沒有）', type: 'string', default: 'ROUND 1' },
    { key: 'topic', label: '頁首題目', type: 'string', default: '早起真的比較有效率？' },
    { key: 'nameA', label: 'a（上／左）的名字', type: 'string', default: '阿明' },
    { key: 'roleA', label: 'a 的身分', type: 'string', default: '主持人' },
    { key: 'nameB', label: 'b（下／右）的名字', type: 'string', default: 'Mia' },
    { key: 'roleB', label: 'b 的身分', type: 'string', default: '睡眠教練' },
    { key: 'top', label: '頁首高度（畫面高比例）', type: 'number', min: 0, max: 0.4, step: 0.002, default: 0.104 },
    { key: 'band', label: '字幕帶高度（畫面高比例）', type: 'number', min: 0, max: 0.4, step: 0.002, default: 0.078 },
    { key: 'foot', label: '頁尾高度（畫面高比例）', type: 'number', min: 0, max: 0.4, step: 0.002, default: 0.026 },
    { key: 'colorA', label: 'a 的顏色', type: 'color', default: '#3d7bff', theme: 'palette.accent2' },
    { key: 'colorB', label: 'b 的顏色', type: 'color', default: '#ff5c7a', theme: 'palette.accent' },
    { key: 'hl', label: '頁首小牌顏色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
    { key: 'ink', label: '底色（頁首、字幕帶、頁尾）', type: 'color', default: '#0d0f1a', theme: 'palette.ink' },
    { key: 'paper', label: '字色', type: 'color', default: '#f7f4ee', theme: 'palette.paper' },
    { key: 'dim', label: '不說話的一格壓暗（0–1；solo：視窗下緣給字幕的暗影濃度）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.56 },
    { key: 'desat', label: '不說話的一格褪色（0–1）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.85 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const root = ctx.root, out = abs(root);
    cssCamel(out, { display: 'none' });
    const bars = [0, 1, 2].map(() => abs(root)), edgeA = abs(root), edgeB = abs(root);
    const shade = [0, 1].map(() => abs(root)), ring = [0, 1].map(() => abs(root));
    for (const r of ring) cssCamel(r, { boxSizing: 'border-box' });
    const head = abs(root), pill = h('div', null, null, head), topic = h('div', null, null, head);
    cssCamel(head, { display: 'flex', alignItems: 'center' });
    cssCamel(pill, { flex: 'none', fontWeight: '900', lineHeight: '1.2', whiteSpace: 'pre' });
    cssCamel(topic, { fontWeight: '700', lineHeight: '1.2', whiteSpace: 'nowrap', overflow: 'hidden' });
    const tags = [0, 1].map(() => {
      const box = abs(root), fill = abs(box), lv = h('div', null, null, box), name = h('div', null, null, box), role = h('div', null, null, box);
      cssCamel(box, { display: 'flex', alignItems: 'center' });
      cssCamel(fill, { inset: '0' });
      cssCamel(lv, { position: 'relative', display: 'flex', alignItems: 'flex-end' });
      for (const e of [name, role]) cssCamel(e, { position: 'relative', lineHeight: '1', whiteSpace: 'pre' });
      return { box, fill, bars: [0, 1, 2].map(() => h('div', null, null, lv)), name, role };
    });
    return { out, bars, edgeA, edgeB, head, pill, topic, shade, ring, tags };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local } = ctx, k = Math.min(W, H) / 1080, L = duoLayout(p), segs = parseSegs(p.segs);
    const px = (r: Rect) => ({ left: `${r[0] * W}px`, top: `${r[1] * H}px`, width: `${r[2] * W}px`, height: `${r[3] * H}px` });
    const side = 54 * k, font = `'${p.font}', 'Noto Sans TC', sans-serif`;
    cssCamel(s.out, { display: 'none' });
    for (const e of [...s.bars, s.edgeA, s.edgeB, ...s.shade, ...s.ring]) cssCamel(e, { display: 'block', borderRadius: '0' });
    for (const t of s.tags) cssCamel(t.box, { opacity: '1', transform: 'none' });
    // the opaque strips round the pictures: header, band, foot (and nothing else, so the footage shows in the panels)
    const footTop = Math.max(L.a[1] + L.a[3], L.b[1] + L.b[3]);
    const strips: Rect[] = [L.head, L.band, [0, footTop, 1, 1 - footTop]];
    s.bars.forEach((b, i) => cssCamel(b, { ...px(strips[i]), background: i === 1 ? `linear-gradient(180deg, ${lift(p.ink, 8, 11, 18)}, ${p.ink})` : p.ink }));
    // the band's edges: a's colour on top, b's at the bottom (side by side: one half each, on top)
    const e = 6 * k, [bx, by, bw, bh] = L.band;
    const lvA = duoLevel(segs, 'a', local), lvB = duoLevel(segs, 'b', local);
    cssCamel(s.edgeA, { left: `${bx * W}px`, top: `${by * H}px`, width: `${(p.dir === 'h' ? bw / 2 : bw) * W}px`, height: `${e}px`, background: p.colorA, opacity: (0.35 + 0.65 * lvA).toFixed(3) });
    cssCamel(s.edgeB, { left: `${(p.dir === 'h' ? bx + bw / 2 : bx) * W}px`, top: `${p.dir === 'h' ? by * H : (by + bh) * H - e}px`, width: `${(p.dir === 'h' ? bw / 2 : bw) * W}px`, height: `${e}px`, background: p.colorB, opacity: (0.35 + 0.65 * lvB).toFixed(3) });
    // the header: chip and topic, sitting at the strip's foot
    s.pill.textContent = p.label; s.topic.textContent = p.topic;
    cssCamel(s.head, { left: `${side}px`, right: `${130 * k}px`, top: `${Math.max(0, L.head[3] * H - 82 * k)}px`, height: `${64 * k}px`, gap: `${18 * k}px`, fontFamily: font, display: L.head[3] > 0 ? 'flex' : 'none' });
    cssCamel(s.pill, { display: p.label ? 'block' : 'none', padding: `${6 * k}px ${18 * k}px`, borderRadius: `${10 * k}px`, background: p.hl, color: p.ink, fontSize: `${34 * k}px`, letterSpacing: `${2 * k}px` });
    cssCamel(s.topic, { color: p.paper, fontSize: `${40 * k}px` });
    if (p.mode === 'solo') { drawSolo(ctx, s, L, segs); return; }
    // each panel: the quiet one grey and dark, the speaking one rung in its colour; the name chips
    ([[L.a, lvA, p.colorA, p.nameA, p.roleA], [L.b, lvB, p.colorB, p.nameB, p.roleB]] as const).forEach(([r, lv, color, name, role], i) => {
      const off = 1 - lv;
      cssCamel(s.shade[i], { ...px(r), border: '0', background: `rgba(6,8,16,${(off * p.dim).toFixed(3)})`, backdropFilter: off * p.desat > 0.001 ? `grayscale(${(off * p.desat).toFixed(3)})` : 'none' });
      cssCamel(s.ring[i], { ...px(r), border: `${8 * k}px solid ${color}`, boxShadow: `inset 0 0 ${60 * k}px ${withAlpha(color, 0.53)}`, opacity: lv.toFixed(3) });
      const t = s.tags[i], th = 62 * k;
      // a's chip at the top of its panel, b's at the bottom of its panel (v) — both kept inside the safe area; side by side both on top
      const topY = Math.max(r[1] * H, theme.safe.top * H * (r[1] > 0 ? 0 : 1)) + 22 * k;
      const botY = Math.min((r[1] + r[3]) * H, (1 - theme.safe.bottom) * H + 38 * k) - 22 * k - th;
      t.name.textContent = name; t.role.textContent = role;
      cssCamel(t.box, { left: `${r[0] * W + side}px`, top: `${(i === 1 && p.dir !== 'h' ? botY : topY).toFixed(1)}px`, height: `${th}px`, gap: `${12 * k}px`, padding: `0 ${20 * k}px 0 ${18 * k}px`,
        borderRadius: `${31 * k}px`, background: withAlpha(p.ink, 0.72), fontFamily: font, display: name ? 'flex' : 'none' });
      cssCamel(t.fill, { borderRadius: `${31 * k}px`, background: color, opacity: lv.toFixed(3) });
      cssCamel(t.bars[0].parentElement!, { gap: `${5 * k}px`, height: `${30 * k}px`, width: `${31 * k}px` });
      t.bars.forEach((b, j) => cssCamel(b, { width: `${7 * k}px`, borderRadius: `${3 * k}px`, background: p.paper,
        height: `${((8 + lv * 22 * Math.abs(Math.sin(local * (7.3 + j * 2.1) + j * 1.7 + i))) * k).toFixed(1)}px` }));
      cssCamel(t.name, { color: p.paper, fontWeight: '900', fontSize: `${36 * k}px` });
      cssCamel(t.role, { color: p.paper, opacity: '0.8', fontWeight: '500', fontSize: `${26 * k}px`, display: role ? 'block' : 'none' });
    });
  },
};

/** solo: the dark frame with a rounded hole, the window's shades and faint edge, the ring of whoever speaks, the name chips */
function drawSolo(ctx: Parameters<typeof duo.draw>[0], s: S, L: ReturnType<typeof duoLayout>, segs: Array<[number, number, string]>) {
  const p = ctx.params, { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, font = `'${p.font}', 'Noto Sans TC', sans-serif`;
  const [wx, wy, ww, wh] = [L.a[0] * W, L.a[1] * H, L.a[2] * W, L.a[3] * H], r = 40 * k, box = { left: `${wx}px`, top: `${wy}px`, width: `${ww}px`, height: `${wh}px` };
  for (const e of [...s.bars, s.edgeA, s.edgeB, s.shade[1]]) cssCamel(e, { display: 'none' });
  // the frame round the window: ink, a haze of a's colour top left and b's bottom right
  cssCamel(s.out, { display: 'block', inset: '0', background: `radial-gradient(circle at 16% 8%, ${withAlpha(p.colorA, 0.2)}, transparent 58%), radial-gradient(circle at 94% 93%, ${withAlpha(p.colorB, 0.18)}, transparent 55%), ${p.ink}` });
  punch(s.out, [wx, wy, ww, wh], r);
  // inside the window: a light shade at the top (for the chip), a deep one at the foot (for captions) and a faint edge
  const foot = Math.min(wh * 0.5, 600 * k), deep = clamp(p.dim * 1.6, 0, 0.95);
  cssCamel(s.shade[0], { ...box, display: 'block', borderRadius: `${r}px`, backdropFilter: 'none', boxSizing: 'border-box', border: `${2 * k}px solid ${withAlpha(p.paper, 0.16)}`,
    background: `linear-gradient(180deg, ${withAlpha(p.ink, 0.4)} 0px, ${withAlpha(p.ink, 0)} ${200 * k}px, ${withAlpha(p.ink, 0)} ${wh - foot}px, ${withAlpha(p.ink, deep * 0.65)} ${wh - foot / 2}px, ${withAlpha(p.ink, deep)} ${wh}px)` });
  // the ring: whoever speaks, in their colour (both at once for ab), fading in and out with the item
  const fade = clamp(local / 0.3) * clamp((dur - local) / 0.3);
  ([[p.colorA, duoLevel(segs, 'a', local)], [p.colorB, duoLevel(segs, 'b', local)]] as const).forEach(([color, lv], i) => {
    cssCamel(s.ring[i], { ...box, display: 'block', borderRadius: `${r}px`, border: `${5 * k}px solid ${color}`,
      boxShadow: `0 0 ${36 * k}px ${withAlpha(color, 0.75)}, inset 0 0 ${30 * k}px ${withAlpha(color, 0.3)}`, opacity: (lv * fade).toFixed(3) });
  });
  // each person's name chip, top left in the window, on their first turn
  ([[p.colorA, p.nameA, p.roleA, 'a'], [p.colorB, p.nameB, p.roleB, 'b']] as const).forEach(([color, name, role, who], i) => {
    const t = s.tags[i], th = 62 * k, a = soloChip(segs, who, local), lv = duoLevel(segs, who, local);
    t.name.textContent = name; t.role.textContent = role;
    cssCamel(t.box, { left: `${wx + 34 * k}px`, top: `${wy + 34 * k}px`, height: `${th}px`, gap: `${12 * k}px`, padding: `0 ${20 * k}px 0 ${18 * k}px`, borderRadius: `${31 * k}px`,
      background: withAlpha(p.ink, 0.72), fontFamily: font, display: name && a > 0 ? 'flex' : 'none', opacity: a.toFixed(3), transform: `translateX(${((1 - a) * -30 * k).toFixed(1)}px)` });
    cssCamel(t.fill, { borderRadius: `${31 * k}px`, background: color, opacity: '1' });
    cssCamel(t.bars[0].parentElement!, { gap: `${5 * k}px`, height: `${30 * k}px`, width: `${31 * k}px` });
    t.bars.forEach((b, j) => cssCamel(b, { width: `${7 * k}px`, borderRadius: `${3 * k}px`, background: p.paper,
      height: `${((8 + lv * 22 * Math.abs(Math.sin(local * (7.3 + j * 2.1) + j * 1.7 + i))) * k).toFixed(1)}px` }));
    cssCamel(t.name, { color: p.paper, fontWeight: '900', fontSize: `${36 * k}px` });
    cssCamel(t.role, { color: p.paper, opacity: '0.8', fontWeight: '500', fontSize: `${26 * k}px`, display: role ? 'block' : 'none' });
  });
}
