// common.filmstrip, the black-and-white kit's (mono-kit.ts) page of two 35 mm film strips scrolling opposite ways, stills of the
// footage in their frames, sprocket holes and edge numbers. A pure function of time.
import { clamp, type ItemType, type SceneItem } from '@tellcut/engine';
import { canvasIn, rr } from './desk-kit.ts';
import { LATIN, fontsReady } from './mono-kit.ts';
import { imagesReady } from './window.ts';

/** the stills: source seconds, comma or space separated */
export const parseStillTimes = (text: unknown) => String(text ?? '').split(/[\s,，]+/).filter(Boolean).map(Number).filter(Number.isFinite);
/** strip `col` (0 left, scrolling up; 1 right, scrolling down): which still frame `k` of the strip shows, `scrolled` frames along */
export function stripStill(k: number, col: number, scrolled: number, n: number): number {
  if (n <= 0) return 0;
  const i = k + (col ? Math.floor(n / 2) - scrolled : scrolled);
  return ((i % n) + n) % n;
}

/** strip `col`'s frames `run` px scrolled: each frame's top (before the gap), its still and its edge number. The offset and the
 *  count of whole frames scrolled come from one floor, so they wrap together: the left strip (scrolling up) takes its offset as
 *  pitch − (run mod pitch), in (0, pitch], which is pitch, not 0, at a whole number of frames (a wrap a frame early there showed every
 *  frame one still on for that one picture). The edge number moves with the frame the way its still does (k + scrolled on the left,
 *  k − scrolled on the right), so it stays printed on its frame instead of stepping two a frame. */
export function stripFrames(run: number, pitch: number, col: number, n: number, H: number): Array<{ k: number; y: number; still: number; no: number }> {
  const into = ((run % pitch) + pitch) % pitch, off = col ? into : pitch - into, scrolled = Math.floor(run / pitch), out = [];
  for (let k = -2; k * pitch < H + pitch * 2; k++) out.push({ k, y: k * pitch + off - pitch, still: stripStill(k, col, scrolled, n), no: 21 + ((((k + (col ? -scrolled : scrolled) + col * 7) % 18) + 18) % 18) });
  return out;
}

interface SP { source: string; stills: string; label: string; speed: number; bg: string }
interface SS { c: HTMLCanvasElement; imgs: HTMLImageElement[]; key: string }
const stillOf = (source: string, t: number) => ({ source, t, w: 640 });
function makeImgs(ctx: { params: SP; media: { stillUrl(r: { source: string; t: number; w?: number }): string } }, s: SS) {
  const key = `${ctx.params.source}|${ctx.params.stills}`;
  if (s.key === key) return;
  s.imgs = ctx.params.source ? parseStillTimes(ctx.params.stills).map((t) => { const i = new Image(); i.src = ctx.media.stillUrl(stillOf(ctx.params.source, t)); return i; }) : [];
  s.key = key;
}

export const filmstrip: ItemType<SP, SS> = {
  type: 'common.filmstrip', label: '捲動的底片', category: 'frame', kind: 'scene',
  doc: '一頁兩條 35mm 底片，一條往上、一條往下捲（speed 是每秒捲過幾個畫面高），格子裡是素材（source）在 stills 那幾秒的靜止畫面（逗號分隔，輪流出現），兩邊齒孔、格與格之間有片號（label 加上格號 21A、22A…）；底色 bg；放在影片下面當整頁的底（layer: under），字幕疊在上面；回顧、「還有好多想記住的」、一趟旅行的總整理；選沒有原片燒字的畫面（整格不裁切）',
  params: [
    { key: 'source', label: '素材', type: 'source-ref', default: '' },
    { key: 'stills', label: '畫面（素材秒，逗號分隔）', type: 'string', default: '0' },
    { key: 'label', label: '片號前面的字', type: 'string', default: 'TC 400 · SAFETY FILM' },
    { key: 'speed', label: '捲動速度（畫面高／秒）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.09 },
    { key: 'bg', label: '底色', type: 'color', default: '#0b0b0b' },
  ],
  media(item: SceneItem) {
    const p = item.params as unknown as SP;
    return { videos: [], stills: p.source ? parseStillTimes(p.stills).map((t) => stillOf(p.source, t)) : [] };
  },
  build(ctx) { const s: SS = { c: canvasIn(ctx.root), imgs: [], key: '' }; makeImgs(ctx, s); return s; },
  ready(s) { return Promise.all([fontsReady('字'), imagesReady(s.imgs)]).then(() => undefined); },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    makeImgs(ctx, s);
    const { local, dur, W, H, params: p } = ctx, u = Math.min(W, H) / 1080;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = clamp(local / 0.15) * clamp((dur - local) / 0.15);
    g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
    const sw = Math.min(W, H) * 0.44, fw = sw * 0.76, fh = fw / 1.5, gap = sw * 0.14, pitch = fh + gap, n = s.imgs.length, run = local * p.speed * H;
    [0.265, 0.735].forEach((cx, col) => {
      const x0 = cx * W - sw / 2;
      g.fillStyle = '#1b1b1b'; g.fillRect(x0, 0, sw, H);
      for (const { y, still, no } of stripFrames(run, pitch, col, n, H)) {
        const fx = cx * W - fw / 2, fy = y + gap / 2;
        g.fillStyle = '#e9e6dd';   // sprocket holes down both margins
        for (let hole = 0; hole < 4; hole++) {
          const hy = y + (hole + 0.5) * (pitch / 4) - 7 * u;
          rr(g, x0 + sw * 0.035, hy, sw * 0.06, 14 * u, 3 * u); g.fill(); rr(g, x0 + sw * 0.905, hy, sw * 0.06, 14 * u, 3 * u); g.fill();
        }
        g.fillStyle = '#333'; g.fillRect(fx, fy, fw, fh);
        const img = n ? s.imgs[still] : null;
        if (img && img.complete && img.naturalWidth) {
          const ir = img.naturalWidth / img.naturalHeight, fr = fw / fh;
          let sx = 0, sy = 0, sWd = img.naturalWidth, sHt = img.naturalHeight;
          if (ir > fr) { sWd = sHt * fr; sx = (img.naturalWidth - sWd) / 2; } else { sHt = sWd / fr; sy = (img.naturalHeight - sHt) / 2; }
          g.drawImage(img, sx, sy, sWd, sHt, fx, fy, fw, fh);
        }
        const ly = fy + fh + gap * 0.25;
        g.fillStyle = '#f0c040'; g.font = `500 ${15 * u}px "${LATIN}", sans-serif`; g.textBaseline = 'middle';
        g.textAlign = 'left'; g.fillText(`${no}`, fx, ly); g.textAlign = 'right'; g.fillText(`${p.label} · ${no}A`, fx + fw, ly);
      }
    });
    g.globalAlpha = 1;
  },
};
