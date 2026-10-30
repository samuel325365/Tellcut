// common.dachshund — Tellcut's own dog (spec 2026-10-30-showcase-films §1): the logo's black and cream dachshund with a film-strip
// body, drawn on a canvas from the shapes in dachshund.ts and moved part by part about their pivots. It walks across, wags, tilts
// its head, sits, or cuts itself in two along a slanted line and closes again; the band between the sprocket holes can show
// frames of a source, scrolling like film. It does not fade: one action per item, chained item after item, and it comes and goes
// by walking in or out of the frame. The agent never picks it on its own (onRequest): only when the user asks for the dog.
import { clamp, cssCamel, eIO3, eOut3, type ItemType, lerp, prog } from '@tellcut/engine';
import { DOG_BAND, DOG_COLORS, DOG_PIVOTS, DOG_SHAPES, type DogLook, type DogPart } from './dachshund.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { imagesReady, stillRef } from './window.ts';

type Action = 'walk' | 'wag' | 'tilt' | 'sit' | 'cut' | 'idle';
interface P { action: Action; x0: number; x1: number; y: number; size: number; facing: 'right' | 'left'; look: DogLook; steps: number; source: string; times: string; scroll: number; cutAt: number }
interface S { cv: HTMLCanvasElement; imgs: HTMLImageElement[]; key: string }
/** a pose: angles in degrees about each part's pivot; body turns the rear about the front hip (below 0 the rear goes down);
 *  bob lifts everything but the legs, split parts the two halves of a cut (both in the dog's own 160×80 units) */
export interface DogPose { frontLeg: number; backLeg: number; tail: number; head: number; body: number; bob: number; split: number; fold: number }

const FRAMES = DOG_BAND.count, STEP_T = 1.5, STILL_W = 360;
/** the front hip, which a sitting dog turns its body about */
const HIP = DOG_PIVOTS.frontLeg;
/** the cut's slanted line: x at the top of the box and at the bottom */
const CUT_TOP = 72, CUT_BOTTOM = 66;

/** the source's moments for the band: the given seconds first (at most five), then on from the last every 1.5 s; with the
 *  source's length, each wraps round inside it (a still past the end makes the export fail) */
export function frameTimes(times: string, duration?: number): number[] {
  const given = String(times ?? '').split(/[,，\s]+/).map(Number).filter((x) => Number.isFinite(x) && x >= 0).slice(0, FRAMES);
  const out = [...given];
  while (out.length < FRAMES) out.push(out.length ? out[out.length - 1] + STEP_T : 0);
  const room = (duration ?? 0) - 1 / 30;
  return duration && Number.isFinite(duration) ? out.map((t) => (room > 0 ? +(t % room).toFixed(3) : 0)) : out;
}

/** which way the dog looks: a walking dog always faces the way it goes (`facing: 'left'` with x0 < x1 walked backwards); standing,
 *  or walking on the spot, it looks where `facing` says */
export const facingOf = (p: Pick<P, 'action' | 'x0' | 'x1' | 'facing'>): 'right' | 'left' =>
  p.action === 'walk' && p.x1 !== p.x0 ? (p.x1 < p.x0 ? 'left' : 'right') : p.facing === 'left' ? 'left' : 'right';

/** the pose at `local` seconds into the item */
export function dogPose(action: Action, local: number, o: { steps: number; cutAt: number }): DogPose {
  const pose: DogPose = { frontLeg: 0, backLeg: 0, tail: 0, head: 0, body: 0, bob: 0, split: 0, fold: 1 }, TAU = Math.PI * 2;
  if (action === 'walk') {
    const ph = TAU * o.steps * local;
    Object.assign(pose, { frontLeg: 18 * Math.sin(ph), backLeg: -18 * Math.sin(ph), tail: 10 * Math.sin(2 * ph), bob: 1.5 * Math.abs(Math.sin(ph)) });
  } else if (action === 'wag') pose.tail = 25 * Math.sin(TAU * 3 * local);
  else if (action === 'tilt') pose.head = -12 * (eIO3(prog(local, 0.3, 0.6)) - eIO3(prog(local, 1.4, 1.7)));
  else if (action === 'sit') {
    const s = eIO3(prog(local, 0.2, 0.8));
    // the rear drops onto its folded back leg (about 6 units), the head stays level
    Object.assign(pose, { body: -5 * s, head: 5 * s, fold: 1 - 0.65 * s, tail: 8 * s * Math.sin(TAU * 2 * local) });
  } else if (action === 'cut') pose.split = 4.5 * (eOut3(prog(local, o.cutAt, o.cutAt + 0.12)) - eIO3(prog(local, o.cutAt + 0.35, o.cutAt + 0.6)));
  if (action === 'idle' || action === 'cut') pose.tail = 6 * Math.sin(TAU * 1.2 * local);
  return pose;
}

