// common.postcard — a travel journal told as postcards on a wooden desk (promoted from the uk-postcard short's fx.postcard). One
// item is one stop: the card slides (or flips) in over the pile of the cards before it, a stamp sits in its corner with a picture of
// that stop, a postmark (place + date) thumps down, and the narration is written on it by hand, character by character, in time with
// the voice. While the card is settled its picture window is a hole (window.ts): the clip on the main track, whose `frame` is
// postcardWindow(), plays through it; while the card moves the window shows a still of that clip. The last item can turn its card over
// and spread every card out on the desk. Everything is DOM text, a pure function of the item's local time.
import { abs, clamp, cssCamel, eIO3, eOut3, h, type ItemType, type MediaApi } from '@tellcut/engine';
import { drawTexts, handFamily, LATIN, textLayer, writeTime, type TextLayer, type Txt } from './hand.ts';
import { parseSentences } from './handwrite.ts';
import { drawMark, drawStamp, hash, markEl, SERIF, stampEl, type Mark, type MarkEl, type StampEl, type StampSpec } from './postmark.ts';
import { asFrame, imagesReady, punch, showStill, stillRef, windowEl, type Still, type Win } from './window.ts';
import { freeCanvas } from './inkline.ts';

type Orient = 'portrait' | 'landscape';
type Rect = [number, number, number, number];
/** card geometry in card pixels (a 1080 × 1920 frame); `at` is the settled top-left */
export const POSTCARD_LAYOUT = {
  portrait: {
    w: 940, h: 1330, at: [70, 150], win: [30, 30, 880, 1000] as Rect,
    stamp: [775, 1062, 140, 170], mark: [724, 1206, 74],
    lines: { x: 52, base: [1118, 1196, 1274], size: 54 },
    back: { header: [56, 158], stamp: [775, 46, 140, 170], mark: [712, 196, 74], lines: { x: 64, base: [440, 552, 664], size: 70 },
      sig: [880, 760], divider: 830, address: { x0: 440, x1: 884, base: [960, 1060, 1160], size: 54 } },
  },
  landscape: {
    w: 1000, h: 800, at: [40, 520], win: [30, 30, 940, 529] as Rect,
    stamp: [840, 590, 128, 160], mark: [792, 704, 66],
    lines: { x: 52, base: [652, 732], size: 54 },
    back: { header: [50, 120], stamp: [830, 40, 140, 170], mark: [700, 170, 66], lines: { x: 56, base: [330, 420], size: 64 },
      sig: [940, 500], divider: 560, address: { x0: 470, x1: 950, base: [640, 720], size: 50 } },
  },
};

export interface Line { text: string; t0?: number; t1?: number }
export interface Card {
  index: number; orient: Orient; show?: 'front' | 'back';
  front?: { enter?: Still; exit?: Still & { stampCrop?: Still['crop'] }; open?: number; stamp: StampSpec; mark?: Mark; lines?: Line[] };
  back?: { lines?: Line[]; address?: Line[]; sig?: Line; mark?: Mark; stamp?: StampSpec; header?: string; sub?: string };
  flip?: { at: number; dur: number }; enter?: { from: [number, number, number]; dur: number };
}
export interface Spread { at: number; dur: number; center?: [number, number, number?, number?]; slots: Array<[number, number, number, number]> }

/** the card frame inside a W×H frame: the 1080 × 1920 card space scaled to fit (k) and centred (ox, oy) */
export const cardSpace = (W: number, H: number) => { const k = Math.min(W / 1080, H / 1920); return { k, ox: (W - 1080 * k) / 2, oy: (H - 1920 * k) / 2 }; };

/** the window of a settled card in a W×H frame, in px */
export function windowRect(orient: Orient, W: number, H: number): Rect {
  const L = POSTCARD_LAYOUT[orient], { k, ox, oy } = cardSpace(W, H), [x, y, w, hh] = L.win;
  return [ox + (L.at[0] + x) * k, oy + (L.at[1] + y) * k, w * k, hh * k];
}
/** the settled card's window as the main-track clip's `frame` ([x, y, w, h], fractions of the frame) */
export const postcardWindow = (orient: Orient, W = 1080, H = 1920) => asFrame(windowRect(orient, W, H), W, H);

