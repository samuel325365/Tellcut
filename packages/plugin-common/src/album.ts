// common.album — a phone's photo album as a screen recording, from uk-album's fx.albumGrid / albumForYou / albumZoom / albumSwipe /
// albumChrome (the film's rhythm kept: the tile pattern, the fling with its date bubble, the open and close, the memory card). A generic
// album, not any real app: every word (tabs, title, button, dates, places, the time in the status bar) is a parameter and the icons
// are phone.ts' own drawn set. One block, five modes stacked on the same phone:
//   grid    the photos in groups by day (a header with place and date; three photos as one big and two small, two side by side, one
//           full width, the rest in rows of three), scrolled by "秒|第幾組|緩動" keys, the date bubble at the right edge, the tab bar
//   foryou  the memories page: one memory card (a picture, a hand-written title, a line under it) that gives a little when tapped
//   zoom    a picture flying from one box to another — a grid tile to the full screen (open) and back (close), a card opening, a
//           letterboxed landscape picture spread to fill; the full screen is placed exactly like the main-track clip with the same
//           crop, so the clip takes over where the flight ends
//   swipe   the viewer going to the next picture: this one leaves to the left, the next comes in from the right over black
//   viewer  the bars round a picture being looked at: back, the date and time, an action word, a toolbar (the heart pops at heartAt)
// Pictures are the project's sources (a still at t s; a photo: 0) or, with no source, painted stand-ins (a gallery preview, goldens).
// On 9:16 the screen is the frame; on a wide or square frame it is a phone in the middle (phone.ts): the main-track clip then takes
// `frame: screenFrame(W, H)`. common.touch draws the finger (albumTile gives where a tile is), common.handwrite the hand-written notes.
import { clamp, coverPlacement, cssCamel, defaultSafe, eBack, eIO3, eOut3, h, lerp, withDefaults, type Crop, type ItemType, type MediaApi, type Theme } from '@tellcut/engine';
import { countAt, popAt } from './reels.ts';
import { asFrame, imagesReady, showStill, stillRef, stillUrl, windowEl, type Still, type Win } from './window.ts';
import { DEVICES, drawStatusBar, glyphSvg, parseSteps, phoneEls, phoneScreen, phoneView, placePhone, statusBarEl, timeSpan, type Device, type PhoneEls, type StatusBar } from './phone.ts';
import { fitPx, lineAbs, nl } from './text.ts';
import { withAlpha } from './color.ts';

export const ALBUM_MODES = ['grid', 'foryou', 'zoom', 'swipe', 'viewer'] as const;
type Mode = (typeof ALBUM_MODES)[number];
/** where a zoom starts or ends: a grid tile, the full screen (cover, the clip's crop), the whole picture letterboxed, the memory card */
export const ZOOM_ENDS = ['tile', 'full', 'fit', 'card'] as const;
type End = (typeof ZOOM_ENDS)[number];
const EASE = { out: eOut3, inOut: eIO3, linear: (p: number) => p, back: (p: number) => eBack(p) } as const;
type Ease = keyof typeof EASE;
export type Rect = [number, number, number, number];

// ---------------------------------------------------------------- the photos and their groups
export interface AlbumPhoto { source: string; t: number; label: string; fx: number; fy: number }
export interface AlbumGroup { place: string; date: string; day: string; layout: string; photos: number[] }
const num = (v: unknown, d: number) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
/** "# 地點|日期|泡泡字|版型" starts a group; every other line is a photo "素材|秒|角落字|x,y" (素材 - or empty: a stand-in) */
export function parseAlbum(text: string): { groups: AlbumGroup[]; photos: AlbumPhoto[] } {
  const groups: AlbumGroup[] = [], photos: AlbumPhoto[] = [];
  for (const raw of nl(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const [place = '', date = '', day = '', layout = ''] = line.slice(1).split('|').map((x) => x.trim());
      groups.push({ place, date, day, layout: layout.toUpperCase(), photos: [] });
      continue;
    }
    if (!groups.length) groups.push({ place: '', date: '', day: '', layout: '', photos: [] });
    const [src = '', t = '', label = '', focus = ''] = line.split('|').map((x) => x.trim());
    const [fx, fy] = focus ? focus.split(/[,，\s]+/) : [];
    groups[groups.length - 1].photos.push(photos.length);
    photos.push({ source: src === '-' ? '' : src, t: num(t, 0), label, fx: clamp(num(fx, 0.5)), fy: clamp(num(fy, 0.5)) });
  }
  return { groups, photos };
}

/** the grid's design space: 1080 wide, the content starts under the top bar */
export const ALBUM_TOP = 280;
const HEAD = 170, GAP = 4, COL = (1080 - 2 * GAP) / 3, BIG = 2 * COL + GAP, HALF = (1080 - GAP) / 2, PAIR_H = 716, ONE_H = 900, FOOT = 260;
/** Every tile (x, y, w, h in the content, design px; index = photo), every group's top and the content's height. Layout L: one big at
 *  the left and two small, R the same mirrored, 2 side by side, 1 full width, 3 rows of three; auto by the count (3 alternates L, R);
 *  photos past the pattern go on in rows of three. */
export function albumLayout(groups: AlbumGroup[], n: number): { tiles: Rect[]; groupY: number[]; height: number } {
  const tiles: Rect[] = Array.from({ length: n }, () => [0, 0, 0, 0] as Rect), groupY: number[] = [];
  let y = 0, threes = 0;
  for (const g of groups) {
    groupY.push(y);
    const ids = g.photos, m = ids.length;
    let ty = y + HEAD, used = 0, lay = g.layout;
    const fits = lay === '3' || (lay === '1' && m >= 1) || (lay === '2' && m >= 2) || ((lay === 'L' || lay === 'R') && m >= 3);
    if (!fits) lay = m === 1 ? '1' : m === 2 ? '2' : m >= 3 ? (threes % 2 ? 'R' : 'L') : '';
    if (lay === 'L' || lay === 'R') {
      threes++;
      const bx = lay === 'L' ? 0 : COL + GAP, sx = lay === 'L' ? BIG + GAP : 0;
      tiles[ids[0]] = [bx, ty, BIG, BIG]; tiles[ids[1]] = [sx, ty, COL, COL]; tiles[ids[2]] = [sx, ty + COL + GAP, COL, COL];
      ty += BIG + GAP; used = 3;
    } else if (lay === '2') { tiles[ids[0]] = [0, ty, HALF, PAIR_H]; tiles[ids[1]] = [HALF + GAP, ty, HALF, PAIR_H]; ty += PAIR_H + GAP; used = 2; }
    else if (lay === '1') { tiles[ids[0]] = [0, ty, 1080, ONE_H]; ty += ONE_H + GAP; used = 1; }
    for (let j = used; j < m; j += 3) {
      for (let c = 0; c < 3 && j + c < m; c++) tiles[ids[j + c]] = [c * (COL + GAP), ty, COL, COL];
      ty += COL + GAP;
    }
    y = ty;
  }
  return { tiles, groupY, height: y + FOOT };
}
/** how far the content can scroll on a screen Hd design px tall */
export const albumMaxY = (height: number, Hd: number) => Math.max(0, height - (Hd - ALBUM_TOP));

