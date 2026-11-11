// common.band, the one-colour kit's (onecolor-kit.ts) tape: a diagonal band of repeated words, scrolling. A pure function of time.
import { eOut3Clamped, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas, canvasIn } from './inkline.ts';
import { SLANT, fontsReady, sans, spaced } from './onecolor-kit.ts';

interface CS { c: HTMLCanvasElement }
interface BP { words: string; angle: number; y: number; color: string; ink: string; speed: number }
export const band: ItemType<BP, CS> = {
  type: 'common.band', label: '斜膠帶字', category: 'text', kind: 'overlay',
  doc: '一條斜過整個畫面的色帶（color），上面重複的粗斜體小字（words，結尾加「 / 」當分隔）一直往左捲，開場從左邊刷進來；angle 角度、y 中心高度；裝飾，不算字幕；KM BY KM、CITY BY CITY 這種節奏字，配 common.whoosh',
  params: [
    { key: 'words', label: '帶子上的字', type: 'string', default: 'KM BY KM / ' },
    { key: 'angle', label: '角度（度）', type: 'number', min: -45, max: 45, step: 1, default: -10 },
    { key: 'y', label: '中心高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'color', label: '帶子顏色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'ink', label: '字色', type: 'color', default: '#111111' },
    { key: 'speed', label: '捲動速度（以 1080 短邊計的 px／秒）', type: 'number', min: 0, max: 800, step: 10, default: 140 },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root) }),
  ready: () => fontsReady(''),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const L = Math.hypot(W, H), bh = 62 * u;
    g.save(); g.translate(W / 2, p.y * H); g.rotate((p.angle * Math.PI) / 180);
    g.beginPath(); g.rect(-L / 2, -bh / 2, L * eOut3Clamped(local / 0.22), bh); g.clip();
    g.fillStyle = p.color; g.fillRect(-L / 2, -bh / 2, L, bh);
    g.fillStyle = p.ink; g.font = sans(30 * u); spaced(g, 2 * u); g.textBaseline = 'middle'; g.textAlign = 'left';
    g.transform(1, 0, SLANT * 0.6, 1, 0, 0);
    // blank words: the band alone (an empty one measured 0 and was written at every px along it)
    const tw = Math.max(1, g.measureText(p.words).width);
    if (String(p.words ?? '').trim()) for (let x = -L / 2 - ((local * p.speed * u) % tw); x < L / 2 + tw; x += tw) g.fillText(p.words, x, 2 * u);
    spaced(g, 0); g.restore();
  },
};