/** the face a card ends on (after its flip, if any) */
export const finalFace = (c: Card) => (c.flip ? (c.show === 'back' ? 'front' : 'back') : c.show ?? 'front');
const PILE = [[-26, 20, -3.4], [24, -12, 2.8], [-16, 26, -2.2], [30, -20, 3.9], [-32, 12, -4.4], [18, 28, 3.1], [-22, -18, -2.7], [28, 12, 3.6], [-12, 22, -1.9], [20, -16, 2.4]];
interface Pose { cx: number; cy: number; rot: number; scale: number; sx?: number; lift?: number; shade?: number }
const centerOf = (c: Card) => { const L = POSTCARD_LAYOUT[c.orient]; return [L.at[0] + L.w / 2, L.at[1] + L.h / 2]; };
export function pilePose(c: Card): Pose { const [cx, cy] = centerOf(c), [dx, dy, r] = PILE[c.index % PILE.length]; return { cx: cx + dx, cy: cy + dy, rot: r, scale: 1 }; }
const mix = (a: Pose, b: Pose, p: number): Pose => ({ cx: a.cx + (b.cx - a.cx) * p, cy: a.cy + (b.cy - a.cy) * p, rot: a.rot + (b.rot - a.rot) * p, scale: a.scale + (b.scale - a.scale) * p });

/** the active card at `local`: its pose, the face showing, and whether its window is a hole (and how much of the still is left) */
export function cardState(card: Card, local: number, spread?: Spread | null) {
  const enter = card.enter, ep = enter ? eOut3(clamp(local / enter.dur)) : 1, sp = spread ? eIO3(clamp((local - spread.at) / spread.dur)) : 0;
  const [cx, cy] = centerOf(card);
  let pose: Pose = { cx, cy, rot: 0, scale: 1 };
  if (enter && ep < 1) { const [dx, dy, r] = enter.from; pose = { cx: cx + dx * (1 - ep), cy: cy + dy * (1 - ep), rot: r * (1 - ep), scale: 1 }; }
  let face = card.show ?? 'front', sx = 1, lift = 0;
  if (card.flip) {
    const e = eIO3(clamp((local - card.flip.at) / card.flip.dur));
    if (local > card.flip.at) { sx = Math.max(0.002, Math.abs(Math.cos(Math.PI * e))); lift = Math.sin(Math.PI * e); if (e >= 0.5) face = card.show === 'back' ? 'front' : 'back'; }
  }
  if (spread) { const c0 = spread.center ?? [540, 900, 0, 0.5]; pose = mix(pose, { cx: c0[0], cy: c0[1], rot: c0[2] ?? 0, scale: c0[3] ?? 0.5 }, sp); }
  pose = { ...pose, sx, lift, shade: 0.22 * lift, scale: pose.scale * (1 + lift * 0.05) };
  const f = card.front, settled = (!enter || local >= enter.dur) && sx === 1 && !sp;
  const hole = face === 'front' && !!f && f.open !== undefined && local >= f.open && settled;
  return { pose, face, hole, stillAlpha: hole ? 1 - clamp((local - f!.open!) / 0.3) : 1, useExit: face === 'front' && !!f && f.open === undefined };
}

interface P {
  card: Card | null; pile: Card[]; spread: Spread | null;
  lines: string; place: string; placeZh: string; date: string; markAt: number; stampLabel: string; year: string; orient: Orient; enter: 'right' | 'left' | 'bottom' | 'none'; enterDur: number;
  source: string; t: number; live: boolean; desk: 'wood' | 'none'; font: string; ink: string; markInk: string; paper: string;
}
interface Face { el: HTMLElement; paper: HTMLCanvasElement; win: Win | null; stamp: StampEl; mark: MarkEl; txt: TextLayer; key: string }
interface CardEl { el: HTMLElement; front: Face; back: Face; shade: HTMLElement; orient: string }
interface S { under: HTMLElement; desk: HTMLCanvasElement; deskKey: string; pileStage: HTMLElement; stage: HTMLElement; piles: CardEl[]; active: CardEl | null; imgs: HTMLImageElement[] }

