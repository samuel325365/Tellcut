// common.lens — a lens over the picture: it bends what is under it (the footage and every item below) instead of drawing on top.
// A div inside the item's layer carries `backdrop-filter: url(#filter)`, an SVG filter of the item's own (as common.glitch's rgb /
// block). The bends that vary over the lens (magnify, fisheye, prism) are a displacement map drawn once on a canvas in build, read
// by feImage and applied by feDisplacementMap; mosaic is feFlood + feTile + feMorphology (a few px in the middle of each cell spread
// over it); ripple is a tile of seeded waves (another map) moved by feOffset inside an feTile, so the shift wraps without a seam;
// streak is a one-way feGaussianBlur. Per frame only attributes (the displacement's scale, the cell size, the waves' shift, the blur)
// and the div's place change, so draw stays cheap and a pure function of time. Every number in the filters is in the stage's px
// (userSpaceOnUse), which Chrome scales with the preview's frame; the one primitive it does not, feTurbulence, is not used.
// backdrop-filter with url() is Chromium only: other browsers'
// previews show the picture unbent; the export always uses Chrome. The layer must not be blended (a blended layer is a backdrop
// root and would see nothing under it).
import { attr, clamp, cssCamel, h, mulberry32, type ItemType } from '@tellcut/engine';

export const LOOKS = ['magnify', 'fisheye', 'mosaic', 'ripple', 'streak', 'prism'] as const;
type Look = (typeof LOOKS)[number];
type Shape = 'circle' | 'box' | 'full';
type Move = 'none' | 'grow' | 'pop';
type From = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br';
interface P { look: Look; shape: Shape; x: number; y: number; size: number; strength: number; enter: Move; exit: Move; from: From; travel: number;
  axis: 'across' | 'down'; speed: number; rim: 'none' | 'line' | 'glass'; seed: number }
interface S { look: Look; lens: HTMLElement; rim: HTMLElement; img?: SVGElement; filter: string; nodes: SVGElement[]; box: Box; unit: number; ready: Promise<void> }
/** the lens div's box in stage px (for `full`, the frame; twice the frame round the moving centre when it travels) and the lens
 *  centre and radius inside it */
export interface Box { w: number; h: number; cx: number; cy: number; R: number; moves: boolean }

const SVG = 'http://www.w3.org/2000/svg';
/** one filter id per lens item on the page (two lenses may show at once; ids are document-wide) */
let seq = 0;
/** the longest side of a displacement map (px): its values are smooth, so the upscale costs nothing visible */
export const MAP_SIDE = 256;
/** magnify's top magnification: the map holds 8 bits per axis, and its steps start to show past this */
export const MAX_MAGNIFY = 2.5;
/** the looks whose bend is a displacement map */
const MAPPED: readonly Look[] = ['magnify', 'fisheye', 'prism'];
/** how far each of prism's red and cyan moves at the lens edge at strength 1, of the lens radius (at most 0.4 of the short side
 *  counted, so the whole frame splits no wider than a big lens) */
const PRISM_SPLIT = 0.06;

const isLook = (v: unknown): v is Look => (LOOKS as readonly unknown[]).includes(v);

/** how much each look does at strength `s` (0…1, a little more on a pop's overshoot), in its own unit:
 *  magnify ×1 to ×2.5; fisheye how far toward the middle a point takes its pixel from, per (1 − r) (0 to 0.75: the very middle
 *  ×1 to ×4); mosaic the cell (px, odd, up to 6 % of the short side); ripple the displacement's scale (px, up to 12 % of the short
 *  side: the noise keeps near its middle, so the picture moves a few % of the short side); streak the blur's deviation (px, up to
 *  4 % of the short side); prism how far each of red and cyan moves at the lens edge (px; they part twice that) */
export function lensAmount(look: Look, s: number, S: number, R: number): number {
  s = Math.max(0, s);
  switch (look) {
    case 'magnify': return clamp(1 + 1.5 * s, 1, MAX_MAGNIFY);
    case 'fisheye': return Math.min(0.85, 0.75 * s);
    // odd, so the one picked pixel in the middle of a cell dilates to exactly its cell (an even cell overlapped its neighbours by
    // a pixel, and the dilate's max drew a faint grid there)
    case 'mosaic': return Math.max(1, 2 * Math.round((s * 0.06 * S - 1) / 2) + 1);
    case 'ripple': return s * 0.12 * S;
    case 'streak': return s * 0.04 * S;
    case 'prism': return s * PRISM_SPLIT * Math.min(R, 0.4 * S);
  }
}

