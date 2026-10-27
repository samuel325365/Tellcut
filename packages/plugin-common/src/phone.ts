// The pieces every phone-screen block is made of (group B, 2026-10-23): not a block itself. Promoted from what t2-notify's
// phone.js, t2-line's chat.js, t2-search's search.js and t2-reels' reels.js each wrote again:
//   phoneScreen / phoneEls / placePhone / screenFrame   where the phone's screen is on any frame shape, and its body
//   statusBarEl / drawStatusBar                         the status bar (time, carrier, signal, wifi, battery — all given)
//   typed / typedSpan / caretOn / typeEl / drawType      text being typed or deleted, with a blinking caret
//   placeWindow (+ window.ts punch with a radius)        a rounded video window: a still while it moves, a hole once settled
//   ICON_KINDS / iconTile / glyphSvg                     app icons drawn here (generic glyphs on a gradient tile, no real app's mark)
//   initialOf / avatarEl / drawAvatar                    round avatars (a letter or an emoji, an optional story ring)
//   fmtCount                                             1.2萬 / 1.2万 / 1.2K / 12,345
//   stackAt                                              the moving stack of notifications, chat lines, comments
//   rippleAt / drawRipple                                the ring a finger leaves (common.touch draws the same one)
//
// The phone's screen is always 9:16, laid out in a 1080-wide design space (k = screen px per design px). On a tall frame
// (9:16 and taller) with device 'auto' the screen IS the frame; on a 16:9, 4:5 or 1:1 frame a phone stands in the middle of the
// safe area (device 'phone': with a dark body round the screen; 'bare': the same 9:16 column without it). Phone UIs are tall by
// nature: stretching one across a wide frame would turn a notification into a banner, so a wide film shows the phone.
import { clamp, cssCamel, defaultSafe, eBack, eOut3, esc, h, prog, type MediaApi, type Theme } from '@tellcut/engine';
import { showStill, type Still, type Win, asFrame } from './window.ts';
import { nl } from './text.ts';
import { withAlpha } from './color.ts';

// ---------------------------------------------------------------- the screen
export type Device = 'auto' | 'phone' | 'bare';
export const DEVICES: Device[] = ['auto', 'phone', 'bare'];
/** the screen in frame px; k = px per design px (the design space is 1080 wide, 1080·h/w tall); body: a phone body is drawn round it */
export interface Screen { x: number; y: number; w: number; h: number; k: number; r: number; body: boolean; bezel: number; full: boolean }

/** A phone block's screen and its design units: `k` px per design px, `Hd` the screen height in design px, `X(v)` v design px as css. */
export function phoneView(W: number, H: number, safe: Theme['safe'], p: { device?: Device; px?: number }) {
  const sc = phoneScreen(W, H, safe, p.device, p.px), k = sc.k;
  return { sc, k, Hd: sc.h / k, X: (v: number) => `${v * k}px` };
}
/** Where the phone's screen is: the whole frame on a tall frame (device auto), else a 9:16 phone in the safe area, centred on `cx`. */
export function phoneScreen(W: number, H: number, safe: Theme['safe'], device: Device = 'auto', cx = 0.5): Screen {
  const tall = H / W >= 1.5;
  if (tall && device !== 'phone') return { x: 0, y: 0, w: W, h: H, k: W / 1080, r: 0, body: false, bezel: 0, full: true };
  const body = device !== 'bare', availH = (1 - safe.top - safe.bottom) * H, availW = (1 - 2 * safe.side) * W;
  const bez = body ? Math.min(availH, availW) * 0.018 : 0;
  let sh = availH - 2 * bez, sw = (sh * 9) / 16;
  if (sw > availW - 2 * bez) { sw = availW - 2 * bez; sh = (sw * 16) / 9; }
  const x = clamp(cx * W - sw / 2, safe.side * W + bez, (1 - safe.side) * W - bez - sw), y = safe.top * H + bez + (availH - 2 * bez - sh) / 2;
  return { x, y, w: sw, h: sh, k: sw / 1080, r: body ? sw * 0.085 : 0, body, bezel: bez, full: false };
}

/** The screen as a clip `frame` (fractions), to play footage inside the phone of a wide or square film: in cut.ts
 *  `c.clip(src, { …, frame: screenFrame(1920, 1080) })` (the blocks' `device` and `px` as `o`; `safe`: the theme's, if it changes it). */
