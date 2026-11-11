// A pastel retro computer, promoted 2026-11-05 from the retro desktop pilot film's fx.retrodesk / fx.retrowin / fx.retrodialog /
// fx.retroend (after the user's own Retro UI style film):
//   common.desktop  the desktop for the whole film: a gradient that changes colour each chapter, a faint grid, pixel clouds drifting,
//                   twinkles, a menu bar, a globe and folders, and a taskbar whose buttons are the chapters, the current one lit
//   common.window   a window (file name, three buttons, ink border, hard shadow) that plays its own clip or photo, or holds a search box
//                   being typed, a profile list or a progress bar; it pops in and at its end flies into its chapter's taskbar button,
//                   closes, or grows to fill the top of the frame
//   common.popup    a notice dialog with a question and two buttons, one pressed at `press`; mode sheet is the closing panel: a cream
//                   sheet with a typed line and a button that is pressed, turns into its done label and throws pixel confetti
// The pointer is common.touch's look cursor; the message box is the caption template desk-type. All pure functions of time.
import { clamp, eIO3 as eIO, lerp, rng, type ItemType, type MediaRef, type Project, type SceneItem } from '@tellcut/engine';
import { mixHex } from './color.ts';
import { fitMeasuredSize } from './headline.ts';
import { imagesReady, windowEl } from './window.ts';

const CJK = 'Huninn', PIX = 'VT323';
export const DESK_BARS: Record<string, string> = { lav: '#c3b1f5', pink: '#f7b2cf', mint: '#97e0c6', yellow: '#ffd879' };
const bar = (c: string) => DESK_BARS[c] ?? c;
type G = CanvasRenderingContext2D;
/** the size (at most `px`) at which `text` in `family` fits in `room` px on `g`: a long question or label shrinks instead of
 *  running out of its dialog or button */
const fit = (g: G, text: string, px: number, family: string, room: number) => fitMeasuredSize(g, [text], px, family, 400, room);

/** a canvas over the whole of `parent` (the desktop kit's and mono.ts's blocks draw on one each) */
export function canvasIn(parent: HTMLElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
  parent.appendChild(c);
  return c;
}
/** a rounded rectangle's path on `g` (arcTo, so a radius bigger than the box still closes) */
export function rr(g: G, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const fonts = (text: string) => Promise.all([document.fonts.load(`40px "${PIX}"`, 'Aa.exe0123456789%_'), document.fonts.load(`56px "${CJK}"`, text || '桌面')]).then(() => undefined);

export interface DeskChapter { t: number; name: string; top: string; bottom: string }
/** the chapters: "seconds|name|top colour|bottom colour" one a line */
export function deskChapters(text: string): DeskChapter[] {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [t, name = '', top, bottom] = l.split('|').map((s) => s.trim());
    return { t: Number(t) || 0, name, top: top || '#ffd6b8', bottom: bottom || '#cdb8f5' };
  });
}
/** the taskbar's button n (from 1) of `count`: centre and size in frame px (common.window flies into it) */
export function deskSlot(n: number, count: number, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const k = Math.min(W, H) / 1080, x0 = 190 * k, x1 = W - 18 * k, gap = 10 * k, c = Math.max(1, count), bw = (x1 - x0 - gap * (c - 1)) / c;
  return { x: x0 + (clamp(n, 1, c) - 1) * (bw + gap) + bw / 2, y: H - 40 * k, w: bw, h: 50 * k };
}

type Report = (g: G, text: string, x: number, y: number) => void;
/** a window's chrome: hard shadow, cream body, title bar with its name (fitted to the room left of the buttons) and three buttons, ink
 *  border; k = px per 1080 */
