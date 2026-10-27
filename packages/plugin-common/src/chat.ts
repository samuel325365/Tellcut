// common.chat — a messaging app's conversation as a screen recording, from t2-line's fx.chat (whose layout cut.ts worked out; here the
// block lays itself out). A generic chat app, not any real one: every word on it (the friend's name, 已讀, the input hint, the pinned
// title) is a parameter and the colours are the block's own. One message per line of `items`:
//   秒[-秒]|誰|內容|key=值…
//   誰: me (right), them (left, with the avatar; any other word is a group member's name), sys (a grey pill in the middle), ch (a
//   chapter pill; with `pin` the pinned bar at the top tracks the chapters as dots).
//   kinds (a bare word among the extras): text (default; "/" breaks a line, long lines wrap), typing (the three dots, until the next
//   message on the same side or the second time), photo, video, album, link, voice, sticker (the content big, no bubble).
//   extras: src=素材 t=秒 t2=秒 (the poster after play) crop=x,y,zoom ratio=4:5 w=0.66 (of the screen width) dur=0:12 mute tag=字
//   play=秒-秒 (a video: the main-track clip plays through a hole in the bubble — frame: chatWindow(…); a voice: its wave fills)
//   pics=src@t,src@t,- labels=a,b (album) sub= button= badge= press=秒 (link) read=秒 / unread (me) when=time name= avatar= color= icon=
// New messages pop in at the bottom and push the conversation up; the input bar types and deletes (`inputs`); the wallpaper changes
// colour with `wall`. Only time and the parameters decide what shows: bubble heights come from the lines the block wraps itself.
// On 9:16 the screen is the frame; on a wide or square frame it is a phone in the middle (phone.ts), the clip then takes chatWindow.
import { clamp, cssCamel, defaultSafe, eBack, eIO3, eOut3, esc, fitLines, h, rng, textEm, withDefaults, type Crop, type ItemType, type MediaApi, type Theme } from '@tellcut/engine';
import { standIn } from './album.ts';
import { asFrame, imagesReady, punch, showStill, stillRef, stillUrl, windowEl, type Still, type Win } from './window.ts';
import { avatarEl, caretOn, DEVICES, drawAvatar, drawStatusBar, drawType, glyphSvg, parseSteps, phoneEls, phoneView, placePhone, statusBarEl, timeSpan, typedSpan, typeEl,
  type Device, type PhoneEls, type StatusBar, type TypeEl } from './phone.ts';
import { fitPx, lineAbs, nl } from './text.ts';
import { mixHex, withAlpha } from './color.ts';

// ---------------------------------------------------------------- the messages
export type Who = 'me' | 'them' | 'sys' | 'ch';
export const MSG_KINDS = ['text', 'typing', 'photo', 'video', 'album', 'link', 'voice', 'sticker'] as const;
export type MsgKind = typeof MSG_KINDS[number];
export interface Pic { src: string; t: number }
export interface ChatMsg {
  i: number; at: number; end: number; who: Who; kind: MsgKind; text: string; name: string; avatar: string; color: string; head: boolean;
  src: string; t: number; t2: number; crop: Crop; aspect: number; w: number; dur: string; mute: boolean; tag: string; play: [number, number] | null;
  pics: Pic[]; labels: string[]; sub: string; button: string; badge: string; press: number; read: number; when: string; icon: string;
}
const WHO: Record<string, Who> = { me: 'me', 我: 'me', self: 'me', them: 'them', other: 'them', 對方: 'them', sys: 'sys', system: 'sys', 系統: 'sys', ch: 'ch', chapter: 'ch', 章節: 'ch' };
const num = (v: unknown, d: number) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
/** "4:5" / "16x9" → width ÷ height; a bare number is that ratio already; NaN when it does not read */
export function aspectOf(v: string): number {
  const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : NaN;
  const n = Number(v);
  return v !== '' && n > 0 ? n : NaN;
}
const picOf = (s: string): Pic => { const [a = '', b] = s.split('@').map((x) => x.trim()); return { src: a === '-' ? '' : a, t: num(b, 0) }; };
const list = (s: string) => String(s ?? '').split(/[,，]/).map((x) => x.trim());

/** the messages of `items`, one per line (a typed \n too); lines without a time are dropped */
export function parseChat(text: string): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const line of nl(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [when0 = '', who0 = '', body = '', ...extra] = line.split('|').map((x) => x.trim());
    const span = timeSpan(when0);
    if (!span) continue;
    const known = WHO[who0.toLowerCase()];
    const m: ChatMsg = { i: out.length, at: span[0], end: span[1] ?? Infinity, who: known ?? 'them', kind: 'text', text: body, name: known ? '' : who0, avatar: '', color: '', head: false,
      src: '', t: 0, t2: NaN, crop: { x: 0.5, y: 0.5, zoom: 1 }, aspect: NaN, w: 0, dur: '', mute: false, tag: '', play: null,
      pics: [], labels: [], sub: '', button: '', badge: '', press: -1, read: NaN, when: '', icon: '' };
    for (const e of extra) {
      const i = e.indexOf('='), key = (i < 0 ? e : e.slice(0, i)).trim(), v = i < 0 ? '' : e.slice(i + 1).trim();
      if (i < 0 && (MSG_KINDS as readonly string[]).includes(key)) { m.kind = key as MsgKind; continue; }
      switch (key) {
        case 'kind': if ((MSG_KINDS as readonly string[]).includes(v)) m.kind = v as MsgKind; break;
        case 'name': m.name = v; break;
        case 'avatar': m.avatar = v; break;
        case 'color': m.color = v; break;
        case 'src': m.src = v === '-' ? '' : v; break;
        case 't': m.t = num(v, 0); break;
        case 't2': m.t2 = num(v, NaN); break;
        case 'crop': { const [x, y, z] = v.split(/[,，]/).map((q) => q.trim()); m.crop = { x: clamp(num(x, 0.5)), y: clamp(num(y, 0.5)), zoom: Math.max(1, num(z, 1)) }; break; }
        case 'ratio': m.aspect = aspectOf(v); break;
        case 'w': m.w = clamp(num(v, 0), 0, 1); break;
        case 'dur': m.dur = v; break;
        case 'mute': m.mute = i < 0 || !/^(0|false|no)$/i.test(v); break;
        case 'tag': m.tag = v; break;
        case 'play': { const s = timeSpan(v); m.play = s && s[1] !== undefined && s[1] > s[0] ? [s[0], s[1]] : null; break; }
        case 'pics': m.pics = list(v).filter(Boolean).map(picOf); break;
        case 'labels': m.labels = list(v); break;
        case 'sub': m.sub = v; break;
        case 'button': m.button = v; break;
        case 'badge': m.badge = v; break;
        case 'press': m.press = num(v, -1); break;
        case 'read': m.read = num(v, NaN); break;
        case 'unread': m.read = -1; break;
        case 'when': m.when = v; break;
        case 'icon': m.icon = v; break;
      }
    }
    if (m.who === 'sys' || m.who === 'ch') m.kind = 'text';
    out.push(m);
  }
  // the dots stop when the next message on the same side arrives (it takes their place)
  out.forEach((m, j) => {
    if (m.kind !== 'typing' || Number.isFinite(m.end)) return;
    const nx = out.slice(j + 1).find((n) => n.who === m.who && n.name === m.name && n.kind !== 'typing' && n.at >= m.at);
    if (nx) m.end = nx.at;
  });
  // the avatar (and a group member's name) at the head of each run of the other side's messages
  out.forEach((m, j) => { const pv = out[j - 1]; m.head = m.who === 'them' && !(pv && pv.who === 'them' && pv.name === m.name && pv.kind !== 'typing'); });
  return out;
}

