// common.tabletop — a table surface under the video, from the grill-restaurant acceptance film's fx.steeltable. look 'steel' is brushed
// stainless steel: a sheet lighter at the top, many fine hairline strokes, a warm pool of light from a lamp above and a slanted sheen;
// look 'wood' is the postcard's wooden desk (planks, grain, a warm lamp), in any colour. `grill` sets a charcoal grill into a corner
// (an iron ring, a sunken pit of glowing coals, the grate) for barbecue, hot pot and street-food films. Static: painted once per size
// and params, with a seeded random (`seed`), so draw(t) does not depend on t.
import { type ItemType, rng } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { paintDesk } from './postcard.ts';
import { shade, withAlpha } from './color.ts';

interface P { look: 'steel' | 'wood'; color: string; light: string; grill: boolean; grillX: number; grillY: number; grillR: number; vignette: number; seed: number }
interface S { cv: HTMLCanvasElement; key: string }

/** each look's own colour, when `color` is left empty */
export const TABLE_COLOR = { steel: '#7c838b', wood: '#86603f' } as const;
/** the surface's colour: `color`, or the look's own */
export const tableColor = (p: Pick<P, 'look' | 'color'>) => p.color || TABLE_COLOR[p.look] || TABLE_COLOR.steel;

export const tabletop: ItemType<P, S> = {
  type: 'common.tabletop', label: '桌面質感', category: 'background', kind: 'scene',
  doc: '整片桌面底，放在影片之下（靜態）：look steel 不鏽鋼（髮絲紋、上方暖燈的一圈柔光、一道斜斜的亮帶）、wood 木桌（木板、木紋、左上暖燈）；color 換桌面顏色、light 換燈光顏色；grill 在角落嵌一個炭爐（鐵圈、暗紅炭火、烤網：烤肉、火鍋、路邊攤）；美食、開箱、手作，影片縮成面板、收據機或卡片放在桌上時的底；紙張桌面用 common.paper',
  params: [
    { key: 'look', label: '桌面（steel 不鏽鋼、wood 木桌）', type: 'enum', options: ['steel', 'wood'], default: 'steel' },
    { key: 'color', label: '桌面顏色（空＝這種桌面本來的顏色：steel 鋼灰、wood 胡桃木）', type: 'color', default: '' },
    { key: 'light', label: '燈光顏色', type: 'color', default: '#ffd9a8' },
    { key: 'grill', label: '角落的炭爐（鐵圈、炭火、烤網）', type: 'bool', default: false },
    { key: 'grillX', label: '炭爐圓心 x（畫面寬比例）', type: 'number', min: -0.5, max: 1.5, step: 0.01, default: 1.02 },
    { key: 'grillY', label: '炭爐圓心 y（畫面高比例）', type: 'number', min: -0.5, max: 1.5, step: 0.01, default: 0.93 },
    { key: 'grillR', label: '炭爐半徑（畫面短邊的比例）', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.3 },
    { key: 'vignette', label: '四角壓暗（0–1）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'seed', label: '紋路種子', type: 'number', min: 1, max: 9999, step: 1, default: 7 },
  ],
  build(ctx) {
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    ctx.root.appendChild(cv);
    return { cv, key: '' };
  },
  hide(s) { freeCanvas(s.cv); s.key = ''; },
  draw(ctx, s) {
    const p = ctx.params, { W, H } = ctx, key = JSON.stringify([W, H, p]);
    if (key === s.key) return;   // nothing moves: painted again only when the size or a param changes
    s.key = key;
    const k = Math.min(W, H) / 1080, base = tableColor(p), r = rng(Math.max(1, Math.floor(p.seed)) * 7919);
    let g: CanvasRenderingContext2D;
    if (p.look === 'wood') {
      paintDesk(s.cv, W, H, { wood: [shade(base, 1.15), base, shade(base, 0.81)], lamp: p.light, vignette: Math.min(1, Math.max(0, p.vignette)) });
      g = s.cv.getContext('2d')!;
    } else {
      g = canvasAt(s.cv, W, H);
      paintSteel(g, W, H, k, base, p.light, r);
    }
    if (p.grill && p.grillR > 0) paintGrill(g, p.grillX * W, p.grillY * H, p.grillR * Math.min(W, H), k, r);
    if (p.look !== 'wood' && p.vignette > 0) {   // the desk has its own
      const d = Math.hypot(W, H), vig = g.createRadialGradient(W / 2, H * 0.55, d * 0.2, W / 2, H * 0.55, d * 0.68);
      vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, `rgba(0,0,0,${Math.min(1, p.vignette)})`);
      g.fillStyle = vig; g.fillRect(0, 0, W, H);
    }
  },
};