/** The scroll (design px) at t from "秒|位置|緩動" keys: 位置 is a group counted from 0 (its header just under the top bar; a fraction
 *  lies between two), end (the bottom) or px ("850px"); 緩動 out / inOut (default) / linear / back, into that key. */
export function albumScroll(text: string, t: number, groupY: number[], maxY: number): number {
  const at = (v: string) => {
    v = String(v ?? '').trim();
    if (v === 'end') return maxY;
    if (/px$/i.test(v)) return num(v.slice(0, -2), 0);
    const g = num(v, 0);
    if (!groupY.length) return 0;
    const i = clamp(g, 0, groupY.length - 1), a = Math.floor(i), b = Math.min(groupY.length - 1, a + 1);
    return lerp(groupY[a], groupY[b], i - a) - 40;
  };
  const ks = parseSteps(text).map((s) => ({ t: s.t, y: clamp(at(s.v[0] ?? '0'), 0, maxY), e: EASE[(s.v[1] ?? '') as Ease] ?? eIO3 }));
  if (!ks.length) return 0;
  if (t <= ks[0].t) return ks[0].y;
  for (let i = 1; i < ks.length; i++) if (t < ks[i].t) return lerp(ks[i - 1].y, ks[i].y, ks[i].e(clamp((t - ks[i - 1].t) / Math.max(1e-6, ks[i].t - ks[i - 1].t))));
  return ks[ks.length - 1].y;
}
/** the photos blanked at t ("秒-秒|第幾張" lines, from 0, several separated by commas; "秒|…" from then on): the one flying open */
export function hiddenAt(text: string, t: number): Set<number> {
  const out = new Set<number>();
  for (const l of nl(text).split('\n')) {
    const [when = '', which = ''] = l.split('|').map((x) => x.trim()), s = timeSpan(when);
    if (!s || t < s[0] || t >= (s[1] ?? Infinity)) continue;
    for (const n of which.split(/[,，\s]+/)) if (/^\d+$/.test(n)) out.add(Number(n));
  }
  return out;
}
/** "圖示|名字" separated by commas or lines (a name alone: the app glyph) */
export function parseTabs(text: string): Array<{ icon: string; name: string }> {
  return nl(text).split(/[,，\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const [a, b] = x.split('|').map((y) => y.trim());
    return b === undefined ? { icon: 'app', name: a } : { icon: a || 'app', name: b };
  });
}
/** a video's length as a tile's corner shows it: 0:07, 1:02 */
export const clipLen = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Where photo i's tile is at local time t of a grid item with these params, on a W×H frame: rect (fractions of the frame, like a
 *  clip's `frame`) and its centre (x, y fractions: common.touch's tap). null when there is no such photo. */
export function albumTile(params: Record<string, unknown>, i: number, t = 0, W = 1080, H = 1920, safe?: Partial<Theme['safe']>) {
  const p = withDefaults(album.params, params) as P;
  const sc = phoneScreen(W, H, { ...defaultSafe(W, H), ...safe }, p.device, p.px), Hd = sc.h / sc.k;
  const A = parseAlbum(p.photos), L = albumLayout(A.groups, A.photos.length), maxY = albumMaxY(L.height, Hd);
  const r = L.tiles[i];
  if (!r) return null;
  const Y = clamp(albumScroll(p.scroll, t, L.groupY, maxY), 0, maxY);
  const px: Rect = [sc.x + r[0] * sc.k, sc.y + (ALBUM_TOP + r[1] - Y) * sc.k, r[2] * sc.k, r[3] * sc.k];
  const f = (v: number) => Math.round(v * 1e4) / 1e4;
  return { rect: asFrame(px, W, H), x: f((px[0] + px[2] / 2) / W), y: f((px[1] + px[3] / 2) / H) };
}

// ---------------------------------------------------------------- stand-ins and the flight
const STAND: Array<[string, string, string]> = [
  ['#a8d5e2', '#f3d9b1', '#fff7e0'], ['#f6bd60', '#e76f51', '#fff1d6'], ['#95d5b2', '#2d6a4f', '#f1faee'], ['#cdb4db', '#6d597a', '#fde2e4'],
  ['#ffd6a5', '#cb997e', '#fffbe8'], ['#90e0ef', '#0077b6', '#e0fbfc'], ['#e9c46a', '#7f5539', '#fff8e1'], ['#ffafcc', '#a2d2ff', '#ffffff'],
];
/** a painted stand-in for photo i (a sky, a low hill, a sun): the same i always gets the same one */
export function standIn(i: number): string {
  const [a, b, c] = STAND[((Math.round(i) % STAND.length) + STAND.length) % STAND.length];
  return `radial-gradient(circle at 72% 28%, ${c} 0 8%, transparent 8.5%), radial-gradient(ellipse 85% 36% at 28% 100%, rgba(0,0,0,0.2) 0 99%, transparent 100%), linear-gradient(165deg, ${a}, ${b})`;
}

/** a picture iw × ih in a box: the box (px), the scale and which picture point sits at the box's middle, the corner radius */
export interface Pose { r: Rect; s: number; cx: number; cy: number; rad: number }
/** cover: placed like the engine places a clip (coverPlacement with crop); fit: the whole picture, the box shrunk round it */
export function poseOf(iw: number, ih: number, r: Rect, how: 'cover' | 'fit', crop: Crop, rad = 0): Pose {
  if (how === 'fit') {
    const s = Math.min(r[2] / iw, r[3] / ih), w = iw * s, hh = ih * s;
    return { r: [r[0] + (r[2] - w) / 2, r[1] + (r[3] - hh) / 2, w, hh], s, cx: iw / 2, cy: ih / 2, rad };
  }
  const b = coverPlacement(iw, ih, r[2], r[3], crop), s = b.width / iw;
  return { r, s, cx: (r[2] / 2 - b.left) / s, cy: (r[3] / 2 - b.top) / s, rad };
}
/** between two poses: the box and the picture point move straight, the scale evenly in log (no wobble in size) */
export function flyPose(a: Pose, b: Pose, k: number): Pose {
  return { r: a.r.map((v, i) => lerp(v, b.r[i], k)) as Rect, s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), k)), cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), rad: lerp(a.rad, b.rad, k) };
}
/** the picture's box in its window for a pose (px, from the window's corner) */
export const poseImg = (q: Pose, iw: number, ih: number) => ({ left: q.r[2] / 2 - q.cx * q.s, top: q.r[3] / 2 - q.cy * q.s, width: iw * q.s, height: ih * q.s });