// ---------------------------------------------------------------- sizes (design px: the screen is 1080 wide)
export const FS = 52, LH = 72, PADV = 24, PADH = 32, GAP = 24, LEFT = 148, RIGHT = 1040, AV = 92, NAME = 46, RAD = 38, MEDIA_R = 34;
const MAXW = 760, SYS = 38, CH = 46, VOICE_FS = 44, VOICE_LH = 62, PAD_TOP = 18, PAD_BOT = 14;
export interface MsgBox { x: number; w: number; h: number; off: number; slot: number; lines: string[] }
/** the lines of a text: "/" breaks a line, long ones wrap (CJK 1 em, other characters 0.55 em) into a box `em` wide */
export const wrapText = (text: string, em: number) => {
  const paras = String(text ?? '').split('/').map((x) => x.trim());
  return paras.flatMap((p) => (p ? fitLines(p, em, 99, 1).lines : [''])).filter((l, i, a) => l !== '' || a.length === 1);
};
const mediaW = (m: ChatMsg, d: number) => (m.w > 0 ? m.w : d) * 1080;
/** the link card's thumbnail height and its text rows below */
export const linkRows = (m: ChatMsg, w: number) => {
  const th = Math.round(w * 9 / 16), title = th + 30, sub = title + 64, btn = (m.sub ? sub + 52 : sub) + 18;
  return { th, title, sub, btn, h: btn + (m.button ? 84 + 26 : 6) };
};
/** where a message's bubble is in its slot and how big: x (design px), w, h, off (the bubble's top in the slot), slot (the room it takes) */
export function msgBox(m: ChatMsg): MsgBox {
  let w = 0, hh = 0, lines: string[] = [];
  const nameOff = m.who === 'them' && m.head && m.name ? NAME : 0;
  if (m.who === 'sys') { w = Math.min(980, textEm(m.text) * SYS + 60); hh = 68; }
  else if (m.who === 'ch') { w = Math.min(980, textEm(m.text) * CH + 76); hh = 84; }
  else if (m.kind === 'typing') { w = 170; hh = 100; }
  else if (m.kind === 'sticker') { w = 280; hh = 280; }
  else if (m.kind === 'photo' || m.kind === 'video') { w = mediaW(m, 0.66); hh = Math.round(w / (m.aspect > 0 ? m.aspect : 1)); }
  else if (m.kind === 'album') {
    w = mediaW(m, 0.66);
    const n = Math.max(1, m.pics.length || 4), T = (w - 8) / 2, rows = n === 1 ? 1 : Math.ceil(n / 2);
    hh = n === 1 ? w : Math.round(rows * T + (rows - 1) * 8);
  } else if (m.kind === 'link') { w = mediaW(m, 0.7); hh = linkRows(m, w).h; }
  else if (m.kind === 'voice') {
    w = mediaW(m, 0.58);
    lines = m.text ? wrapText(m.text, (w - 2 * 34) / VOICE_FS) : [];
    hh = 124 + (lines.length ? 22 + lines.length * VOICE_LH + 20 : 0);
  } else {
    lines = wrapText(m.text, (MAXW - 2 * PADH) / FS);
    w = Math.min(MAXW, Math.max(...lines.map(textEm), 1) * FS + 2 * PADH);
    hh = 2 * PADV + lines.length * LH;
  }
  const x = m.who === 'sys' || m.who === 'ch' ? (1080 - w) / 2 : m.who === 'me' ? RIGHT - w : LEFT;
  const off = m.who === 'ch' ? 18 : nameOff;
  return { x, w, h: hh, off, slot: off + hh + (m.who === 'ch' ? 18 : 0), lines };
}

// ---------------------------------------------------------------- where every message is at t
export interface Place { i: number; y: number; enter: number }
/** The conversation at t: every message on screen with its slot's top (design px from the top of the message area) and how far it has
 *  popped in (0→1 over 0.28 s; one at a negative time is there from the start). Messages are stacked from the top in the order they
 *  arrive; once they pass the bottom the whole conversation scrolls up so the newest one sits on the bottom edge. Each change (a
 *  message in, the dots gone) moves things to their new place over `move` s. */
export function chatPlace(msgs: ChatMsg[], slots: number[], t: number, areaH: number, move = 0.32): { pos: Place[]; scroll: number } {
  const on = (m: ChatMsg, tk: number) => m.at <= tk && !(m.end <= tk);
  const times = [...new Set(msgs.flatMap((m) => [m.at, m.end]).filter((v) => Number.isFinite(v)))].sort((a, b) => a - b).filter((tk) => tk <= t);
  let scroll = 0, prevS: number | null = null;
  const ys = new Map<number, number>(), last = new Map<number, number>();
  for (const tk of times) {
    const vis = msgs.filter((m) => on(m, tk)).sort((a, b) => a.at - b.at || a.i - b.i);
    let y = PAD_TOP;
    const pos = new Map<number, number>();
    for (const m of vis) { pos.set(m.i, y); y += slots[m.i] + GAP; }
    const S = Math.max(0, (vis.length ? y - GAP + PAD_BOT : 0) - areaH), e = eOut3(clamp((t - tk) / move));
    scroll = prevS == null ? S : scroll + (S - prevS) * e;
    prevS = S;
    for (const [i, yy] of pos) { const l = last.get(i); ys.set(i, l == null ? yy : ys.get(i)! + (yy - l) * e); last.set(i, yy); }
  }
  const pos = msgs.filter((m) => on(m, t)).map((m) => ({ i: m.i, y: (ys.get(m.i) ?? PAD_TOP) - scroll, enter: m.at < 0 ? 1 : (t - m.at) / 0.28 }));
  return { pos, scroll };
}

// ---------------------------------------------------------------- the screen's parts
const HEAD = 200, PIN_Y = 214, INPUT_H = 130;
export const emojiList = (s: string) => String(s ?? '').split(/[\s,，]+/).filter(Boolean);
/** the leading emoji of a chapter's words (its dot's icon) */
const leadEmoji = (s: string) => String(s ?? '').match(/^\s*(\p{Extended_Pictographic}️?)/u)?.[1] ?? '';

