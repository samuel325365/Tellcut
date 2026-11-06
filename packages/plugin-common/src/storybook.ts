// A storybook kit, promoted 2026-11-06 from the Wes Anderson pilot film's fx.binocular / fx.cards (after the user's own Wes Anderson
// style film):
//   common.binocular   the picture blacked out but for two overlapping round windows opening (or one, a spyglass)
//   common.photostack  rounded photo cards sliding up one after another down a plain page, each with an italic label
// The titles are common.heading's look storybook (templates storybook, story-card on the backing frame, fin), the captions the template
// story-serif; the colour blocks above and below a shot are common.backdrop solid under a clip in a 16:9 frame. Pure functions of time.
import { clamp, type ItemType, type SceneItem } from '@tellcut/engine';

const eOut = (q: number) => 1 - Math.pow(1 - clamp(q), 3);
type G = CanvasRenderingContext2D;

function canvasIn(root: HTMLElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
  root.appendChild(c);
  return c;
}
const sized = (c: HTMLCanvasElement, W: number, H: number) => { if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } return c.getContext('2d')!; };

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
  doc: '透過望遠鏡看：畫面蓋上 color 色（預設黑），只留兩個並排、互相重疊的圓窗（shape binocular 雙筒；spyglass 一個圓、單筒），窗邊柔和，開場 open 秒內從小張開；cx、cy 是中心（畫面比例）、r 半徑（畫面寬比例）、overlap 兩圓重疊多少（半徑的比例）；圓窗要對準主角：移 cy／cx，比改片段的 crop 好對；字幕放在圓窗下面的黑底上；偷看、發現、遠遠看到（牆上的貓、遠處的鳥、對面的人），故事書風、Wes Anderson 風的旅行片',
  params: [
    { key: 'shape', label: '樣式（binocular 雙筒、spyglass 單筒）', type: 'enum', options: ['binocular', 'spyglass'], default: 'binocular' },
    { key: 'cx', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'cy', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'r', label: '圓的半徑（畫面寬比例）', type: 'number', min: 0.05, max: 0.6, step: 0.01, default: 0.27 },
    { key: 'overlap', label: '兩圓重疊（半徑的比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'color', label: '圓窗外的顏色', type: 'color', default: '#000000' },
    { key: 'open', label: '張開要幾秒（0＝一開始就張開）', type: 'number', min: 0, max: 3, step: 0.05, default: 0.45 },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root) }),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, g = sized(s.c, W, H);
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over'; g.fillStyle = p.color; g.fillRect(0, 0, W, H);
    const r = p.r * W * (p.open > 0 ? 0.6 + 0.4 * eOut(local / p.open) : 1), cy = p.cy * H;
    g.globalCompositeOperation = 'destination-out';
    for (const cx of windowCentres(p.shape, p.cx * W, r, p.overlap)) {
      const grad = g.createRadialGradient(cx, cy, r * 0.9, cx, cy, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  },
};

// ── common.photostack
/** "source|seconds|label|fx,fy" lines */
export function parseCards(text: string): Array<{ source: string; t: number; label: string; fx: number; fy: number }> {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [source, t, label, f] = l.split('|'), [fx, fy] = String(f || '0.5,0.5').split(',').map(Number);
    return { source: source.trim(), t: Number(t) || 0, label: (label ?? '').trim(), fx: Number.isFinite(fx) ? fx : 0.5, fy: Number.isFinite(fy) ? fy : 0.5 };
  });
}
/** how far card `i` has slid in at `local` (0–1), one every `every` seconds over 0.4 s */
export const cardIn = (local: number, i: number, every: number) => eOut((local - i * every) / 0.4);