const PATHS = new Map<string, Path2D>();
const path2d = (d: string) => { let p = PATHS.get(d); if (!p) { p = new Path2D(d); PATHS.set(d, p); } return p; };
const HOLES = DOG_SHAPES.filter((s) => s.role === 'hole').map((s) => s.d).join(' ');
/** how far a part rises with the walk's bob: everything but the legs, so both feet stay on the ground */
export const bobOf = (part: DogPart, pose: DogPose) => (part === 'frontLeg' || part === 'backLeg' ? 0 : pose.bob);
const rad = (deg: number) => (deg * Math.PI) / 180;
const turn = (g: CanvasRenderingContext2D, [x, y]: readonly [number, number], deg: number) => { if (!deg) return; g.translate(x, y); g.rotate(rad(deg)); g.translate(-x, -y); };

/** how each part is placed: the rear (all but the front leg) turns with the body, then the part about its own pivot */
function place(g: CanvasRenderingContext2D, part: DogPart, pose: DogPose) {
  if (part !== 'frontLeg') turn(g, HIP, pose.body);
  g.translate(0, -bobOf(part, pose));
  if (part === 'tail') turn(g, DOG_PIVOTS.tail, pose.tail);
  else if (part === 'backLeg') { turn(g, DOG_PIVOTS.backLeg, pose.backLeg); if (pose.fold !== 1) { const [x, y] = DOG_PIVOTS.backLeg; g.translate(x, y); g.scale(1, pose.fold); g.translate(-x, -y); } }
  else if (part === 'frontLeg') turn(g, DOG_PIVOTS.frontLeg, pose.frontLeg);
  else if (part === 'head') turn(g, DOG_PIVOTS.head, pose.head);
}

/** a frame of footage, covering its box */
function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth, ih = img.naturalHeight, k = Math.max(w / iw, h / ih), sw = w / k, sh = h / k;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** the frames in the band, scrolling `scroll` frames a second (film runs right to left) */
function drawBand(g: CanvasRenderingContext2D, imgs: HTMLImageElement[], local: number, scroll: number) {
  const ok = imgs.filter((i) => i.complete && i.naturalWidth > 0);
  if (!ok.length) return;
  const { x, y, w, h, count, gap } = DOG_BAND, fw = (w - gap * (count - 1)) / count, step = fw + gap, moved = local * scroll;
  const off = (moved - Math.floor(moved)) * step, first = Math.floor(moved);
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let i = 0; i <= count; i++) cover(g, ok[(first + i) % ok.length], x + i * step - off, y, fw, h);
  g.restore();
}

function drawDog(g: CanvasRenderingContext2D, look: DogLook, pose: DogPose, imgs: HTMLImageElement[], local: number, scroll: number) {
  const c = DOG_COLORS[look];
  for (const s of DOG_SHAPES) {
    if (s.role === 'hole') continue;
    g.save();
    place(g, s.part, pose);
    g.fillStyle = c[s.role];
    // the body with its sprocket holes cut out (what is behind shows through), then the frames in its band
    if (s.part === 'body' && s.role === 'body') { g.fill(path2d(`${s.d} ${HOLES}`), 'evenodd'); drawBand(g, imgs, local, scroll); }
    else g.fill(path2d(s.d));
    g.restore();
  }
}

/** the dog in the canvas: both halves of a cut, each clipped to its side of the slanted line and moved out by `split` */
function drawCut(g: CanvasRenderingContext2D, look: DogLook, pose: DogPose, imgs: HTMLImageElement[], local: number, scroll: number) {
  if (pose.split <= 0) { drawDog(g, look, pose, imgs, local, scroll); return; }
  const at = (y: number) => CUT_TOP + ((CUT_BOTTOM - CUT_TOP) * y) / 80, top = -100, bottom = 180;
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * pose.split, 0);   // first: the half's edge moves out with it, so the gap shows
    g.beginPath();
    if (side < 0) { g.moveTo(-100, top); g.lineTo(at(top), top); g.lineTo(at(bottom), bottom); g.lineTo(-100, bottom); }
    else { g.moveTo(at(top), top); g.lineTo(300, top); g.lineTo(300, bottom); g.lineTo(at(bottom), bottom); }
    g.closePath(); g.clip();
    drawDog(g, look, pose, imgs, local, scroll);
    g.restore();
  }
}