/** the strength's envelope at `local` (0 → 1 → 0): grow eases in / out over the first and last 0.45 s (half the item at most);
 *  pop overshoots on a spring coming in and swells a little before vanishing going out */
export function lensEnvelope(p: Pick<P, 'enter' | 'exit'>, local: number, dur: number, m: { spring: (o: { duration?: number; bounce?: number }) => (t: number) => number; ease: Record<'out' | 'in' | 'backIn', (x: number) => number> }): number {
  const T = Math.max(0.01, Math.min(0.45, dur / 2));
  const a = p.enter === 'pop' ? m.spring({ duration: T * 0.8, bounce: 0.45 })(local) : p.enter === 'grow' ? m.ease.out(clamp(local / T)) : 1;
  const u = clamp((local - (dur - T)) / T);
  const b = p.exit === 'pop' ? 1 - m.ease.backIn(u) : p.exit === 'grow' ? 1 - m.ease.in(u) : 1;
  return Math.max(0, a * b);
}

/** the way the travel moves the lens, per unit of travel (frame widths across, heights down; a corner goes as many px down as across) */
const DIRS: Record<From, [number, number]> = { l: [1, 0], r: [-1, 0], t: [0, 1], b: [0, -1], tl: [1, 1], tr: [-1, 1], bl: [1, -1], br: [-1, -1] };

/** the lens centre (frame fractions) `k` (0…1, eased) of the way along its travel: it passes (x, y) halfway */
export function lensCentre(p: Pick<P, 'x' | 'y' | 'from' | 'travel'>, k: number, W: number, H: number): [number, number] {
  if (!(p.travel > 0)) return [p.x, p.y];
  const [dx, dy] = DIRS[p.from] ?? DIRS.l, d = p.travel * (k - 0.5);
  return [p.x + dx * d, p.y + dy * d * (dx ? W / H : 1)];
}

/** the lens div's box: a square of `size` % of the short side round the centre; the frame for `full` (a mapped look that travels
 *  gets twice the frame round its centre, so the centre stays in the box's middle and the map need not be redrawn) */
export function lensBox(p: Pick<P, 'look' | 'shape' | 'size' | 'x' | 'y' | 'travel'>, W: number, H: number): Box {
  if (p.shape === 'full') {
    const R = Math.hypot(W, H) / 2;
    if (p.travel > 0 && MAPPED.includes(p.look)) return { w: 2 * W, h: 2 * H, cx: W, cy: H, R, moves: true };
    return { w: W, h: H, cx: p.x * W, cy: p.y * H, R, moves: false };
  }
  const side = Math.max(4, (p.size / 100) * Math.min(W, H));
  return { w: side, h: side, cx: side / 2, cy: side / 2, R: side / 2, moves: true };
}

/** a mapped look's displacement at (dx, dy) px from the lens centre, at amount 1 (draw scales it): where the pixel there is taken
 *  from, relative to it. magnify: toward the centre in proportion (times 1 - 1/m: the picture m times larger); fisheye: toward the
 *  centre by (1 - r) of the distance inside the radius, so the middle swells and the rim is squeezed, nothing past it; prism: outward
 *  growing with r² (red one way, cyan the other), none in the middle */
export function bend(look: Look, dx: number, dy: number, R: number): [number, number] {
  const r = Math.hypot(dx, dy) / R;
  if (look === 'fisheye') return r >= 1 ? [0, 0] : [-dx * (1 - r), -dy * (1 - r)];
  if (look === 'prism') { const q = Math.min(r, 1.5) ** 2; return [dx * q, dy * q]; }
  return [-dx, -dy];
}

/** the displacement map of a look over a box: RGBA bytes `mw`×`mh` (red the x offset, green the y, 128 none) and `unit`, the px one
 *  full swing (0 or 255) stands for at amount 1. The offsets are sampled at each map pixel's centre in the box's own px. */
