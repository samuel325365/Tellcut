// common.sticker, the Dopamine Colors kit's (dopamine-kit.ts) flat sticker (heart, bolt, star, smiley) with a thick ink line and a
// hard shadow, popping in and wobbling. A pure function of time.
import { cssCamel, h, type ItemType } from '@tellcut/engine';
import { springPopAt } from './dopamine-kit.ts';

interface SP { shape: 'heart' | 'bolt' | 'star' | 'smile'; x: number; y: number; size: number; color: string; ink: string; tilt: number; popAt: number }
interface SS { c: HTMLCanvasElement }
type G = CanvasRenderingContext2D;

/** the sticker's outline, centred on 0,0, `r` its half size */
export function stickerPath(g: Pick<G, 'beginPath' | 'moveTo' | 'lineTo' | 'bezierCurveTo' | 'arc' | 'closePath'>, shape: SP['shape'], r: number) {
  g.beginPath();
  if (shape === 'heart') { g.moveTo(0, r * 0.85); g.bezierCurveTo(-r * 1.25, -r * 0.05, -r * 0.65, -r * 1.05, 0, -r * 0.42); g.bezierCurveTo(r * 0.65, -r * 1.05, r * 1.25, -r * 0.05, 0, r * 0.85); }
  if (shape === 'bolt') [[0.25, -1], [-0.5, 0.12], [-0.02, 0.12], [-0.3, 1], [0.55, -0.22], [0.06, -0.22], [0.35, -1]].forEach(([x, y]) => g.lineTo(x * r, y * r));
  if (shape === 'star') for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + (j * Math.PI) / 5, rr = j % 2 ? r * 0.48 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  if (shape === 'smile') g.arc(0, 0, r, 0, Math.PI * 2);
  g.closePath();
}

/** the settled sticker's wobble in degrees: still until 0.4 s after the pop, then swinging from 0 (its phase counted from then, so
 *  it does not jump in at a tilt) */
export const stickerWobble = (local: number, at: number) => (local - at > 0.4 ? Math.sin((local - at - 0.4) * 4.2) * 4 : 0);

export const sticker: ItemType<SP, SS> = {
  type: 'common.sticker', label: '扁平貼紙', category: 'mark', kind: 'overlay',
  doc: '一張扁平的小貼紙：heart 愛心、bolt 閃電、star 星星、smile 笑臉（腮紅、彎彎的嘴），黑色粗框（ink）、往右下錯開的實心影子，從斜斜的小一點彈出來，貼好後輕輕晃；x、y 中心（畫面比例）、size 寬（畫面短邊比例，直式橫式一樣大）；貼在卡片角落、標題旁邊（多巴胺配色的開箱、清單、Vlog，配 common.popcard；有字的爆炸貼紙用 common.burst 的 shadow，游標用 common.touch 的 cursor）',
  params: [
    { key: 'shape', label: '形狀（heart 愛心、bolt 閃電、star 星星、smile 笑臉）', type: 'enum', options: ['heart', 'bolt', 'star', 'smile'], default: 'heart' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.8 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.7 },
    { key: 'size', label: '大小（畫面短邊比例）', type: 'number', min: 0.02, max: 0.6, step: 0.005, default: 0.12 },
    { key: 'color', label: '填色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
    { key: 'ink', label: '框線和影子的顏色', type: 'color', default: '#111111', theme: 'palette.ink' },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -45, max: 45, step: 1, default: 8 },
    { key: 'popAt', label: '彈出（秒）', type: 'number', min: 0, max: 30, step: 0.05, default: 0.3 },
  ],
  build(ctx) {
    const c = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    cssCamel(c, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    return { c };
  },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const pop = springPopAt(local, p.popAt, 0.4), k = Math.min(W, H) / 1080;
    if (pop <= 0.001) return;
    const r = (p.size * Math.min(W, H)) / 2, wob = stickerWobble(local, p.popAt);
    const line = 5 * k, off = 7 * k;
    g.save(); g.translate(p.x * W, p.y * H); g.rotate(((p.tilt + wob + (1 - Math.min(1, pop)) * -25) * Math.PI) / 180); g.scale(pop, pop); g.lineJoin = 'round';
    g.save(); g.translate(off, off); stickerPath(g, p.shape, r); g.fillStyle = p.ink; g.fill(); g.restore();
    stickerPath(g, p.shape, r); g.fillStyle = p.color; g.fill(); g.lineWidth = line; g.strokeStyle = p.ink; g.stroke();
    if (p.shape === 'smile') {
      g.fillStyle = p.ink; g.beginPath(); g.ellipse(-r * 0.33, -r * 0.2, r * 0.09, r * 0.15, 0, 0, Math.PI * 2); g.ellipse(r * 0.33, -r * 0.2, r * 0.09, r * 0.15, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(0, r * 0.05, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = line * 1.1; g.lineCap = 'round'; g.stroke();
      g.fillStyle = 'rgba(255,90,140,0.55)'; g.beginPath(); g.arc(-r * 0.62, r * 0.18, r * 0.14, 0, Math.PI * 2); g.arc(r * 0.62, r * 0.18, r * 0.14, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  },
};
