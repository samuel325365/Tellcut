// A storybook kit, promoted 2026-11-06 from the Wes Anderson pilot film's fx.binocular / fx.cards (after the user's own Wes Anderson
// style film):
//   common.binocular   the picture blacked out but for two overlapping round windows opening (or one, a spyglass)
// The photo cards are common.photostack (photostack.ts), the titles common.heading's look storybook (templates storybook, story-card on
// the backing frame, fin), the captions the template story-serif. A pure function of time.
import { clamp, eOut3Clamped, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas, canvasIn } from './inkline.ts';

/** the round windows' centres: two `r` apart less their overlap, or the one */
export function windowCentres(shape: string, cx: number, r: number, overlap: number): number[] {
  if (shape === 'spyglass') return [cx];
  const d = r * (1 - clamp(overlap));
  return [cx - d, cx + d];
}

// ── common.binocular
interface BP { shape: 'binocular' | 'spyglass'; cx: number; cy: number; r: number; overlap: number; color: string; open: number }
interface CS { c: HTMLCanvasElement }
export const binocular: ItemType<BP, CS> = {
  type: 'common.binocular', label: '望遠鏡', category: 'frame', kind: 'overlay',
  doc: '透過望遠鏡看：畫面蓋上 color 色（預設黑），只留兩個並排、互相重疊的圓窗（shape binocular 雙筒；spyglass 一個圓、單筒），窗邊柔和，開場 open 秒內從小張開；cx、cy 是中心（畫面比例）、r 半徑（畫面短邊比例）、overlap 兩圓重疊多少（半徑的比例）；圓窗要對準主角：移 cy／cx，比改片段的 crop 好對；字幕放在圓窗下面的黑底上；偷看、發現、遠遠看到（牆上的貓、遠處的鳥、對面的人），故事書風、Wes Anderson 風的旅行片',
  params: [
    { key: 'shape', label: '樣式（binocular 雙筒、spyglass 單筒）', type: 'enum', options: ['binocular', 'spyglass'], default: 'binocular' },
    { key: 'cx', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'cy', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'r', label: '圓的半徑（畫面短邊的比例）', type: 'number', min: 0.05, max: 0.6, step: 0.01, default: 0.27 },
    { key: 'overlap', label: '兩圓重疊（半徑的比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'color', label: '圓窗外的顏色', type: 'color', default: '#000000' },
    { key: 'open', label: '張開要幾秒（0＝一開始就張開）', type: 'number', min: 0, max: 3, step: 0.05, default: 0.45 },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root) }),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, g = canvasAt(s.c, W, H);
    g.globalCompositeOperation = 'source-over'; g.fillStyle = p.color; g.fillRect(0, 0, W, H);
    const r = p.r * Math.min(W, H) * (p.open > 0 ? 0.6 + 0.4 * eOut3Clamped(local / p.open) : 1), cy = p.cy * H;
    g.globalCompositeOperation = 'destination-out';
    for (const cx of windowCentres(p.shape, p.cx * W, r, p.overlap)) {
      const grad = g.createRadialGradient(cx, cy, r * 0.9, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  },
};
