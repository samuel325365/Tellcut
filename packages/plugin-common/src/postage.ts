// common.postage — a perforated postage stamp that drops (or slides) in and plays a shot in its picture (cells.ts: the block plays
// it, the way common.popcard does, so the picture moves and tilts with the stamp), its value and a small line printed in the margin
// below, then a round postmark thumps down across its corner (postmark.ts' drawMark). Its moves are common.frame's (framePose, no
// turning over). Derived from common.frame, postmark.ts' stamp and mark, and common.popcard. A pure function of time.
import { abs, cssCamel, h, type ItemType } from '@tellcut/engine';
import { cellEl, cellLive, cellMedia, cropOf, showCell, type CellShot, type Rect } from './cells.ts';
import { framePose } from './frame.ts';
import { drawMark, markEl, type MarkEl } from './postmark.ts';
import { paintDesk } from './postcard.ts';
import { freeCanvas } from './inkline.ts';
import { imagesReady, type Win } from './window.ts';

type Move = 'drop' | 'left' | 'right' | 'bottom' | 'top' | 'none';
interface P {
  source: string; from: number; crop: { x: number; y: number; zoom: number }; still: boolean; x: number; y: number; w: number; aspect: number;
  paper: string; perf: number; value: string; line: string; ink: string; font: string; place: string; date: string; markAt: number; markX: number; markY: number; markColor: string;
  enter: Move; enterDur: number; exit: Move; exitDur: number; tilt: number; backdrop: 'none' | 'desk' | 'color'; bg: string;
}
interface S { under: HTMLCanvasElement; underKey: string; stamp: HTMLElement; paper: HTMLCanvasElement; paperKey: string; win: Win; rule: HTMLElement; value: HTMLElement; line: HTMLElement; mark: MarkEl; meas: HTMLCanvasElement }

/** the stamp (sw × sh px, top left x0, y0) and its picture window: w a share of the short side (the whole stamp kept within 0.9 of
 *  the frame), the margin 0.07 of the picture's width on the left, top and right and 0.22 below it (for the value and the line).
 *  The centre is x, y, moved in just as far as the settled stamp, turned `tilt` degrees, needs to stay wholly in the frame (a stamp
 *  as tall as 0.9 of a wide frame at y 0.45 would otherwise poke out over the top edge) */
export function postageBox(p: Pick<P, 'x' | 'y' | 'w' | 'aspect'> & { tilt?: number }, W: number, H: number): { sw: number; sh: number; x0: number; y0: number; win: Rect } {
  // the stamp is 1.14 picture widths wide and (1 / aspect + 0.29) tall: shrunk, if need be, to 0.9 of the frame both ways
  const a = Math.max(0.2, p.aspect), ww = Math.min(p.w * Math.min(W, H), (0.9 * W) / 1.14, (0.9 * H) / (1 / a + 0.29));
  const wh = ww / a, side = ww * 0.07, foot = ww * 0.22;
  const sw = ww + 2 * side, sh = wh + side + foot;
  const r = (Math.abs(Number(p.tilt) || 0) * Math.PI) / 180, bw = sw * Math.cos(r) + sh * Math.sin(r), bh = sw * Math.sin(r) + sh * Math.cos(r);
  const inside = (c: number, half: number, len: number) => (half * 2 >= len ? len / 2 : Math.min(len - half, Math.max(half, c)));
  const cx = inside(p.x * W, bw / 2, W), cy = inside(p.y * H, bh / 2, H), x0 = cx - sw / 2, y0 = cy - sh / 2;
  return { sw, sh, x0, y0, win: [x0 + side, y0 + side, ww, wh] };
}

/** the stamp's paper: a sheet with half-round bites all round its edge (the perforation), r px, evenly spaced */
function paintPaper(c: HTMLCanvasElement, sw: number, sh: number, r: number, color: string) {
  c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
  const g = c.getContext('2d')!, step = r * 2.6;
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-out';
  const along = (len: number) => { const n = Math.max(2, Math.floor(len / step) + 1), gap = (len - (n - 1) * step) / 2; return Array.from({ length: n }, (_, i) => gap + i * step); };
  const bite = (x: number, y: number) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  for (const x of along(c.width)) { bite(x, 0); bite(x, c.height); }
  for (const y of along(c.height)) { bite(0, y); bite(c.width, y); }
  g.globalCompositeOperation = 'source-over';
}

/** the crop as written: an object, or its JSON text; a part left out (or not a number) is the middle and 1 */
function cropParam(v: unknown) {
  if (typeof v === 'string') { try { return cropOf(JSON.parse(v)); } catch { return cropOf(null); } }
  return cropOf(v);
}
const shotOf = (p: Partial<P>): CellShot | null => (p.source ? { source: String(p.source), from: Number(p.from) || 0, crop: cropParam(p.crop), still: !!p.still } : null);