function chrome(g: G, w: number, h: number, k: number, colour: string, title: string, ink: string, paper: string, report: Report) {
  const sh = 12 * k, bw = 4 * k, tb = 50 * k;
  g.fillStyle = 'rgba(75,58,140,0.55)'; g.fillRect(sh, sh, w, h);
  g.fillStyle = paper; g.fillRect(0, 0, w, h);
  g.fillStyle = bar(colour); g.fillRect(0, 0, w, tb);
  g.strokeStyle = ink; g.lineWidth = bw; g.strokeRect(bw / 2, bw / 2, w - bw, h - bw);
  g.beginPath(); g.moveTo(0, tb); g.lineTo(w, tb); g.stroke();
  const face = `"${PIX}", "${CJK}"`, ts = fit(g, title, 32 * k, face, w - 142 * k);   // the first button starts 114 px from the right
  g.fillStyle = ink; g.font = `${ts}px ${face}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(title, 16 * k, tb / 2 + 2 * k); report(g, title, 16 * k, tb / 2 + 2 * k);
  const s = 28 * k, y = (tb - s) / 2; g.lineWidth = 3 * k;
  ['min', 'max', 'x'].forEach((kind, i) => {
    const x = w - 14 * k - (3 - i) * (s + 8 * k) + 8 * k;
    g.fillStyle = paper; g.fillRect(x, y, s, s); g.strokeRect(x, y, s, s);
    g.beginPath();
    if (kind === 'min') { g.moveTo(x + 7 * k, y + s - 8 * k); g.lineTo(x + s - 7 * k, y + s - 8 * k); }
    if (kind === 'max') g.rect(x + 7 * k, y + 7 * k, s - 14 * k, s - 14 * k);
    if (kind === 'x') { g.moveTo(x + 7 * k, y + 7 * k); g.lineTo(x + s - 7 * k, y + s - 7 * k); g.moveTo(x + s - 7 * k, y + 7 * k); g.lineTo(x + 7 * k, y + s - 7 * k); }
    g.stroke();
  });
  return { tb, bw };
}
/** a button with a hard shadow, its label fitted inside; pressed, it sits down into the shadow */
function button(g: G, x: number, y: number, w: number, h: number, k: number, fill: string, label: string, pressed: boolean, ink: string, report: Report) {
  const d = 6 * k, o = pressed ? d : 0;
  g.fillStyle = ink; rr(g, x + d, y + d, w, h, 8 * k); g.fill();
  g.fillStyle = fill; rr(g, x + o, y + o, w, h, 8 * k); g.fill();
  g.strokeStyle = ink; g.lineWidth = 4 * k; g.stroke();
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${fit(g, label, 48 * k, `"${CJK}"`, w - 28 * k)}px "${CJK}"`;
  g.fillText(label, x + o + w / 2, y + o + h / 2 + 2 * k); report(g, label, x + o + w / 2, y + o + h / 2 + 2 * k);
}