export const screenFrame = (W: number, H: number, o: { safe?: Partial<Theme['safe']>; device?: Device; px?: number } = {}) => {
  const s = phoneScreen(W, H, { ...defaultSafe(W, H), ...o.safe }, o.device ?? 'auto', o.px ?? 0.5);
  return asFrame([s.x, s.y, s.w, s.h], W, H);
};

export interface PhoneEls { body: HTMLElement; screen: HTMLElement; island: HTMLElement }
/** the phone body (a ring round the screen: blocks stacked on one phone each draw the same ring and never cover each other's
 *  screen), the screen (clips what is drawn in it) and the camera island on top. Add content to `screen`, then `island` stays last. */
export function phoneEls(parent: HTMLElement): PhoneEls {
  const body = h('div', null, null, parent), screen = h('div', null, null, parent), island = h('div', null, null, parent);
  for (const e of [body, screen, island]) cssCamel(e, { position: 'absolute', pointerEvents: 'none' });
  cssCamel(screen, { overflow: 'hidden' });
  return { body, screen, island };
}
/** lay the phone out for screen `s`; `color` is the body's */
export function placePhone(els: PhoneEls, s: Screen, color = '#16161a') {
  cssCamel(els.screen, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px`, borderRadius: `${s.r}px` });
  cssCamel(els.body, { display: s.body ? 'block' : 'none', left: `${s.x - s.bezel}px`, top: `${s.y - s.bezel}px`, width: `${s.w}px`, height: `${s.h}px`,
    border: `${s.bezel}px solid ${color}`, borderRadius: `${s.r + s.bezel}px`, boxShadow: `0 ${s.bezel * 1.4}px ${s.bezel * 4}px rgba(0,0,0,0.45), inset 0 0 0 ${Math.max(1, s.bezel * 0.12)}px rgba(255,255,255,0.08)` });
  const iw = s.w * 0.28, ih = s.w * 0.075;
  cssCamel(els.island, { display: s.body ? 'block' : 'none', left: `${s.x + (s.w - iw) / 2}px`, top: `${s.y + s.w * 0.03}px`, width: `${iw}px`, height: `${ih}px`, borderRadius: `${ih / 2}px`, background: '#050506' });
}

// ---------------------------------------------------------------- status bar
export interface StatusOpts { time: string; carrier: string; signal: number; wifi: boolean; battery: number; color: string; font: string }
export interface StatusBar { el: HTMLElement; left: HTMLElement; right: HTMLElement; carrier: HTMLElement; icons: HTMLElement }
export function statusBarEl(parent: HTMLElement): StatusBar {
  const el = h('div', null, null, parent), left = h('div', null, null, el), right = h('div', null, null, el), carrier = h('div', null, null, right), icons = h('div', null, null, right);
  cssCamel(el, { position: 'absolute', left: '0', width: '100%' });
  cssCamel(left, { position: 'absolute', top: '50%', transform: 'translateY(-50%)', whiteSpace: 'pre', lineHeight: '1' });
  cssCamel(right, { position: 'absolute', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' });
  cssCamel(carrier, { whiteSpace: 'pre', lineHeight: '1' });
  return { el, left, right, carrier, icons };
}
/** the signal bars, wifi arcs and battery as one svg, in design px (40 tall) */
export function statusIconsSvg(signal: number, wifi: boolean, battery: number, color: string): { svg: string; w: number } {
  const c = esc(color), n = Math.round(clamp(signal, 0, 4)), parts: string[] = [];
  for (let i = 0; i < 4; i++) { const hh = 12 + i * 7; parts.push(`<rect x="${i * 16}" y="${36 - hh}" width="10" height="${hh}" rx="3" fill="${c}" opacity="${i < n ? 1 : 0.35}"/>`); }
  let x = 64;
  if (wifi) {
    const cx = x + 26;
    parts.push(`<circle cx="${cx}" cy="33" r="3.5" fill="${c}"/>`);
    for (const r of [11, 19, 27]) {
      const a = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), 35 + r * Math.sin((deg * Math.PI) / 180)].map((v) => v.toFixed(1)).join(' ');
      parts.push(`<path d="M${a(-135)}A${r} ${r} 0 0 1 ${a(-45)}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`);
    }
    x += 56;
  } else x += 8;
  const lvl = clamp(battery / 100), fill = lvl <= 0.2 ? '#ff453a' : c;
  parts.push(`<rect x="${x + 1.5}" y="7.5" width="59" height="27" rx="8" fill="none" stroke="${c}" stroke-width="3" opacity="0.9"/>`,
    `<rect x="${x + 6}" y="12" width="${(50 * lvl).toFixed(1)}" height="18" rx="4.5" fill="${fill}"/>`, `<rect x="${x + 63}" y="15" width="5" height="12" rx="2" fill="${c}" opacity="0.9"/>`);
  const w = x + 70;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 40" width="100%" height="100%" style="display:block">${parts.join('')}</svg>`, w };
}
/** The status bar across a screen `w` px wide, its middle at `y` (px): the time at the left (the carrier there when there is no time),
 *  the carrier (when there is a time), signal, wifi and battery at the right. */