export function lensMap(look: Look, box: Box): { mw: number; mh: number; data: Uint8ClampedArray; unit: number } {
  const sc = MAP_SIDE / Math.max(box.w, box.h), mw = Math.max(2, Math.round(box.w * sc)), mh = Math.max(2, Math.round(box.h * sc));
  const off = new Float32Array(mw * mh * 2);
  let unit = 0;
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const [ox, oy] = bend(look, ((i + 0.5) / mw) * box.w - box.cx, ((j + 0.5) / mh) * box.h - box.cy, box.R), n = (j * mw + i) * 2;
    off[n] = ox; off[n + 1] = oy; unit = Math.max(unit, Math.abs(ox), Math.abs(oy));
  }
  unit = unit || 1;
  const data = new Uint8ClampedArray(mw * mh * 4);
  for (let n = 0; n < mw * mh; n++) {
    data[n * 4] = Math.round(127.5 + 127.5 * (off[n * 2] / unit)); data[n * 4 + 1] = Math.round(127.5 + 127.5 * (off[n * 2 + 1] / unit));
    data[n * 4 + 2] = 128; data[n * 4 + 3] = 255;
  }
  return { mw, mh, data, unit };
}

/** ripple's noise tile (px): the box halved along the flow (up for across, right for down), whole across it */
export const rippleTile = (box: Pick<Box, 'w' | 'h'>, across: boolean): [number, number] => (across ? [box.w, box.h / 2] : [box.w / 2, box.h]);

/** ripple's waves over one tile: red (the x offset) and green (the y) each a sum of three seeded plane waves, a whole number of
 *  them across the tile both ways so it tiles without a seam; long (about 0.7 of the short side) across the flow, shorter (about a
 *  fifth) along it, so the bands lie across the flow. The offset across the bands is the big one (sideways shimmer for across);
 *  the other is 0.4 of it. A map rather than feTurbulence: Chrome draws feTurbulence in screen px, so the preview's smaller frame
 *  got finer waves than the export; a map scales with the lens like the other looks'. Values ±0.9 at most, about ±0.4 typical. */
export function rippleMap(tw: number, th: number, across: boolean, seed: number, S: number): { mw: number; mh: number; data: Uint8ClampedArray } {
  const sc = MAP_SIDE / Math.max(tw, th), mw = Math.max(2, Math.round(tw * sc)), mh = Math.max(2, Math.round(th * sc));
  const r = mulberry32(Math.imul(Math.round(Number(seed) || 1), 0x9e3779b1) ^ 0x27d4eb2f);
  const [lw, lh] = across ? [tw, th] : [th, tw];   // the tile across the flow / along it
  const waves = () => Array.from({ length: 3 }, () => {
    const kl = Math.round(lw / (0.7 * S * (0.7 + 0.6 * r()))) * (r() < 0.5 ? -1 : 1), ks = Math.max(1, Math.round(lh / (0.2 * S * (0.7 + 0.6 * r()))));
    return { kx: across ? kl : ks, ky: across ? ks : kl, ph: r() * Math.PI * 2 };
  });
  const red = waves(), green = waves(), data = new Uint8ClampedArray(mw * mh * 4), [ar, ag] = across ? [0.9, 0.36] : [0.36, 0.9];
  const at = (ws: ReturnType<typeof waves>, amp: number, u: number, v: number) => (amp / 3) * ws.reduce((t, w) => t + Math.sin(2 * Math.PI * (w.kx * u + w.ky * v) + w.ph), 0);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const u = (i + 0.5) / mw, v = (j + 0.5) / mh, n = (j * mw + i) * 4;
    data[n] = Math.round(127.5 + 127.5 * at(red, ar, u, v)); data[n + 1] = Math.round(127.5 + 127.5 * at(green, ag, u, v)); data[n + 2] = 128; data[n + 3] = 255;
  }
  return { mw, mh, data };
}

/** mosaic's pick for a cell of `c` px (odd): the side of the square of picked pixels in its middle (odd, about a tenth of the cell:
 *  small, as the dilation's max over a part of it varies across the cell, yet some screen px in a preview scaled down a few times)
 *  and the dilation that spreads it over exactly the cell */
export function mosaicPick(c: number): { d: number; radius: number } {
  const d = Math.max(1, 2 * Math.floor(c / 20) + 1);
  return { d, radius: (c - d) / 2 };
}

/** feDisplacementMap's scale that moves a map's pixel by `amount` times its offset: px = scale × (value − ½) = scale × ½ × off/unit */
export const mapScale = (unit: number, amount: number) => 2 * unit * amount;

/** a map as a PNG data URL ('' where there is no 2D canvas, as in jsdom) */
function mapUrl(m: { mw: number; mh: number; data: Uint8ClampedArray }): string {
  const c = document.createElement('canvas'); c.width = m.mw; c.height = m.mh;
  const g = c.getContext('2d');
  if (!g) return '';
  const im = g.createImageData(m.mw, m.mh); im.data.set(m.data); g.putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}