// ── common.desktop
interface DP { chapters: string; menu: string; start: string; app: string; ink: string; paper: string; seed: number }
interface DS { c: HTMLCanvasElement; text: string }
export const desktop: ItemType<DP, DS> = {
  type: 'common.desktop', label: '復古桌面', category: 'phone', kind: 'scene',
  doc: '粉彩復古電腦的桌面，整支片一個：每章換一組漸層色（淡格線、像素雲慢慢飄、小星星閃），頂端選單列（menu）和右上的程式名（app），左上地球、右邊三個資料夾，底部工作列「★ 開始」＋每章一顆 .exe 按鈕、現在這章的亮起來（章節進度就在工作列上）；chapters 一行一章「秒|名稱|上色|下色」；配 common.window 視窗（章末飛進自己那章的按鈕）、common.popup 對話框、common.touch 的 cursor 游標、字幕範本 desk-type 訊息框；生日、派對、回憶相簿、「打開檔案」式的整理影片',
  params: [
    { key: 'chapters', label: '章節（一行一章：秒|名稱|上色|下色）', type: 'text', default: '0|準備|#ffd6b8|#cdb8f5\n1.5|派對|#ffc4dc|#d9c2f7' },
    { key: 'menu', label: '選單（逗號分隔）', type: 'string', default: '檔案,編輯,檢視,派對' },
    { key: 'start', label: '開始按鈕的字', type: 'string', default: '開始' },
    { key: 'app', label: '右上角的程式名', type: 'string', default: 'PARTY.EXE' },
    { key: 'ink', label: '線和字的顏色', type: 'color', default: '#4b3a8c' },
    { key: 'paper', label: '選單列和工作列的底色', type: 'color', default: '#fffaf0' },
    { key: 'seed', label: '雲和星星的亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 5 },
  ],
  build(ctx) { return { c: canvasIn(ctx.root), text: `${ctx.params.chapters}${ctx.params.menu}${ctx.params.start}★♥.exe` }; },
  ready(s) { return fonts(s.text); },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, k = Math.min(W, H) / 1080;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const ch = deskChapters(p.chapters);
    if (!ch.length) ch.push({ t: 0, name: '', top: '#ffd6b8', bottom: '#cdb8f5' });
    let n = 0; ch.forEach((c, i) => { if (local >= c.t) n = i; });
    const prev = ch[Math.max(0, n - 1)], cur = ch[n], q = n === 0 ? 1 : eIO(clamp((local - cur.t) / 0.6));
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, mixHex(prev.top, cur.top, q)); grd.addColorStop(1, mixHex(prev.bottom, cur.bottom, q));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 1.5 * k;
    for (let x = 0; x <= W; x += 54 * k) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 54 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const r = rng(p.seed);
    for (let i = 0; i < 6; i++) {   // pixel clouds drifting right, wrapping round
      const y = (0.18 + r() * 0.62) * H, sp = (8 + r() * 10) * k, span = W + 300 * k, x = ((r() * span + local * sp) % span) - 150 * k, b = (10 + r() * 6) * k;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      for (const [dx, dy, len] of [[1, 0, 3], [0, 1, 6], [2, -1, 2]]) g.fillRect(x + dx * b * 2, y + dy * b, len * b * 2, b);
    }
    for (let i = 0; i < 22; i++) {   // twinkles
      const x = r() * W, y = (0.1 + r() * 0.8) * H, ph = r() * 6, a = 0.5 + 0.5 * Math.sin(local * 3 + ph), z = (3 + r() * 4) * k;
      g.fillStyle = `rgba(255,255,255,${(0.25 + 0.6 * a).toFixed(3)})`;
      g.fillRect(x - z, y - z / 3, z * 2, (z * 2) / 3); g.fillRect(x - z / 3, y - z, (z * 2) / 3, z * 2);
    }
    const mb = 56 * k;   // the menu bar
    g.fillStyle = p.paper; g.fillRect(0, 0, W, mb); g.fillStyle = p.ink; g.fillRect(0, mb - 3 * k, W, 3 * k);
    const say = (text: string, x: number, y: number) => { g.fillText(text, x, y); ctx.reportText(g, text, x, y); };
    g.font = `${32 * k}px "${CJK}"`; g.textBaseline = 'middle'; g.textAlign = 'left';
    say('★  ' + String(p.menu).split(/[,，]/).join('   '), 22 * k, mb / 2);
    g.textAlign = 'right'; g.font = `${32 * k}px "${PIX}", "${CJK}"`; say('♥ ' + p.app, W - 22 * k, mb / 2);
    g.strokeStyle = p.ink; g.lineWidth = 3 * k;   // the globe
    const gx = 52 * k, gy = 118 * k, gr = 26 * k;
    g.beginPath(); g.arc(gx, gy, gr, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(gx, gy, gr * 0.45, gr, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(gx - gr, gy); g.lineTo(gx + gr, gy); g.stroke();
    ['#f7a8c8', '#8fdcc2', '#f7a8c8'].forEach((col, i) => {   // three folders on the right
      const fx = W - 108 * k, fy = (100 + i * 92) * k, fw = 70 * k, fh = 52 * k;
      g.fillStyle = col; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + fw * 0.4, fy); g.lineTo(fx + fw * 0.5, fy + 9 * k); g.lineTo(fx + fw, fy + 9 * k); g.lineTo(fx + fw, fy + fh); g.lineTo(fx, fy + fh); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(75,58,140,0.5)'; g.lineWidth = 2 * k; g.stroke();
    });
    const tbY = H - 80 * k;   // the taskbar: the start button, then one .exe button a chapter
    g.fillStyle = p.paper; g.fillRect(0, tbY, W, H - tbY); g.fillStyle = p.ink; g.fillRect(0, tbY, W, 3 * k);
    g.fillStyle = p.ink; rr(g, 22 * k, tbY + 19 * k, 150 * k, 50 * k, 8 * k); g.fill();
    g.fillStyle = '#ffd46b'; rr(g, 16 * k, tbY + 13 * k, 150 * k, 50 * k, 8 * k); g.fill(); g.strokeStyle = p.ink; g.lineWidth = 3 * k; g.stroke();
    // the start label and the chapter names shrink into their buttons rather than running out of them
    g.fillStyle = p.ink; g.textAlign = 'center'; g.font = `${fit(g, `★ ${p.start}`, 32 * k, `"${CJK}"`, 130 * k)}px "${CJK}"`; say(`★ ${p.start}`, 91 * k, tbY + 40 * k);
    ch.forEach((c, i) => {
      if (!c.name) return;
      const sl = deskSlot(i + 1, ch.length, W, H), on = i === n;
      g.fillStyle = on ? '#ffffff' : i < n ? '#efe6ff' : '#f6f0e4'; g.fillRect(sl.x - sl.w / 2, sl.y - sl.h / 2, sl.w, sl.h);
      g.strokeStyle = p.ink; g.lineWidth = (on ? 4 : 2) * k; g.strokeRect(sl.x - sl.w / 2, sl.y - sl.h / 2, sl.w, sl.h);
      g.fillStyle = p.ink; g.font = `${fit(g, `${c.name}.exe`, 28 * k, `"${CJK}"`, sl.w - 16 * k)}px "${CJK}"`; g.globalAlpha = on ? 1 : 0.7; say(`${c.name}.exe`, sl.x, sl.y + 2 * k); g.globalAlpha = 1;
    });
  },
};

