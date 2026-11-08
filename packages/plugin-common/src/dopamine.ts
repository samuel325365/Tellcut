// A Dopamine Colors kit, promoted 2026-11-06 from the Dopamine Colors pilot film's fx.popcard / fx.sticker (after the user's own
// Dopamine Colors style film):
//   common.popcard  a tilted white photo card with a black line and an offset colour shadow that pops in and plays its own shots (each
//                   with an item pill on a corner), or holds a still
//   common.sticker  a flat sticker (heart, bolt, star, smiley) with a thick ink line and a hard shadow, popping in and wobbling
// The page is common.backdrop's pattern words (with bits), the section wipe common.wipe's mode stripes, the titles common.heading's
// look pop (templates pop, pop-no), "No.1" common.badge's shape box, the captions the template pop-box. Pure functions of time.
import { clamp, cssCamel, h, type ItemType, type MediaRef, type Project, type SceneItem } from '@tellcut/engine';
import { cropOf } from './cells.ts';

const lerp = (a: number, b: number, q: number) => a + (b - a) * q;

/** a springy pop: 0 before `at`, then 0→1 with a little overshoot (an underdamped spring of about `dur` s) */
export function popAt(local: number, at: number, dur = 0.42): number {
  const t = local - at;
  if (t <= 0) return 0;
  const w = (2 * Math.PI) / dur, z = 0.38;
  return 1 - Math.exp(-z * w * t) * Math.cos(w * Math.sqrt(1 - z * z) * t);
}

// ── common.popcard
export interface Shot { t: number; source: string; from: number; crop: { x: number; y: number; zoom: number }; label: string; still: boolean; len: number }
/** "seconds|source|from|x,y,zoom|label|still" lines: seconds from the item's start, each shot running until the next (the last to `dur`);
 *  a line with no source is dropped before the lengths are worked out, so the shot before it plays on instead of freezing */
export function parseShots(text: string, dur: number): Shot[] {
  const shots = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [t, source = '', from, crop, label = '', still] = l.split('|').map((x) => x.trim());
    const [x, y, zoom] = String(crop ?? '').split(',').map((v) => v.trim());
    return { t: Number(t) || 0, source, from: Number(from) || 0, crop: cropOf({ x, y, zoom }), label, still: still === 'still', len: 0 };
  }).filter((s) => s.source).sort((a, b) => a.t - b.t);
  shots.forEach((s, i) => { s.len = Math.max(0.05, (i + 1 < shots.length ? shots[i + 1].t : dur) - s.t); });
  return shots;
}
const shotRef = (s: Shot): MediaRef => ({ source: s.source, in: s.from, out: s.from + s.len, speed: 1, interp: 'none' });
/** the shot showing at `local`, and the first of the run of shots before it that share its label (its pill pops once, at that one) */
export function shotAt(shots: Shot[], local: number): { i: number; labelFrom: number } {
  let i = 0;
  shots.forEach((s, j) => { if (local >= s.t) i = j; });
  let j = i;
  while (j > 0 && shots[j - 1].label === shots[i]?.label) j--;
  return { i, labelFrom: j };
}

interface PP { shots: string; x: number; y: number; w: number; h: number; tilt: number; shadow: string; pill: string; pillInk: string; pillSide: 'left' | 'right'; ink: string; paper: string; popAt: number }
interface PS { wrap: HTMLElement; shade: HTMLElement; card: HTMLElement; box: HTMLElement; pill: HTMLElement; shots: Shot[]; imgs: Array<HTMLImageElement | null>; text: string }
const SERIF = "'Noto Serif TC', serif";

