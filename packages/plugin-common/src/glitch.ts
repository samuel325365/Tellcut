// common.glitch — digital interference in short bursts, four looks.
// look tear (the first, unchanged): torn bands that invert the picture under them. A layer cannot read the pixels below it, so this is
// a difference-blended set of bars rather than a true colour split; the bars come from a seeded generator, one set per two frames.
// The difference blend is set on the item's layer here (not as the type's `blend`) because only tear wants it.
// looks scan / rgb / block do move the picture under them: a full-frame div inside the item's layer with `backdrop-filter:
// url(#filter)`, an SVG filter of the item's own (feOffset, feColorMatrix, feMerge, feComposite) that shifts the backdrop — the
// footage and every item below — sideways, splits its red and blue, or displaces rectangles of it. backdrop-filter with url() is
// Chromium only: other browsers show the preview without the shift (scan still draws its lines); the export always uses Chrome.
// The layer must not be blended for these (a blended layer is a backdrop root, and the filter would see nothing under it).
// Bursts: time is cut into windows of half a second; each window (seeded) holds one burst of 2–5 frames with chance `density`.
import { attr, cssCamel, frameOf, h, rng, type ItemType } from '@tellcut/engine';

type Look = 'tear' | 'scan' | 'rgb' | 'block';
interface P { look: Look; bands: number; density: number; maxHeight: number; seed: number; tint: boolean; shift: number }
interface S { bars: HTMLElement[]; look: Look; back?: HTMLElement; filter?: string; nodes: SVGElement[][]; lines?: HTMLElement; roll?: HTMLElement }

const SVG = 'http://www.w3.org/2000/svg';
/** one filter id per glitch item on the page (several may play at once; ids are document-wide) */
let seq = 0;

/** colour matrices for a displaced block: as it is, cyan (no red), magenta (no green) */
const TINTS = [
  '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0.04  0 0 0 1 0',
  '1 0 0 0 0.04  0 0 0 0 0  0 0 1 0 0.04  0 0 0 1 0',
];

/** how strong the burst is at frame n (0 calm, 1 full, 0.5 on its last frame): one window of half a second per seeded draw, holding
 *  one burst of 2–5 frames at a seeded place with chance `density` */
export function glitchBurst(n: number, fps: number, seed: number, density: number): number {
  const wlen = Math.max(4, Math.round(fps / 2)), w = Math.floor(n / wlen), r = rng(seed * 7919 + w * 104729 + 31);
  if (r() >= density) return 0;
  const len = 2 + Math.floor(r() * 4), at = Math.floor(r() * (wlen - len + 1)), i = n - w * wlen - at;
  return i < 0 || i >= len ? 0 : i < len - 1 ? 1 : 0.5;
}

/** the rgb look's red / blue offset (px; red moves by -dx, blue by +dx) at frame n: a faint steady fringe, about half of `shift` in
 *  a burst (each channel moves that far, so red and blue end up twice it apart) */
export function rgbSplit(n: number, fps: number, p: Pick<P, 'seed' | 'density' | 'shift'>, k: number): number {
  const b = glitchBurst(n, fps, p.seed, p.density), max = (Number(p.shift) || 0) / 100 * 1080 * k;
  if (!b) return +(max * 0.1).toFixed(2);
  const r = rng(p.seed * 31 + Math.floor(n / 2) * 7477 + 3), sign = r() < 0.75 ? 1 : -1;
  return +(sign * max * b * (0.4 + 0.2 * r())).toFixed(2);
}

/** the block look's rectangles at frame n (px), empty when calm: a new set every two frames during a burst */
export function glitchBlocks(n: number, fps: number, p: Pick<P, 'seed' | 'density' | 'shift' | 'bands' | 'maxHeight' | 'tint'>, W: number, H: number): Array<{ x: number; y: number; w: number; h: number; dx: number; tint: number }> {
  const b = glitchBurst(n, fps, p.seed, p.density);
  if (!b) return [];
  const k = Math.min(W, H) / 1080, max = (Number(p.shift) || 0) / 100 * 1080 * k, r = rng(p.seed * 7919 + Math.floor(n / 2) * 104729 + 7);
  return Array.from({ length: Math.max(1, Math.round(p.bands)) }, () => {
    const hh = (0.25 + 0.75 * r()) * p.maxHeight * 1.6 * H, w = W * (0.25 + 0.6 * r()), x = r() * (W - w * 0.5), y = r() * (H - hh), tone = r();
    const dx = (r() < 0.5 ? -1 : 1) * max * (2.5 + 3.5 * r()) * b;
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh), dx: +dx.toFixed(1), tint: p.tint ? (tone < 0.35 ? 1 : tone < 0.7 ? 2 : 0) : 0 };
  });
}

/** the scan look's sideways jump (px) at frame n: none when calm */
export function scanJump(n: number, fps: number, p: Pick<P, 'seed' | 'density' | 'shift'>, k: number): number {
  const b = glitchBurst(n, fps, p.seed, p.density);
  if (!b) return 0;
  const r = rng(p.seed * 131 + Math.floor(n / 2) * 6151 + 11);
  return +((r() < 0.5 ? -1 : 1) * (Number(p.shift) || 0) / 100 * 1080 * k * (0.35 + 0.35 * r())).toFixed(1);
}