function rounded(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function cover(g: G, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, fx = 0.5, fy = 0.5) {
  if (!img || !img.complete || !img.naturalWidth) { g.fillStyle = '#555'; g.fillRect(x, y, w, h); return; }
  const ir = img.naturalWidth / img.naturalHeight, br = w / h;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (ir > br) sw = sh * br; else sh = sw / br;
  const sx = clamp(fx * img.naturalWidth - sw / 2, 0, img.naturalWidth - sw), sy = clamp(fy * img.naturalHeight - sh / 2, 0, img.naturalHeight - sh);
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

interface PP { cards: string; every: number; bg: string; edge: string; label: string; top: number; w: number; aspect: number }
interface PS { c: HTMLCanvasElement; cards: Array<{ img: HTMLImageElement; label: string; fx: number; fy: number }>; text: string }
export const photostack: ItemType<PP, PS> = {
  type: 'common.photostack', label: '相片卡疊', category: 'frame', kind: 'scene',
  doc: '素色頁（bg）上由上往下疊幾張圓角相片卡：cards「素材|秒|標籤|fx,fy」一行一張（影片取那一秒的畫面），每 every 秒滑上來一張，細邊框（edge）、柔和陰影，右下角一行斜體標籤（label 色，英文小寫最好看）；w 卡片寬、aspect 高寬比、top 第一張的上緣，三張以上把 w、aspect 調小，讓最後一張停在字幕上方；放在沒有影片的那段（layer under）；一天裡吃的、喝的、看到的幾樣東西一次排出來，故事書風、Wes Anderson 風的旅行片，配 common.shutter',
  params: [
    { key: 'cards', label: '相片（素材|秒|標籤|fx,fy，一行一張）', type: 'text', default: '' },
    { key: 'every', label: '每幾秒上一張', type: 'number', min: 0.1, max: 5, step: 0.05, default: 0.6 },
    { key: 'bg', label: '底色', type: 'color', default: '#000000' },
    { key: 'edge', label: '邊框顏色', type: 'color', default: '#8a5a3c' },
    { key: 'label', label: '標籤顏色', type: 'color', default: '#e8b13c', theme: 'palette.accent' },
    { key: 'top', label: '第一張的上緣（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.11 },
    { key: 'w', label: '卡片寬（畫面寬比例）', type: 'number', min: 0.2, max: 1, step: 0.01, default: 0.7 },
    { key: 'aspect', label: '卡片高寬比', type: 'number', min: 0.2, max: 2, step: 0.01, default: 0.5 },
  ],
  media: (item: SceneItem) => ({ videos: [], stills: parseCards((item.params as Partial<PP>).cards ?? '').map((c) => ({ source: c.source, t: c.t, w: 1080 })) }),
  build(ctx) {
    const cards = parseCards(ctx.params.cards);
    return { c: canvasIn(ctx.root), cards: cards.map((c) => ({ img: Object.assign(new Image(), { src: ctx.media.stillUrl({ source: c.source, t: c.t, w: 1080 }) }), label: c.label, fx: c.fx, fy: c.fy })), text: cards.map((c) => c.label).join('') };
  },
  ready: (s) => Promise.all([document.fonts.load('italic 400 40px "Playfair Display"', s.text || 'az'),
    ...s.cards.map((c) => (c.img.complete ? Promise.resolve() : c.img.decode().catch(() => undefined)))]).then(() => undefined),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = W / 1080, g = sized(s.c, W, H);
    g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
    const cw = p.w * W, ch = cw * p.aspect, gap = 30 * u, x = (W - cw) / 2, r = 22 * u, b = 5 * u;
    s.cards.forEach((c, i) => {
      const q = cardIn(local, i, p.every);
      if (q <= 0) return;
      const y = p.top * H + i * (ch + gap) + (1 - q) * 60 * u;
      g.save(); g.globalAlpha = q;
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 18 * u; g.shadowOffsetY = 6 * u;
      rounded(g, x, y, cw, ch, r); g.fillStyle = p.edge; g.fill();
      g.shadowColor = 'transparent';
      g.save(); rounded(g, x + b, y + b, cw - 2 * b, ch - 2 * b, r - 4 * u); g.clip(); cover(g, c.img, x + b, y + b, cw - 2 * b, ch - 2 * b, c.fx, c.fy); g.restore();
      if (c.label) {
        // a small ornament on the photo, not a caption: not reported to check
        g.font = `italic 400 ${34 * u}px "Playfair Display", "Noto Serif TC", serif`; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
        g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = 8 * u; g.fillStyle = p.label; g.fillText(c.label, x + cw - 34 * u, y + ch - 30 * u);
      }
      g.restore();
    });
  },
};