/** The screen and the bands on it, in design px: the message area between the header (or the pinned bar) and the input bar. */
export function chatGeometry(p: Pick<P, 'items' | 'pin' | 'panel' | 'device' | 'px'>, W: number, H: number, safe: Theme['safe']) {
  const { sc, k, Hd } = phoneView(W, H, safe, p);
  const msgs = parseChat(p.items), boxes = msgs.map(msgBox), chapters = msgs.filter((m) => m.who === 'ch');
  const pinH = p.pin ? (chapters.length ? 156 : 96) : 0, panel = emojiList(p.panel).length > 0;
  const areaTop = pinH ? PIN_Y + pinH + 14 : HEAD + 6;
  const inputTop = sc.full ? Math.min(Hd - INPUT_H - 36, (1 - safe.bottom) * Hd) : panel ? 0.8 * Hd : Hd - INPUT_H - 36;
  return { sc, k, Hd, msgs, boxes, chapters, pinH, panel, areaTop, areaBot: inputTop - 10, inputTop };
}
type Geo = ReturnType<typeof chatGeometry>;
/** message i's bubble at t in design px of the screen ([x, y, w, h]), null when it is not on screen */
export function bubbleAt(G: Geo, i: number, t: number): [number, number, number, number] | null {
  const q = chatPlace(G.msgs, G.boxes.map((b) => b.slot), t, G.areaBot - G.areaTop).pos.find((x) => x.i === i), b = G.boxes[i];
  return q && b ? [b.x, G.areaTop + q.y + b.off, b.w, b.h] : null;
}
const geoOf = (params: Record<string, unknown>, W: number, H: number, safe?: Partial<Theme['safe']>) =>
  chatGeometry(withDefaults(chat.params, params) as P, W, H, { ...defaultSafe(W, H), ...safe });

/** Where message i's bubble is on a W×H frame (fractions, a clip's `frame`): a video message's window for the main-track clip that plays in
 *  it — at the start of its play= span unless `t` is given (keep new messages from arriving while it plays, or the bubble moves off the
 *  clip). i counts every line of items from 0. null when that message is not on screen then. */
export function chatWindow(params: Record<string, unknown>, i: number, W = 1080, H = 1920, o: { t?: number; safe?: Partial<Theme['safe']> } = {}) {
  const G = geoOf(params, W, H, o.safe), m = G.msgs[i];
  if (!m) return null;
  const r = bubbleAt(G, i, o.t ?? (m.play ? m.play[0] : m.at + 1));
  if (!r) return null;
  const { sc, k } = G;
  return asFrame([sc.x + r[0] * k, sc.y + r[1] * k, r[2] * k, r[3] * k], W, H);
}
/** the middle of message i's bubble at t as fractions of the frame (common.touch's tap), null when it is not on screen */
export function chatPoint(params: Record<string, unknown>, i: number, t: number, W = 1080, H = 1920, safe?: Partial<Theme['safe']>) {
  const G = geoOf(params, W, H, safe), r = bubbleAt(G, i, t);
  if (!r) return null;
  const f = (v: number) => Math.round(v * 1e4) / 1e4, { sc, k } = G;
  return { x: f((sc.x + (r[0] + r[2] / 2) * k) / W), y: f((sc.y + (r[1] + r[3] / 2) * k) / H) };
}