const FROM: Record<string, [number, number, number]> = { right: [1250, 160, 9], left: [-1250, 120, -8], bottom: [80, 1900, 5] };

/** the card the simple params describe (when `card` is not given): one front, its lines written as the sentences say */
export function cardFromParams(p: Partial<P>): Card {
  const still = p.source ? { source: p.source, t: Number(p.t) || 0, crop: { x: 0.5, y: 0.45, zoom: 1 } } : undefined, dur = Number(p.enterDur) || 0.8;
  const lines = parseSentences(String(p.lines ?? '')).map((s) => ({ text: s.text, t0: s.start, t1: s.end ?? s.start + writeTime(s.text, 12) }));
  return {
    index: 0, orient: p.orient === 'landscape' ? 'landscape' : 'portrait', show: 'front', enter: p.enter && p.enter !== 'none' ? { from: FROM[p.enter], dur } : undefined,
    // without footage the window never opens (nothing would play through it); 1e9: written on, never a hole
    front: { enter: still, exit: still, open: p.live && still ? (p.enter === 'none' ? 0 : dur) : 1e9, stamp: { label: p.stampLabel ?? '', year: p.year }, mark: { top: p.place ?? '', bottom: p.placeZh ?? '', date: p.date ?? '', at: p.markAt }, lines },
  };
}

/** every still the item shows (the export prepares them) */
export function postcardStills(p: Partial<P>): Still[] {
  const out: Still[] = [], add = (s?: Still) => { if (s?.source && !s.file && !out.some((x) => x.source === s.source && x.t === s.t)) out.push(s); };
  const card = p.card ?? cardFromParams(p);
  add(card.front?.enter); add(card.front?.exit);
  for (const c of p.pile ?? []) add(c.front?.exit);
  return out;
}

const spaced = (s: string) => [...String(s ?? '')].join(' ');

/** the card's paper, `dpr` device pixels per card px */
function paperCanvas(c: HTMLCanvasElement, card: Card, face: 'front' | 'back', paper: string, dpr: number) {
  const L = POSTCARD_LAYOUT[card.orient], g = c.getContext('2d')!, seed = card.index * 13 + (face === 'back' ? 5 : 0);
  c.width = Math.ceil(L.w * dpr); c.height = Math.ceil(L.h * dpr); g.scale(c.width / L.w, c.height / L.h);
  g.fillStyle = paper; g.fillRect(0, 0, L.w, L.h);
  const grd = g.createLinearGradient(0, 0, L.w, L.h);
  grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(150,120,80,0.10)');
  g.fillStyle = grd; g.fillRect(0, 0, L.w, L.h);
  for (let i = 0; i < 900; i++) {   // fibres: short pale strokes
    const x = hash(seed + i * 3.1) * L.w, y = hash(seed + i * 7.7) * L.h, a = hash(seed + i * 1.3) * Math.PI, l = 4 + hash(i + seed * 2) * 10;
    g.strokeStyle = hash(i * 9.1 + seed) > 0.5 ? 'rgba(120,95,60,0.07)' : 'rgba(255,255,255,0.25)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.strokeStyle = 'rgba(120,96,64,0.28)'; g.lineWidth = 2; g.strokeRect(12, 12, L.w - 24, L.h - 24);
  const ruled = (x0: number, x1: number, ys: number[]) => { g.strokeStyle = 'rgba(110,90,60,0.22)'; g.lineWidth = 1.5; for (const y of ys) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); } };
  if (face === 'front') {
    ruled(L.lines.x, L.stamp[0] - 150, L.lines.base.map((b) => b + 12));
    const [x, y, w, hh] = L.win;
    g.clearRect(x, y, w, hh);   // the window: the still, or the clip below, shows through
    g.strokeStyle = 'rgba(50,36,22,0.55)'; g.lineWidth = 3; g.strokeRect(x - 0.5, y - 0.5, w + 1, hh + 1);
  } else {
    const B = L.back;
    ruled(B.lines.x, L.w - 56, B.lines.base.map((b) => b + 16));
    g.strokeStyle = 'rgba(110,90,60,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(56, B.divider); g.lineTo(L.w - 56, B.divider); g.stroke();
    ruled(B.address.x0, B.address.x1, B.address.base.map((b) => b + 14));
  }
}