/** the value's and the line's font sizes, both shrunk alike when the two side by side (and a gap) are wider than the picture */
export function postageFoot(value: string, line: string, fs: number, room: number, measure: (text: string, size: number) => number): { value: number; line: number } {
  const lf = fs * 0.62, wv = value ? measure(value, fs) : 0, wl = line ? measure(line, lf) + [...line].length * 0.12 * lf : 0;
  const need = wv + wl + (value && line ? fs * 0.5 : 0), k = need > room && need > 0 ? room / need : 1;
  return { value: fs * k, line: lf * k };
}

export const postage: ItemType<P, S> = {
  type: 'common.postage', label: '郵票框', category: 'frame', kind: 'overlay',
  doc: '一張齒孔邊的郵票掉進來（或從一邊滑進來），票面裡自己播一段鏡頭（source 素材、from 素材秒、crop 裁切、still 定格；沒有素材時是示意圖），影片跟著郵票動、停好後保持 tilt 的小傾斜；票面下方印 value 面額和 line 一行小字，markAt 時一個圓形郵戳（place 地名、date 日期）蓋到票面右下角；backdrop 底（desk 木桌、color 純色、none 透明）；票面的影片沒有聲音；和 common.flatlay 3D 桌面（明信片、相框）、common.postmark 只蓋郵戳、common.stamp 印章不同：單張郵票、影片在票面裡播；旅行的一站、回憶的一格',
  params: [
    { key: 'source', label: '票面的素材（空＝示意圖）', type: 'source-ref', default: '' },
    { key: 'from', label: '從素材第幾秒開始播', type: 'number', min: 0, max: 36000, step: 0.1, default: 0 },
    { key: 'crop', label: '裁切 { x, y, zoom }', type: 'json', default: { x: 0.5, y: 0.5, zoom: 1 } },
    { key: 'still', label: '定格（不播，只放 from 那一格）', type: 'bool', default: false },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.45 },
    { key: 'w', label: '票面寬（畫面短邊的比例）', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.6 },
    { key: 'aspect', label: '票面寬高比（寬÷高）', type: 'number', min: 0.3, max: 3, step: 0.01, default: 0.8 },
    { key: 'paper', label: '票紙顏色', type: 'color', default: '#fbf8f1' },
    { key: 'perf', label: '齒孔大小（px，短邊 1080）', type: 'number', min: 3, max: 30, step: 0.5, default: 10 },
    { key: 'value', label: '面額', type: 'string', default: 'NT$ 15' },
    { key: 'line', label: '票面小字', type: 'string', default: 'TAIWAN' },
    { key: 'ink', label: '印刷字色', type: 'color', default: '#b2382c', theme: 'palette.accent' },
    { key: 'font', label: '印刷字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'place', label: '郵戳上的地名（空且沒有日期＝不蓋）', type: 'string', default: 'TAIPEI' },
    { key: 'date', label: '郵戳上的日期', type: 'string', default: '2026.11.07' },
    { key: 'markAt', label: '郵戳蓋上的秒', type: 'number', min: 0, max: 600, step: 0.05, default: 1 },
    { key: 'markX', label: '郵戳中心 x（郵票寬的比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.78 },
    { key: 'markY', label: '郵戳中心 y（郵票高的比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.66 },
    { key: 'markColor', label: '郵戳墨色', type: 'color', default: '#28305a' },
    { key: 'enter', label: '進場', type: 'enum', options: ['drop', 'left', 'right', 'bottom', 'top', 'none'], default: 'drop' },
    { key: 'enterDur', label: '進場長度（秒）', type: 'number', min: 0.1, max: 5, step: 0.05, default: 0.7 },
    { key: 'exit', label: '離場', type: 'enum', options: ['none', 'drop', 'left', 'right', 'bottom', 'top'], default: 'none' },
    { key: 'exitDur', label: '離場長度（秒）', type: 'number', min: 0.1, max: 5, step: 0.05, default: 0.6 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -30, max: 30, step: 0.5, default: -3 },
    { key: 'backdrop', label: '底（none 透明、desk 木桌、color 純色）', type: 'enum', options: ['none', 'desk', 'color'], default: 'desk' },
    { key: 'bg', label: '純色底的顏色', type: 'color', default: '#e9e1d3', theme: 'palette.paper' },
  ],
  media(item) {
    // the same rule as the cell frames' (cellLive): an item of 0.05 s or less asks for no piece, and draw then shows the stand-in
    return cellMedia([shotOf(item.params as Partial<P>)], [0], item.end - item.start);
  },
  build(ctx) {
    const under = abs(ctx.root, {}, 'canvas') as HTMLCanvasElement, stamp = abs(ctx.root), paper = abs(stamp, {}, 'canvas') as HTMLCanvasElement;
    stamp.dataset.stamp = '';
    cssCamel(under, { left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(stamp, { transformOrigin: '50% 50%' });
    cssCamel(paper, { left: '0', top: '0', width: '100%', height: '100%' });
    const win = cellEl(stamp), rule = abs(stamp), value = h('div', null, null, stamp), line = h('div', null, null, stamp);
    for (const e of [value, line]) cssCamel(e, { position: 'absolute', whiteSpace: 'nowrap', lineHeight: '1', fontWeight: '700' });
    cssCamel(rule, { pointerEvents: 'none', boxSizing: 'border-box' });
    const s: S = { under, underKey: '', stamp, paper, paperKey: '', win, rule, value, line, mark: markEl(stamp), meas: document.createElement('canvas') };
    postage.draw(ctx, s);   // starts loading the still now, so ready() can wait for it
    return s;
  },
  ready: (s) => imagesReady([s.win.img]),
  hide(s) { freeCanvas(s.under, s.paper, s.mark.cv); s.underKey = ''; s.paperKey = ''; s.mark.key = ''; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, b = postageBox(p, W, H), [wx, wy, ww, wh] = b.win;
    const underKey = `${p.backdrop}|${W}x${H}|${p.bg}`;
    if (s.underKey !== underKey) {
      s.underKey = underKey;
      if (p.backdrop === 'desk') paintDesk(s.under, W, H);
      else { s.under.width = 1; s.under.height = 1; const g = s.under.getContext('2d')!; g.fillStyle = p.bg; g.fillRect(0, 0, 1, 1); }
    }
    cssCamel(s.under, { display: p.backdrop === 'none' ? 'none' : 'block' });
    const paperKey = JSON.stringify([b.sw, b.sh, p.perf * k, p.paper]);
    if (s.paperKey !== paperKey) { s.paperKey = paperKey; paintPaper(s.paper, b.sw, b.sh, Math.max(2, p.perf * k), p.paper); }
    const ps = framePose({ enter: p.enter, enterDur: p.enterDur, exit: p.exit, exitDur: p.exitDur, flipAt: -1, flipDur: 0.8 }, local, dur, W, H);
    cssCamel(s.stamp, { left: `${b.x0.toFixed(2)}px`, top: `${b.y0.toFixed(2)}px`, width: `${b.sw.toFixed(2)}px`, height: `${b.sh.toFixed(2)}px`, opacity: String(ps.alpha),
      transform: `translate(${ps.dx.toFixed(2)}px, ${ps.dy.toFixed(2)}px) rotate(${(ps.rot + p.tilt).toFixed(3)}deg) scale(${ps.scale.toFixed(4)})`,
      filter: `drop-shadow(${(4 * k).toFixed(2)}px ${(12 * k).toFixed(2)}px ${(16 * k).toFixed(2)}px rgba(20,12,6,0.45))` });
    const lx = wx - b.x0, ly = wy - b.y0;
    cssCamel(s.win.box, { left: `${lx.toFixed(2)}px`, top: `${ly.toFixed(2)}px` });
    showCell(ctx, s.win, cellLive(0, dur) ? shotOf(p) : null, local, dur, ww, wh);
    cssCamel(s.rule, { left: `${lx.toFixed(2)}px`, top: `${ly.toFixed(2)}px`, width: `${ww.toFixed(2)}px`, height: `${wh.toFixed(2)}px`, border: `${(2 * k).toFixed(2)}px solid rgba(0,0,0,0.25)` });
    // the value bottom left and the line bottom right, in the margin under the picture
    const foot = b.sh - (ly + wh), fs = Math.min(foot * 0.42, ww * 0.1), base = ly + wh + foot * 0.5 - fs * 0.45;
    const value = String(p.value ?? ''), line = String(p.line ?? ''), family = `'${p.font}', serif`, g = s.meas.getContext('2d');
    const size = g ? postageFoot(value, line, fs, ww, (text, px) => { g.font = `700 ${px}px ${family}`; return g.measureText(text).width; }) : { value: fs, line: fs * 0.62 };
    s.value.textContent = value; s.line.textContent = line;
    cssCamel(s.value, { left: `${lx.toFixed(2)}px`, top: `${(base + (fs - size.value) * 0.5).toFixed(2)}px`, fontSize: `${size.value.toFixed(2)}px`, color: p.ink, fontFamily: family });
    cssCamel(s.line, { right: `${lx.toFixed(2)}px`, top: `${(base + fs * 0.25 + (fs * 0.62 - size.line) * 0.5).toFixed(2)}px`, fontSize: `${size.line.toFixed(2)}px`, color: p.ink, fontFamily: family, letterSpacing: '0.12em' });
    const has = !!(String(p.place ?? '').trim() || String(p.date ?? '').trim());
    drawMark(s.mark, has ? { top: p.place, bottom: '', date: p.date, at: p.markAt } : null, b.sw * 0.2, p.markX * b.sw, p.markY * b.sh, local, false, p.markColor, true, 0.82, Math.max(1, k));
  },
};