const node = (tag: string, a: Record<string, string | number>, parent: Element): SVGElement => {
  const e = document.createElementNS(SVG, tag) as SVGElement;
  for (const [key, v] of Object.entries(a)) e.setAttribute(key, String(v));
  parent.appendChild(e);
  return e;
};
const RED = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', CYAN = '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0';
const mod = (a: number, n: number) => ((a % n) + n) % n;

export const lens: ItemType<P, S> = {
  type: 'common.lens', label: '鏡頭變形', category: 'look', kind: 'overlay',
  doc: '鏡頭：把底下的畫面本身變形（影片和下面軌道的積木、字幕都一起變），不是蓋一層東西上去。look magnify 放大鏡，範圍裡放大 1–2.5 倍（指出畫面裡的小東西，travel 讓它掃過畫面＝找東西）；fisheye 魚眼，中間鼓起來、邊緣擠扁（搞笑、誇張、湊近看）；mosaic 馬賽克，格子最大到畫面短邊 6%（遮住不能看的；shape full 加 enter、exit grow＝像素化轉場）；ripple 水波／熱氣，畫面一直波動、往一個方向流（熱、暈、夢、水底；speed 流速）；streak 單向模糊，橫向或直向拉成線（甩鏡頭、快速換場；axis 方向）；prism 色散，越靠邊緣紅、青分得越開，中間清楚（夢幻、恍神、科技感）。shape circle 圓形、box 方形、full 整個畫面；strength 是各樣子的強度，enter／exit 讓強度從 0 長出來或衝過頭再回來。注意：鏡頭下面的字幕也會一起變形，字幕要清楚就把鏡頭放在字幕下面的軌道；不能和混色（blend）的積木疊成同一層；預覽只有 Chromium 系瀏覽器（Chrome、Edge）看得到，輸出一律用 Chrome',
  params: [
    { key: 'look', label: '樣子（magnify 放大鏡、fisheye 魚眼、mosaic 馬賽克、ripple 水波、streak 單向模糊、prism 色散）', type: 'enum', options: [...LOOKS], default: 'magnify' },
    { key: 'shape', label: '範圍（circle 圓形、box 方形、full 整個畫面）', type: 'enum', options: ['circle', 'box', 'full'], default: 'circle' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'size', label: '大小（畫面短邊 %；full 不用）', type: 'number', min: 5, max: 100, step: 1, default: 40 },
    { key: 'strength', label: '強度（0–1；magnify 1–2.5 倍、fisheye 鼓起的程度、mosaic 格子大小、ripple 波幅、streak 模糊長度、prism 分色距離）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'enter', label: '進場（none 直接出現、grow 強度從 0 長出來、pop 衝過頭再回來）', type: 'enum', options: ['none', 'grow', 'pop'], default: 'grow' },
    { key: 'exit', label: '退場（none 直接消失、grow 強度退回 0、pop 先鼓一下再消失）', type: 'enum', options: ['none', 'grow', 'pop'], default: 'grow' },
    { key: 'from', label: '從哪邊移過來（l 左、r 右、t 上、b 下、tl 左上、tr 右上、bl 左下、br 右下；travel 0 不用）', type: 'enum', options: ['l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br'], default: 'l' },
    { key: 'travel', label: '移動距離（畫面寬或高的比例，中間經過 x, y；0＝不動）', type: 'number', min: 0, max: 1.5, step: 0.05, default: 0 },
    { key: 'axis', label: '方向（streak 模糊的方向、ripple 波紋的方向；across 橫向、down 直向）', type: 'enum', options: ['across', 'down'], default: 'across' },
    { key: 'speed', label: '流速（ripple；畫面短邊 %／秒，0＝不流動）', type: 'number', min: 0, max: 40, step: 1, default: 8 },
    { key: 'rim', label: '鏡框（none 無、line 細白邊、glass 白邊加玻璃反光；full 沒有）', type: 'enum', options: ['none', 'line', 'glass'], default: 'line' },
    { key: 'seed', label: '亂數種子（ripple 的波紋）', type: 'number', min: 1, max: 9999, step: 1, default: 7 },
  ],
  build(ctx) {
    const p = ctx.params, { W, H } = ctx, look: Look = isLook(p.look) ? p.look : 'magnify', box = lensBox({ ...p, look }, W, H), id = `tc-lens-${++seq}`;
    const S = Math.min(W, H);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    (svg as unknown as HTMLElement).style.position = 'absolute';
    ctx.root.appendChild(svg);
    // userSpaceOnUse: the primitives' numbers are the lens div's own px (the stage's, before the preview's scale)
    const f = node('filter', { id, x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB', primitiveUnits: 'userSpaceOnUse' }, svg);
    let img: SVGElement | undefined, unit = 1, ready = Promise.resolve();
    const nodes: SVGElement[] = [];
    /** an feImage of a map stretched over w×h; the filter waits for it: feImage loads even a data URL on its own time, and a frame
     *  drawn before would show the picture unbent */
    const image = (m: { mw: number; mh: number; data: Uint8ClampedArray }, w: number, h: number, result: string) => {
      const href = mapUrl(m);
      img = node('feImage', { href, x: 0, y: 0, width: +w.toFixed(2), height: +h.toFixed(2), preserveAspectRatio: 'none', result }, f);
      if (href && typeof Image !== 'undefined') ready = new Promise<void>((done) => {
        let left = 2;
        const one = () => { if (--left <= 0) done(); };
        img!.addEventListener('load', one, { once: true }); img!.addEventListener('error', one, { once: true });
        const pic = new Image(); pic.src = href; (typeof pic.decode === 'function' ? pic.decode() : Promise.resolve()).then(one, one);
        setTimeout(done, 1500);
      });
    };
    if (MAPPED.includes(look)) {
      const m = lensMap(look, box);
      unit = m.unit;
      image(m, box.w, box.h, 'map');
      if (look === 'prism') {
        // red taken from outward, green and blue from inward, added back together (one channel each, so a plain sum)
        nodes.push(node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'a' }, f));
        nodes.push(node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'b' }, f));
        node('feColorMatrix', { in: 'a', type: 'matrix', values: RED, result: 'r' }, f);
        node('feColorMatrix', { in: 'b', type: 'matrix', values: CYAN, result: 'c' }, f);
        node('feComposite', { in: 'r', in2: 'c', operator: 'arithmetic', k2: 1, k3: 1 }, f);
      } else nodes.push(node('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G' }, f));
    } else if (look === 'mosaic') {
      // the picture softened (so the middle of a cell is about the cell's mean), a small opaque square in the middle of each cell
      // tiled over the box keeps those pixels only, and dilating spreads them over their cell (the rest is clear, so the max is
      // the pick, nearly flat after the blur). In a preview scaled down the pick may cover part of a screen pixel and come out
      // half clear: its alpha is pushed back to full (feComponentTransfer works on unpremultiplied colour, so the colour stays)
      nodes.push(node('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 0, edgeMode: 'duplicate', result: 'soft' }, f));
      nodes.push(node('feFlood', { 'flood-color': '#000', 'flood-opacity': 1, x: 0, y: 0, width: 1, height: 1, result: 'dot' }, f));
      nodes.push(node('feComposite', { in: 'dot', in2: 'dot', operator: 'over', x: 0, y: 0, width: 3, height: 3, result: 'cell' }, f));
      node('feTile', { in: 'cell', result: 'dots' }, f);
      node('feComposite', { in: 'soft', in2: 'dots', operator: 'in', result: 'picks' }, f);
      nodes.push(node('feMorphology', { in: 'picks', operator: 'dilate', radius: 1, result: 'cells' }, f));
      const ct = node('feComponentTransfer', { in: 'cells' }, f);
      node('feFuncA', { type: 'linear', slope: 40, intercept: 0 }, ct);
    } else if (look === 'ripple') {
      // the waves' tile (half the box along the flow) shifted by up to one tile and tiled again: the shift wraps without a seam,
      // and the shifted tile still lies inside the filter region (a primitive is cut to it, so a whole box's tile shifted would be
      // cut short). across: long waves lying sideways, drifting up (heat rising); down: standing waves drifting right
      const across = p.axis !== 'down', [tw, th] = rippleTile(box, across);
      image(rippleMap(tw, th, across, p.seed, S), tw, th, 'n');
      nodes.push(node('feOffset', { in: 'n', dx: 0, dy: 0, x: 0, y: 0, width: tw, height: th, result: 'o' }, f));
      node('feTile', { in: 'o', result: 'flow' }, f);
      nodes.push(node('feDisplacementMap', { in: 'SourceGraphic', in2: 'flow', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G' }, f));
    } else {
      // streak: feGaussianBlur can blur along x or y only, hence axis across / down; the box's edge repeats its last pixels
      nodes.push(node('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0 0', edgeMode: 'duplicate' }, f));
    }
    const lensEl = h('div', null, null, ctx.root), rim = h('div', null, null, ctx.root);
    for (const e of [lensEl, rim]) cssCamel(e, { position: 'absolute', pointerEvents: 'none', boxSizing: 'border-box', width: `${box.w.toFixed(2)}px`, height: `${box.h.toFixed(2)}px`, borderRadius: p.shape === 'circle' ? '50%' : '0' });
    return { look, lens: lensEl, rim, img, filter: `url(#${id})`, nodes, box, unit, ready };
  },
  ready: (s) => s.ready,
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx, S = Math.min(W, H), k1 = S / 1080, b = s.box;
    const e = lensEnvelope(p, ctx.local, ctx.dur, ctx.motion), a = lensAmount(s.look, clamp(p.strength) * e, S, b.R);
    const [fx, fy] = lensCentre(p, ctx.motion.ease.inOut(clamp(ctx.local / Math.max(0.01, ctx.dur))), W, H);
    const left = b.moves ? fx * W - b.cx : 0, top = b.moves ? fy * H - b.cy : 0;
    const place = { left: `${left.toFixed(2)}px`, top: `${top.toFixed(2)}px` };
    cssCamel(s.lens, place);
    let on: boolean;
    if (s.look === 'magnify' || s.look === 'fisheye') {
      const sc = mapScale(s.unit, s.look === 'magnify' ? 1 - 1 / a : a);
      attr(s.nodes[0], { scale: +sc.toFixed(3) }); on = sc > 0.05;
    } else if (s.look === 'prism') {
      const sc = mapScale(s.unit, a / b.R);
      attr(s.nodes[0], { scale: +sc.toFixed(3) }); attr(s.nodes[1], { scale: +(-sc).toFixed(3) }); on = sc > 0.05;
    } else if (s.look === 'mosaic') {
      // the grid is the frame's, not the box's: a moving box shows the same cells instead of swimming ones
      const c = Math.max(1, a), ox = mod(Math.round(-left), c), oy = mod(Math.round(-top), c), { d, radius } = mosaicPick(c);
      attr(s.nodes[0], { stdDeviation: +(c / 3).toFixed(2) });
      attr(s.nodes[1], { x: ox + radius, y: oy + radius, width: d, height: d });
      attr(s.nodes[2], { x: ox, y: oy, width: c, height: c });
      attr(s.nodes[3], { radius });
      on = c >= 3;
    } else if (s.look === 'ripple') {
      const v = (Number(p.speed) || 0) / 100 * S * ctx.local, across = p.axis !== 'down', [tw, th] = rippleTile(b, across);
      const dx = across ? 0 : mod(v, tw), dy = across ? mod(-v, th) : 0;
      attr(s.nodes[0], { dx: +dx.toFixed(2), dy: +dy.toFixed(2), x: +dx.toFixed(2), y: +dy.toFixed(2) });
      attr(s.nodes[1], { scale: +a.toFixed(2) }); on = a > 0.1;
    } else {
      attr(s.nodes[0], { stdDeviation: p.axis === 'down' ? `0 ${a.toFixed(2)}` : `${a.toFixed(2)} 0` }); on = a > 0.1;
    }
    cssCamel(s.lens, { backdropFilter: on ? s.filter : 'none' });
    // the rim comes in with the lens: as strong as the envelope, never past full
    const ring = p.shape !== 'full' && p.rim !== 'none' ? clamp(e) : 0, lw = Math.max(1, 3 * k1);
    cssCamel(s.rim, { ...place, display: ring > 0.001 ? 'block' : 'none', opacity: ring.toFixed(3), border: `${lw.toFixed(2)}px solid rgba(255,255,255,0.92)`,
      boxShadow: p.rim === 'glass' ? `0 ${(8 * k1).toFixed(1)}px ${(26 * k1).toFixed(1)}px rgba(0,0,0,0.35), inset 0 0 ${(18 * k1).toFixed(1)}px rgba(255,255,255,0.35)` : `0 ${(2 * k1).toFixed(1)}px ${(8 * k1).toFixed(1)}px rgba(0,0,0,0.3)`,
      background: p.rim === 'glass' ? 'radial-gradient(ellipse 38% 24% at 32% 24%, rgba(255,255,255,0.42), rgba(255,255,255,0) 100%)' : 'none' });
  },
  // the map's data URL is the one big thing the item holds outside the DOM the stage drops
  dispose(s) { s.img?.setAttribute('href', ''); },
};
