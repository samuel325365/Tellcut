// common.comic — a comic page the footage plays in: white gutters round slanted, ink-bordered panels, the panels sliding in one by one,
// manga focus lines inside a panel. Promoted 2026-11-05 from the comic pilot film's fx.comicpage (after the user's own Comic style
// film). The page is drawn over the footage with the panels cut out of it, so each panel shows whatever clip plays under it: put a
// clip in panel n with frame = comicWindow(n, params) (the panel's bounding box; the slant is the page's gutter covering the rest),
// the main-track clip in one panel and c.beside(...) clips in the others. A panel not revealed yet is all gutter. A pure function of time.
import { clamp, rng, type ItemType } from '@tellcut/engine';

type Pt = [number, number];
type Rect = [number, number, number, number];
type Dir = 'none' | 'left' | 'right' | 'top' | 'bottom';
export type ComicLayout = 'one' | 'two' | 'two-flip' | 'three' | 'four' | 'side';
interface P { layout: ComicLayout; panels: string; times: string; from: string; focus: string; gutter: string; ink: string; border: number; slide: number; lines: number; inner: number; seed: number }
interface S { c: HTMLCanvasElement }

/** the ready-made pages (frame fractions, corners clockwise from the top left); gutters about 0.02 of the frame */
export const COMIC_LAYOUTS: Record<ComicLayout, Pt[][]> = {
  one: [[[0.03, 0.015], [0.97, 0.015], [0.97, 0.985], [0.03, 0.985]]],
  two: [[[0.03, 0.015], [0.97, 0.015], [0.97, 0.5], [0.03, 0.555]], [[0.03, 0.575], [0.97, 0.52], [0.97, 0.985], [0.03, 0.985]]],
  'two-flip': [[[0.03, 0.015], [0.97, 0.015], [0.97, 0.555], [0.03, 0.5]], [[0.03, 0.52], [0.97, 0.575], [0.97, 0.985], [0.03, 0.985]]],
  three: [[[0.03, 0.015], [0.97, 0.015], [0.97, 0.47], [0.03, 0.5]], [[0.03, 0.52], [0.485, 0.505], [0.47, 0.985], [0.03, 0.985]], [[0.505, 0.505], [0.97, 0.49], [0.97, 0.985], [0.49, 0.985]]],
  four: [[[0.03, 0.015], [0.485, 0.015], [0.475, 0.5], [0.03, 0.52]], [[0.505, 0.015], [0.97, 0.015], [0.97, 0.48], [0.495, 0.5]],
    [[0.03, 0.54], [0.475, 0.52], [0.485, 0.985], [0.03, 0.985]], [[0.495, 0.52], [0.97, 0.5], [0.97, 0.985], [0.505, 0.985]]],
  side: [[[0.015, 0.03], [0.53, 0.03], [0.49, 0.97], [0.015, 0.97]], [[0.55, 0.03], [0.985, 0.03], [0.985, 0.97], [0.51, 0.97]]],
};

/** the page's panels: `panels` (one a line, "x,y x,y x,y …" corners in frame fractions) when given, else the layout's */
export function comicPanels(p: Partial<Pick<P, 'layout' | 'panels'>> = {}): Pt[][] {
  const own = String(p.panels ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/\s+/).map((q) => q.split(',').map(Number) as Pt).filter((q) => q.length === 2 && q.every(Number.isFinite)))
    .filter((poly) => poly.length >= 3);
  return own.length ? own : COMIC_LAYOUTS[p.layout ?? 'two'] ?? COMIC_LAYOUTS.two;
}

/** panel n's (1 = the first) bounding box [x, y, w, h] in frame fractions: a clip's `frame` for that panel */
export function comicWindow(n: number, p: Partial<Pick<P, 'layout' | 'panels'>> = {}): Rect {
  const all = comicPanels(p), poly = all[clamp(Math.round(n) - 1, 0, all.length - 1)];
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]), x = Math.min(...xs), y = Math.min(...ys);
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return [r(x), r(y), r(Math.max(...xs) - x), r(Math.max(...ys) - y)];
}

const DIRS: Dir[] = ['none', 'left', 'right', 'top', 'bottom'];
/** when each panel comes in and from where: `times` / `from` comma lists, missing ones 0.6 s apart and from the right and left in turn */
export function comicReveal(p: Pick<P, 'times' | 'from'>, count: number): Array<{ at: number; dir: Dir }> {
  const ats = String(p.times ?? '').split(/[,，\s]+/).filter(Boolean).map(Number), froms = String(p.from ?? '').split(/[,，\s]+/).filter(Boolean);
  return Array.from({ length: count }, (_, i) => {
    const d = froms[i] as Dir;
    return { at: Number.isFinite(ats[i]) ? ats[i] : i * 0.6, dir: DIRS.includes(d) ? d : i === 0 ? 'none' : i % 2 ? 'right' : 'left' };
  });
}

/** focus lines: "panel|x,y|at" one a line (panel from 1, the centre in frame fractions, at in item seconds; at left out = the panel's) */
export function comicFocus(text: string): Array<{ panel: number; x: number; y: number; at: number | null }> {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l) => {
    const [n, xy, at] = l.split('|').map((s) => s.trim()), [x, y] = (xy ?? '').split(',').map(Number);
    return Number.isFinite(+n) && Number.isFinite(x) && Number.isFinite(y) ? [{ panel: +n, x, y, at: at !== undefined && at !== '' && Number.isFinite(+at) ? +at : null }] : [];
  });
}