/** load the band's stills when the source or the times change */
function loadStills(ctx: { params: P; project: { sources: Record<string, { duration: number }> }; media: { stillUrl(r: { source: string; t: number; w: number }): string } }, s: S) {
  const p = ctx.params, duration = ctx.project.sources[p.source]?.duration, key = p.source ? `${p.source}|${p.times}|${duration}` : '';
  if (key === s.key) return;
  s.key = key;
  s.imgs = p.source ? frameTimes(p.times, duration).map((t) => { const img = new Image(); img.src = ctx.media.stillUrl(stillRef({ source: p.source, t }, STILL_W)); return img; }) : [];
}

export const dachshund: ItemType<P, S> = {
  type: 'common.dachshund', label: '臘腸狗', category: 'moment', kind: 'overlay', onRequest: true,
  doc: 'Tellcut 的臘腸狗：黑配奶油色、身體是一條底片，會走路、搖尾巴、歪頭、坐下、用身體把片段剪開；底片格子裡可以放影片畫面。只有使用者要 Tellcut 臘腸狗時才用',
  params: [
    { key: 'action', label: '動作（walk 走路、wag 搖尾巴、tilt 歪頭、sit 坐下、cut 剪開、idle 站著）', type: 'enum', options: ['walk', 'wag', 'tilt', 'sit', 'cut', 'idle'], default: 'walk' },
    { key: 'x0', label: '起點 x（身體中心，畫面寬比例；不走路時就站在這裡）', type: 'number', min: -0.5, max: 1.5, step: 0.01, default: 0.2 },
    { key: 'x1', label: '終點 x（走路時，畫面寬比例；比起點小就往左走、面向左）', type: 'number', min: -0.5, max: 1.5, step: 0.01, default: 0.8 },
    { key: 'y', label: '腳底的位置（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.78 },
    { key: 'size', label: '大小（狗所在方框的寬，畫面寬 %；狗從尾巴到鼻尖約佔方框的 88%）', type: 'number', min: 5, max: 100, step: 0.5, default: 36 },
    { key: 'facing', label: '朝向（不走路時；走路時一律面向前進的方向）', type: 'enum', options: ['right', 'left'], default: 'right' },
    { key: 'look', label: '樣子（light 黑狗、dark 奶油色的狗，給深色底）', type: 'enum', options: ['light', 'dark'], default: 'light' },
    { key: 'steps', label: '每秒走幾步', type: 'number', min: 0.5, max: 6, step: 0.1, default: 2.2 },
    { key: 'source', label: '底片格子裡放哪個素材（空＝沒有畫面）', type: 'string', default: '' },
    { key: 'times', label: '格子放素材的哪幾秒（逗號分開；不足五個就從最後一個每 1.5 秒往後取）', type: 'string', default: '' },
    { key: 'scroll', label: '格子每秒捲動幾格', type: 'number', min: 0, max: 3, step: 0.1, default: 1 },
    { key: 'cutAt', label: '剪開的時間（秒，相對項目開始；cut）', type: 'number', min: 0, max: 600, step: 0.05, default: 1 },
  ],
  media(item, project) {
    const p = item.params as Partial<P>;
    return { videos: [], stills: p.source ? frameTimes(p.times ?? '', project?.sources?.[p.source]?.duration).map((t) => stillRef({ source: p.source!, t }, STILL_W)) : [] };
  },
  build(ctx) {
    const cv = document.createElement('canvas');
    ctx.root.appendChild(cv);
    cssCamel(cv, { position: 'absolute' });
    const s: S = { cv, imgs: [], key: '' };
    loadStills(ctx, s);   // starts loading now, so ready() can wait for them
    return s;
  },
  ready: (s) => imagesReady(s.imgs),
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur } = ctx;
    loadStills(ctx, s);
    const L = (clamp(p.size, 5, 100) / 100) * W, k = L / 160, cw = Math.ceil(L * 1.2), ch = Math.ceil(L * 0.62);
    const cx = (p.action === 'walk' ? lerp(p.x0, p.x1, clamp(local / Math.max(dur, 0.01))) : p.x0) * W, feet = p.y * H;
    cssCamel(s.cv, { left: `${cx - cw / 2}px`, top: `${feet - ch * 0.9}px`, width: `${cw}px`, height: `${ch}px` });
    const g = canvasAt(s.cv, cw, ch);
    g.save();
    g.translate(cw / 2, ch * 0.9);
    if (facingOf(p) === 'left') g.scale(-1, 1);
    g.scale(k, k);
    g.translate(-85, -66);   // the dog's middle, and the soles of its feet
    drawCut(g, p.look === 'dark' ? 'dark' : 'light', dogPose(p.action, local, { steps: p.steps, cutAt: p.cutAt }), s.imgs, local, p.scroll);
    g.restore();
  },
};