// ---------------------------------------------------------------- the block
interface P {
  mode: Mode; photos: string; scroll: string; hide: string; pick: number; title: string; button: string; tabs: string; tab: number; chips: string; chip: number; bubble: boolean;
  section: string; more: string; cardTitle: string; cardSub: string; next: string; tapAt: number; fadeIn: number;
  source: string; t: number; crop: Crop; source2: string; t2: number; crop2: Crop; fit: boolean; fit2: boolean; zoomFrom: End; zoomTo: End; ease: Ease; move: number; fadeOut: number;
  date: string; when: string; action: string; tools: string; heartAt: number; show: string; time: string; battery: number;
  device: Device; px: number; font: string; hand: string; paper: string; ink: string; accent: string; heart: string; hl: string;
}
interface Tile { win: Win; label: HTMLElement; blank: HTMLElement }
interface Head { el: HTMLElement; place: HTMLElement; date: HTMLElement }
interface S {
  ph: PhoneEls; key: string; A: ReturnType<typeof parseAlbum>; L: ReturnType<typeof albumLayout>;
  page: HTMLElement; content: HTMLElement; tiles: Tile[]; heads: Head[];
  topBar: HTMLElement; title: HTMLElement; button: HTMLElement; rail: HTMLElement; bubble: HTMLElement; bubDate: HTMLElement; bubDay: HTMLElement;
  chips: HTMLElement; chipEls: HTMLElement[]; tabBar: HTMLElement; tabEls: Array<{ icon: HTMLElement; name: HTMLElement }>;
  section: HTMLElement; more: HTMLElement; card: HTMLElement; cardWin: Win; cardShade: HTMLElement; cardTitle: HTMLElement; cardSub: HTMLElement; next: HTMLElement; fade: HTMLElement;
  black: HTMLElement; fly: Win; wa: Win; wb: Win;
  vTop: HTMLElement; vBottom: HTMLElement; back: HTMLElement; date: HTMLElement; when: HTMLElement; action: HTMLElement; tools: HTMLElement[];
  sb: StatusBar; home: HTMLElement;
}
const asCrop = (c: unknown, d: Crop = { x: 0.5, y: 0.5, zoom: 1 }): Crop => { const o = (c ?? {}) as Partial<Crop>; return { x: num(o.x, d.x), y: num(o.y, d.y), zoom: num(o.zoom, d.zoom) }; };
/** put svg in el, rebuilt only when it changes */
const svgIn = (el: HTMLElement, key: string, svg: () => string) => { if (el.dataset.k !== key) { el.dataset.k = key; el.innerHTML = svg(); } };
/** the memory card on a screen Hd design px tall */
export const cardRect = (Hd: number): Rect => [60, 440, 960, Hd - 770];