function faceEl(parent: HTMLElement, front: boolean): Face {
  const el = h('div', null, null, parent);
  cssCamel(el, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
  const win = front ? windowEl(el) : null, paper = h('canvas', null, null, el);
  cssCamel(paper, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
  const stamp = stampEl(el), mark = markEl(el), txt = textLayer(el);
  return { el, paper, win, stamp, mark, txt, key: '' };
}
function cardEl(parent: HTMLElement): CardEl {
  const el = h('div', null, null, parent);
  cssCamel(el, { position: 'absolute', transformOrigin: '50% 50%' });
  const front = faceEl(el, true), back = faceEl(el, false), shade = h('div', null, null, el);
  cssCamel(shade, { position: 'absolute', inset: '0', background: 'rgb(30,18,8)', pointerEvents: 'none' });
  return { el, front, back, shade, orient: '' };
}

/** one face of a card: paper, window (still or hole), stamp, postmark, the hand-written lines; `dpr`: device pixels per card px (the
 *  card space's scale, never under 1), so the paper, stamp and postmark are drawn at the frame's size, not stretched on a 4K frame */
function drawFace(media: MediaApi, F: Face, card: Card, which: 'front' | 'back', local: number, o: { hole: boolean; stillAlpha: number; useExit: boolean; complete: boolean }, p: P, dpr: number) {
  const L = POSTCARD_LAYOUT[card.orient], key = JSON.stringify([card.orient, card.index, which, p.paper, dpr]), hand = handFamily(p.font);
  if (F.key !== key) { F.key = key; paperCanvas(F.paper, card, which, p.paper, dpr); }
  const line = (ln: Line, x: number, y: number, px: number, align: Txt['align'] = 'left'): Txt => {
    const span = Math.max(0.05, (ln.t1 ?? 0) - (ln.t0 ?? 0)), n = Math.max(1, [...ln.text].length);
    return { text: ln.text, x, y, px, color: p.ink, family: hand, align, ...(o.complete || ln.t0 === undefined ? {} : { t0: ln.t0, cps: n / span }) };
  };
  const T: Txt[] = [];
  if (which === 'front') {
    const f = card.front, [x, y, w, hh] = L.win;
    cssCamel(F.win!.box, { left: `${x}px`, top: `${y}px` });
    showStill(media, F.win!, o.hole ? f?.enter : o.useExit ? f?.exit : f?.enter, w, hh, o.hole ? o.stillAlpha : 1);
    const [sx, sy, sw, sh] = L.stamp;
    drawStamp(media, F.stamp, f?.stamp ?? { label: '' }, f?.exit ? { ...f.exit, crop: f.exit.stampCrop } : null, sx + (sw - 140) / 2, sy + (sh - 170) / 2, 2.2, sw / 140, (sw / 140) * dpr);
    drawMark(F.mark, f?.mark, L.mark[2], L.mark[0], L.mark[1], local, o.complete, p.markInk, true, 0.82, dpr);
    (f?.lines ?? []).forEach((ln, i) => { if (L.lines.base[i] !== undefined) T.push(line(ln, L.lines.x, L.lines.base[i], L.lines.size)); });
  } else {
    const B = L.back, bk = card.back ?? {};
    drawStamp(media, F.stamp, bk.stamp ?? { label: 'POSTE', year: '2022' }, null, B.stamp[0], B.stamp[1], -1.6, 1, dpr);
    drawMark(F.mark, bk.mark, B.mark[2], B.mark[0], B.mark[1], local, o.complete, p.markInk, true, 0.82, dpr);
    T.push({ text: bk.header ?? 'Carte Postale', x: B.header[0], y: B.header[1], px: 80, color: 'rgba(70,52,30,0.85)', family: LATIN, italic: true, weight: 300 });
    T.push({ text: spaced(bk.sub ?? '寄給自己的明信片'), x: B.header[0] + 6, y: B.header[1] + 46, px: 22, color: 'rgba(70,52,30,0.55)', family: SERIF, weight: 500 });
    (bk.lines ?? []).forEach((ln, i) => { if (B.lines.base[i] !== undefined) T.push(line(ln, B.lines.x, B.lines.base[i], B.lines.size)); });
    if (bk.sig) T.push(line(bk.sig, B.sig[0], B.sig[1], 46, 'right'));
    (bk.address ?? []).forEach((ln, i) => { if (B.address.base[i] !== undefined) T.push(line(ln, B.address.x0 + 8, B.address.base[i], B.address.size)); });
  }
  drawTexts(F.txt, T, local, 1);
}

/** a whole card at a pose (card space px), showing one face */
function drawCard(media: MediaApi, C: CardEl, card: Card, pose: Pose, face: 'front' | 'back', local: number, o: { hole: boolean; stillAlpha: number; useExit: boolean; complete: boolean }, p: P, dpr: number) {
  const L = POSTCARD_LAYOUT[card.orient], lift = pose.lift ?? 0;
  cssCamel(C.el, { left: `${pose.cx - L.w / 2}px`, top: `${pose.cy - L.h / 2}px`, width: `${L.w}px`, height: `${L.h}px`,
    transform: `rotate(${pose.rot.toFixed(3)}deg) scale(${(pose.scale * (pose.sx ?? 1)).toFixed(4)}, ${pose.scale.toFixed(4)})`,
    boxShadow: `${(4 + lift * 10).toFixed(1)}px ${(10 + lift * 24).toFixed(1)}px 30px rgba(25,12,4,0.54)` });
  cssCamel(C.front.el, { display: face === 'front' ? 'block' : 'none' });
  cssCamel(C.back.el, { display: face === 'back' ? 'block' : 'none' });
  // both faces are kept drawn, so the stills of the face to come are loaded before it turns
  drawFace(media, C.front, card, 'front', local, face === 'front' ? o : { hole: false, stillAlpha: 1, useExit: false, complete: o.complete }, p, dpr);
  if (card.back || face === 'back') drawFace(media, C.back, card, 'back', local, o, p, dpr);
  cssCamel(C.shade, { opacity: String(pose.shade ?? 0), display: pose.shade ? 'block' : 'none' });
}

/** a wooden desk: planks, grain, warm light from the upper left, darker corners (painted once per size) */
export function paintDesk(c: HTMLCanvasElement, W: number, H: number) {
  c.width = Math.round(W); c.height = Math.round(H);
  const g = c.getContext('2d')!, u = Math.min(W, H) / 1080;
  const grd = g.createLinearGradient(0, 0, W * 0.3, H);
  grd.addColorStop(0, '#9a7150'); grd.addColorStop(0.5, '#86603f'); grd.addColorStop(1, '#6d4b31');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // planks and grain: long gently waving lines, all from the hash
  for (let i = 0; i < 260; i++) {
    const y0 = hash(i * 2.3) * H, amp = (3 + hash(i * 5.9) * 9) * u, len = (0.004 + hash(i * 1.7) * 0.006) / u, ph = hash(i * 8.3) * 6.28;
    g.strokeStyle = hash(i * 4.4) > 0.55 ? `rgba(60,36,18,${0.06 + hash(i) * 0.1})` : `rgba(210,170,120,${0.04 + hash(i * 3) * 0.06})`;
    g.lineWidth = (0.8 + hash(i * 6.6) * 2.2) * u;
    g.beginPath();
    for (let x = -10; x <= W + 10; x += 12 * u) { const y = y0 + Math.sin(x * len + ph) * amp + (x / W) * 40 * u; if (x === -10) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  for (const y of [H * 0.27, H * 0.61, H * 0.93]) { g.fillStyle = 'rgba(40,24,12,0.22)'; g.fillRect(0, y, W, 3 * u); g.fillStyle = 'rgba(230,190,140,0.10)'; g.fillRect(0, y + 3 * u, W, 2 * u); }
  const lamp = g.createRadialGradient(W * 0.25, H * 0.18, 0, W * 0.25, H * 0.18, Math.max(W, H) * 0.9);
  lamp.addColorStop(0, 'rgba(255,214,160,0.28)'); lamp.addColorStop(1, 'rgba(255,214,160,0)');
  g.fillStyle = lamp; g.fillRect(0, 0, W, H);
  const vig = g.createRadialGradient(W / 2, H / 2, Math.max(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(20,10,4,0.45)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);
}

export const postcard: ItemType<P, S> = {
  type: 'common.postcard', label: '明信片', category: 'frame', kind: 'scene',
  doc: '明信片旅記的一站：木桌上一疊明信片，新的一張滑入（或翻面）壓上去，角落郵票（該站的畫面）、郵戳（地名＋日期）蓋下，旁白一字一字手寫在卡上；卡片停好時照片窗是透明的洞，主軌片段（frame＝postcardWindow）從裡面播出來，卡片移動時窗裡是靜態圖；最後一張可翻到背面寫字、全部攤開；簡單參數一張卡，card／pile／spread 給整套',
  params: [
    { key: 'lines', label: '手寫字（每行「開始秒-結束秒|句子」，最多 3 行）', type: 'text', default: '0.8-1.8|到了巴黎\n1.9-2.8|先好好吃一頓' },
    { key: 'place', label: '郵戳上弧（地名）', type: 'string', default: 'PARIS' },
    { key: 'placeZh', label: '郵戳下弧', type: 'string', default: '巴黎' },
    { key: 'date', label: '郵戳日期', type: 'string', default: '2022.05.26' },
    { key: 'markAt', label: '郵戳蓋下的時間（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 1.25 },
    { key: 'stampLabel', label: '郵票國名', type: 'string', default: 'FRANCE' },
    { key: 'year', label: '郵票年份', type: 'string', default: '2022' },
    { key: 'orient', label: '卡片方向', type: 'enum', options: ['portrait', 'landscape'], default: 'portrait' },
    { key: 'enter', label: '進場（從哪邊滑入）', type: 'enum', options: ['right', 'left', 'bottom', 'none'], default: 'right' },
    { key: 'enterDur', label: '滑入長度（秒）', type: 'number', min: 0.1, max: 5, step: 0.05, default: 0.8 },
    { key: 'source', label: '照片窗的素材（空＝畫的示意圖）', type: 'source-ref', default: '' },
    { key: 't', label: '靜態圖取素材第幾秒', type: 'number', min: 0, max: 36000, step: 0.1, default: 0 },
    { key: 'live', label: '停好後照片窗變成洞（主軌片段 frame＝postcardWindow）', type: 'bool', default: true },
    { key: 'card', label: '整張卡（JSON，給了就不用上面的簡單參數）', type: 'json', default: null },
    { key: 'pile', label: '底下那疊（之前的卡，JSON）', type: 'json', default: [] },
    { key: 'spread', label: '收尾攤開 { at, dur, center, slots }', type: 'json', default: null },
    { key: 'desk', label: '桌面（wood 木桌、none 透明）', type: 'enum', options: ['wood', 'none'], default: 'wood' },
    { key: 'font', label: '手寫字型', type: 'string', default: 'LXGW WenKai TC' },
    { key: 'ink', label: '手寫墨色', type: 'color', default: '#1d2b57' },
    { key: 'markInk', label: '郵戳墨色', type: 'color', default: '#2a3550' },
    { key: 'paper', label: '卡片紙色', type: 'color', default: '#f6efe1' },
  ],
  media(item) { return { videos: [], stills: postcardStills(item.params as Partial<P>).map((s) => stillRef(s)) }; },
  build(ctx) {
    const under = abs(ctx.root), desk = abs(under, {}, 'canvas') as HTMLCanvasElement, pileStage = abs(under), stage = abs(ctx.root);
    cssCamel(under, { inset: '0' });
    cssCamel(desk, { left: '0', top: '0', width: '100%', height: '100%' });
    for (const st of [pileStage, stage]) cssCamel(st, { left: '0', top: '0', width: '1080px', height: '1920px', transformOrigin: '0 0' });
    const s: S = { under, desk, deskKey: '', pileStage, stage, piles: [], active: null, imgs: [] };
    postcard.draw(ctx, s);   // builds the cards and starts loading every still now, so ready() can wait for them
    return s;
  },
  ready: (s) => imagesReady(s.imgs),
  hide(s) { freeCanvas(s.desk); s.deskKey = ''; for (const c of [s.active, ...s.piles]) for (const F of c ? [c.front, c.back] : []) { freeCanvas(F.paper); F.key = ''; } },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local } = ctx, { k, ox, oy } = cardSpace(W, H), dpr = Math.max(1, k);
    const card = p.card ?? cardFromParams(p), pile = Array.isArray(p.pile) ? p.pile : [], spread = p.spread ?? null;
    if (p.desk === 'wood') { const key = `${W}x${H}`; if (s.deskKey !== key) { s.deskKey = key; paintDesk(s.desk, W, H); } }
    cssCamel(s.desk, { display: p.desk === 'wood' ? 'block' : 'none' });
    for (const st of [s.pileStage, s.stage]) cssCamel(st, { transform: `translate(${ox}px, ${oy}px) scale(${k})` });
    // the card elements: one per pile card and one for this card (rebuilt when the number changes)
    if (s.piles.length !== pile.length || !s.active) {
      for (const c of s.piles) c.el.remove();
      s.piles = pile.map(() => cardEl(s.pileStage));
      s.active ??= cardEl(s.stage);
      s.imgs = [s.active, ...s.piles].flatMap((c) => [c.front.win!.img, c.front.stamp.win.img]);
    }
    const st = cardState(card, local, spread), ep = card.enter ? eOut3(clamp(local / card.enter.dur)) : 1;
    // the pile: the newest card under this one moves from where it lay (settled) into the pile while this one comes in
    pile.forEach((pc, i) => {
      let pose = pilePose(pc);
      if (card.enter && i === pile.length - 1) { const [cx, cy] = centerOf(pc); pose = mix({ cx, cy, rot: 0, scale: 1 }, pose, ep); }
      if (spread) {
        const slot = spread.slots[i] ?? [540, 960, 0, 0.3], q = eIO3(clamp((local - spread.at - i * 0.07) / spread.dur));
        pose = mix(pose, { cx: slot[0], cy: slot[1], rot: slot[2], scale: slot[3] }, q);
      }
      drawCard(ctx.media, s.piles[i], pc, pose, finalFace(pc), local, { hole: false, stillAlpha: 1, useExit: true, complete: true }, p, dpr);
    });
    drawCard(ctx.media, s.active!, card, st.pose, st.face, local, { hole: st.hole, stillAlpha: st.stillAlpha, useExit: st.useExit, complete: st.face === 'front' && st.useExit }, p, dpr);
    // the hole goes through the desk and the pile too: the clip below shows only there
    punch(s.under, st.hole ? windowRect(card.orient, W, H) : null);
  },
};