// ── common.window
interface WP {
  content: 'media' | 'search' | 'profile' | 'progress'; source: string; in: number; cx: number; cy: number; zoom: number;
  x: number; y: number; w: number; h: number; title: string; bar: string; text: string; typeAt: number; progFrom: number; progTo: number;
  exit: 'none' | 'min' | 'close' | 'max'; slot: number; slots: number; maxAt: number; maxH: number; ink: string; paper: string;
}
interface WS { wrap: HTMLDivElement; c: HTMLCanvasElement; box: HTMLDivElement; ph: HTMLElement; img: HTMLImageElement | null; text: string }
const isImage = (project: Project | undefined, source: string) => (project?.sources as Record<string, { kind?: string }> | undefined)?.[source]?.kind === 'image';
/** a photo window's <img>, covering the box */
function photoImg(box: HTMLElement, src: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src; img.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover';
  box.appendChild(img);
  return img;
}
/** the clip a media window plays: from `in` for the window's whole time */
export const windowRef = (p: Pick<WP, 'source' | 'in'>, dur: number): MediaRef => ({ source: p.source, in: p.in, out: p.in + dur, speed: 1, interp: 'none' });

/** where the window is at `local` (frame px) and how much of its chrome shows: popping in, growing to the top (max) or flying into
 *  its taskbar button (min) / shrinking away (close) at its end */
export function windowRectAt(p: WP, local: number, dur: number, W: number, H: number, pop: number) {
  const k = Math.min(W, H) / 1080;
  let x = p.x * W, y = p.y * H, w = p.w * W, h = p.h * H, sc = pop, alpha = clamp(local / 0.06), chromeA = 1;
  if (p.exit === 'max' && local > p.maxAt) {
    const q = eIO(clamp((local - p.maxAt) / 0.55));
    x = lerp(x, -14 * k, q); y = lerp(y, -50 * k, q); w = lerp(w, W + 28 * k, q); h = lerp(h, p.maxH * H + 50 * k, q); chromeA = 1 - q;
  }
  let cx = x + w / 2, cy = y + h / 2;
  if (p.exit === 'min') {
    const q = Math.pow(clamp((local - (dur - 0.45)) / 0.45), 3), sl = deskSlot(p.slot, p.slots, W, H);
    sc *= lerp(1, 0.05, q); cx = lerp(cx, sl.x, q); cy = lerp(cy, sl.y, q); alpha *= 1 - clamp((q - 0.85) / 0.15);
  }
  if (p.exit === 'close') { const q = clamp((local - (dur - 0.25)) / 0.25); sc *= 1 - 0.2 * q; alpha *= 1 - q; }
  return { left: cx - (w * sc) / 2, top: cy - (h * sc) / 2, w: w * sc, h: h * sc, k: k * sc, alpha, chromeA };
}

