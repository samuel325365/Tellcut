// common.band, the one-colour kit's (onecolor-kit.ts) tape: a diagonal band of repeated words, scrolling. A pure function of time.
// 2026-11-24: `look` draws it as a hazard tape with striped edges (caution), as two bands crossing in an X (cross), or as two thin
// lines with the words between them and no fill (outline); `bandStrips` says where each band is and how far it is wiped in.
import { eOut3Clamped, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas, canvasIn } from './inkline.ts';
import { SLANT, fontsReady, sans, spaced, type G } from './onecolor-kit.ts';

export type BandLook = 'tape' | 'caution' | 'cross' | 'outline';
interface CS { c: HTMLCanvasElement }
interface BP { words: string; look: BandLook; angle: number; y: number; color: string; ink: string; speed: number }

/** One band of a look: its angle (degrees), height and text size (px at a 1080 short side), which way its words scroll (-1 left,
 *  1 right), how far it is wiped in (0–1) and from which side, and what it is painted with: `fill` the band's colour (null: none),
 *  `text` the words' colour, `edges` what runs along its long edges. */
export interface Strip { angle: number; bh: number; fpx: number; dir: -1 | 1; wipe: number; from: 'left' | 'right'; fill: string | null; text: string; edges: 'none' | 'stripes' | 'lines'; edge: string }
/** The bands a look draws at `local`, in drawing order (the one on top last). A pure function of its arguments. */
export function bandStrips(look: BandLook, p: Pick<BP, 'angle' | 'color' | 'ink'>, local: number): Strip[] {
  const wipe = eOut3Clamped(local / 0.22), one = { angle: p.angle, bh: 62, fpx: 30, dir: -1 as const, wipe, from: 'left' as const, fill: p.color as string | null, text: p.ink, edges: 'none' as const, edge: p.ink };
  if (look === 'caution') return [{ ...one, bh: 104, fpx: 34, edges: 'stripes' }];
  if (look === 'outline') return [{ ...one, fill: null, text: p.color, edges: 'lines', edge: p.color }];
  if (look === 'cross') {
    // the second band, under the first: the opposite angle, the colours swapped, scrolling the other way, wiped in from the right a moment later
    return [{ ...one, angle: -p.angle, dir: 1, wipe: eOut3Clamped((local - 0.2) / 0.22), from: 'right', fill: p.ink, text: p.color }, one];
  }
  return [one];
}

/** a strip of diagonal stripes (`w` wide each, as far apart) across [x0, x1] × [y0, y0 + h], moved `shift` px along */
function stripes(g: G, x0: number, x1: number, y0: number, h: number, w: number, shift: number) {
  g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, h); g.clip(); g.beginPath();
  for (let x = x0 - h - 2 * w + (((shift % (2 * w)) + 2 * w) % (2 * w)); x < x1 + h; x += 2 * w) {
    g.moveTo(x, y0 + h); g.lineTo(x + w, y0 + h); g.lineTo(x + w + h, y0); g.lineTo(x + h, y0); g.closePath();
  }
  g.fill(); g.restore();
}

export const band: ItemType<BP, CS> = {
  type: 'common.band', label: '斜膠帶字', category: 'text', kind: 'overlay',
  doc: '斜過整個畫面的帶子，上面重複的粗斜體小字（words，結尾加「 / 」當分隔）一直捲動，開場刷進來；look 選帶子的樣子；angle 角度、y 中心高度；裝飾，不算字幕；KM BY KM、CITY BY CITY 這種節奏字，配 common.whoosh',
  variants: { param: 'look', list: [
    { value: 'tape', label: '色帶', doc: '一條 color 色的實心色帶，ink 色的字往左捲，開場從左邊刷進來；預設的節奏字膠帶' },
    { value: 'caution', label: '警示帶', doc: '比色帶粗一點的警示膠帶：color 色的底，上下兩緣各一排 ink 色的斜條紋跟著字一起捲，字在中間；施工中、注意、危險、限時、重大消息' },
    { value: 'cross', label: '交叉', doc: '兩條帶子交叉成 X：第二條角度相反、底和字的顏色對調（ink 底、color 字），字往右捲，稍晚從右邊刷進來；封鎖、禁止、衝突、兩件事撞在一起、熱鬧的開場' },
    { value: 'outline', label: '空心帶', doc: '沒有底色，只有帶子上下兩緣兩條 color 色的細線，中間是 color 色的字，畫面透得比較多；畫面很漂亮不想蓋住、比較輕的節奏字；ink 不用' },
  ] },
  params: [
    { key: 'words', label: '帶子上的字', type: 'string', default: 'KM BY KM / ' },
    { key: 'look', label: '樣子', type: 'enum', options: ['tape', 'caution', 'cross', 'outline'], default: 'tape' },
    { key: 'angle', label: '角度（度；cross 的第二條是相反角度）', type: 'number', min: -45, max: 45, step: 1, default: -10 },
    { key: 'y', label: '中心高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'color', label: '帶子顏色（outline 是線和字的顏色）', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'ink', label: '字色（caution 也是條紋，cross 也是第二條的底；outline 不用）', type: 'color', default: '#111111' },
    { key: 'speed', label: '捲動速度（以 1080 短邊計的 px／秒）', type: 'number', min: 0, max: 800, step: 10, default: 140 },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root) }),
  ready: () => fontsReady(''),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const L = Math.hypot(W, H);
    for (const b of bandStrips(p.look ?? 'tape', p, local)) {
      const bh = b.bh * u, run = L * b.wipe;
      g.save(); g.translate(W / 2, p.y * H); g.rotate((b.angle * Math.PI) / 180);
      g.beginPath(); g.rect(b.from === 'left' ? -L / 2 : L / 2 - run, -bh / 2, run, bh); g.clip();
      if (b.fill) { g.fillStyle = b.fill; g.fillRect(-L / 2, -bh / 2, L, bh); }
      const scroll = local * p.speed * u;
      if (b.edges === 'stripes') {   // the hazard stripes along both edges, moving with the words, a thin ink line inside each
        const sh = 0.2 * bh, w = 0.9 * sh;
        g.fillStyle = b.edge;
        stripes(g, -L / 2, L / 2, -bh / 2, sh, w, b.dir * scroll);
        stripes(g, -L / 2, L / 2, bh / 2 - sh, sh, w, b.dir * scroll);
        g.fillRect(-L / 2, -bh / 2 + sh, L, 2.5 * u); g.fillRect(-L / 2, bh / 2 - sh - 2.5 * u, L, 2.5 * u);
      } else if (b.edges === 'lines') {
        g.fillStyle = b.edge; g.fillRect(-L / 2, -bh / 2, L, 3 * u); g.fillRect(-L / 2, bh / 2 - 3 * u, L, 3 * u);
      }
      g.fillStyle = b.text; g.font = sans(b.fpx * u); spaced(g, 2 * u); g.textBaseline = 'middle'; g.textAlign = 'left';
      g.transform(1, 0, SLANT * 0.6, 1, 0, 0);
      // blank words: the band alone (an empty one measured 0 and was written at every px along it)
      const tw = Math.max(1, g.measureText(p.words).width);
      if (String(p.words ?? '').trim()) {
        const x0 = b.dir < 0 ? -L / 2 - (scroll % tw) : -L / 2 - tw + (scroll % tw);
        for (let x = x0; x < L / 2 + tw; x += tw) g.fillText(p.words, x, 2 * u);
      }
      spaced(g, 0); g.restore();
    }
  },
};