/** brushed steel: lighter at the top, hairline strokes (light and dark), a warm pool of light and a slanted sheen */
function paintSteel(g: CanvasRenderingContext2D, W: number, H: number, k: number, steel: string, light: string, r: () => number) {
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, shade(steel, 1.18)); base.addColorStop(0.5, steel); base.addColorStop(1, shade(steel, 0.65));
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const n = Math.round((1400 * W * H) / (1080 * 1920));
  for (let i = 0; i < n; i++) {
    const y = r() * H, x = r() * W * 1.2 - W * 0.1, len = (0.15 + r() * 0.7) * W, bright = r() > 0.5;
    g.strokeStyle = bright ? `rgba(255,255,255,${(0.03 + r() * 0.06).toFixed(3)})` : `rgba(0,0,0,${(0.03 + r() * 0.07).toFixed(3)})`;
    g.lineWidth = (0.6 + r() * 1.4) * k;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 2 * k); g.stroke();
  }
  const R = Math.max(W, H) * 0.5, glow = g.createRadialGradient(W * 0.3, H * 0.72, 0, W * 0.3, H * 0.72, R);
  glow.addColorStop(0, withAlpha(light, 0.32)); glow.addColorStop(0.5, withAlpha(light, 0.1)); glow.addColorStop(1, withAlpha(light, 0));
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W * 0.15, H * 0.62); g.rotate(-0.35);
  const bh = H * 0.05, band = g.createLinearGradient(0, -bh, 0, bh);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.10)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = band; g.fillRect(-W, -bh, W * 3, bh * 2); g.restore();
}

/** a charcoal grill set into the table: its shadow, a metal ring, a dark pit with glowing coals, the grate */
function paintGrill(g: CanvasRenderingContext2D, gx: number, gy: number, rad: number, k: number, r: () => number) {
  g.save();
  g.beginPath(); g.arc(gx, gy, rad * 1.12, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
  const ring = g.createLinearGradient(gx - rad, gy - rad, gx + rad, gy + rad);
  ring.addColorStop(0, '#a9b0b7'); ring.addColorStop(0.5, '#4a4f55'); ring.addColorStop(1, '#2b2f33');
  g.beginPath(); g.arc(gx, gy, rad * 1.08, 0, Math.PI * 2); g.fillStyle = ring; g.fill();
  g.beginPath(); g.arc(gx, gy, rad * 0.96, 0, Math.PI * 2); g.clip();
  const pit = g.createRadialGradient(gx, gy, 0, gx, gy, rad);
  pit.addColorStop(0, '#5a1c0c'); pit.addColorStop(0.55, '#2a0d07'); pit.addColorStop(1, '#0d0605');
  g.fillStyle = pit; g.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
  const coals = Math.round(70 * (rad / (324 * k)) ** 2);
  for (let i = 0; i < Math.min(400, coals); i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * 0.85, cr = (8 + r() * 22) * k, hot = r();
    g.fillStyle = hot > 0.7 ? `rgba(255,${110 + Math.floor(r() * 60)},40,0.55)` : `rgba(${60 + Math.floor(hot * 80)},20,12,0.8)`;
    g.beginPath(); g.arc(gx + Math.cos(a) * d, gy + Math.sin(a) * d, cr, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(190,196,202,0.55)'; g.lineWidth = 4 * k;
  const step = 34 * k;
  for (let x = gx - rad; x <= gx + rad; x += step) { g.beginPath(); g.moveTo(x, gy - rad); g.lineTo(x, gy + rad); g.stroke(); }
  for (let y = gy - rad; y <= gy + rad; y += step) { g.beginPath(); g.moveTo(gx - rad, y); g.lineTo(gx + rad, y); g.stroke(); }
  g.restore();
}