const node = (tag: string, a: Record<string, string | number>, parent: Element): SVGElement => {
  const e = document.createElementNS(SVG, tag) as SVGElement;
  for (const [key, v] of Object.entries(a)) e.setAttribute(key, String(v));
  parent.appendChild(e);
  return e;
};
/** source + `top` merged: where `top` is empty (the strip an offset leaves at the frame's edge) the picture stays as it was */
const merge = (f: Element, ins: string[], result?: string) => {
  const m = node('feMerge', result ? { result } : {}, f);
  for (const i of ['SourceGraphic', ...ins]) node('feMergeNode', { in: i }, m);
};

export const glitch: ItemType<P, S> = {
  type: 'common.glitch', label: '故障干擾', category: 'look', kind: 'overlay', over: 'picture',
  doc: '數位干擾，一陣一陣閃（亂數種子決定什麼時候閃）；轉場、驚嚇、科技感、「出事了」的瞬間。shift 是錯位量。rgb、block 和 scan 的跳動要在 Chromium 系瀏覽器（Chrome、Edge）的預覽裡才看得到，輸出一律用 Chrome',
  variants: { param: 'look', list: [
    { value: 'tear', label: '反相橫帶', doc: '畫面被撕出幾條反相的橫帶（預設的樣子）；轉場、驚嚇的一瞬間；bands 是條數、maxHeight 是最高多高，tint 帶青／洋紅色' },
    { value: 'scan', label: '掃描線', doc: '細細的掃描線加一條慢慢往下滾的亮帶，偶爾整個畫面往旁邊跳幾 px；監視器、老電視、駭客畫面' },
    { value: 'rgb', label: '色版分離', doc: '底下畫面的紅、藍色版真的分開，平常只有一點色邊，一閃就分很開；音樂、節奏點、訊號不良' },
    { value: 'block', label: '色塊錯位', doc: '底下畫面的幾塊長方形往旁邊錯開、帶青／洋紅色；資料損毀、切換、壞掉的感覺；bands 是色塊數' },
  ] },
  params: [
    { key: 'look', label: '樣子', type: 'enum', options: ['tear', 'scan', 'rgb', 'block'], default: 'tear' },
    { key: 'bands', label: '橫帶數量（tear；block 是色塊數）', type: 'number', min: 1, max: 14, step: 1, default: 6 },
    { key: 'density', label: '出現機率（0–1，越大越常閃）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'maxHeight', label: '橫帶最大高度（畫面高比例；tear、block）', type: 'number', min: 0.005, max: 0.2, step: 0.005, default: 0.05 },
    { key: 'seed', label: '亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 5 },
    { key: 'tint', label: '帶青／洋紅色（tear、block）', type: 'bool', default: true },
    { key: 'shift', label: '錯位量（畫面短邊 %；rgb 一閃時紅、藍各移開約一半，block 錯開 2.5–6 倍，scan 跳動約一半）', type: 'number', min: 0, max: 5, step: 0.1, default: 1 },
  ],
  // named sets of these params (engine templates.ts); their golden samples are glitch-tpl-<id>
  templates: [
    { id: 'signal-loss', label: '訊號不良', doc: '監視器畫面、訊號不良、切進回憶：細掃描線加一條往下滾的亮帶，比 look scan 更常、更大幅地整個畫面往旁邊一跳', params: { look: 'scan', density: 0.8, shift: 2 } },
    { id: 'rgb-hit', label: '重拍色版分離', doc: '音樂重拍、驚嚇的一瞬間：每一陣都把紅、藍色版拉得很開，比 look rgb 更狠', params: { look: 'rgb', density: 1, shift: 2.5 } },
    { id: 'data-break', label: '資料損毀', doc: '科技、駭客、系統出錯：很多塊高高的長方形往旁邊錯開、帶青／洋紅色', params: { look: 'block', bands: 10, density: 0.7, maxHeight: 0.09 } },
    { id: 'soft-tear', label: '低調撕裂', doc: '懸疑的鋪陳、低調的干擾：偶爾閃過兩三條不帶顏色的反相細帶，不搶戲', params: { bands: 3, density: 0.3, tint: false } },
  ],
  build(ctx) {
    const p = ctx.params, look: Look = p.look === 'scan' || p.look === 'rgb' || p.look === 'block' ? p.look : 'tear';
    if (look === 'tear') {
      cssCamel(ctx.root, { mixBlendMode: 'difference' });
      const bars = Array.from({ length: p.bands }, () => { const b = h('div', null, null, ctx.root); cssCamel(b, { position: 'absolute', left: '0', right: '0' }); return b; });
      return { bars, look, nodes: [] };
    }
    // the filter lives in the item's own layer (shown and dropped with it), on an id no other item has
    const id = `tc-glitch-${++seq}`, svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    (svg as unknown as HTMLElement).style.position = 'absolute';
    ctx.root.appendChild(svg);
    const f = node('filter', { id, x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, svg);
    const nodes: SVGElement[][] = [];
    if (look === 'rgb') {
      // red from the picture moved left, blue moved right, green where it was; added back together (one channel each, so plain sums)
      const ro = node('feOffset', { in: 'SourceGraphic', dx: 0, dy: 0, result: 'ro' }, f); merge(f, ['ro'], 'rf');
      node('feColorMatrix', { in: 'rf', type: 'matrix', values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'r' }, f);
      const bo = node('feOffset', { in: 'SourceGraphic', dx: 0, dy: 0, result: 'bo' }, f); merge(f, ['bo'], 'bf');
      node('feColorMatrix', { in: 'bf', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', result: 'b' }, f);
      node('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'g' }, f);
      node('feComposite', { in: 'r', in2: 'g', operator: 'arithmetic', k2: 1, k3: 1, result: 'rg' }, f);
      node('feComposite', { in: 'rg', in2: 'b', operator: 'arithmetic', k2: 1, k3: 1 }, f);
      nodes.push([ro, bo]);
    } else if (look === 'block') {
      // each block: the picture moved sideways, cut to the block's rectangle (the primitives' own region), maybe tinted
      const ins: string[] = [];
      for (let i = 0; i < Math.max(1, Math.round(p.bands)); i++) {
        const o = node('feOffset', { in: 'SourceGraphic', dx: 0, dy: 0, x: 0, y: 0, width: 0, height: 0, result: `o${i}` }, f);
        const c = node('feColorMatrix', { in: `o${i}`, type: 'matrix', values: TINTS[0], x: 0, y: 0, width: 0, height: 0, result: `c${i}` }, f);
        nodes.push([o, c]); ins.push(`c${i}`);
      }
      merge(f, ins);
    } else {
      const o = node('feOffset', { in: 'SourceGraphic', dx: 0, dy: 0, result: 'o' }, f); merge(f, ['o']);
      nodes.push([o]);
    }
    const back = h('div', null, null, ctx.root);
    cssCamel(back, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const s: S = { bars: [], look, back, filter: `url(#${id})`, nodes };
    if (look === 'scan') {
      s.lines = h('div', null, null, ctx.root); s.roll = h('div', null, null, ctx.root);
      for (const e of [s.lines, s.roll]) cssCamel(e, { position: 'absolute', left: '0', right: '0', pointerEvents: 'none' });
      cssCamel(s.lines, { top: '0', bottom: '0' });
    }
    return s;
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx;
    if (s.look === 'tear') {
      const step = Math.floor(frameOf(ctx.local, ctx.fps) / 2), r = rng(p.seed * 7919 + step * 104729);
      const on = r() < p.density;
      for (const b of s.bars) {
        const y = r(), hh = (0.2 + 0.8 * r()) * p.maxHeight, shift = (r() - 0.5) * 0.3, tone = r();
        cssCamel(b, { display: on ? 'block' : 'none', top: `${y * H}px`, height: `${hh * H}px`, transform: `translateX(${shift * ctx.W}px)`, background: p.tint ? (tone < 0.4 ? '#00ffff' : tone < 0.8 ? '#ff00ff' : '#ffffff') : '#ffffff' });
      }
      return;
    }
    const n = frameOf(ctx.local, ctx.fps), k = Math.min(W, H) / 1080;
    let on = false;
    if (s.look === 'rgb') {
      const dx = rgbSplit(n, ctx.fps, p, k);
      attr(s.nodes[0][0], { dx: -dx }); attr(s.nodes[0][1], { dx });
      on = dx !== 0;
    } else if (s.look === 'block') {
      const blocks = glitchBlocks(n, ctx.fps, p, W, H);
      s.nodes.forEach(([o, c], i) => {
        const b = blocks[i], box = b ? { x: b.x, y: b.y, width: b.w, height: b.h } : { x: 0, y: 0, width: 0, height: 0 };
        attr(o, { ...box, dx: b?.dx ?? 0 }); attr(c, { ...box, values: TINTS[b?.tint ?? 0] });
      });
      on = blocks.length > 0;
    } else {
      // scan: one dark line every 3 px (at 1080), a soft bright band rolling down the frame in 6 s, the jump in a burst
      const gap = Math.max(2, Math.round(3 * k)), lh = Math.max(1, Math.round(1.2 * k)), dx = scanJump(n, ctx.fps, p, k);
      cssCamel(s.lines!, { background: `repeating-linear-gradient(180deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) ${lh}px, transparent ${lh}px, transparent ${gap}px)` });
      const bh = 0.14 * H, ph = rng(p.seed * 17 + 5)(), y = (((ctx.local / 6 + ph) % 1) * (H + bh)) - bh;
      cssCamel(s.roll!, { top: `${y.toFixed(1)}px`, height: `${bh.toFixed(1)}px`, background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 60%, rgba(255,255,255,0.16) 85%, rgba(255,255,255,0) 100%)' });
      attr(s.nodes[0][0], { dx });
      on = dx !== 0;
    }
    cssCamel(s.back!, { backdropFilter: on ? s.filter! : 'none' });
  },
};