/** the picture a zoom, a swipe (second: the next one) or the card shows: the given source, else photo pick (+1) of the list */
function picture(p: P, A: S['A'], second: boolean): { still: Still | null; i: number; focus: Crop; crop: Crop } {
  const src = second ? p.source2 : p.source, i = Math.max(0, Math.round(p.pick)) + (second ? 1 : 0), crop = asCrop(second ? p.crop2 : p.crop);
  if (src) return { still: { source: src, t: second ? p.t2 : p.t, crop }, i, focus: { ...crop, zoom: 1 }, crop };
  const ph = A.photos[i], focus = { x: ph?.fx ?? 0.5, y: ph?.fy ?? 0.5, zoom: 1 };
  return { still: ph?.source ? { source: ph.source, t: ph.t, crop } : null, i, focus, crop };
}
/** point the window at a still (or the stand-in) without placing the picture: the zoom and the swipe place it themselves */
function loadWin(media: MediaApi, win: Win, s: Still | null, i: number) {
  const src = s ? stillUrl(media, s) : '';
  if (src !== win.src) { win.src = src; if (src) win.img.src = src; else win.img.removeAttribute('src'); }
  cssCamel(win.ph, { background: standIn(i) });
  const ok = !!src && win.img.complete && win.img.naturalWidth > 0;
  cssCamel(win.ph, { display: ok ? 'none' : 'block' });
  cssCamel(win.img, { display: ok ? 'block' : 'none' });
  return ok ? { iw: win.img.naturalWidth, ih: win.img.naturalHeight } : null;
}
/** place a window at a pose (px in the screen); dx shifts it (a swipe) */
function placeWin(win: Win, q: Pose, size: { iw: number; ih: number } | null, alpha = 1, dx = 0) {
  cssCamel(win.box, { display: alpha > 0 ? 'block' : 'none', left: `${q.r[0] + dx}px`, top: `${q.r[1]}px`, width: `${q.r[2]}px`, height: `${q.r[3]}px`, borderRadius: `${q.rad}px`, opacity: String(alpha) });
  if (!size) return;
  const b = poseImg(q, size.iw, size.ih);
  cssCamel(win.img, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
}

const PHOTOS = '# 海邊小鎮|7月12日|第 1 天\n-\n-||0:12\n-\n# 山上的老街|7月13日|第 2 天\n-||0:08\n-\n-\n# |7月15日|第 4 天\n-\n-';

export const album: ItemType<P, S> = {
  type: 'common.album', label: '手機相簿', category: 'phone', kind: 'overlay',
  doc: '手機相簿的螢幕錄影（通用介面，不是哪一家 App；每個字、分頁、日期、地點、狀態列時間都是參數，圖示是內建的自繪圖示），同一支手機疊五種 mode：grid 相片格——photos 一行一張「素材|秒|角落字|x,y」（素材是專案的素材 id，影片取那一秒的畫面；- 或空＝畫的示意色塊；角落字空＝影片自動寫片長、- 不寫；x,y 縮圖的焦點），「# 地點|日期|泡泡字|版型」開一組（地點空＝只寫日期；版型 L 左大右兩小、R 反過來、2 兩張並排、1 一張滿寬、3 一排三張，空＝依張數自動，3 張輪流 L／R；多的一排三張接下去），scroll「秒|位置|緩動」捲動（位置＝第幾組，從 0 數，可帶小數；end 到底；850px 直接給 px；緩動 out／inOut／linear／back），右緣日期泡泡跟著跳（bubble；日期＋泡泡字），hide「秒-秒|第幾張」把正在飛出去的那格留白，上方標題（title 空＝亮著的分頁名）＋右上按鈕（button），底部分頁列（tabs「圖示|名字」逗號分隔，tab 亮哪一個，-1＝grid 第 0 個、foryou 第 1 個）、可選的分段膠囊（chips 逗號分隔、chip 選哪個）；foryou 回憶頁——標題、section＋more 連結、一張回憶卡片（source／t／crop，空＝photos 第 pick 張；cardTitle 手寫字、cardSub），tapAt 點下去縮一下，next 下一排的標題露出來，fadeIn 從紙色淡入；zoom 一張畫面從 zoomFrom 飛到 zoomTo（tile 第 pick 格（位置用 scroll 在項目開始時的值）、full 滿版（crop 跟主軌片段一樣，最後一格接上真的影片）、fit 整張放進畫面（橫式上下留黑）、card 回憶卡片），move 秒內飛完（ease），後面的黑底跟著變（滿版＝黑），fadeOut 最後淡出；swipe 看大圖往左滑：這張（source 或第 pick 張）往左出去、下一張（source2 或第 pick+1 張）從右邊進來，fit／fit2 整張放進畫面；viewer 看大圖的上下介面——返回、date、when、action 字、tools 工具列（圖示逗號分隔，heart 在 heartAt 跳一下變 heart 色），show「秒|透明度」關鍵影格（影片播一下就淡掉）；狀態列 time、battery；9:16 鋪滿畫面，16:9／1:1 是畫面中間一支手機（device；主軌片段用 frame: screenFrame(寬, 高)）；手指用 common.touch（albumTile(參數, 第幾張, 秒, 寬, 高) 給格子的位置）、手寫標註用 common.handwrite、閃白淡黑用 core.flash；音效配 common.tick（點一下）、common.whoosh（飛開、甩動、滑）、common.thud（兩指捏合）',
  params: [
    { key: 'mode', label: '樣式（grid 相片格、foryou 回憶頁、zoom 點開或縮回的飛行、swipe 左右滑、viewer 看大圖的介面）', type: 'enum', options: [...ALBUM_MODES], default: 'grid' },
    { key: 'photos', label: '相片（一行一張：素材|秒|角落字|x,y；「# 地點|日期|泡泡字|版型」開一組；素材 - ＝示意色塊）', type: 'text', default: PHOTOS },
    { key: 'scroll', label: '捲動（grid：一行一個 秒|第幾組（從 0 數；end 到底；數字加 px）|緩動 out/inOut/linear/back；zoom 取項目開始時的位置）', type: 'text', default: '0|0\n0.6|0\n2.2|1|out' },
    { key: 'hide', label: '留白的格子（grid：一行一個 秒-秒|第幾張，從 0 數）', type: 'text', default: '' },
    { key: 'pick', label: '第幾張（zoom 飛哪一格、swipe 現在這張、foryou 卡片；從 0 數，給了 source 就用 source）', type: 'number', min: 0, max: 500, step: 1, default: 0 },
    { key: 'title', label: '頁面標題（grid、foryou；空＝亮著的分頁名）', type: 'string', default: '' },
    { key: 'button', label: '右上角的按鈕（grid；空＝沒有）', type: 'string', default: '選取' },
    { key: 'tabs', label: '分頁列（grid、foryou：圖示|名字，逗號分隔；空＝沒有分頁列）', type: 'string', default: 'image|照片, heart|回憶, app|相簿, search|搜尋' },
    { key: 'tab', label: '亮著的分頁（從 0 數；-1＝grid 第 0 個、foryou 第 1 個）', type: 'number', min: -1, max: 9, step: 1, default: -1 },
    { key: 'chips', label: '分段膠囊（grid：逗號分隔，例如 年, 月, 日, 全部；空＝沒有）', type: 'string', default: '' },
    { key: 'chip', label: '選了第幾段（從 0 數）', type: 'number', min: 0, max: 9, step: 1, default: 0 },
    { key: 'bubble', label: '右緣的日期泡泡（grid：目前這組的日期和泡泡字）', type: 'bool', default: true },
    { key: 'section', label: '區塊標題（foryou）', type: 'string', default: '精選回憶' },
    { key: 'more', label: '區塊右邊的連結字（foryou；空＝沒有）', type: 'string', default: '查看全部' },
    { key: 'cardTitle', label: '卡片標題（foryou，手寫字）', type: 'string', default: '海邊的夏天' },
    { key: 'cardSub', label: '卡片副標（foryou）', type: 'string', default: '2025年7月' },
    { key: 'next', label: '下一排的標題（foryou，露出一點；空＝沒有）', type: 'string', default: '精選照片' },
    { key: 'tapAt', label: '點卡片的時間（foryou，項目內秒數，卡片縮一下；-1＝不點）', type: 'number', min: -1, max: 600, step: 0.05, default: 1.6 },
    { key: 'fadeIn', label: '從紙色淡入（foryou，秒；0＝不淡入）', type: 'number', min: 0, max: 5, step: 0.05, default: 0 },
    { key: 'source', label: '畫面素材（zoom、swipe 現在這張、foryou 卡片；空＝photos 第 pick 張）', type: 'source-ref', default: '' },
    { key: 't', label: '畫面取素材第幾秒', type: 'number', min: 0, max: 36000, step: 0.05, default: 0 },
    { key: 'crop', label: '畫面的裁切 { x, y, zoom }（滿版時跟主軌片段一樣；格子和卡片用它的 x, y）', type: 'json', default: { x: 0.5, y: 0.5, zoom: 1 } },
    { key: 'source2', label: '下一張的素材（swipe；空＝photos 第 pick+1 張）', type: 'source-ref', default: '' },
    { key: 't2', label: '下一張取素材第幾秒', type: 'number', min: 0, max: 36000, step: 0.05, default: 0 },
    { key: 'crop2', label: '下一張的裁切 { x, y, zoom }', type: 'json', default: { x: 0.5, y: 0.5, zoom: 1 } },
    { key: 'fit', label: '這張整張放進畫面（swipe：橫式上下留黑）', type: 'bool', default: false },
    { key: 'fit2', label: '下一張整張放進畫面（swipe）', type: 'bool', default: false },
    { key: 'zoomFrom', label: '飛行起點（zoom：tile 格子、full 滿版、fit 整張留黑邊、card 回憶卡片）', type: 'enum', options: [...ZOOM_ENDS], default: 'tile' },
    { key: 'zoomTo', label: '飛行終點（zoom）', type: 'enum', options: [...ZOOM_ENDS], default: 'full' },
    { key: 'ease', label: '飛行緩動（zoom）', type: 'enum', options: Object.keys(EASE), default: 'out' },
    { key: 'move', label: '飛行／滑動秒數（zoom、swipe；之後停在終點；0＝整個項目）', type: 'number', min: 0, max: 10, step: 0.05, default: 0.6 },
    { key: 'fadeOut', label: '最後淡出秒數（zoom）', type: 'number', min: 0, max: 3, step: 0.05, default: 0 },
    { key: 'date', label: '日期（viewer 上方）', type: 'string', default: '7月12日' },
    { key: 'when', label: '時間（viewer 日期下面）', type: 'string', default: '下午 3:24' },
    { key: 'action', label: '右上角的字（viewer；空＝沒有）', type: 'string', default: '編輯' },
    { key: 'tools', label: '工具列圖示（viewer：逗號分隔，內建圖示名；空＝沒有工具列）', type: 'string', default: 'heart, share, info, trash' },
    { key: 'heartAt', label: '按愛心的時間（viewer：跳一下、變色；-1＝不按）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'show', label: '介面透明度（viewer：一行一個 秒|0–1，之間緩動）', type: 'text', default: '0|1' },
    { key: 'time', label: '狀態列的時間', type: 'string', default: '14:08' },
    { key: 'battery', label: '電量（%）', type: 'number', min: 0, max: 100, step: 1, default: 80 },
    { key: 'device', label: '手機（auto：9:16 鋪滿畫面、其他比例畫一支手機；phone 一律畫手機；bare 只要 9:16 的畫面不畫機身）', type: 'enum', options: DEVICES, default: 'auto' },
    { key: 'px', label: '手機中心 x（畫面寬比例；有手機時）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'hand', label: '卡片標題的手寫字', type: 'string', default: 'LXGW WenKai TC' },
    { key: 'paper', label: '頁面底色（介面條是它的半透明）', type: 'color', default: '#ffffff' },
    { key: 'ink', label: '字色', type: 'color', default: '#111111' },
    { key: 'accent', label: '強調色（亮著的分頁、按鈕、連結、工具列）', type: 'color', default: '#2f7cf6' },
    { key: 'heart', label: '按過的愛心色', type: 'color', default: '#ff3b5c' },
    { key: 'hl', label: '日期泡泡第二行的顏色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
  ],
  media(item) {
    const p = withDefaults(album.params, item.params as Record<string, unknown>) as P, A = parseAlbum(p.photos), out = new Map<string, ReturnType<typeof stillRef>>();
    const add = (s: Still | null) => { if (s) { const r = stillRef(s); out.set(`${r.source}@${r.t}`, r); } };
    if (p.mode === 'grid') for (const ph of A.photos) add(ph.source ? { source: ph.source, t: ph.t } : null);
    if (p.mode === 'foryou' || p.mode === 'zoom' || p.mode === 'swipe') add(picture(p, A, false).still);
    if (p.mode === 'swipe') add(picture(p, A, true).still);
    return { videos: [], stills: [...out.values()] };
  },
  build(ctx) {
    const ph = phoneEls(ctx.root), sc = ph.screen;
    const page = lineAbs(sc), content = lineAbs(page), topBar = lineAbs(page), title = lineAbs(page), button = lineAbs(page), rail = lineAbs(page), bubble = lineAbs(page), bubDate = lineAbs(bubble), bubDay = lineAbs(bubble);
    const chips = lineAbs(page), tabBar = lineAbs(page);
    cssCamel(chips, { display: 'flex', alignItems: 'center' });
    const section = lineAbs(page), more = lineAbs(page), card = lineAbs(page), cardWin = windowEl(card), cardShade = lineAbs(card), cardTitle = lineAbs(card), cardSub = lineAbs(card), next = lineAbs(page);
    const black = lineAbs(sc), fly = windowEl(sc), wa = windowEl(sc), wb = windowEl(sc);
    const vTop = lineAbs(sc), vBottom = lineAbs(sc), back = lineAbs(sc), date = lineAbs(sc), when = lineAbs(sc), action = lineAbs(sc);
    const sb = statusBarEl(sc), home = lineAbs(sc), fade = lineAbs(sc);
    for (const e of [page, content, black, fade]) cssCamel(e, { inset: '0' });
    cssCamel(content, { overflow: 'hidden' });
    const s: S = { ph, key: '', A: { groups: [], photos: [] }, L: { tiles: [], groupY: [], height: 0 }, page, content, tiles: [], heads: [], topBar, title, button, rail, bubble, bubDate, bubDay,
      chips, chipEls: [], tabBar, tabEls: [], section, more, card, cardWin, cardShade, cardTitle, cardSub, next, fade, black, fly, wa, wb, vTop, vBottom, back, date, when, action, tools: [], sb, home };
    album.draw(ctx, s);
    // every tile's still starts loading now (not only the ones on screen), so ready() waits for all of them
    if (ctx.params.mode === 'grid') s.tiles.forEach((tl, i) => {
      const q = s.A.photos[i], src = q.source ? stillUrl(ctx.media, { source: q.source, t: q.t }) : '';
      if (src && tl.win.src !== src) { tl.win.src = src; tl.win.img.src = src; }
    });
    return s;
  },
  ready: (s) => imagesReady([...s.tiles.map((t) => t.win.img), s.cardWin.img, s.fly.img, s.wa.img, s.wb.img]),
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t, dur, media } = ctx;
    const { sc, k, Hd, X } = phoneView(W, H, theme.safe, p);
    placePhone(s.ph, sc);
    const font = `'${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`, hand = `'${p.hand}', '${p.font}', 'Noto Sans TC', sans-serif`;
    cssCamel(s.ph.screen, { fontFamily: font, color: p.ink });
    const mode: Mode = (ALBUM_MODES as readonly string[]).includes(p.mode) ? p.mode : 'grid';
    const isPage = mode === 'grid' || mode === 'foryou', isGrid = mode === 'grid', isFy = mode === 'foryou', flying = mode === 'zoom' || mode === 'swipe';
    // the photos, laid out again only when they change
    if (s.key !== p.photos) {
      s.key = p.photos; s.A = parseAlbum(p.photos); s.L = albumLayout(s.A.groups, s.A.photos.length);
      for (const tl of s.tiles) tl.win.box.remove();
      for (const hd of s.heads) hd.el.remove();
      s.tiles = s.A.photos.map((_, i) => {
        const win = windowEl(s.content), blank = lineAbs(win.box), label = lineAbs(win.box);
        cssCamel(win.ph, { background: standIn(i) });
        cssCamel(blank, { inset: '0' });
        return { win, label, blank };
      });
      s.heads = s.A.groups.map(() => { const el = lineAbs(s.content), place = lineAbs(el), date = lineAbs(el); return { el, place, date }; });
    }
    const A = s.A, L = s.L;
    const bar = withAlpha(p.paper, 0.94), hair = withAlpha(p.ink, 0.1), muted = withAlpha(p.ink, 0.55);
    for (const [e, on] of [[s.page, isPage], [s.content, isGrid], [s.topBar, isGrid], [s.button, isGrid && !!p.button], [s.section, isFy], [s.more, isFy && !!p.more], [s.card, isFy], [s.next, isFy && !!p.next],
      [s.black, flying], [s.vTop, mode === 'viewer'], [s.vBottom, mode === 'viewer' && !!p.tools.trim()], [s.back, mode === 'viewer'], [s.date, mode === 'viewer'], [s.when, mode === 'viewer'], [s.action, mode === 'viewer' && !!p.action],
      [s.sb.el, !flying], [s.home, !flying]] as Array<[HTMLElement, boolean]>) cssCamel(e, { display: on ? 'block' : 'none' });
    for (const w of [s.fly, s.wa, s.wb]) if (!(w === s.fly ? mode === 'zoom' : mode === 'swipe')) cssCamel(w.box, { display: 'none' });
    if (!isGrid) for (const e of [s.rail, s.bubble, s.chips]) cssCamel(e, { display: 'none' });
    if (mode !== 'viewer') for (const e of s.tools) cssCamel(e, { display: 'none' });
    if (!isFy) cssCamel(s.fade, { display: 'none' });
    if (mode !== 'viewer') cssCamel(s.sb.el, { opacity: '1' });
    cssCamel(s.page, { background: p.paper });

    // the tabs and the page title (grid and foryou)
    const tabs = parseTabs(p.tabs), active = p.tab >= 0 ? Math.round(p.tab) : isFy ? 1 : 0;
    const pageTitle = p.title || tabs[active]?.name || '';
    if (isPage) {
      s.title.textContent = pageTitle;
      cssCamel(s.title, { display: pageTitle ? 'block' : 'none', left: X(36), top: X(210), transform: 'translateY(-50%)', fontSize: X(fitPx(pageTitle, 84, isGrid && p.button ? 760 : 1000)), fontWeight: '700', color: p.ink });
      if (s.tabEls.length !== tabs.length) {
        for (const e of s.tabEls) { e.icon.remove(); e.name.remove(); }
        s.tabEls = tabs.map(() => ({ icon: lineAbs(s.tabBar), name: lineAbs(s.tabBar) }));
      }
      cssCamel(s.tabBar, { display: tabs.length ? 'block' : 'none', left: '0', top: X(Hd - 168), width: '100%', height: X(168), background: bar, borderTop: `${2 * k}px solid ${hair}` });
      tabs.forEach((tb, i) => {
        const on = i === active, col = on ? p.accent : withAlpha(p.ink, 0.4), cx = (1080 * (i + 0.5)) / tabs.length, e = s.tabEls[i];
        svgIn(e.icon, `${tb.icon}${col}${p.paper}`, () => glyphSvg(tb.icon, col, p.paper));
        cssCamel(e.icon, { left: X(cx - 28), top: X(32), width: X(56), height: X(56) });
        e.name.textContent = tb.name;
        cssCamel(e.name, { left: X(cx), top: X(107), transform: 'translate(-50%, -50%)', fontSize: X(fitPx(tb.name, 30, 1080 / tabs.length - 24)), fontWeight: on ? '700' : '400', color: col });
      });
    } else cssCamel(s.tabBar, { display: 'none' });

    if (isGrid) drawGrid();
    if (isFy) drawForYou();
    if (mode === 'zoom') drawZoom();
    if (mode === 'swipe') drawSwipe();
    if (mode === 'viewer') drawViewer();
    // the status bar and the home bar over everything but a flight (a viewer item stacked on top draws them there)
    if (!flying) {
      drawStatusBar(s.sb, { time: p.time, carrier: '', signal: 4, wifi: true, battery: p.battery, color: p.ink, font: p.font }, k, 72 * k, sc.w, false);
      cssCamel(s.home, { left: X(380), top: X(Hd - 24), width: X(320), height: X(10), borderRadius: X(5), background: p.ink, opacity: mode === 'viewer' ? String(viewerAlpha()) : '1' });
    }

    function drawGrid() {
      const maxY = albumMaxY(L.height, Hd), Y = clamp(albumScroll(p.scroll, t, L.groupY, maxY), 0, maxY), hidden = hiddenAt(p.hide, t);
      const blank = `linear-gradient(${withAlpha(p.ink, 0.05)}, ${withAlpha(p.ink, 0.05)}), ${p.paper}`;
      A.photos.forEach((q, i) => {
        const r = L.tiles[i], tl = s.tiles[i], y = ALBUM_TOP + r[1] - Y;
        if (y > Hd || y + r[3] < 0 || r[2] <= 0) { cssCamel(tl.win.box, { display: 'none' }); return; }
        cssCamel(tl.win.box, { left: X(r[0]), top: X(y) });
        showStill(media, tl.win, q.source ? { source: q.source, t: q.t, crop: { x: q.fx, y: q.fy, zoom: 1 } } : null, r[2] * k, r[3] * k);
        if (!q.source) cssCamel(tl.win.ph, { display: 'block' });
        const off = hidden.has(i);
        cssCamel(tl.blank, { display: off ? 'block' : 'none', background: blank });
        const src = q.source ? ctx.project.sources?.[q.source] as { kind?: string; duration?: number } | undefined : undefined;
        const lab = q.label === '-' ? '' : q.label || (src?.kind === 'video' && src.duration ? clipLen(src.duration) : '');
        tl.label.textContent = lab;
        cssCamel(tl.label, { display: lab && !off ? 'block' : 'none', right: X(16), bottom: X(14), fontSize: X(36), fontWeight: '700', color: '#fff', textShadow: `0 0 ${8 * k}px rgba(0,0,0,0.6)` });
      });
      A.groups.forEach((g, i) => {
        const hd = s.heads[i], y = ALBUM_TOP + L.groupY[i] - Y;
        if (y > Hd || y + HEAD < 0) { cssCamel(hd.el, { display: 'none' }); return; }
        cssCamel(hd.el, { display: 'block', left: '0', top: X(y), width: '100%', height: X(HEAD), background: p.paper });
        hd.place.textContent = g.place; hd.date.textContent = g.date;
        cssCamel(hd.place, { display: g.place ? 'block' : 'none', left: X(36), top: X(65), transform: 'translateY(-50%)', fontSize: X(fitPx(g.place, 64, 1000)), fontWeight: '700', color: p.ink });
        cssCamel(hd.date, g.place ? { left: X(36), top: X(133), transform: 'translateY(-50%)', fontSize: X(48), fontWeight: '400', color: muted }
          : { left: X(36), top: X(89), transform: 'translateY(-50%)', fontSize: X(fitPx(g.date, 64, 1000)), fontWeight: '700', color: p.ink });
      });
      // the top bar over the content
      cssCamel(s.topBar, { left: '0', top: '0', width: '100%', height: X(ALBUM_TOP), background: bar, borderBottom: `${2 * k}px solid ${hair}`, boxSizing: 'border-box' });
      s.button.textContent = p.button;
      cssCamel(s.button, { right: X(36), top: X(213), transform: 'translateY(-50%)', height: X(70), padding: `0 ${X(34)}`, boxSizing: 'border-box', display: p.button ? 'flex' : 'none', alignItems: 'center',
        borderRadius: X(35), background: withAlpha(p.ink, 0.08), color: p.accent, fontSize: X(fitPx(p.button, 40, 240)), fontWeight: '700' });
      // the date bubble at the right edge: the group at the middle of the view
      let cur = -1;
      L.groupY.forEach((gy, i) => { if (cur < 0 || ALBUM_TOP + gy - Y <= Hd * 0.52) cur = i; });
      const g = A.groups[cur], bub = p.bubble && !!g && !!(g.date || g.day);
      const by = 340 + (maxY ? Y / maxY : 0) * Math.max(0, Hd - 490 - 340 - 156);
      cssCamel(s.rail, { display: bub ? 'block' : 'none', left: X(1064), top: X(by + 20), width: X(8), height: X(116), borderRadius: X(4), background: 'rgba(160,160,168,0.5)' });
      cssCamel(s.bubble, { display: bub ? 'block' : 'none', left: X(770), top: X(by), width: X(280), height: X(156), borderRadius: X(30), background: 'rgba(28,28,30,0.86)', boxShadow: `0 ${4 * k}px ${18 * k}px rgba(0,0,0,0.25)` });
      if (bub) {
        const two = !!(g.date && g.day);
        s.bubDate.textContent = g.date || g.day; s.bubDay.textContent = two ? g.day : '';
        cssCamel(s.bubDate, { left: '50%', top: X(two ? 49 : 78), transform: 'translate(-50%, -50%)', fontSize: X(fitPx(g.date || g.day, 48, 240)), fontWeight: '700', color: two || g.date ? '#fff' : p.hl });
        cssCamel(s.bubDay, { display: two ? 'block' : 'none', left: '50%', top: X(114), transform: 'translate(-50%, -50%)', fontSize: X(fitPx(g.day, 50, 240)), fontWeight: '700', color: p.hl });
      }
      // the segmented chips over the tab bar
      const words = p.chips.split(/[,，]+/).map((x) => x.trim()).filter(Boolean);
      if (s.chipEls.length !== words.length) { for (const e of s.chipEls) e.remove(); s.chipEls = words.map(() => h('div', null, null, s.chips)); }
      cssCamel(s.chips, { display: words.length ? 'flex' : 'none', left: '50%', top: X(Hd - 238), transform: 'translate(-50%, -50%)', height: X(92), padding: `0 ${X(10)}`, boxSizing: 'border-box', borderRadius: X(46),
        background: `linear-gradient(${withAlpha(p.ink, 0.05)}, ${withAlpha(p.ink, 0.05)}), ${withAlpha(p.paper, 0.96)}`, boxShadow: `0 ${6 * k}px ${24 * k}px rgba(0,0,0,0.18)` });
      words.forEach((w, i) => {
        const on = i === Math.round(p.chip), e = s.chipEls[i];
        e.textContent = w;
        cssCamel(e, { whiteSpace: 'pre', lineHeight: '1', display: 'flex', alignItems: 'center', height: X(72), padding: `0 ${X(38)}`, borderRadius: X(36), background: on ? p.paper : 'transparent',
          boxShadow: on ? `0 ${2 * k}px ${6 * k}px rgba(0,0,0,0.12)` : 'none', fontSize: X(38), fontWeight: on ? '700' : '400', color: on ? p.ink : withAlpha(p.ink, 0.7) });
      });
    }

    function drawForYou() {
      cssCamel(s.title, { color: p.ink });
      s.section.textContent = p.section; s.more.textContent = p.more; s.next.textContent = p.next;
      cssCamel(s.section, { left: X(36), top: X(359), transform: 'translateY(-50%)', fontSize: X(fitPx(p.section, 60, p.more ? 700 : 1000)), fontWeight: '700', color: p.ink });
      cssCamel(s.more, { right: X(36), top: X(363), transform: 'translateY(-50%)', fontSize: X(fitPx(p.more, 42, 300)), fontWeight: '400', color: p.accent });
      cssCamel(s.next, { left: X(36), top: X(Hd - 241), transform: 'translateY(-50%)', fontSize: X(fitPx(p.next, 60, 1000)), fontWeight: '700', color: p.ink });
      const [x, y, w, hh] = cardRect(Hd), press = p.tapAt >= 0 ? Math.sin(Math.PI * clamp((t - p.tapAt) / 0.3)) : 0;
      cssCamel(s.card, { left: X(x), top: X(y), width: X(w), height: X(hh), borderRadius: X(40), overflow: 'hidden', background: '#ddd', boxShadow: `0 ${16 * k}px ${40 * k}px rgba(0,0,0,0.22)`,
        transform: `scale(${1 - 0.035 * press})`, whiteSpace: 'normal' });
      const pic = picture(p, A, false);
      cssCamel(s.cardWin.box, { left: '0', top: '0' });
      showStill(media, s.cardWin, pic.still ? { ...pic.still, crop: pic.crop } : null, w * k, hh * k);
      if (!pic.still) cssCamel(s.cardWin.ph, { display: 'block', background: standIn(pic.i) });
      cssCamel(s.cardShade, { inset: '0', background: 'linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.6))' });
      s.cardTitle.textContent = p.cardTitle; s.cardSub.textContent = p.cardSub;
      cssCamel(s.cardTitle, { left: X(56), top: X(hh - 183), transform: 'translateY(-50%)', fontFamily: hand, fontSize: X(fitPx(p.cardTitle, 120, 850)), fontWeight: '700', color: '#fff', textShadow: `0 ${2 * k}px ${12 * k}px rgba(0,0,0,0.35)` });
      cssCamel(s.cardSub, { left: X(60), top: X(hh - 78), transform: 'translateY(-50%)', fontSize: X(fitPx(p.cardSub, 50, 850)), fontWeight: '700', color: '#fff' });
      const fa = p.fadeIn > 0 && t < p.fadeIn ? 1 - eOut3(t / p.fadeIn) : 0;
      cssCamel(s.fade, { display: fa > 0 ? 'block' : 'none', background: p.paper, opacity: String(fa) });
    }

    /** a zoom end as a pose (px in the screen) for a picture iw × ih */
    function endPose(e: End, iw: number, ih: number, pic: ReturnType<typeof picture>): Pose {
      const full: Rect = [0, 0, sc.w, sc.h];
      if (e === 'full') return poseOf(iw, ih, full, 'cover', pic.crop);
      if (e === 'fit') return poseOf(iw, ih, full, 'fit', pic.crop);
      if (e === 'card') { const r = cardRect(Hd); return poseOf(iw, ih, r.map((v) => v * k) as Rect, 'cover', pic.focus, 40 * k); }
      const maxY = albumMaxY(L.height, Hd), Y = clamp(albumScroll(p.scroll, 0, L.groupY, maxY), 0, maxY), r = L.tiles[pic.i] ?? [0, ALBUM_TOP, COL, COL];
      return poseOf(iw, ih, [r[0] * k, (ALBUM_TOP + r[1] - Y) * k, r[2] * k, r[3] * k], 'cover', pic.focus);
    }
    function drawZoom() {
      const mv = p.move > 0 ? p.move : dur, e = (EASE[p.ease] ?? eOut3)(clamp(t / mv)), fo = p.fadeOut > 0 ? clamp((dur - t) / p.fadeOut) : 1;
      const dark = (x: End) => (x === 'full' || x === 'fit' ? 1 : 0), bg = lerp(dark(p.zoomFrom), dark(p.zoomTo), clamp(t / mv)) * fo;
      cssCamel(s.black, { background: '#000', opacity: String(bg), display: bg > 0 ? 'block' : 'none' });
      const pic = picture(p, A, false), size = loadWin(media, s.fly, pic.still, pic.i), iw = size?.iw ?? sc.w, ih = size?.ih ?? sc.h;
      placeWin(s.fly, flyPose(endPose(p.zoomFrom, iw, ih, pic), endPose(p.zoomTo, iw, ih, pic), e), size, fo);
    }
    function drawSwipe() {
      const mv = p.move > 0 ? p.move : dur, e = eOut3(clamp(t / mv)), off = -e * (sc.w + 48 * k);
      cssCamel(s.black, { background: '#000', opacity: '1' });
      const full: Rect = [0, 0, sc.w, sc.h];
      ([[s.wa, false, p.fit, 0], [s.wb, true, p.fit2, sc.w + 48 * k]] as Array<[Win, boolean, boolean, number]>).forEach(([w, second, fit, dx]) => {
        const pic = picture(p, A, second), size = loadWin(media, w, pic.still, pic.i);
        placeWin(w, size ? poseOf(size.iw, size.ih, full, fit ? 'fit' : 'cover', pic.crop) : { r: full, s: 1, cx: 0, cy: 0, rad: 0 }, size, 1, off + dx);
      });
    }

    function viewerAlpha() { return clamp(countAt(p.show, t)); }
    function drawViewer() {
      const a = viewerAlpha(), vbar = withAlpha(p.paper, 0.86);
      for (const e of [s.vTop, s.vBottom, s.back, s.date, s.when, s.action, s.sb.el, ...s.tools]) cssCamel(e, { opacity: String(a) });
      if (a <= 0.001) for (const e of [s.vTop, s.vBottom, s.back, s.date, s.when, s.action, s.sb.el, s.home, ...s.tools]) cssCamel(e, { display: 'none' });
      cssCamel(s.vTop, { left: '0', top: '0', width: '100%', height: X(262), background: vbar });
      cssCamel(s.vBottom, { left: '0', top: X(Hd - 220), width: '100%', height: X(220), background: vbar });
      svgIn(s.back, `b${p.accent}`, () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 64" width="100%" height="100%" style="display:block;overflow:visible"><path d="M32 6L8 32l24 26" fill="none" stroke="${p.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
      cssCamel(s.back, { left: X(38), top: X(160), width: X(40), height: X(64) });
      s.date.textContent = p.date; s.when.textContent = p.when; s.action.textContent = p.action;
      const room = p.action ? 620 : 860;
      cssCamel(s.date, { left: '50%', top: X(168), transform: 'translate(-50%, -50%)', fontSize: X(fitPx(p.date, 50, room)), fontWeight: '700', color: p.ink });
      cssCamel(s.when, { left: '50%', top: X(225), transform: 'translate(-50%, -50%)', fontSize: X(fitPx(p.when, 42, room)), fontWeight: '400', color: withAlpha(p.ink, 0.75) });
      cssCamel(s.action, { right: X(40), top: X(194), transform: 'translateY(-50%)', fontSize: X(fitPx(p.action, 46, 260)), fontWeight: '400', color: p.accent });
      const kinds = p.tools.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean);
      if (s.tools.length !== kinds.length) { for (const e of s.tools) e.remove(); s.tools = kinds.map(() => lineAbs(s.ph.screen)); s.ph.screen.appendChild(s.sb.el); s.ph.screen.appendChild(s.home); }
      const liked = p.heartAt >= 0 && t >= p.heartAt;
      kinds.forEach((kind, i) => {
        const el = s.tools[i], heart = kind === 'heart', col = heart && liked ? p.heart : p.accent, cx = kinds.length > 1 ? 122 + (i * 836) / (kinds.length - 1) : 540;
        svgIn(el, `${kind}${col}${p.paper}`, () => glyphSvg(kind, col, p.paper));
        cssCamel(el, { display: a > 0.001 ? 'block' : 'none', left: X(cx - 34), top: X(Hd - 146), width: X(68), height: X(68), transform: `scale(${heart && p.heartAt >= 0 ? popAt(t, p.heartAt) : 1})` });
      });
    }
  },
};