export const deskWindow: ItemType<WP, WS> = {
  type: 'common.window', label: '復古視窗', category: 'phone', kind: 'overlay',
  doc: '復古電腦的視窗：標題列（檔名 title、三顆鈕，bar 是 lav／pink／mint／yellow 或色碼）、深紫外框、硬陰影；content media 播它自己的片段或照片（source、in，cx、cy、zoom 對焦），search 是搜尋框把 text 打出來，profile 是「名稱|值」清單一行一列地出現，progress 是進度條（text「進行中|完成」，progFrom 到 progTo 跑滿）；media 加 progTo 時進度條在片子下面；從小彈出來，結尾 exit：min 縮小飛進工作列第 slot 顆（共 slots 顆，和 common.desktop 的章節一樣）、close 關掉、max 在 maxAt 秒放大到畫面上方（maxH 高、標題列淡掉）、none 留著；一章幾個視窗斜斜疊起來；配 common.desktop、common.popup',
  params: [
    { key: 'content', label: '內容（media 片段或照片、search 搜尋框、profile 清單、progress 進度條）', type: 'enum', options: ['media', 'search', 'profile', 'progress'], default: 'media' },
    { key: 'source', label: '素材', type: 'source-ref', default: '' },
    { key: 'in', label: '從素材第幾秒', type: 'number', min: 0, max: 99999, step: 0.01, default: 0 },
    { key: 'cx', label: '對焦 x（素材比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'cy', label: '對焦 y（素材比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'zoom', label: '放大', type: 'number', min: 1, max: 4, step: 0.01, default: 1 },
    { key: 'x', label: '左緣（畫面寬比例）', type: 'number', min: -1, max: 1, step: 0.005, default: 0.08 },
    { key: 'y', label: '上緣（畫面高比例）', type: 'number', min: -1, max: 1, step: 0.005, default: 0.1 },
    { key: 'w', label: '寬（畫面寬比例）', type: 'number', min: 0.1, max: 1, step: 0.005, default: 0.8 },
    { key: 'h', label: '高（畫面高比例，含標題列）', type: 'number', min: 0.05, max: 1, step: 0.005, default: 0.28 },
    { key: 'title', label: '標題列的檔名', type: 'string', default: 'photo_01.jpg' },
    { key: 'bar', label: '標題列顏色（lav、pink、mint、yellow 或色碼）', type: 'string', default: 'lav' },
    { key: 'text', label: '內容的字（search 要打的字；profile 一行一列「名稱|值」；progress「進行中|完成」）', type: 'text', default: '' },
    { key: 'typeAt', label: '開始打字（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.3 },
    { key: 'progFrom', label: '進度條開始（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.3 },
    { key: 'progTo', label: '進度條跑滿（秒；0＝沒有）', type: 'number', min: 0, max: 60, step: 0.05, default: 0 },
    { key: 'exit', label: '結尾（min 飛進工作列、close 關掉、max 放到最大、none 不動）', type: 'enum', options: ['min', 'close', 'max', 'none'], default: 'min' },
    { key: 'slot', label: '飛進工作列第幾顆', type: 'number', min: 1, max: 12, step: 1, default: 1 },
    { key: 'slots', label: '工作列共幾顆', type: 'number', min: 1, max: 12, step: 1, default: 5 },
    { key: 'maxAt', label: '放到最大（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.8 },
    { key: 'maxH', label: '放到最大的高（畫面高比例）', type: 'number', min: 0.2, max: 1, step: 0.01, default: 0.72 },
    { key: 'ink', label: '線和字的顏色', type: 'color', default: '#4b3a8c' },
    { key: 'paper', label: '視窗底色', type: 'color', default: '#fffaf0' },
  ],
  media(item: SceneItem, project?: Project) {
    const p = item.params as unknown as WP;
    if ((p.content ?? 'media') !== 'media' || !p.source) return { videos: [], stills: [] };
    if (isImage(project, p.source)) return { videos: [], stills: [{ source: p.source, t: 0, w: 1080 }] };
    return { videos: [windowRef(p, item.end - item.start)], stills: [] };
  },
  build(ctx) {
    const wrap = document.createElement('div'); wrap.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    ctx.root.appendChild(wrap);
    const c = canvasIn(wrap), box = document.createElement('div'); box.style.cssText = 'position:absolute;overflow:hidden;background:#222';
    wrap.appendChild(box);
    // the painted stand-in (window.ts) under the clip, shown when the window has no footage
    const ph = windowEl(box).box;
    ph.style.cssText += ';left:0;top:0;width:100%;height:100%';
    // a photo's <img> is made here, not at the first draw, so the player's ready (which collects the stage's images) waits for it
    const p = ctx.params;
    const img = (p.content ?? 'media') === 'media' && p.source && isImage(ctx.project, p.source) ? photoImg(box, ctx.media.stillUrl({ source: p.source, t: 0, w: 1080 })) : null;
    return { wrap, c, box, ph, img, text: `${ctx.params.text}${ctx.params.title}` };
  },
  ready(s) { return Promise.all([fonts(s.text), imagesReady(s.img ? [s.img] : [])]).then(() => undefined); },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const { local, dur, W, H, params: p, motion, media, project } = ctx;
    const pop = local < 0 ? 0 : 0.55 + 0.45 * motion.spring({ duration: 0.35, bounce: 0.45 })(local);
    const R = windowRectAt(p, local, dur, W, H, pop), k = R.k, sh = 12 * k;
    Object.assign(s.wrap.style, { left: `${(R.left / W) * 100}%`, top: `${(R.top / H) * 100}%`, width: `${((R.w + sh) / W) * 100}%`, height: `${((R.h + sh) / H) * 100}%`,
      opacity: String(R.alpha), display: R.w > 2 ? 'block' : 'none' });
    const cw = Math.max(1, Math.round(R.w + sh)), chh = Math.max(1, Math.round(R.h + sh));
    if (s.c.width !== cw || s.c.height !== chh) { s.c.width = cw; s.c.height = chh; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, cw, chh);
    const report: Report = (gg, text, x, y) => ctx.reportText(gg, text, x, y);
    g.save(); g.globalAlpha = R.chromeA; const { tb, bw } = chrome(g, R.w, R.h, k, p.bar, p.title, p.ink, p.paper, report); g.restore();
    const foot = p.progTo > 0 && p.content === 'media' ? 120 * k : 0, pad = 8 * k * R.chromeA;
    const bx = bw * R.chromeA + pad, by = tb * R.chromeA + pad, bwid = R.w - 2 * bx, bh = R.h - by - pad - foot;
    if (p.content === 'media') {
      s.ph.style.display = p.source ? 'none' : 'block';
      Object.assign(s.box.style, { display: 'block', background: p.source ? '#222' : 'none', left: `${(bx / (R.w + sh)) * 100}%`, top: `${(by / (R.h + sh)) * 100}%`, width: `${(bwid / (R.w + sh)) * 100}%`, height: `${(bh / (R.h + sh)) * 100}%`,
        outline: R.chromeA > 0.5 ? `${(3 * k).toFixed(1)}px solid ${p.ink}` : 'none' });
      const src = (project.sources as Record<string, { kind?: string; width?: number; height?: number }>)[p.source];
      if (!p.source) { /* the stand-in only */ } else if (src?.kind === 'image') {
        s.img ??= photoImg(s.box, media.stillUrl({ source: p.source, t: 0, w: 1080 }));
        Object.assign(s.img.style, { objectPosition: `${p.cx * 100}% ${p.cy * 100}%`, transformOrigin: `${p.cx * 100}% ${p.cy * 100}%`, transform: `scale(${p.zoom})` });
      } else {
        const v = media.video(windowRef(p, dur), s.box, Math.min(local, dur - 0.04), false);
        // the box is bwid × bh by construction: reading clientWidth here forced a layout every frame
        media.place(v, bwid, bh, { x: p.cx, y: p.cy, zoom: p.zoom }, src?.width, src?.height);
      }
    } else s.box.style.display = 'none';
    g.save(); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = p.ink;
    const fs = 52 * k;
    if (p.content === 'search') {
      const fx = bx + 14 * k, fy = by + (bh - 84 * k) / 2, fw = bwid - 28 * k;
      g.fillStyle = '#ffffff'; g.fillRect(fx, fy, fw, 84 * k); g.strokeStyle = p.ink; g.lineWidth = 3 * k; g.strokeRect(fx, fy, fw, 84 * k);
      g.beginPath(); g.arc(fx + 40 * k, fy + 38 * k, 15 * k, 0, Math.PI * 2); g.moveTo(fx + 51 * k, fy + 49 * k); g.lineTo(fx + 64 * k, fy + 62 * k); g.stroke();
      const chars = [...String(p.text)], n = Math.floor(clamp((local - p.typeAt) / Math.max(0.01, chars.length * 0.12)) * chars.length), typed = chars.slice(0, n).join('');
      // sized for the whole query (so it does not change while typed) to end before the caret's room at the box's right
      g.fillStyle = p.ink; g.font = `${fit(g, String(p.text), fs, `"${CJK}"`, fw - 104 * k)}px "${CJK}"`;
      if (typed) { g.fillText(typed, fx + 84 * k, fy + 44 * k); report(g, typed, fx + 84 * k, fy + 44 * k); }
      if (Math.floor(local * 2.5) % 2 === 0) g.fillRect(fx + 84 * k + g.measureText(typed).width + 4 * k, fy + 18 * k, 4 * k, 50 * k);
    }
    if (p.content === 'profile') {
      // the values start three ems in, or half an em after the widest name when that is wider
      const rows = String(p.text).split('\n').filter(Boolean);
      g.font = `${fs}px "${CJK}"`;
      const nameW = Math.max(0, ...rows.map((l) => g.measureText(l.split('|')[0]).width)), valX = bx + 26 * k + Math.max(fs * 3, nameW + fs * 0.5);
      rows.forEach((line, i) => {
        const [name, val = ''] = line.split('|'), ly = by + 50 * k + i * 82 * k, show = clamp((local - 0.25 - i * 0.25) / 0.15);
        if (ly > by + bh || show <= 0) return;
        g.globalAlpha = show; g.font = `${fs}px "${CJK}"`;
        g.fillStyle = 'rgba(75,58,140,0.6)'; g.fillText(name, bx + 26 * k, ly); report(g, name, bx + 26 * k, ly);
        g.fillStyle = p.ink; g.fillText(val, valX, ly); report(g, val, valX, ly); g.globalAlpha = 1;
      });
    }
    if (p.content === 'progress' || foot > 0) {
      // no progTo (or one not after progFrom): the bar fills by half a second before the window's end, rather than at once
      const end = p.progTo > p.progFrom ? p.progTo : Math.max(p.progFrom + 0.01, dur - 0.5);
      const [doing = '', done] = String(p.text).split('|'), q = clamp((local - p.progFrom) / Math.max(0.01, end - p.progFrom)), label = local >= end ? (done || doing) : doing;
      const top0 = foot > 0 ? by + bh + 10 * k : by + 20 * k, fx = bx + 18 * k, fw = bwid - 36 * k;
      g.font = `${50 * k}px "${CJK}"`; g.fillStyle = p.ink; g.fillText(label, fx, top0 + 30 * k); report(g, label, fx, top0 + 30 * k);
      g.font = `${38 * k}px "${PIX}"`; g.textAlign = 'right'; g.fillText(`${Math.round(q * 100)}%`, fx + fw, top0 + 30 * k); g.textAlign = 'left';
      const barY = top0 + 62 * k, barH = 34 * k, cells = 24, cg = 3 * k, cwid = (fw - cg * (cells + 1)) / cells;
      g.fillStyle = '#ffffff'; g.fillRect(fx, barY, fw, barH); g.strokeStyle = p.ink; g.lineWidth = 3 * k; g.strokeRect(fx, barY, fw, barH);
      for (let i = 0; i < Math.round(q * cells); i++) { g.fillStyle = i % 2 ? '#f7a8c8' : '#f48fbf'; g.fillRect(fx + cg + i * (cwid + cg), barY + cg + k, cwid, barH - 2 * cg - 2 * k); }
    }
    g.restore();
  },
};

// ── common.popup
interface PP { mode: 'dialog' | 'sheet'; title: string; text: string; buttons: string; done: string; press: number; pick: number; x: number; y: number; w: number; bar: string; typeAt: number; ink: string; paper: string; seed: number }
interface PS { c: HTMLCanvasElement; text: string }
export const popup: ItemType<PP, PS> = {
  type: 'common.popup', label: '復古對話框', category: 'phone', kind: 'overlay',
  doc: '復古電腦的對話框：mode dialog 是「notice」小視窗，一句問題（text）、兩顆按鈕（buttons「主要|次要」，第一顆黃色），在 press 秒按下第 pick 顆，彈出、結尾關掉（「派對要取消嗎？［取消］［再等等］」、「一起唱生日快樂歌？［好啊！］」）；mode sheet 是結尾面板：從下面升起一塊奶油色，把 text 打出來，下面一顆按鈕（buttons 的第一個）在 press 秒被按下、變成 done（「儲存回憶 → 已儲存 ✓」）並噴出像素彩紙；配 common.desktop、common.window 和 common.touch 的 cursor 游標（點的位置對準按鈕）',
  params: [
    { key: 'mode', label: '樣式（dialog 對話框、sheet 結尾面板）', type: 'enum', options: ['dialog', 'sheet'], default: 'dialog' },
    { key: 'title', label: '標題列的字（dialog）', type: 'string', default: 'notice' },
    { key: 'text', label: '問題（dialog）／打出來的一句話（sheet）', type: 'string', default: '一起唱生日快樂歌？' },
    { key: 'buttons', label: '按鈕（主要|次要）', type: 'string', default: '好啊！|再等等' },
    { key: 'done', label: '按下後的字（sheet）', type: 'string', default: '已儲存 ✓' },
    { key: 'press', label: '按下（秒；-1 不按）', type: 'number', min: -1, max: 60, step: 0.05, default: 1.2 },
    { key: 'pick', label: '按第幾顆（dialog）', type: 'number', min: 1, max: 2, step: 1, default: 1 },
    { key: 'x', label: '中心 x（dialog）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'y', label: '中心 y（dialog）／面板上緣（sheet），畫面高比例', type: 'number', min: 0, max: 1, step: 0.005, default: 0.45 },
    { key: 'w', label: '寬（dialog，畫面短邊比例）', type: 'number', min: 0.3, max: 1, step: 0.01, default: 0.84 },
    { key: 'bar', label: '標題列顏色（dialog）', type: 'string', default: 'lav' },
    { key: 'typeAt', label: '開始打字（sheet，秒）', type: 'number', min: 0, max: 30, step: 0.05, default: 0.5 },
    { key: 'ink', label: '線和字的顏色', type: 'color', default: '#4b3a8c' },
    { key: 'paper', label: '底色', type: 'color', default: '#fffaf0' },
    { key: 'seed', label: '彩紙亂數種子（sheet）', type: 'number', min: 1, max: 9999, step: 1, default: 3 },
  ],
  build(ctx) { return { c: canvasIn(ctx.root), text: `${ctx.params.text}${ctx.params.buttons}${ctx.params.done}` }; },
  ready(s) { return fonts(s.text); },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const { local, dur, W, H, params: p, motion } = ctx, k = Math.min(W, H) / 1080;
    if (s.c.width !== W || s.c.height !== H) { s.c.width = W; s.c.height = H; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const report: Report = (gg, text, x, y) => ctx.reportText(gg, text, x, y);
    const bs = String(p.buttons).split('|').filter(Boolean);
    if (p.mode === 'sheet') { drawSheet(g, p, local, W, H, k, bs[0] ?? '', report); return; }
    const close = clamp((local - (dur - 0.22)) / 0.22), sc = (local < 0 ? 0 : 0.55 + 0.45 * motion.spring({ duration: 0.35, bounce: 0.45 })(local)) * (1 - 0.15 * close);
    if (sc <= 0) return;
    const w = p.w * Math.min(W, H), h = 300 * k;
    g.save(); g.globalAlpha = clamp(local / 0.06) * (1 - close);
    g.translate(p.x * W, p.y * H); g.scale(sc, sc); g.translate(-w / 2, -h / 2);
    const { tb } = chrome(g, w, h, k, p.bar, p.title, p.ink, p.paper, report);
    g.fillStyle = p.ink; g.font = `${fit(g, String(p.text), 54 * k, `"${CJK}"`, w - 80 * k)}px "${CJK}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.text, w / 2, tb + 70 * k); report(g, p.text, w / 2, tb + 70 * k);
    const bwid = Math.min(300 * k, (w - 120 * k) / Math.max(1, bs.length)), gap = (w - bs.length * bwid) / (bs.length + 1);
    bs.forEach((label, i) => button(g, gap + i * (bwid + gap), tb + 140 * k, bwid, 86 * k, k, i === 0 ? '#ffd46b' : p.paper, label, p.press >= 0 && i + 1 === p.pick && local >= p.press && local < p.press + 0.2, p.ink, report));
    g.restore();
  },
};

/** a dialog's button n (from 1) centre in frame fractions, for pointing the cursor at it (the dialog settled, not mid-pop) */
export function popupButton(n: number, p: Partial<Pick<PP, 'x' | 'y' | 'w' | 'buttons'>> = {}, W = 1080, H = 1920): [number, number] {
  const k = Math.min(W, H) / 1080, w = (p.w ?? 0.84) * Math.min(W, H), count = Math.max(1, String(p.buttons ?? '好啊！|再等等').split('|').filter(Boolean).length);
  const bwid = Math.min(300 * k, (w - 120 * k) / count), gap = (w - count * bwid) / (count + 1), left = (p.x ?? 0.5) * W - w / 2, top = (p.y ?? 0.45) * H - 150 * k;
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return [r((left + gap + (clamp(n, 1, count) - 1) * (bwid + gap) + bwid / 2) / W), r((top + 50 * k + 140 * k + 43 * k) / H)];
}

/** sheet: the cream panel rising, the line typed, the button pressed at `press` and its pixel confetti */
function drawSheet(g: G, p: PP, local: number, W: number, H: number, k: number, label: string, report: Report) {
  const top = p.y * H, y0 = top + (1 - eIO(clamp(local / 0.45))) * (H - top);
  g.fillStyle = p.paper; g.fillRect(0, y0, W, H - y0); g.fillStyle = p.ink; g.fillRect(0, y0, W, 4 * k);
  const chars = [...String(p.text)], typedAt = p.typeAt + chars.length * 0.08, n = Math.floor(clamp((local - p.typeAt) / Math.max(0.01, chars.length * 0.08)) * chars.length), typed = chars.slice(0, n).join('');
  g.fillStyle = p.ink; g.font = `${fit(g, String(p.text), 64 * k, `"${CJK}"`, W - 120 * k)}px "${CJK}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (typed) { g.fillText(typed, W / 2, y0 + 120 * k); report(g, typed, W / 2, y0 + 120 * k); }
  const pressed = p.press >= 0 && local >= p.press, after = pressed && local >= p.press + 0.2, bw = 380 * k, bh = 96 * k;
  if (local > typedAt && label) button(g, W / 2 - bw / 2, y0 + 210 * k, bw, bh, k, after ? '#97e0c6' : '#ffd46b', after ? p.done : label, pressed && !after, p.ink, report);
  if (!pressed) return;
  const r = rng(p.seed), t = local - p.press, cx = W / 2, cy = y0 + 258 * k, cols = ['#f48fbf', '#8fdcc2', '#ffd46b', '#b9a6f2', '#7fb2e5'];
  g.globalAlpha = clamp(1 - (t - 1.4) / 0.6);
  for (let i = 0; i < 90; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6, v = (500 + r() * 900) * k, z = (8 + r() * 10) * k;
    g.fillStyle = cols[i % cols.length]; g.fillRect(cx + Math.cos(a) * v * t, cy + Math.sin(a) * v * t + 900 * k * t * t, z, z);
  }
  g.globalAlpha = 1;
}

/** the sheet's button centre in frame fractions (for the cursor) */
export function sheetButton(p: Partial<Pick<PP, 'y'>> = {}, W = 1080, H = 1920): [number, number] {
  const k = Math.min(W, H) / 1080;
  return [0.5, Math.round((((p.y ?? 0.45) * H + 258 * k) / H) * 1e4) / 1e4];
}