/** a slide's overshoot (back out) */
const backOut = (q: number) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2); };

export const comic: ItemType<P, S> = {
  type: 'common.comic', label: '漫畫頁', category: 'frame', kind: 'overlay',
  doc: '一頁漫畫，影片在格子裡播：白色格線、黑框的斜格子，格子一格一格滑進來，格內可加漫畫集中線；layout 選版面（one 一格、two 上下兩格、two-flip 斜向相反、three 上一下二、four 四格、side 左右兩格，橫式片用），panels 自己畫格子（一行一格「x,y x,y x,y x,y」畫面比例）；times、from 每格出現的秒和方向（逗號分隔；沒寫的每 0.6 秒一格、左右輪流）；focus 一行一條集中線「第幾格|x,y|秒」；影片放進第 n 格用 frame: comicWindow(n, 同一組參數)（從 @tellcut/plugin-common 匯入）：主軌一格、其他格用 c.beside；一頁一個項目，換頁時再放一個；配 common.onomatopoeia 狀聲詞、caption 的 comic-narration 旁白框、burst 的網點陰影、glitch 換頁',
  params: [
    { key: 'layout', label: '版面（one 一格、two 上下、two-flip 上下斜向相反、three 上一下二、four 四格、side 左右）', type: 'enum', options: ['one', 'two', 'two-flip', 'three', 'four', 'side'], default: 'two' },
    { key: 'panels', label: '自己畫格子（一行一格：x,y x,y x,y x,y，畫面比例；空＝照版面）', type: 'text', default: '' },
    { key: 'times', label: '每格出現的秒（逗號分隔；空＝每 0.6 秒一格）', type: 'string', default: '' },
    { key: 'from', label: '每格從哪邊滑進（none、left、right、top、bottom，逗號分隔）', type: 'string', default: '' },
    { key: 'focus', label: '集中線（一行一條：第幾格|中心 x,y|秒）', type: 'text', default: '' },
    { key: 'gutter', label: '格線顏色', type: 'color', default: '#ffffff' },
    { key: 'ink', label: '框線顏色', type: 'color', default: '#111111', theme: 'palette.ink' },
    { key: 'border', label: '框線粗細（px，短邊 1080）', type: 'number', min: 0, max: 20, step: 1, default: 6 },
    { key: 'slide', label: '滑進時間（秒）', type: 'number', min: 0.05, max: 1.5, step: 0.05, default: 0.32 },
    { key: 'lines', label: '集中線數量', type: 'number', min: 16, max: 160, step: 1, default: 72 },
    { key: 'inner', label: '集中線中間留白半徑（畫面短邊比例）', type: 'number', min: 0.05, max: 0.9, step: 0.01, default: 0.4 },
    { key: 'seed', label: '集中線亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 7 },
  ],
  build(ctx) {
    const c = document.createElement('canvas');
    c.width = ctx.W; c.height = ctx.H;
    c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    ctx.root.appendChild(c);
    return { c };
  },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local } = ctx, S = Math.min(W, H), u = S / 1080;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.fillStyle = p.gutter; g.fillRect(0, 0, W, H);
    const panels = comicPanels(p), reveal = comicReveal(p, panels.length), focus = comicFocus(p.focus);
    const path = (poly: Pt[], dx: number, dy: number) => { g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(x * W + dx, y * H + dy) : g.moveTo(x * W + dx, y * H + dy))); g.closePath(); };
    panels.forEach((poly, k) => {
      const { at, dir } = reveal[k];
      if (local < at) return;
      const off = 1 - backOut(clamp((local - at) / Math.max(0.01, p.slide)));
      const dx = dir === 'left' ? -off * W * 0.7 : dir === 'right' ? off * W * 0.7 : 0, dy = dir === 'top' ? -off * H * 0.45 : dir === 'bottom' ? off * H * 0.45 : 0;
      g.save(); g.globalCompositeOperation = 'destination-out'; path(poly, dx, dy); g.fill(); g.restore();
      for (const f of focus.filter((q) => q.panel === k + 1)) {
        const fl = local - (f.at ?? at);
        if (fl < 0) continue;
        // thin ink wedges from beyond the panel towards (x, y), stopping short of it; they rush in over 0.18 s and twitch 10 times a second
        g.save(); path(poly, dx, dy); g.clip();
        const cx = f.x * W + dx, cy = f.y * H + dy, R = Math.hypot(W, H), grow = clamp(fl / 0.18), r = rng(p.seed * 131 + k * 17 + Math.floor(fl * 10));
        g.fillStyle = p.ink;
        for (let i = 0; i < p.lines; i++) {
          const a = (i / p.lines) * Math.PI * 2 + (r() - 0.5) * 0.08, r0 = p.inner * S * (0.8 + r() * 0.55) + (1 - grow) * R * 0.5, half = ((1.5 + r() * 5) * u * 4) / R;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          g.lineTo(cx + Math.cos(a - half) * R, cy + Math.sin(a - half) * R);
          g.lineTo(cx + Math.cos(a + half) * R, cy + Math.sin(a + half) * R);
          g.closePath(); g.fill();
        }
        g.restore();
      }
      if (p.border > 0) { g.lineWidth = p.border * u; g.lineJoin = 'miter'; g.strokeStyle = p.ink; path(poly, dx, dy); g.stroke(); }
    });
  },
};