export function drawStatusBar(sb: StatusBar, o: StatusOpts, k: number, y: number, w: number, shadow = true) {
  const font = `'${o.font}', 'Noto Sans TC', sans-serif`, ts = shadow ? `0 0 ${8 * k}px rgba(0,0,0,0.35)` : 'none';
  cssCamel(sb.el, { top: `${y}px`, color: o.color, fontFamily: font, textShadow: ts });
  sb.left.textContent = o.time || o.carrier;
  cssCamel(sb.left, { left: `${60 * k}px`, fontSize: `${(o.time ? 40 : 36) * k}px`, fontWeight: o.time ? '700' : '500' });
  sb.carrier.textContent = o.time ? o.carrier : '';
  cssCamel(sb.carrier, { display: o.time && o.carrier ? 'block' : 'none', fontSize: `${32 * k}px`, fontWeight: '500', marginRight: `${16 * k}px` });
  const ic = statusIconsSvg(o.signal, o.wifi, o.battery, o.color), key = ic.svg;
  if (sb.icons.dataset.k !== key) { sb.icons.dataset.k = key; sb.icons.innerHTML = ic.svg; }
  cssCamel(sb.icons, { width: `${ic.w * k * 0.95}px`, height: `${40 * k * 0.95}px`, filter: shadow ? `drop-shadow(0 0 ${5 * k}px rgba(0,0,0,0.3))` : 'none' });
  cssCamel(sb.right, { right: `${56 * k}px` });
}