/** the wallpaper's two colours at t from "秒|#上|#下" keys, eased from one key to the next */
export function wallAt(text: string, t: number): [string, string] {
  const ks = parseSteps(text).filter((s) => s.v[0]);
  if (!ks.length) return ['#e6ebf1', '#d2dbe6'];
  const pair = (s: typeof ks[number]): [string, string] => [s.v[0], s.v[1] || s.v[0]];
  if (t <= ks[0].t) return pair(ks[0]);
  for (let i = 0; i < ks.length - 1; i++) if (t < ks[i + 1].t) {
    const e = eIO3(clamp((t - ks[i].t) / Math.max(1e-6, ks[i + 1].t - ks[i].t))), a = pair(ks[i]), b = pair(ks[i + 1]);
    return [mixHex(a[0], b[0], e), mixHex(a[1], b[1], e)];
  }
  return pair(ks[ks.length - 1]);
}
/** what the input field shows at t from "秒-秒|文字|type/delete" lines: the text and whether it is being typed; null: the hint */
export function inputAt(text: string, t: number): string | null {
  let out: string | null = null;
  for (const line of nl(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [when = '', words = '', mode = 'type'] = line.split('|').map((x) => x.trim()), s = timeSpan(when);
    if (!s) continue;
    const v = typedSpan(words, t, s[0], s[1] ?? s[0] + [...words].length * 0.12, mode === 'delete' ? 'delete' : 'type');
    if (v !== null) out = v;
  }
  return out;
}

// ---------------------------------------------------------------- drawn glyphs
const SVG = (vb: string, inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%" style="display:block;overflow:visible">${inner}</svg>`;
const ST = (c: string, w = 7) => `fill="none" stroke="${esc(c)}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const GL = {
  back: (c: string) => SVG('0 0 100 100', `<path d="M64 18L32 50l32 32" ${ST(c, 10)}/>`),
  menu: (c: string) => SVG('0 0 100 100', `<path d="M20 28h60M20 50h60M20 72h60" ${ST(c, 8)}/>`),
  plus: (c: string) => SVG('0 0 100 100', `<path d="M50 22v56M22 50h56" ${ST(c, 8)}/>`),
  face: (c: string) => SVG('0 0 100 100', `<circle cx="50" cy="50" r="34" ${ST(c, 7)}/><circle cx="38" cy="42" r="5" fill="${esc(c)}"/><circle cx="62" cy="42" r="5" fill="${esc(c)}"/><path d="M34 60q16 16 32 0" ${ST(c, 7)}/>`),
  play: (bg: string) => SVG('0 0 100 100', `<circle cx="50" cy="50" r="46" fill="${esc(bg)}" stroke="#fff" stroke-width="5"/><path d="M40 30l32 20-32 20z" fill="#fff"/>`),
  mute: (c: string) => SVG('0 0 100 100', `<path d="M14 38h18l24-20v64L32 62H14z" fill="${esc(c)}"/><path d="M66 38l24 24M90 38L66 62" ${ST(c, 8)}/>`),
  pause: (c: string) => SVG('0 0 100 100', `<rect x="30" y="26" width="14" height="48" rx="4" fill="${esc(c)}"/><rect x="56" y="26" width="14" height="48" rx="4" fill="${esc(c)}"/>`),
  tri: (c: string) => SVG('0 0 100 100', `<path d="M36 26l40 24-40 24z" fill="${esc(c)}"/>`),
  /** the little tail at a bubble's top corner (drawn for the right side; mirrored for the left) */
  tail: (c: string) => SVG('0 0 26 30', `<path d="M0 0H8Q22 0 26 4Q14 10 6 30H0z" fill="${esc(c)}"/>`),
};
const svgIn = (el: HTMLElement, svg: string) => { if (el.dataset.k !== svg) { el.dataset.k = svg; el.innerHTML = svg; } };

// ---------------------------------------------------------------- the block
interface P {
  items: string; name: string; status: string; avatar: string; avatarColor: string; time: string; battery: number;
  pin: string; pinIcon: string; read: string; readAfter: number; hint: string; inputs: string; panel: string; wall: string; pattern: boolean;
  device: Device; px: number; font: string; round: string; me: string; meInk: string; them: string; themInk: string; accent: string; bar: string; ink: string;
}
interface MsgEl {
  box: HTMLElement; av: HTMLElement | null; bub: HTMLElement; read: HTMLElement | null; dots: HTMLElement[]; wins: Win[]; play: HTMLElement | null;
  bars: HTMLElement[]; knob: HTMLElement | null; sticker: HTMLElement | null; sizes: Array<[number, number]>;
}
interface S {
  ph: PhoneEls; ui: HTMLElement; wall: HTMLElement; area: HTMLElement; msgEls: MsgEl[]; key: string; G: Geo | null;
  head: HTMLElement; back: HTMLElement; hAv: HTMLElement; hName: HTMLElement; hStatus: HTMLElement; hIcons: HTMLElement[]; sb: StatusBar;
  pin: HTMLElement; pinIcon: HTMLElement; pinTitle: HTMLElement; pinTrack: HTMLElement; pinFill: HTMLElement; pinDots: HTMLElement[];
  input: HTMLElement; inIcons: HTMLElement[]; field: HTMLElement; type: TypeEl; hint: HTMLElement; panel: HTMLElement; home: HTMLElement;
}
const flex = (parent: HTMLElement) => { const e = h('div', null, null, parent); cssCamel(e, { display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1', whiteSpace: 'pre' }); return e; };
const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";

/** one message's elements, styled once (sizes in px at k); draw() moves and animates them */
function buildMsg(parent: HTMLElement, m: ChatMsg, b: MsgBox, p: P, k: number, media: MediaApi): MsgEl {
  const X = (v: number) => `${v * k}px`, mine = m.who === 'me', side = m.who === 'me' || m.who === 'them';
  const box = lineAbs(parent), el: MsgEl = { box, av: null, bub: box, read: null, dots: [], wins: [], play: null, bars: [], knob: null, sticker: null, sizes: [] };
  cssCamel(box, { left: '0', top: '0', width: X(1080), height: X(b.slot), whiteSpace: 'normal' });
  const bg = mine ? p.me : p.them, ink = mine ? p.meInk : p.themInk;
  // the avatar and a group member's name at the head of a run
  if (m.who === 'them' && m.head) {
    el.av = avatarEl(box);
    drawAvatar(el.av, { name: m.name || p.name, text: m.avatar || (m.name ? '' : p.avatar), color: m.color || p.avatarColor, size: AV * k, font: p.font });
    cssCamel(el.av, { left: X(82 - AV / 2), top: '0', boxShadow: 'none', border: `${3 * k}px solid rgba(255,255,255,0.9)`, boxSizing: 'border-box' });
    if (m.name) { const nm = lineAbs(box); nm.textContent = m.name; cssCamel(nm, { left: X(LEFT + 6), top: X(4), fontSize: X(34), fontWeight: '500', color: withAlpha(p.ink, 0.6) }); }
  }
  // a row at the bubble's top: [read, bubble] at the right, [bubble, time] at the left, the pill in the middle
  const row = h('div', null, null, box);
  cssCamel(row, { position: 'absolute', top: X(b.off), display: 'flex', alignItems: 'flex-end', gap: X(12), ...(side ? mine ? { right: X(1080 - RIGHT), flexDirection: 'row-reverse' } : { left: X(LEFT) } : { left: '0', width: X(1080), justifyContent: 'center' }) });
  const bub = h('div', null, null, row);
  el.bub = bub;
  cssCamel(bub, { position: 'relative', flex: 'none', boxSizing: 'border-box' });
  if (side) {
    const rd = h('div', null, null, row);
    cssCamel(rd, { display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: X(4), fontSize: X(28), fontWeight: '500', color: withAlpha(p.ink, 0.55), lineHeight: '1', whiteSpace: 'pre', paddingBottom: X(4) });
    if (mine && p.read) { const r = h('div', null, null, rd); r.textContent = p.read; el.read = r; }
    if (m.when) { const w = h('div', null, null, rd); w.textContent = m.when; }
  }
  const tail = (color: string) => {
    const tl = h('div', null, null, bub);
    cssCamel(tl, { position: 'absolute', top: '0', width: X(26), height: X(30), ...(mine ? { right: X(-16) } : { left: X(-16), transform: 'scaleX(-1)' }) });
    svgIn(tl, GL.tail(color));
  };
  const shadow = `0 ${2 * k}px ${8 * k}px rgba(0,0,0,0.08)`;
  const win = (parent2: HTMLElement, w: number, hh: number, still: Still | null, seed: number) => {
    const wn = windowEl(parent2);
    cssCamel(wn.ph, { background: standIn(seed) });
    cssCamel(wn.box, { width: X(w), height: X(hh) });
    if (still) { const src = stillUrl(media, still); wn.src = src; wn.img.src = src; }
    el.wins.push(wn); el.sizes.push([w * k, hh * k]);
    return wn;
  };
  if (m.who === 'sys' || m.who === 'ch') {
    const ch = m.who === 'ch';
    bub.textContent = m.text;
    cssCamel(bub, { height: X(b.h), padding: `0 ${X(ch ? 38 : 30)}`, display: 'flex', alignItems: 'center', borderRadius: X(b.h / 2), whiteSpace: 'pre', lineHeight: '1',
      background: ch ? 'rgba(255,255,255,0.92)' : 'rgba(30,40,50,0.26)', color: ch ? p.ink : '#ffffff', fontFamily: ch ? `'${p.round}', '${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif` : `'${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif`,
      fontSize: `${fitPx(m.text, (ch ? CH : SYS) * k, (980 - 76) * k)}px`, fontWeight: ch ? '400' : '500', boxShadow: ch ? `0 ${3 * k}px ${10 * k}px rgba(0,0,0,0.08)` : 'none' });
  } else if (m.kind === 'typing') {
    cssCamel(bub, { width: X(b.w), height: X(b.h), borderRadius: X(RAD), background: p.them, boxShadow: shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: X(14) });
    tail(p.them);
    for (let j = 0; j < 3; j++) { const d = h('div', null, null, bub); cssCamel(d, { width: X(22), height: X(22), borderRadius: '50%', background: withAlpha(p.themInk, 0.5) }); el.dots.push(d); }
  } else if (m.kind === 'sticker') {
    const st = flex(bub);
    st.textContent = m.text || '🙂';
    cssCamel(bub, { width: X(b.w), height: X(b.h) });
    cssCamel(st, { width: '100%', height: '100%', fontSize: X(fitPx(m.text || '🙂', 200, 260)), fontFamily: `'${p.round}', ${EMOJI}, sans-serif`, color: p.ink, filter: `drop-shadow(0 ${4 * k}px ${8 * k}px rgba(0,0,0,0.18))` });
    el.sticker = st;
  } else if (m.kind === 'photo' || m.kind === 'video') {
    cssCamel(bub, { width: X(b.w), height: X(b.h), borderRadius: X(MEDIA_R), overflow: 'hidden', background: '#000', boxShadow: `0 ${4 * k}px ${14 * k}px rgba(0,0,0,0.18)` });
    const wn = win(bub, b.w, b.h, m.src ? { source: m.src, t: m.t, crop: m.crop } : null, m.i);
    if (m.src && Number.isFinite(m.t2)) { const w2 = win(bub, b.w, b.h, { source: m.src, t: m.t2, crop: m.crop }, m.i); cssCamel(w2.box, { display: 'none' }); }
    cssCamel(wn.box, { left: '0', top: '0' });
    if (m.kind === 'video') {
      const pl = lineAbs(bub); svgIn(pl, GL.play('rgba(0,0,0,0.45)'));
      cssCamel(pl, { left: X(b.w / 2 - 62), top: X(b.h / 2 - 62), width: X(124), height: X(124) });
      el.play = pl;
      if (m.dur) { const d = lineAbs(bub); d.textContent = m.dur; cssCamel(d, { left: X(22), bottom: X(22), padding: `${X(8)} ${X(18)}`, borderRadius: X(24), background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: X(34), fontWeight: '700' }); }
      if (m.mute) { const mu = lineAbs(bub); svgIn(mu, GL.mute('#fff')); cssCamel(mu, { right: X(22), top: X(22), width: X(48), height: X(48), padding: X(10), borderRadius: '50%', background: 'rgba(0,0,0,0.5)' }); }
    }
    if (m.tag) {
      const tg = lineAbs(bub); tg.textContent = m.tag;
      cssCamel(tg, { left: X(34), bottom: X(30), padding: `${X(16)} ${X(28)}`, borderRadius: X(46), background: '#fff', border: `${6 * k}px solid ${p.accent}`, color: p.ink,
        fontFamily: `'${p.round}', '${p.font}', ${EMOJI}, sans-serif`, fontSize: X(fitPx(m.tag, 52, b.w - 140)), transform: 'rotate(-3deg)', transformOrigin: '0 100%' });
    }
  } else if (m.kind === 'album') {
    const n = Math.max(1, m.pics.length || 4), T = (b.w - 8) / 2;
    cssCamel(bub, { width: X(b.w), height: X(b.h), borderRadius: X(MEDIA_R), overflow: 'hidden', background: '#fff', boxShadow: `0 ${4 * k}px ${14 * k}px rgba(0,0,0,0.16)` });
    for (let j = 0; j < n; j++) {
      const q = m.pics[j], full = n === 1 || (n % 2 === 1 && j === n - 1), tw = full ? b.w : T, th = n === 1 ? b.w : T;
      const wn = win(bub, tw, th, q?.src ? { source: q.src, t: q.t, crop: m.crop } : null, m.i + j);
      cssCamel(wn.box, { left: X(full ? 0 : (j % 2) * (T + 8)), top: X(Math.floor(j / 2) * (T + 8)) });
      const lb = m.labels[j];
      if (lb) {
        const sh = lineAbs(wn.box); cssCamel(sh, { left: '0', right: '0', bottom: '0', height: X(110), background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.55))' });
        const tx = lineAbs(wn.box); tx.textContent = lb;
        cssCamel(tx, { left: X(22), bottom: X(24), color: '#fff', fontFamily: `'${p.round}', '${p.font}', ${EMOJI}, sans-serif`, fontSize: X(fitPx(lb, 48, tw - 44)), textShadow: `0 0 ${6 * k}px rgba(0,0,0,0.6)` });
      }
    }
  } else if (m.kind === 'link') {
    const L = linkRows(m, b.w);
    cssCamel(bub, { width: X(b.w), height: X(b.h), borderRadius: X(MEDIA_R), overflow: 'hidden', background: '#fff', boxShadow: `0 ${4 * k}px ${16 * k}px rgba(0,0,0,0.16)` });
    const wn = win(bub, b.w, L.th, m.src ? { source: m.src, t: m.t, crop: m.crop } : null, m.i);
    cssCamel(wn.box, { left: '0', top: '0' });
    if (m.badge) {
      const pl = lineAbs(bub); svgIn(pl, GL.play('rgba(0,0,0,0.45)'));
      cssCamel(pl, { left: X(b.w / 2 - 66), top: X(L.th / 2 - 66), width: X(132), height: X(132) });
      const bd = lineAbs(bub); bd.textContent = m.badge;
      cssCamel(bd, { right: X(20), top: X(L.th - 66), padding: `${X(8)} ${X(14)}`, borderRadius: X(10), background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: X(34), fontWeight: '700' });
    }
    const tt = lineAbs(bub); tt.textContent = m.text;
    cssCamel(tt, { left: X(34), top: X(L.title), color: p.ink, fontWeight: '700', fontSize: X(fitPx(m.text, 52, b.w - 68)) });
    if (m.sub) { const sb = lineAbs(bub); sb.textContent = m.sub; cssCamel(sb, { left: X(34), top: X(L.sub), color: withAlpha(p.ink, 0.55), fontWeight: '500', fontSize: X(fitPx(m.sub, 42, b.w - 68)) }); }
    if (m.button) {
      const bt = flex(bub); bt.textContent = m.button;
      cssCamel(bt, { position: 'absolute', left: X(26), top: X(L.btn), width: X(b.w - 52), height: X(84), borderRadius: X(42), background: p.accent, color: '#fff', fontWeight: '700', fontSize: X(fitPx(m.button, 44, b.w - 120)) });
    }
  } else if (m.kind === 'voice') {
    cssCamel(bub, { width: X(b.w), height: X(b.h), borderRadius: X(RAD), background: bg, boxShadow: shadow, color: ink });
    tail(bg);
    const knob = lineAbs(bub);
    cssCamel(knob, { left: X(26), top: X(24), width: X(76), height: X(76), borderRadius: '50%', background: mine ? withAlpha(p.meInk, 0.22) : p.accent, padding: X(14), boxSizing: 'border-box' });
    el.knob = knob;
    const bars = 26, bx0 = 124, bw = b.w - 124 - 118, r = rng(7 + m.i);
    for (let j = 0; j < bars; j++) {
      const bh = 12 + r() * 52 * Math.sin(Math.PI * (j + 0.5) / bars), br = lineAbs(bub);
      cssCamel(br, { left: X(bx0 + (j * bw) / bars), top: X(62 - bh / 2), width: X(bw / bars - 6), height: X(bh), borderRadius: X(4) });
      el.bars.push(br);
    }
    const du = lineAbs(bub); du.textContent = m.dur || '0:05';
    cssCamel(du, { right: X(30), top: X(62), transform: 'translateY(-50%)', fontSize: X(38), fontWeight: '700' });
    if (b.lines.length) {
      const ln = lineAbs(bub); cssCamel(ln, { left: X(30), right: X(30), top: X(124), height: X(3), background: withAlpha(ink, 0.2) });
      const tx = lineAbs(bub); tx.textContent = b.lines.join('\n');
      cssCamel(tx, { left: X(34), top: X(124 + 22), fontSize: X(VOICE_FS), lineHeight: X(VOICE_LH), fontWeight: '500' });
    }
  } else {
    cssCamel(bub, { padding: `${X(PADV)} ${X(PADH)}`, borderRadius: X(RAD), background: bg, color: ink, boxShadow: shadow, fontSize: X(FS), lineHeight: X(LH), fontWeight: '500', whiteSpace: 'pre', maxWidth: X(MAXW) });
    const tx = h('span', null, null, bub); tx.textContent = b.lines.join('\n');
    tail(bg);
  }
  return el;
}

export const chat: ItemType<P, S> = {
  type: 'common.chat', label: '聊天對話框', category: 'phone', kind: 'overlay',
  doc: '通訊軟體的聊天畫面（通用介面，不是哪一家 App；每個字都是參數、配色是自己的），整支片一個項目：items 一行一則「秒[-秒]|誰|內容|key=值…」，誰＝me（右邊）／them（左邊有頭像；寫別的字＝群組裡那個人的名字）／sys（中間灰色系統訊息）／ch（章節膠囊）；訊息到時間彈出、新的推到最下面、整串往上捲；種類寫在後面：預設文字（/ 換行、太長自動換行，泡泡高度照行數算）、typing 對方輸入中三個點（到同一邊下一則訊息為止，或寫「秒-秒」）、photo 照片、video 影片（play=秒-秒 播放時泡泡挖圓角洞，主軌片段用 frame: chatWindow(參數, 第幾則, 寬, 高) 放進去；mute 靜音圖示、dur= 片長）、album 相簿（pics=素材@秒,素材@秒,- 多張、labels= 每張的名字）、link 連結卡（內容是標題、sub=、button=、badge= 片長、press= 按下）、voice 語音訊息（dur=、play=秒-秒 波形跟著跑，內容是轉文字）、sticker 大貼圖（內容放 emoji，沒有泡泡）；src=素材 id、t=取第幾秒（沒有素材畫示意色塊）、t2= 播完後的畫面、crop=x,y,zoom、ratio=4:5、w= 寬（螢幕寬比例）、tag= 照片上的小標；me 的訊息 readAfter 秒後出現「已讀」（read 參數換字；read=秒 自己指定、unread 不顯示），when= 時間小字；name= avatar= color= 群組成員；頂部 pin 置頂公告（pin 標題，有 ch 訊息時下面一排章節點跟著亮，icon= 章節點的圖示，預設章節字開頭的 emoji）；header 對方名字 name、status 小字、頭像 avatar；底部輸入框 inputs「秒-秒|文字|type/delete」打字刪字，沒有字時寫 hint；panel 輸入框下的貼圖面板（emoji 空白分隔，空＝沒有）；wall「秒|#上|#下」桌布顏色（關鍵影格之間緩動，例如白天到傍晚）；9:16 鋪滿畫面，16:9／1:1 是畫面中間一支手機（device）；手指用 common.touch（位置用 chatPoint(參數, 第幾則, 秒, 寬, 高)），大爆炸貼紙用 common.burst，飄 emoji 用 common.emoji，字幕用 common.caption；音效配 common.send（送出）、common.recv（收到）、common.typing（打字）、common.buzz（震動、已讀不回）、common.pop（貼圖）',
  params: [
    { key: 'items', label: '訊息（一行一則：秒[-秒]|誰 me/them/sys/ch 或名字|內容（/ 換行）|種類 typing/photo/video/album/link/voice/sticker|key=值：src= t= t2= crop=x,y,zoom ratio= w= dur= mute tag= play=秒-秒 pics= labels= sub= button= badge= press= read= unread when= name= avatar= color= icon=）', type: 'text',
      default: '-1|sys|今天\n0.1|them|週末要去哪裡？\n0.6|me|海邊！/已經到了\n1.0|me||photo|ratio=4:3|tag=☀️ 32°C\n1.5|them||typing\n2.1|them|也太好了吧 😆\n2.5|me|下次一起來' },
    { key: 'name', label: '對方的名字（上方標題）', type: 'string', default: '小美' },
    { key: 'status', label: '名字下的小字（空＝沒有）', type: 'string', default: '' },
    { key: 'avatar', label: '對方頭像上的字（一個 emoji 或字；空＝名字的第一個字）', type: 'string', default: '' },
    { key: 'avatarColor', label: '頭像底色', type: 'color', default: '#f4a259' },
    { key: 'time', label: '狀態列的時間（空＝不寫）', type: 'string', default: '' },
    { key: 'battery', label: '電量（%）', type: 'number', min: 0, max: 100, step: 1, default: 76 },
    { key: 'pin', label: '置頂公告的標題（空＝沒有；有 ch 訊息時下面一排章節點跟著亮）', type: 'string', default: '' },
    { key: 'pinIcon', label: '置頂公告前的圖示（emoji）', type: 'string', default: '📌' },
    { key: 'read', label: '已讀的字（空＝不顯示）', type: 'string', default: '已讀' },
    { key: 'readAfter', label: '我的訊息幾秒後變已讀（-1＝不顯示；每則可用 read=秒、unread）', type: 'number', min: -1, max: 60, step: 0.05, default: 0.7 },
    { key: 'hint', label: '輸入框沒有字時的提示', type: 'string', default: '輸入訊息' },
    { key: 'inputs', label: '輸入框打字（一行一段：秒-秒|文字|type 打字／delete 刪字）', type: 'text', default: '' },
    { key: 'panel', label: '輸入框下的貼圖面板（emoji 空白分隔；空＝沒有，輸入框貼底）', type: 'string', default: '😀 😂 🥹 😍 👍 🙏 🎉 ❤️' },
    { key: 'wall', label: '桌布（一行一個 秒|#上|#下，之間緩動）', type: 'text', default: '0|#e6ebf1|#d2dbe6' },
    { key: 'pattern', label: '桌布上的淡淡圓點', type: 'bool', default: true },
    { key: 'device', label: '手機（auto：9:16 鋪滿畫面、其他比例畫一支手機；phone 一律畫手機；bare 只要 9:16 的畫面不畫機身）', type: 'enum', options: DEVICES, default: 'auto' },
    { key: 'px', label: '手機中心 x（畫面寬比例；有手機時）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'round', label: '圓體（章節膠囊、置頂標題、小標、相簿名字）', type: 'string', default: 'Huninn' },
    { key: 'me', label: '我的泡泡顏色', type: 'color', default: '#6f7cf7' },
    { key: 'meInk', label: '我的泡泡字色', type: 'color', default: '#ffffff' },
    { key: 'them', label: '對方的泡泡顏色', type: 'color', default: '#ffffff' },
    { key: 'themInk', label: '對方的泡泡字色', type: 'color', default: '#1b1d1f' },
    { key: 'accent', label: '強調色（章節點、按鈕、游標、語音播放鈕）', type: 'color', default: '#6f7cf7' },
    { key: 'bar', label: '上方標題列與輸入列的底色', type: 'color', default: '#ffffff' },
    { key: 'ink', label: '介面字色', type: 'color', default: '#1b1d1f' },
  ],
  media(item) {
    const p = withDefaults(chat.params, item.params as Record<string, unknown>) as P, out = new Map<string, ReturnType<typeof stillRef>>();
    const add = (s: Still) => { const r = stillRef(s); out.set(`${r.source}@${r.t}`, r); };
    for (const m of parseChat(p.items)) {
      if (m.src && (m.kind === 'photo' || m.kind === 'video' || m.kind === 'link')) { add({ source: m.src, t: m.t }); if (Number.isFinite(m.t2)) add({ source: m.src, t: m.t2 }); }
      if (m.kind === 'album') for (const q of m.pics) if (q.src) add({ source: q.src, t: q.t });
    }
    return { videos: [], stills: [...out.values()] };
  },
  build(ctx) {
    const ph = phoneEls(ctx.root), sc = ph.screen, ui = lineAbs(sc);
    cssCamel(ui, { inset: '0' });
    const wall = lineAbs(ui), area = lineAbs(ui);
    cssCamel(wall, { inset: '0' });
    cssCamel(area, { left: '0', width: '100%', overflow: 'hidden' });
    const input = lineAbs(ui), panel = lineAbs(ui), home = lineAbs(ui), pin = lineAbs(ui), head = lineAbs(ui);
    const field = lineAbs(input), type = typeEl(field), hint = lineAbs(field);
    const inIcons = [lineAbs(input), lineAbs(input), lineAbs(input), lineAbs(input), lineAbs(input)];
    const pinIcon = lineAbs(pin), pinTitle = lineAbs(pin), pinTrack = lineAbs(pin), pinFill = lineAbs(pin);
    const back = lineAbs(head), hAv = avatarEl(head), hName = lineAbs(head), hStatus = lineAbs(head), hIcons = [lineAbs(head), lineAbs(head), lineAbs(head)], sb = statusBarEl(head);
    const s: S = { ph, ui, wall, area, msgEls: [], key: '', G: null, head, back, hAv, hName, hStatus, hIcons, sb, pin, pinIcon, pinTitle, pinTrack, pinFill, pinDots: [],
      input, inIcons, field, type, hint, panel, home };
    chat.draw(ctx, s);
    return s;
  },
  ready: (s) => imagesReady(s.msgEls.flatMap((m) => m.wins.map((w) => w.img))),
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t, media } = ctx;
    const G = chatGeometry(p, W, H, theme.safe), { sc, k, Hd } = G, X = (v: number) => `${v * k}px`;
    placePhone(s.ph, sc);
    const font = `'${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif`, round = `'${p.round}', '${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif`;
    cssCamel(s.ph.screen, { fontFamily: font, color: p.ink });
    // the messages' elements, built again only when something but the time changes
    const key = JSON.stringify(p) + `|${k}`;
    if (s.key !== key) {
      s.key = key;
      for (const e of s.msgEls) e.box.remove();
      s.msgEls = G.msgs.map((m, i) => buildMsg(s.area, m, G.boxes[i], p, k, media));
      for (const d of s.pinDots) d.remove();
      s.pinDots = G.chapters.map(() => flex(s.pin));
    }
    s.G = G;
    // the wallpaper
    const [w0, w1] = wallAt(p.wall, t), dots = p.pattern ? `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.28) 0 ${10 * k}px, transparent ${11 * k}px), radial-gradient(circle at 70% 75%, rgba(255,255,255,0.2) 0 ${6 * k}px, transparent ${7 * k}px), ` : '';
    cssCamel(s.wall, { background: `${dots}linear-gradient(180deg, ${w0}, ${w1})`, backgroundSize: p.pattern ? `${190 * k}px ${170 * k}px, ${150 * k}px ${210 * k}px, 100% 100%` : '100% 100%' });
    // the conversation
    const areaH = G.areaBot - G.areaTop;
    cssCamel(s.area, { top: X(G.areaTop), height: X(areaH) });
    const { pos } = chatPlace(G.msgs, G.boxes.map((b) => b.slot), t, areaH), shown = new Set(pos.map((q) => q.i));
    s.msgEls.forEach((e, i) => { if (!shown.has(i)) cssCamel(e.box, { display: 'none' }); });
    let hole: [number, number, number, number] | null = null;
    for (const q of pos) {
      const m = G.msgs[q.i], b = G.boxes[q.i], e = s.msgEls[q.i];
      if (!e) continue;
      const u = clamp(q.enter), sc2 = 0.8 + 0.2 * eBack(u), ox = m.who === 'me' ? RIGHT : m.who === 'them' ? LEFT : 540, oy = m.who === 'me' ? b.off + b.h : b.off;
      const vis = q.y + b.slot > -40 && q.y < areaH + 40;
      cssCamel(e.box, { display: vis ? 'block' : 'none', top: X(q.y), opacity: String(clamp(q.enter * 3)), transformOrigin: `${X(ox)} ${X(oy)}`, transform: u < 1 ? `scale(${sc2})` : 'none' });
      if (!vis) continue;
      const mine = m.who === 'me';
      if (e.read) { const at = Number.isFinite(m.read) ? (m.read < 0 ? Infinity : m.read) : p.readAfter < 0 ? Infinity : m.at + p.readAfter; cssCamel(e.read, { visibility: t >= at ? 'visible' : 'hidden' }); }
      if (m.kind === 'typing') e.dots.forEach((d, j) => { const ph = Math.max(0, Math.sin(t * 9 - j * 0.9)); cssCamel(d, { opacity: String(0.4 + 0.5 * ph), transform: `translateY(${-ph * 8 * k}px)` }); });
      if (m.kind === 'sticker' && e.sticker) cssCamel(e.sticker, { transform: `translateY(${Math.sin((t - m.at) * 6) * 6 * k}px)` });
      if (m.kind === 'video' || m.kind === 'photo') {
        const playing = !!m.play && t >= m.play[0] && t < m.play[1], after = !!m.play && t >= m.play[1] && e.wins.length > 1;
        const cur = e.wins[after ? 1 : 0];
        e.wins.forEach((w) => cssCamel(w.box, { display: w === cur ? 'block' : 'none', left: '0', top: '0' }));
        showStill(media, cur, m.src ? { source: m.src, t: after ? m.t2 : m.t, crop: m.crop } : null, b.w * k, b.h * k);
        if (e.play) cssCamel(e.play, { display: playing ? 'none' : 'block' });
        if (playing && u >= 1) hole = [b.x * k, (G.areaTop + q.y + b.off) * k, b.w * k, b.h * k];
      }
      if (m.kind === 'album') e.wins.forEach((w, j) => { const pq = m.pics[j]; if (pq?.src) showStill(media, w, { source: pq.src, t: pq.t, crop: m.crop }, ...e.sizes[j]); });
      if (m.kind === 'link') {
        const wn = e.wins[0];
        if (wn && m.src) showStill(media, wn, { source: m.src, t: m.t, crop: m.crop }, ...e.sizes[0]);
        const pr = m.press >= 0 && t >= m.press && t < m.press + 0.3 ? 1 - 0.03 * Math.sin((Math.PI * (t - m.press)) / 0.3) : 1;
        cssCamel(e.bub, { transform: `scale(${pr})` });
      }
      if (m.kind === 'voice' && e.knob) {
        const on = !!m.play && t >= m.play[0] && t < m.play[1], pr = m.play ? clamp((t - m.play[0]) / (m.play[1] - m.play[0])) : 0, played = !!m.play && t >= m.play[0];
        svgIn(e.knob, on ? GL.pause(mine ? p.meInk : '#fff') : GL.tri(mine ? p.meInk : '#fff'));
        const ink = mine ? p.meInk : p.themInk;
        e.bars.forEach((br, j) => cssCamel(br, { background: played && (j + 0.5) / e.bars.length <= pr ? (mine ? ink : p.accent) : withAlpha(ink, 0.35) }));
      }
    }
    // the main-track clip plays through a rounded hole in the bubble
    punch(s.ui, hole, MEDIA_R * k);
    // the header: back, avatar, the name (and a line under it), search / call / menu, the status bar above
    cssCamel(s.head, { left: '0', top: '0', width: '100%', height: X(HEAD), background: withAlpha(p.bar, 0.97), boxShadow: `0 ${2 * k}px 0 rgba(0,0,0,0.06)` });
    drawStatusBar(s.sb, { time: p.time, carrier: '', signal: 4, wifi: true, battery: p.battery, color: p.ink, font: p.font }, k, (sc.body ? 44 : 34) * k, sc.w, false);
    svgIn(s.back, GL.back(p.ink));
    cssCamel(s.back, { left: X(22), top: X(108), width: X(52), height: X(52) });
    drawAvatar(s.hAv, { name: p.name, text: p.avatar, color: p.avatarColor, size: 80 * k, font: p.font });
    cssCamel(s.hAv, { left: X(86), top: X(94), boxShadow: 'none' });
    s.hName.textContent = p.name; s.hStatus.textContent = p.status;
    cssCamel(s.hName, { left: X(186), top: X(p.status ? 116 : 134), transform: 'translateY(-50%)', fontSize: `${fitPx(p.name, 48 * k, 560 * k)}px`, fontWeight: '700' });
    cssCamel(s.hStatus, { display: p.status ? 'block' : 'none', left: X(186), top: X(162), transform: 'translateY(-50%)', fontSize: X(30), fontWeight: '500', color: withAlpha(p.ink, 0.55) });
    [glyphSvg('search', p.ink), glyphSvg('phone', p.ink), GL.menu(p.ink)].forEach((g, j) => { svgIn(s.hIcons[j], g); cssCamel(s.hIcons[j], { left: X(800 + j * 90), top: X(110), width: X(50), height: X(50) }); });
    // the pinned bar and the chapter dots under it
    cssCamel(s.pin, { display: p.pin ? 'block' : 'none', left: X(28), top: X(PIN_Y), width: X(1024), height: X(G.pinH), borderRadius: X(28), background: 'rgba(255,255,255,0.96)', boxShadow: `0 ${4 * k}px ${18 * k}px rgba(0,0,0,0.12)` });
    if (p.pin) {
      s.pinIcon.textContent = p.pinIcon; s.pinTitle.textContent = p.pin;
      cssCamel(s.pinIcon, { left: X(26), top: X(48), transform: 'translateY(-50%)', fontSize: X(40), fontFamily: `${EMOJI}, sans-serif` });
      cssCamel(s.pinTitle, { left: X(p.pinIcon ? 84 : 30), top: X(50), transform: 'translateY(-50%)', fontSize: `${fitPx(p.pin, 46 * k, (p.pinIcon ? 910 : 960) * k)}px`, fontFamily: round, color: p.ink });
      const n = G.chapters.length, x0 = n > 1 ? 222 : 512, x1 = n > 1 ? 802 : 512, xs = G.chapters.map((_, j) => (n > 1 ? x0 + ((x1 - x0) * j) / (n - 1) : 512)), y = 112;
      let cur = -1, since = 0;
      G.chapters.forEach((c, j) => { if (c.at <= t) { cur = j; since = c.at; } });
      const fillTo = cur <= 0 ? x0 : xs[cur - 1] + (xs[cur] - xs[cur - 1]) * eOut3(clamp((t - since) / 0.4));
      cssCamel(s.pinTrack, { display: n > 1 ? 'block' : 'none', left: X(x0), top: X(y - 4), width: X(x1 - x0), height: X(8), borderRadius: X(4), background: '#e3e7ec' });
      cssCamel(s.pinFill, { display: n > 1 ? 'block' : 'none', left: X(x0), top: X(y - 4), width: X(Math.max(0, fillTo - x0)), height: X(8), borderRadius: X(4), background: p.accent });
      s.pinDots.forEach((d, j) => {
        const c = G.chapters[j], on = j === cur, done = j < cur, pop = on ? eBack(clamp((t - since) / 0.45)) : 1, r = on ? 34 * (0.8 + 0.2 * pop) : 27;
        d.textContent = c.icon || leadEmoji(c.text) || String(j + 1);
        cssCamel(d, { position: 'absolute', left: X(xs[j] - r), top: X(y - r), width: X(2 * r), height: X(2 * r), borderRadius: '50%', boxSizing: 'border-box',
          background: on ? p.accent : done ? withAlpha(p.accent, 0.35) : '#eef1f4', border: on ? `${5 * k}px solid #fff` : 'none', boxShadow: on ? `0 0 0 ${3 * k}px ${withAlpha(p.accent, 0.35)}` : 'none',
          fontSize: X(on ? 38 : 30), fontFamily: `${EMOJI}, '${p.font}', sans-serif`, fontWeight: '700', color: on ? '#fff' : p.ink, opacity: on || done ? '1' : '0.6' });
      });
    }
    // the input bar: plus, camera, picture, the field (typed words or the hint, a caret), a face, the mic
    const iy = G.inputTop;
    cssCamel(s.input, { left: '0', top: X(iy), width: '100%', height: X(INPUT_H), background: p.bar, boxShadow: `0 ${-2 * k}px 0 rgba(0,0,0,0.06)` });
    const icons = [GL.plus(withAlpha(p.ink, 0.6)), glyphSvg('camera', withAlpha(p.ink, 0.6), p.bar), glyphSvg('image', withAlpha(p.ink, 0.6), p.bar), GL.face(withAlpha(p.ink, 0.6)), glyphSvg('mic', withAlpha(p.ink, 0.6))];
    const ix = [30, 112, 194, 880, 980];
    icons.forEach((g, j) => { svgIn(s.inIcons[j], g); cssCamel(s.inIcons[j], { left: X(ix[j]), top: X(INPUT_H / 2 - 26), width: X(52), height: X(52) }); });
    cssCamel(s.field, { left: X(272), top: X(INPUT_H / 2 - 42), width: X(590), height: X(84), borderRadius: X(42), background: withAlpha(p.ink, 0.06), overflow: 'hidden' });
    const typedNow = inputAt(p.inputs, t);
    drawType(s.type, typedNow ?? '', typedNow !== null && caretOn(t, 2.5), p.accent);
    cssCamel(s.type.el, { display: typedNow !== null ? 'flex' : 'none', left: X(32), top: '50%', transform: 'translateY(-50%)', fontSize: X(46), fontWeight: '500', color: p.ink });
    s.hint.textContent = p.hint;
    cssCamel(s.hint, { display: typedNow ? 'none' : 'block', left: X(32), top: '50%', transform: 'translateY(-50%)', fontSize: `${fitPx(p.hint, 42 * k, 520 * k)}px`, fontWeight: '500', color: withAlpha(p.ink, 0.38),
      ...(typedNow === '' ? { left: X(46) } : {}) });
    // the sticker panel under it (no panel: the bar's colour down to the bottom), rows fitted above the home bar
    const em = emojiList(p.panel), pTop = iy + INPUT_H, pH = Math.max(0, Hd - pTop), rows = Math.ceil(em.length / 4), rowH = rows ? Math.min(150, (pH - 90) / rows) : 0;
    cssCamel(s.panel, { display: pH > 0 ? 'block' : 'none', left: '0', top: X(pTop), width: '100%', height: X(pH), background: em.length ? mixHex(p.bar, '#dfe4ea', 0.35) : p.bar, whiteSpace: 'normal' });
    const pk = `${p.panel}|${k}|${rowH}`;
    if (s.panel.dataset.k !== pk) {
      s.panel.dataset.k = pk;
      s.panel.textContent = '';
      em.forEach((ch, j) => { const c = flex(s.panel); c.textContent = ch; cssCamel(c, { position: 'absolute', left: X(30 + (j % 4) * 255), top: X(30 + Math.floor(j / 4) * rowH), width: X(255), height: X(rowH), fontSize: X(Math.min(84, rowH * 0.62)), fontFamily: `${EMOJI}, sans-serif` }); });
    }
    cssCamel(s.home, { display: sc.full || sc.body ? 'block' : 'none', left: X(540 - 140), top: X(Hd - 26), width: X(280), height: X(10), borderRadius: X(5), background: withAlpha(p.ink, 0.75) });
  },
};