export const popcard: ItemType<PP, PS> = {
  type: 'common.popcard', label: '彈出相片卡', category: 'frame', kind: 'overlay',
  doc: '一張微斜的白色相片卡（ink 色細框、右下一塊錯開的 shadow 色陰影）彈進來，卡裡自己播鏡頭：shots 一行一個「秒|素材|素材秒|x,y,zoom|標籤|still」（秒從項目開始算，播到下一行；x,y,zoom 是裁切；still 是停格），換鏡頭時卡片輕輕一跳；標籤是卡片左上角（pillSide right 右上）一顆 pill 色膠囊，標籤換了才彈一次；x、y、w、h 是卡片的框（畫面比例）、tilt 傾斜；整頁都是卡片時主軌不放片段，底下用 common.backdrop（pattern words 字牆）；好物清單、開箱、穿搭、一樣一樣介紹（多巴胺配色，配 common.sticker、common.badge 的 box、標題範本 pop）；幾張小卡並排就是最後的總覽',
  params: [
    { key: 'shots', label: '鏡頭（秒|素材|素材秒|x,y,zoom|標籤|still，一行一個）', type: 'text', default: '' },
    { key: 'x', label: '左緣（畫面寬比例）', type: 'number', min: -0.5, max: 1, step: 0.005, default: 0.11 },
    { key: 'y', label: '上緣（畫面高比例）', type: 'number', min: -0.5, max: 1, step: 0.005, default: 0.25 },
    { key: 'w', label: '寬（畫面寬比例）', type: 'number', min: 0.05, max: 1.2, step: 0.005, default: 0.78 },
    { key: 'h', label: '高（畫面高比例）', type: 'number', min: 0.05, max: 1.2, step: 0.005, default: 0.5 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -30, max: 30, step: 0.5, default: -2 },
    { key: 'shadow', label: '錯開的陰影顏色', type: 'color', default: '#3b4cf0', theme: 'palette.accent' },
    { key: 'pill', label: '標籤膠囊顏色', type: 'color', default: '#c6f03a', theme: 'palette.hl' },
    { key: 'pillInk', label: '標籤字色', type: 'color', default: '#111111', theme: 'palette.ink' },
    { key: 'pillSide', label: '標籤在哪個角（left 左上、right 右上）', type: 'enum', options: ['left', 'right'], default: 'left' },
    { key: 'ink', label: '框線顏色', type: 'color', default: '#111111', theme: 'palette.ink' },
    { key: 'paper', label: '卡片顏色', type: 'color', default: '#ffffff' },
    { key: 'popAt', label: '彈進來（秒）', type: 'number', min: 0, max: 30, step: 0.05, default: 0 },
  ],
  media(item: SceneItem) {
    const shots = parseShots(String((item.params as Partial<PP>).shots ?? ''), item.end - item.start);
    return { videos: shots.filter((s) => !s.still).map(shotRef), stills: shots.filter((s) => s.still).map((s) => ({ source: s.source, t: s.from, w: 1080 })) };
  },
  build(ctx) {
    const wrap = h('div', null, null, ctx.root), shade = h('div', null, null, wrap), card = h('div', null, null, wrap), box = h('div', null, null, card), pill = h('div', null, null, wrap);
    cssCamel(wrap, { position: 'absolute', pointerEvents: 'none' });
    cssCamel(shade, { position: 'absolute', boxSizing: 'border-box' });
    cssCamel(card, { position: 'absolute', inset: '0', boxSizing: 'border-box' });
    cssCamel(box, { position: 'absolute', overflow: 'hidden', background: '#222' });
    cssCamel(pill, { position: 'absolute', whiteSpace: 'nowrap', fontFamily: SERIF, fontWeight: '900', lineHeight: '1.1', boxSizing: 'border-box' });
    const shots = parseShots(ctx.params.shots, ctx.dur);
    const imgs = shots.map((s) => {
      if (!s.still) return null;
      const im = h('img', null, null, box) as HTMLImageElement;
      im.src = ctx.media.stillUrl({ source: s.source, t: s.from, w: 1080 });
      cssCamel(im, { position: 'absolute', display: 'none' });
      return im;
    });
    return { wrap, shade, card, box, pill, shots, imgs, text: shots.map((s) => s.label).join('') };
  },
  ready: (s) => Promise.all([document.fonts.load(`900 40px 'Noto Serif TC'`, s.text || '標'),
    ...s.imgs.map((im) => (im && !im.complete ? im.decode().catch(() => undefined) : Promise.resolve()))]).then(() => undefined),
  draw(ctx, s) {
    const { local, W, H, params: p, media, project } = ctx, k = Math.min(W, H) / 1080, pop = clamp(popAt(local, p.popAt), 0, 1.2);
    const { i, labelFrom } = shotAt(s.shots, local), shot = s.shots[i];
    const bump = i > 0 && shot ? 1 - 0.035 * Math.sin(Math.PI * clamp((local - shot.t) / 0.2)) : 1;
    const cw = p.w * W, ch = p.h * H, line = 5 * k, pad = 16 * k, off = 18 * k, rad = 20 * k;
    cssCamel(s.wrap, { left: `${(p.x * W).toFixed(2)}px`, top: `${(p.y * H).toFixed(2)}px`, width: `${cw.toFixed(2)}px`, height: `${ch.toFixed(2)}px`, display: pop > 0.001 ? 'block' : 'none',
      transform: `rotate(${(p.tilt + (1 - Math.min(1, pop)) * -8).toFixed(3)}deg) scale(${(lerp(0.5, 1, pop) * bump).toFixed(4)})`, opacity: String(clamp(pop * 3)) });
    cssCamel(s.shade, { left: `${off}px`, top: `${off}px`, width: `${cw}px`, height: `${ch}px`, background: p.shadow, border: `${line}px solid ${p.ink}`, borderRadius: `${rad}px` });
    cssCamel(s.card, { background: p.paper, border: `${line}px solid ${p.ink}`, borderRadius: `${rad}px` });
    const bw = cw - 2 * (pad + line), bh = ch - 2 * (pad + line);
    cssCamel(s.box, { left: `${pad}px`, top: `${pad}px`, width: `${bw}px`, height: `${bh}px`, borderRadius: `${rad * 0.5}px` });
    s.imgs.forEach((im, j) => { if (im) cssCamel(im, { display: j === i ? 'block' : 'none' }); });
    if (shot) {
      const src = (project as Project).sources?.[shot.source] as { width?: number; height?: number } | undefined;
      const img = s.imgs[i];
      if (img) media.place(img as unknown as HTMLVideoElement, bw, bh, shot.crop, src?.width, src?.height);
      else { const v = media.video(shotRef(shot), s.box, clamp(local - shot.t, 0, shot.len - 0.04), false); media.place(v, bw, bh, shot.crop, src?.width, src?.height); }
    }
    const label = shot?.label ?? '', fs = 44 * k, lp = clamp(popAt(local, Math.max(p.popAt + 0.2, s.shots[labelFrom]?.t ?? 0), 0.35), 0, 1.2), left = p.pillSide !== 'right';
    s.pill.textContent = label;
    cssCamel(s.pill, { display: label ? 'block' : 'none', fontSize: `${fs.toFixed(2)}px`, color: p.pillInk, background: p.pill, border: `${4 * k}px solid ${p.ink}`, borderRadius: `${fs}px`,
      padding: `${0.18 * fs}px ${0.6 * fs}px ${0.22 * fs}px`, top: `${-0.55 * fs}px`, left: left ? `${-0.04 * cw}px` : 'auto', right: left ? 'auto' : `${-0.04 * cw}px`,
      transform: `rotate(${left ? -4 : 4}deg) scale(${lp.toFixed(4)})`, transformOrigin: left ? '0% 50%' : '100% 50%' });
  },
};