// ---------------------------------------------------------------- typing
/** Text typed from `at`, one character every `cps` s; `erase` (the old text) is deleted first, twice as fast. */
export function typed(text: string, t: number, o: { at: number; cps: number; erase?: string }): { s: string; typing: boolean } {
  const chars = [...String(text ?? '')], old = [...String(o.erase ?? '')], cps = Math.max(0.005, o.cps);
  if (t < o.at) return { s: old.join(''), typing: false };
  let k = t - o.at;
  if (old.length) {
    const eDur = old.length * cps * 0.5;
    if (k < eDur) return { s: old.slice(0, old.length - Math.floor(k / (cps * 0.5)) - 1).join(''), typing: true };
    k -= eDur;
  }
  const n = Math.min(chars.length, Math.floor(k / cps) + 1);
  return { s: chars.slice(0, n).join(''), typing: n < chars.length };
}
/** Text typed in (mode type) or deleted (mode delete) evenly between a and b; null outside [a, b] (a typed text stays 0.1 s after b). */
export function typedSpan(text: string, t: number, a: number, b: number, mode: 'type' | 'delete' = 'type'): string | null {
  if (t < a || t >= b + (mode === 'type' ? 0.1 : 0)) return null;
  const chars = [...String(text ?? '')], p = clamp((t - a) / Math.max(1e-6, b - a));
  const n = mode === 'type' ? Math.ceil(p * chars.length) : Math.round((1 - p) * chars.length);
  return chars.slice(0, n).join('');
}
/** the caret's blink: on for the first half of every 1/rate s */
export const caretOn = (t: number, rate = 2.4) => Math.floor(t * rate) % 2 === 0;
export interface TypeEl { el: HTMLElement; text: HTMLElement; caret: HTMLElement }
/** a line of typed text with its caret (a thin bar after the last character) */
export function typeEl(parent: HTMLElement): TypeEl {
  const el = h('div', null, null, parent), text = h('span', null, null, el), caret = h('span', null, null, el);
  cssCamel(el, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', display: 'flex', alignItems: 'center' });
  cssCamel(caret, { display: 'inline-block', marginLeft: '0.06em', width: '0.08em', height: '1.1em', borderRadius: '0.04em' });
  return { el, text, caret };
}
export function drawType(te: TypeEl, s: string, caret: boolean, caretColor: string) {
  te.text.textContent = s;
  cssCamel(te.caret, { background: caretColor, visibility: caret ? 'visible' : 'hidden' });
}

// ---------------------------------------------------------------- a rounded video window
/** A window at `rect` (x, y, w, h px) with corners `r`: the still while it moves (alpha), nothing once the clip plays through the
 *  hole (punch(el, rect, r) from window.ts on the layer drawn round it). Win comes from window.ts windowEl. */
export function placeWindow(media: MediaApi, win: Win, still: Still | null | undefined, rect: [number, number, number, number], r: number, alpha = 1) {
  cssCamel(win.box, { left: `${rect[0]}px`, top: `${rect[1]}px`, borderRadius: `${r}px` });
  showStill(media, win, still, rect[2], rect[3], alpha);
}

// ---------------------------------------------------------------- icons
/** generic app glyphs, white (or `ink`) on a gradient tile; `C` the glyph colour, `B` the tile's dark end (cut-outs) */
const GLYPH: Record<string, { bg: [string, string]; ink?: string; g: string }> = {
  bell: { bg: ['#ffb347', '#ff6b35'], g: '<path d="M50 16c-13 0-22 10-22 24v15l-8 12h60l-8-12V40c0-14-9-24-22-24z" fill="C"/><circle cx="50" cy="76" r="7" fill="C"/>' },
  work: { bg: ['#495057', '#212529'], g: '<rect x="16" y="34" width="68" height="44" rx="8" fill="C"/><rect x="36" y="22" width="28" height="17" rx="5" fill="none" stroke="C" stroke-width="7"/>' },
  group: { bg: ['#51cf66', '#2b8a3e'], g: '<circle cx="35" cy="38" r="11" fill="C"/><circle cx="66" cy="38" r="11" fill="C"/><path d="M13 79a22 20 0 0 1 44 0zM44 79a22 20 0 0 1 44 0z" fill="C"/>' },
  cal: { bg: ['#ffffff', '#eceff2'], ink: '#343a40', g: '<rect x="0" y="0" width="100" height="30" fill="#fa5252"/><g fill="C"><circle cx="30" cy="50" r="5.5"/><circle cx="50" cy="50" r="5.5"/><circle cx="70" cy="50" r="5.5"/><circle cx="30" cy="70" r="5.5"/><circle cx="50" cy="70" r="5.5"/><circle cx="70" cy="70" r="5.5" fill="#fa5252"/></g>' },
  mail: { bg: ['#4dabf7', '#1864ab'], g: '<rect x="16" y="27" width="68" height="46" rx="6" fill="C"/><path d="M19 31l31 24 31-24" fill="none" stroke="B" stroke-width="5" stroke-linejoin="round"/>' },
  phone: { bg: ['#69db7c', '#2f9e44'], g: '<path d="M30 17c4-2 9 0 11 4l5 11c2 4 0 8-3 10l-5 3c4 9 10 15 19 19l3-5c2-3 6-5 10-3l11 5c4 2 6 7 4 11l-3 7c-2 5-7 7-12 6C47 82 18 53 14 30c-1-5 1-10 6-12z" fill="C"/>' },
  msg: { bg: ['#9775fa', '#6741d9'], g: '<ellipse cx="50" cy="46" rx="34" ry="27" fill="C"/><path d="M28 62l-7 19 23-12z" fill="C"/>' },
  mic: { bg: ['#f783ac', '#d6336c'], g: '<rect x="37" y="14" width="26" height="46" rx="13" fill="C"/><path d="M26 46a24 24 0 0 0 48 0M50 70v13" fill="none" stroke="C" stroke-width="7" stroke-linecap="round"/>' },
  play: { bg: ['#ff6b6b', '#e03131'], g: '<path d="M37 24l37 26-37 26z" fill="C" stroke="C" stroke-width="4" stroke-linejoin="round"/>' },
  moon: { bg: ['#7950f2', '#4c2a9e'], g: '<path d="M60 17a33 33 0 1 0 25 51A29 29 0 0 1 60 17z" fill="C"/>' },
  camera: { bg: ['#868e96', '#343a40'], g: '<path d="M16 35a6 6 0 0 1 6-6h12l6-8h20l6 8h12a6 6 0 0 1 6 6v37a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6z" fill="C"/><circle cx="50" cy="53" r="14" fill="B"/><circle cx="50" cy="53" r="8" fill="C"/>' },
  torch: { bg: ['#868e96', '#343a40'], g: '<path d="M33 15h34v11l-9 14v42a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V40l-9-14z" fill="C"/><circle cx="50" cy="57" r="4.5" fill="B"/>' },
  lock: { bg: ['#868e96', '#495057'], g: '<rect x="24" y="44" width="52" height="40" rx="8" fill="C"/><path d="M34 45V34a16 16 0 0 1 32 0v11" fill="none" stroke="C" stroke-width="8"/>' },
  heart: { bg: ['#ff8fa3', '#e64980'], g: '<path d="M50 82C22 62 14 48 14 36a18 18 0 0 1 36-6a18 18 0 0 1 36 6c0 12-8 26-36 46z" fill="C"/>' },
  star: { bg: ['#ffd43b', '#f08c00'], g: '<path d="M50 13l10.8 21.9 24.2 3.5-17.5 17 4.1 24.1L50 68.1 28.4 79.5l4.1-24.1-17.5-17 24.2-3.5z" fill="C" stroke="C" stroke-width="3" stroke-linejoin="round"/>' },
  pin: { bg: ['#ff8787', '#c92a2a'], g: '<path d="M50 13a25 25 0 0 0-25 25c0 19 25 47 25 47s25-28 25-47a25 25 0 0 0-25-25z" fill="C"/><circle cx="50" cy="38" r="9" fill="B"/>' },
  bag: { bg: ['#ffa94d', '#e8590c'], g: '<path d="M21 36h58l-4 47H25z" fill="C"/><path d="M38 40V30a12 12 0 0 1 24 0v10" fill="none" stroke="C" stroke-width="7" stroke-linecap="round"/>' },
  music: { bg: ['#ff6b9a', '#c2255c'], g: '<path d="M40 24l36-9v47a10 10 0 1 1-7-9.5V31l-22 5.5V70a10 10 0 1 1-7-9.5z" fill="C"/>' },
  news: { bg: ['#74c0fc', '#1971c2'], g: '<rect x="20" y="17" width="60" height="66" rx="6" fill="C"/><path d="M31 34h38M31 48h38M31 62h25" stroke="B" stroke-width="6" stroke-linecap="round"/>' },
  plane: { bg: ['#66d9e8', '#1098ad'], g: '<path d="M50 11c4 0 6 4 6 9v19l27 16v9l-27-8v16l8 7v7l-14-4-14 4v-7l8-7V56l-27 8v-9l27-16V20c0-5 2-9 6-9z" fill="C"/>' },
  gift: { bg: ['#e599f7', '#ae3ec9'], g: '<rect x="17" y="39" width="66" height="16" rx="3" fill="C"/><rect x="23" y="55" width="54" height="29" rx="3" fill="C"/><path d="M50 39v45" stroke="B" stroke-width="6"/><path d="M50 39c-6-15-23-17-23-6 0 6 13 6 23 6zm0 0c6-15 23-17 23-6 0 6-13 6-23 6z" fill="none" stroke="C" stroke-width="5"/>' },
  sun: { bg: ['#ffd43b', '#fd7e14'], g: `<circle cx="50" cy="50" r="16" fill="C"/>${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, f = (r: number) => `${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`; return `<path d="M${f(25)}L${f(34)}" stroke="C" stroke-width="7" stroke-linecap="round"/>`; }).join('')}` },
  clock: { bg: ['#495057', '#212529'], g: '<circle cx="50" cy="52" r="30" fill="none" stroke="C" stroke-width="7"/><path d="M50 35v18l12 8" fill="none" stroke="C" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' },
  user: { bg: ['#ced4da', '#868e96'], g: '<circle cx="50" cy="36" r="15" fill="C"/><path d="M20 83a30 27 0 0 1 60 0z" fill="C"/>' },
  check: { bg: ['#69db7c', '#2b8a3e'], g: '<path d="M25 52l16 16 34-36" fill="none" stroke="C" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>' },
  alert: { bg: ['#ffa94d', '#f03e3e'], g: '<path d="M50 16L86 80H14z" fill="C" stroke="C" stroke-width="6" stroke-linejoin="round"/><path d="M50 40v20" stroke="B" stroke-width="8" stroke-linecap="round"/><circle cx="50" cy="70" r="4.5" fill="B"/>' },
  app: { bg: ['#a5d8ff', '#4c6ef5'], g: '<g fill="C"><rect x="22" y="22" width="24" height="24" rx="7"/><rect x="54" y="22" width="24" height="24" rx="7"/><rect x="22" y="54" width="24" height="24" rx="7"/><rect x="54" y="54" width="24" height="24" rx="7"/></g>' },
  // group B3 (common.album): a picture, a magnifier, three linked dots, a bin, an info disc
  image: { bg: ['#ffd8a8', '#f76707'], g: '<rect x="13" y="20" width="74" height="60" rx="10" fill="C"/><path d="M21 72l19-23 12 13 9-9 18 19z" fill="B"/><circle cx="65" cy="38" r="7.5" fill="B"/>' },
  search: { bg: ['#adb5bd', '#495057'], g: '<circle cx="44" cy="44" r="23" fill="none" stroke="C" stroke-width="9"/><path d="M61 61l20 20" stroke="C" stroke-width="11" stroke-linecap="round"/>' },
  share: { bg: ['#63e6be', '#0ca678'], g: '<path d="M30 50L68 27M30 50l38 23" stroke="C" stroke-width="7"/><circle cx="68" cy="26" r="12" fill="C"/><circle cx="30" cy="50" r="12" fill="C"/><circle cx="68" cy="74" r="12" fill="C"/>' },
  trash: { bg: ['#ff8787', '#e03131'], g: '<rect x="19" y="22" width="62" height="9" rx="4" fill="C"/><rect x="39" y="13" width="22" height="12" rx="4" fill="C"/><path d="M26 35h48l-4 45a6 6 0 0 1-6 5H36a6 6 0 0 1-6-5z" fill="C"/><path d="M42 45v30M58 45v30" stroke="B" stroke-width="5" stroke-linecap="round"/>' },
  info: { bg: ['#74c0fc', '#1c7ed6'], g: '<circle cx="50" cy="50" r="35" fill="C"/><rect x="44.5" y="43" width="11" height="29" rx="4.5" fill="B"/><circle cx="50" cy="30" r="6.5" fill="B"/>' },
};
/** the glyphs iconTile knows; anything else (an emoji, a letter) is written on a gray tile */
export const ICON_KINDS = Object.keys(GLYPH);
const FALLBACK: [string, string] = ['#adb5bd', '#495057'];
/** a glyph alone as svg (no tile), in `color` (cut-outs in `cut`): for buttons and chips */
export function glyphSvg(kind: string, color = '#fff', cut = 'transparent'): string {
  const g = GLYPH[kind] ?? GLYPH.app;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" style="display:block">${g.g.replace(/"C"/g, `"${esc(color)}"`).replace(/"B"/g, `"${esc(cut)}"`)}</svg>`;
}
/** An app icon `size` px in `el`: a known kind's glyph on its gradient tile, or the given text (an emoji, a letter) on a gray one. */
export function iconTile(el: HTMLElement, kind: string, size: number) {
  const g = GLYPH[kind], [a, b] = g?.bg ?? FALLBACK;
  cssCamel(el, { width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.26}px`, background: `linear-gradient(180deg, ${a}, ${b})`, overflow: 'hidden', flex: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${size * 0.6}px`, lineHeight: '1', color: '#fff' });
  if (el.dataset.k === kind) return;
  el.dataset.k = kind;
  if (g) el.innerHTML = glyphSvg(kind, g.ink ?? '#fff', b);
  else el.textContent = [...String(kind)].slice(0, 2).join('') || '·';
}

// ---------------------------------------------------------------- avatars and counts
/** the letter on an avatar: the first Latin letter or CJK character of the name, upper case ('·' when there is none) */
export const initialOf = (name: string) => (String(name ?? '').match(/[A-Za-z㐀-鿿豈-﫿]/)?.[0] ?? '·').toUpperCase();
export interface AvatarOpts { name: string; color: string; size: number; ring?: boolean; text?: string; font?: string }
export function avatarEl(parent: HTMLElement): HTMLElement {
  const el = h('div', null, null, parent);
  cssCamel(el, { position: 'absolute', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', lineHeight: '1', flex: 'none' });
  return el;
}
/** a round avatar `size` px wide with the name's initial (or `text`: an emoji); ring: a story ring round it */
export function drawAvatar(el: HTMLElement, o: AvatarOpts) {
  el.textContent = o.text || initialOf(o.name);
  const ring = o.ring ? `, 0 0 0 ${o.size * 0.06}px #fff, 0 0 0 ${o.size * 0.12}px #ffb02e` : '';
  cssCamel(el, { width: `${o.size}px`, height: `${o.size}px`, background: o.color, fontSize: `${o.size * 0.5}px`, fontWeight: '700',
    fontFamily: `'${o.font ?? 'Noto Sans TC'}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`, boxShadow: `0 ${o.size * 0.03}px ${o.size * 0.12}px rgba(0,0,0,0.3)${ring}` });
}
export type CountStyle = 'zh' | 'ja' | 'en' | 'plain';
/** A follower / like count as a phone app writes it: zh 9,999 · 1.2萬 · 3.4億; ja the same with 万; en 999 · 1.2K · 3.4M · 1.2B; plain 12,345. */
export function fmtCount(n: number, style: CountStyle = 'zh'): string {
  const v = Math.round(Number(n) || 0), a = Math.abs(v), one = (x: number) => { const s = (Math.floor(x * 10) / 10).toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
  const sign = v < 0 ? '-' : '';
  if (style === 'plain') return v.toLocaleString('en-US');
  if (style === 'en') {
    if (a >= 1e9) return `${sign}${one(a / 1e9)}B`;
    if (a >= 1e6) return `${sign}${one(a / 1e6)}M`;
    if (a >= 1e3) return `${sign}${one(a / 1e3)}K`;
    return String(v);
  }
  if (a >= 1e8) return `${sign}${one(a / 1e8)}億`;
  if (a >= 1e4) return `${sign}${one(a / 1e4)}${style === 'ja' ? '万' : '萬'}`;
  return v.toLocaleString('en-US');
}

// ---------------------------------------------------------------- the moving stack
/** one entry of a stack: it comes in at `at`, leaves at `out` (it then keeps its place while it slides away), is `h` px tall and
 *  grows by dh at each `more` [t, dh] (a button unfolding) */
export interface StackItem { at: number; out?: number; h: number; more?: Array<[number, number]> }
export interface StackOpts {
  /** down: the newest at the top, older ones pushed down (a lock screen); up: the newest at the bottom, older ones pushed up (a chat) */
  grow: 'down' | 'up';
  /** down: the first entry's top; up: where entries fade out above */
  top: number;
  /** down: where entries pushed down fade out; up: the newest entry's bottom */
  bottom: number;
  gap: number;
  /** down: this many entries show in full, the next two pile up under the last one (each `peek` px lower), the rest hide behind */
  full: number; peek: number;
  /** how long each move takes (s) and the length (px) over which an entry fades at the far edge */
  move?: number; fade?: number;
}
/** where an entry is: top y, height, pile level (0 full, 1–2 in the pile; eased between), how far it came in (0→1 over `move`,
 *  unclamped so a block can overshoot), how far it has gone out (0→1 over 0.38 s after `out`) and its fade at the far edge */
export interface StackPos { i: number; y: number; h: number; lvl: number; enter: number; out: number; fade: number }

const heightAt = (it: StackItem, tk: number) => it.h + (it.more ?? []).reduce((s, [t, dh]) => s + (t <= tk ? dh : 0), 0);
/** the resting layout once every change up to tk is done: index → {y, lvl, h} */
export function stackLayout(items: StackItem[], tk: number, o: StackOpts): Map<number, { y: number; lvl: number; h: number }> {
  const vis = items.map((it, i) => ({ it, i })).filter(({ it }) => it.at <= tk && !(it.out != null && it.out <= tk)).sort((a, b) => b.it.at - a.it.at || b.i - a.i);
  const pos = new Map<number, { y: number; lvl: number; h: number }>();
  let y = o.top, lastY = o.top, lastH = 0, yb = o.bottom;
  vis.forEach(({ it, i }, n) => {
    const hh = heightAt(it, tk);
    if (o.grow === 'up') { pos.set(i, { y: yb - hh, lvl: 0, h: hh }); yb -= hh + o.gap; }
    else if (n < Math.max(1, o.full)) { pos.set(i, { y, lvl: 0, h: hh }); lastY = y; lastH = hh; y += hh + o.gap; }
    else { const k = Math.min(2, n - Math.max(1, o.full) + 1); pos.set(i, { y: lastY + lastH - hh + o.peek * k, lvl: k, h: hh }); }
  });
  return pos;
}
/** Every entry on screen at t, in the order given. Each layout change (an entry in or out, a button unfolding) moves the others to
 *  their new place over `move` s; only time and the entries decide where anything is. */
export function stackAt(items: StackItem[], t: number, o: StackOpts): StackPos[] {
  const move = o.move ?? 0.45, fade = o.fade ?? 220;
  const times = [...new Set(items.flatMap((it) => [it.at, it.out, ...(it.more ?? []).map((m) => m[0])]).filter((v): v is number => v != null && Number.isFinite(v)))].sort((a, b) => a - b).filter((tk) => tk <= t);
  const states = times.map((tk) => ({ tk, pos: stackLayout(items, tk, o) }));
  const out: StackPos[] = [];
  items.forEach((it, i) => {
    if (t < it.at) return;
    const gone = it.out != null ? clamp((t - it.out) / 0.38) : 0;
    if (gone >= 1) return;
    let y: number | null = null, lvl = 0, hh = 0, prev: { y: number; lvl: number; h: number } | null = null;
    for (const s of states) {
      if (it.out != null && s.tk >= it.out) break;
      const q = s.pos.get(i);
      if (!q) continue;
      if (!prev) { y = q.y; lvl = q.lvl; hh = q.h; }
      else { const e = eOut3(clamp((t - s.tk) / move)); y! += (q.y - prev.y) * e; lvl += (q.lvl - prev.lvl) * e; hh += (q.h - prev.h) * e; }
      prev = q;
    }
    if (y == null) return;
    const f = o.grow === 'up' ? clamp((y - o.top) / fade) : clamp((o.bottom - y - 0.4 * fade) / fade);
    out.push({ i, y, h: hh, lvl, enter: (t - it.at) / move, out: gone, fade: f });
  });
  return out;
}
/** how an entry pops in: its offset (px, towards where it came from: above for down, below for up) and scale, from StackPos.enter */
export const stackEnter = (enter: number, grow: 'down' | 'up', dist: number) => ({ dy: (grow === 'up' ? 1 : -1) * (1 - eBack(clamp(enter))) * dist, scale: 0.96 + 0.04 * clamp(enter), alpha: clamp(enter * 3) });

// ---------------------------------------------------------------- the finger's ripple
/** The ring a finger leaves when it lands at t0 on something R px round (common.touch's): over `dur` s it grows from 0.85 R by 70 px
 *  (at 1080) and fades; null before t0 and once it is gone. */
export function rippleAt(t: number, t0: number, R: number, k: number, dur = 0.45): { r: number; a: number; w: number } | null {
  if (t < t0) return null;
  const u = prog(t, t0, t0 + dur);
  if (u >= 1) return null;
  return { r: R * 0.85 + 70 * k * eOut3(u), a: 0.8 * (1 - u), w: 6 * k };
}
/** the ripple as a DOM ring centred on x, y (px in the ring's parent); hidden when rp is null */
export function drawRipple(el: HTMLElement, x: number, y: number, rp: ReturnType<typeof rippleAt>, color: string) {
  if (!rp) { cssCamel(el, { display: 'none' }); return; }
  cssCamel(el, { display: 'block', position: 'absolute', left: `${x - rp.r}px`, top: `${y - rp.r}px`, width: `${2 * rp.r}px`, height: `${2 * rp.r}px`, borderRadius: '50%',
    boxSizing: 'border-box', border: `${rp.w}px solid ${withAlpha(color, rp.a)}`, pointerEvents: 'none' });
}

// ---------------------------------------------------------------- shared parsing
/** "1.2" → [1.2, undefined], "1.2-3.4" → [1.2, 3.4]; null when it does not read */
export function timeSpan(s: string): [number, number | undefined] | null {
  const m = String(s ?? '').trim().match(/^(-?\d+(?:\.\d+)?)\s*(?:[-–~～]\s*(\d+(?:\.\d+)?))?$/);
  return m ? [Number(m[1]), m[2] === undefined ? undefined : Math.max(Number(m[1]), Number(m[2]))] : null;
}
/** a list of "秒|值|…" keyframes sorted by time; the step value at t is the last one with time ≤ t (stepAt) */
export function parseSteps(text: string): Array<{ t: number; v: string[] }> {
  return nl(text).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split('|').map((x) => x.trim()))
    .map(([t, ...v]) => ({ t: Number(t), v })).filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
}
/** the step in force at t, the one before it (for a crossfade) and since when */
export function stepAt<T extends { t: number }>(steps: T[], t: number): { cur: T | null; prev: T | null } {
  let cur: T | null = null, prev: T | null = null;
  for (const s of steps) if (s.t <= t) { prev = cur; cur = s; }
  return { cur, prev };
}