// ── common.sticker
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

export const sticker: ItemType<SP, SS> = {
  type: 'common.sticker', label: '扁平貼紙', category: 'mark', kind: 'overlay',
  doc: '一張扁平的小貼紙：heart 愛心、bolt 閃電、star 星星、smile 笑臉（腮紅、彎彎的嘴），黑色粗框（ink）、往右下錯開的實心影子，從斜斜的小一點彈出來，貼好後輕輕晃；x、y 中心、size 寬（畫面寬比例）；貼在卡片角落、標題旁邊（多巴胺配色的開箱、清單、Vlog，配 common.popcard；有字的爆炸貼紙用 common.burst 的 shadow，游標用 common.touch 的 cursor）',
  params: [
    { key: 'shape', label: '形狀（heart 愛心、bolt 閃電、star 星星、smile 笑臉）', type: 'enum', options: ['heart', 'bolt', 'star', 'smile'], default: 'heart' },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.8 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.7 },
    { key: 'size', label: '大小（畫面寬比例）', type: 'number', min: 0.02, max: 0.6, step: 0.005, default: 0.12 },
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
    const pop = popAt(local, p.popAt, 0.4), k = Math.min(W, H) / 1080;
    if (pop <= 0.001) return;
    const r = (p.size * W) / 2, wob = local - p.popAt > 0.4 ? Math.sin((local - p.popAt) * 4.2) * 4 : 0;
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
