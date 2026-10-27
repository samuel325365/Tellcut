// common.reels — a short-video / story app's frame round the footage, from t2-reels' fx.reelsChrome and fx.shareSheet. A generic
// app (no real app's mark or layout of its own): mode feed is the frame that runs the whole film — segment bars at the top (one
// segment can crawl; a cold open plays a later segment first and rewinds), the avatar with the account and a place, a title sticker
// with the segment count, the button column at the right with its counts (a heart that pops and turns red at each double tap, the
// bookmark filling at saveAt), the account / follow / caption / music marquee at the bottom and the nav bar. Mode end goes on top
// of it at the end: a pinned comment pops in, the author's reply under it (███ becomes black bars), a "saved" toast, the share
// sheet slides up with its big button, and the button is pressed (a ripple; common.touch draws the finger).
// Every word is a parameter; times are from the item's start; counts are "秒|數" keyframes written by fmtCount in the chosen style.
// On 9:16 it covers the frame; on a wide or square frame it is a phone in the middle (phone.ts).
import { clamp, cssCamel, eBack, eIO3, eOut3 as eOut, esc, h, lerp, textEm, type ItemType } from '@tellcut/engine';
import { liveSpans } from './lockscreen.ts';
import { avatarEl, DEVICES, drawAvatar, drawRipple, fmtCount, glyphSvg, parseSteps, phoneEls, phoneView, placePhone, rippleAt, timeSpan, type CountStyle, type Device, type PhoneEls } from './phone.ts';
import { fitPx, lineAbs } from './text.ts';
import { withAlpha } from './color.ts';

export const REELS_MODES = ['feed', 'end'] as const;
export const COUNT_STYLES: CountStyle[] = ['zh', 'ja', 'en', 'plain'];

// ---------------------------------------------------------------- the segment bars
export type Span = [number, number];
/** the cold open "秒-秒|段" (the segment it plays first, counted from 0); null when there is none */
export function parseHook(text: string): { a: number; b: number; seg: number } | null {
  const [when = '', seg = ''] = String(text ?? '').split('|').map((x) => x.trim());
  const s = timeSpan(when);
  return s && s[1] !== undefined && s[1] > s[0] ? { a: s[0], b: s[1], seg: Math.max(0, Math.round(Number(seg) || 0)) } : null;
}
const REWIND = 0.5;
/** How full bar i is at t (0–1). The slow segment crawls: a quick start, almost stuck, done at the very end. During the cold open the
 *  bars before its segment are full, its own fills to 0.4, and in its last 0.5 s every bar runs back to empty. */
export function segFill(segs: Span[], hook: ReturnType<typeof parseHook>, slow: number, i: number, t: number): number {
  if (hook && t < hook.b) {
    const base = i < hook.seg ? 1 : i === hook.seg ? 0.4 * clamp((t - hook.a) / Math.max(1e-6, hook.b - REWIND - hook.a)) : 0;
    return t > hook.b - REWIND ? base * (1 - eIO3(clamp((t - (hook.b - REWIND)) / REWIND))) : base;
  }
  const s = segs[i];
  if (!s) return 0;
  const u = clamp((t - s[0]) / Math.max(1e-6, s[1] - s[0]));
  if (i !== slow) return u;
  if (u < 0.12) return lerp(0, 0.1, u / 0.12);
  if (u < 0.9) return lerp(0.1, 0.22, (u - 0.12) / 0.78);
  return lerp(0.22, 1, eIO3((u - 0.9) / 0.1));
}
/** the segment playing at t (the cold open's during it) and since when */
export function segAt(segs: Span[], hook: ReturnType<typeof parseHook>, t: number): { i: number; since: number } {
  if (hook && t < hook.b) return { i: hook.seg, since: hook.a };
  let i = 0;
  segs.forEach((s, j) => { if (t >= s[0]) i = j; });
  return { i, since: segs[i]?.[0] ?? -9 };
}
/** a count at t from "秒|數" keyframes, eased from one to the next */
export function countAt(text: string, t: number): number {
  const ks = parseSteps(text).map((s) => ({ t: s.t, v: Number(s.v[0]) })).filter((s) => Number.isFinite(s.v));
  if (!ks.length) return 0;
  if (t <= ks[0].t) return ks[0].v;
  for (let i = 0; i < ks.length - 1; i++) if (t < ks[i + 1].t) return lerp(ks[i].v, ks[i + 1].v, eIO3((t - ks[i].t) / Math.max(1e-6, ks[i + 1].t - ks[i].t)));
  return ks[ks.length - 1].v;
}
/** a button's bounce when it is tapped at `at`: up to 1.35 and back over `dur` */
export const popAt = (t: number, at: number, dur = 0.35) => { const u = (t - at) / dur; return u < 0 || u > 1 ? 1 : 1 + 0.35 * Math.sin(Math.PI * u); };
/** times written "1.2, 3.4" (comma, space or line separated) */
export const timeList = (text: string) => String(text ?? '').split(/[\s,，]+/).filter(Boolean).map(Number).filter(Number.isFinite);

// ---------------------------------------------------------------- the reply's blacked-out words
/** "去了████ 👉" → [['去了', false], ['████', true], [' 👉', false]] */
export const barParts = (text: string): Array<[string, boolean]> => String(text ?? '').split(/(█+)/).filter(Boolean).map((x) => [x, x.startsWith('█')]);

// ---------------------------------------------------------------- the glyphs (drawn here, in a 100 × 100 box)
const SVG = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" style="display:block;overflow:visible">${inner}</svg>`;
const ST = (c: string, w = 7) => `fill="none" stroke="${esc(c)}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const HEART = 'M50 84C21 63 12 49 12 35a19 19 0 0 1 38-8a19 19 0 0 1 38 8c0 14-9 28-38 49z';
const G = {
  heart: (c: string, fill: string | null) => SVG(fill ? `<path d="${HEART}" fill="${esc(fill)}"/>` : `<path d="${HEART}" ${ST(c)}/>`),
  comment: (c: string) => SVG(`<path d="M50 14c-21 0-37 14-37 32 0 9 4 17 11 23l-4 17 18-8c4 1 8 2 12 2 21 0 37-15 37-34S71 14 50 14z" ${ST(c)}/>`),
  share: (c: string) => SVG(`<path d="M87 14L13 43l30 11 11 30zM43 54L87 14" ${ST(c)}/>`),
  save: (c: string, filled: boolean) => SVG(`<path d="M27 13h46v74L50 69 27 87z" ${filled ? `fill="${esc(c)}" stroke="${esc(c)}" stroke-width="7" stroke-linejoin="round"` : ST(c)}/>`),
  dots: (c: string) => SVG(`<g fill="${esc(c)}"><circle cx="24" cy="50" r="7"/><circle cx="50" cy="50" r="7"/><circle cx="76" cy="50" r="7"/></g>`),
  close: (c: string) => SVG(`<path d="M25 25l50 50M75 25L25 75" ${ST(c, 8)}/>`),
  rewind: (c: string) => SVG(`<g fill="${esc(c)}"><path d="M48 20L12 50l36 30z"/><path d="M86 20L50 50l36 30z"/></g>`),
  home: (c: string) => SVG(`<path d="M16 46L50 16l34 30v38H16z" ${ST(c)}/>`),
  search: (c: string) => SVG(`<circle cx="44" cy="44" r="24" ${ST(c)}/><path d="M62 62l20 20" ${ST(c)}/>`),
  plus: (c: string) => SVG(`<rect x="16" y="16" width="68" height="68" rx="18" ${ST(c)}/><path d="M50 34v32M34 50h32" ${ST(c)}/>`),
  reel: (c: string) => SVG(`<rect x="14" y="14" width="72" height="72" rx="18" fill="${esc(c)}"/><path d="M41 34l25 16-25 16z" fill="#000"/>`),
  link: (c: string) => SVG(`<path d="M44 58l14-14M40 44l-8 8a13 13 0 0 0 18 18l8-8M60 56l8-8a13 13 0 0 0-18-18l-8 8" ${ST(c)}/>`),
  add: (c: string) => SVG(`<circle cx="50" cy="50" r="32" ${ST(c)}/><path d="M50 36v28M36 50h28" ${ST(c)}/>`),
  note: (c: string) => glyphSvg('music', c),
};
type Glyph = keyof typeof G;
const g1 = (n: Glyph, c: string) => (G as unknown as Record<string, (c: string) => string>)[n](c);
/** put a glyph in el, rebuilt only when it changes */
function glyph(el: HTMLElement, key: string, svg: () => string) { if (el.dataset.k !== key) { el.dataset.k = key; el.innerHTML = svg(); } }

interface P {
  mode: 'feed' | 'end'; segs: string; slow: number; hook: string; title: string; count: boolean; handle: string; place: string; avatar: string; avatarColor: string;
  caption: string; more: string; follow: string; music: string; likes: string; comments: string; shares: string; counts: CountStyle; taps: string; saveAt: number; nav: boolean;
  q: string; qName: string; reply: string; replyName: string; pinLabel: string; authorLabel: string; toast: string; sheetTitle: string; btn: string;
  qAt: number; replyAt: number; sheetAt: number; tapAt: number;
  device: Device; px: number; font: string; hand: string; color: string; heart: string; paper: string; ink: string; hl: string; accent: string;
}
interface Row { box: HTMLElement; av: HTMLElement; name: HTMLElement; badge: HTMLElement; text: HTMLElement }
interface S {
  ph: PhoneEls; feed: HTMLElement; end: HTMLElement;
  topShade: HTMLElement; bars: HTMLElement; barEls: Array<[HTMLElement, HTMLElement]>; av: HTMLElement; headRow: HTMLElement; name: HTMLElement; place: HTMLElement; dots: HTMLElement; close: HTMLElement;
  rewind: HTMLElement; sticker: HTMLElement; stickerText: HTMLElement; chip: HTMLElement;
  botShade: HTMLElement; btns: Record<'heart' | 'comment' | 'share' | 'save', HTMLElement>; nums: Record<'heart' | 'comment' | 'share', HTMLElement>;
  av2: HTMLElement; row2: HTMLElement; name2: HTMLElement; follow: HTMLElement; cap: HTMLElement; capText: HTMLElement; capMore: HTMLElement; note: HTMLElement; marquee: HTMLElement; mq: [HTMLElement, HTMLElement];
  navBar: HTMLElement; navIcons: HTMLElement[]; profile: HTMLElement;
  card: HTMLElement; pin: HTMLElement; pinIcon: HTMLElement; pinText: HTMLElement; rows: [Row, Row]; toast: HTMLElement; toastIcon: HTMLElement; toastText: HTMLElement;
  sheet: HTMLElement; grab: HTMLElement; sheetTitle: HTMLElement; btn: HTMLElement; targets: HTMLElement[]; ring: HTMLElement;
}

function rowEls(parent: HTMLElement): Row {
  const box = h('div', null, null, parent), av = avatarEl(box), right = h('div', null, null, box), nameLine = h('div', null, null, right);
  const name = h('span', null, null, nameLine), badge = h('span', null, null, nameLine), text = h('div', null, null, right);
  cssCamel(box, { position: 'relative', display: 'flex', alignItems: 'flex-start' });
  cssCamel(av, { position: 'relative' });
  cssCamel(right, { minWidth: '0' });
  for (const e of [nameLine, text]) cssCamel(e, { whiteSpace: 'pre', lineHeight: '1.3' });
  return { box, av, name, badge, text };
}

export const reels: ItemType<P, S> = {
  type: 'common.reels', label: '短影音介面', category: 'phone', kind: 'overlay',
  doc: '短影音／限動 App 的外框疊在影片上（通用介面，不是哪一家 App）：mode feed 是整支片都在的外框——上方分段進度條（segs「秒-秒」逗號或換行分隔；slow 那段慢慢爬、最後才走完；hook「秒-秒|段」冷開場先播後面那段，最後 0.5 秒全部倒帶並出現倒帶圖示）、頭像＋帳號（handle）＋地點（place）、標題貼紙（title，手寫字）＋段數小牌（count）、右側愛心／留言／分享／收藏按鈕與計數（likes、comments、shares 一行一個「秒|數」，數字之間緩動，counts 選 zh 1.2萬／ja 1.2万／en 1.2K／plain 12,345；taps 雙擊的時間：愛心跳一下變紅；saveAt 收藏變實心）、底部帳號＋追蹤鈕（follow）、說明（caption＋more「更多」）、音樂跑馬燈（music）、底部導覽列（nav）；mode end 疊在 feed 上當結尾：置頂留言（q、qName、pinLabel）彈出、作者回覆（reply，███ 變成黑條；replyName 空＝handle，authorLabel 作者小牌）、已收藏提示（toast，在 saveAt）、分享面板（sheetTitle）從底部滑上來（sheetAt）、大按鈕（btn）在 tapAt 被按下（手指用 common.touch）；9:16 鋪滿畫面，16:9／1:1 是畫面中間一支手機（device，跟 common.comments、common.story 給一樣的值就疊在同一支手機上）；字幕用 common.caption 的 auto／big，飄愛心用 common.emoji 的 float、雙擊大愛心用 tap，留言串用 common.comments，限動貼紙用 common.story；音效配 common.rewind（冷開場倒帶）、common.pop（雙擊、按鈕）、common.recv（留言）、common.send（分享）',
  params: [
    { key: 'mode', label: '樣式（feed 整支片的外框、end 結尾的置頂留言與分享面板，疊在 feed 上）', type: 'enum', options: [...REELS_MODES], default: 'feed' },
    { key: 'segs', label: '分段（feed：「秒-秒」逗號或換行分隔，一段一格進度條；空＝不畫）', type: 'text', default: '0-1, 1-2, 2-3' },
    { key: 'slow', label: '慢速的段（feed：從 0 數，-1＝沒有）', type: 'number', min: -1, max: 20, step: 1, default: -1 },
    { key: 'hook', label: '冷開場（feed：秒-秒|先播第幾段，從 0 數；最後 0.5 秒倒帶；空＝沒有）', type: 'string', default: '' },
    { key: 'title', label: '標題貼紙（feed；空＝不顯示）', type: 'string', default: '這個週末去哪裡？' },
    { key: 'count', label: '標題旁的段數小牌（feed：目前第幾段／共幾段）', type: 'bool', default: true },
    { key: 'handle', label: '帳號', type: 'string', default: 'mia.travel' },
    { key: 'place', label: '帳號旁的地點（feed；空＝不顯示）', type: 'string', default: '海邊小鎮' },
    { key: 'avatar', label: '頭像上的字（一個 emoji 或字；空＝帳號的第一個字）', type: 'string', default: '' },
    { key: 'avatarColor', label: '頭像底色', type: 'color', default: '#f4a259' },
    { key: 'caption', label: '底部說明（feed；空＝不顯示）', type: 'string', default: '三個沒人知道的角落，最後一個最美' },
    { key: 'more', label: '說明後面的「更多」（feed；空＝不加）', type: 'string', default: '更多' },
    { key: 'follow', label: '追蹤鈕的字（feed；空＝沒有按鈕）', type: 'string', default: '追蹤' },
    { key: 'music', label: '音樂跑馬燈（feed；空＝不顯示）', type: 'string', default: '原創音樂 · mia.travel' },
    { key: 'likes', label: '愛心數（feed：一行一個 秒|數，數字之間緩動）', type: 'text', default: '0|8200\n3|12600' },
    { key: 'comments', label: '留言數（feed：一行一個 秒|數）', type: 'text', default: '0|312\n3|468' },
    { key: 'shares', label: '分享數（feed：一行一個 秒|數）', type: 'text', default: '0|1027' },
    { key: 'counts', label: '數字寫法（zh 1.2萬、ja 1.2万、en 1.2K、plain 12,345）', type: 'enum', options: COUNT_STYLES, default: 'zh' },
    { key: 'taps', label: '雙擊的時間（feed：逗號分隔的秒數，愛心跳一下、變紅）', type: 'string', default: '1.2' },
    { key: 'saveAt', label: '按收藏的時間（feed：收藏變實心；end：已收藏提示出現；-1＝不按）', type: 'number', min: -1, max: 600, step: 0.05, default: 2.2 },
    { key: 'nav', label: '底部導覽列（feed）', type: 'bool', default: true },
    { key: 'q', label: '置頂留言（end）', type: 'string', default: '最後那個角落在哪裡？👀' },
    { key: 'qName', label: '留言的人（end）', type: 'string', default: 'kiki_trip' },
    { key: 'reply', label: '作者回覆（end：███ 變成黑條；空＝沒有回覆）', type: 'string', default: '在████ 👉 完整版' },
    { key: 'replyName', label: '回覆的人（end；空＝帳號）', type: 'string', default: '' },
    { key: 'pinLabel', label: '置頂的標籤（end）', type: 'string', default: '置頂留言' },
    { key: 'authorLabel', label: '作者小牌（end；空＝不加）', type: 'string', default: '作者' },
    { key: 'toast', label: '收藏提示（end，在 saveAt 出現；空＝沒有）', type: 'string', default: '已收藏' },
    { key: 'sheetTitle', label: '分享面板的標題（end）', type: 'string', default: '分享' },
    { key: 'btn', label: '分享面板的大按鈕（end；空＝沒有面板）', type: 'string', default: '看完整版 👉' },
    { key: 'qAt', label: '置頂留言出現（end，項目內秒數）', type: 'number', min: 0, max: 600, step: 0.05, default: 0.1 },
    { key: 'replyAt', label: '回覆出現（end）', type: 'number', min: 0, max: 600, step: 0.05, default: 0.7 },
    { key: 'sheetAt', label: '分享面板滑上來（end）', type: 'number', min: 0, max: 600, step: 0.05, default: 1.6 },
    { key: 'tapAt', label: '按下大按鈕（end；-1＝不按）', type: 'number', min: -1, max: 600, step: 0.05, default: 2.4 },
    { key: 'device', label: '手機（auto：9:16 鋪滿畫面、其他比例畫一支手機；phone 一律畫手機；bare 只要 9:16 的畫面不畫機身）', type: 'enum', options: DEVICES, default: 'auto' },
    { key: 'px', label: '手機中心 x（畫面寬比例；有手機時）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'hand', label: '標題貼紙的手寫字', type: 'string', default: 'LXGW WenKai TC' },
    { key: 'color', label: '介面的字與圖示色', type: 'color', default: '#ffffff' },
    { key: 'heart', label: '按過的愛心色', type: 'color', default: '#ff3b5c' },
    { key: 'paper', label: '貼紙與卡片的底色', type: 'color', default: '#fffdf6', theme: 'palette.paper' },
    { key: 'ink', label: '貼紙與卡片的字色', type: 'color', default: '#1b1b1b', theme: 'palette.ink' },
    { key: 'hl', label: '段數小牌的顏色', type: 'color', default: '#ffd84d', theme: 'palette.hl' },
    { key: 'accent', label: '強調色（作者小牌、大按鈕）', type: 'color', default: '#ff3b5c', theme: 'palette.accent' },
  ],
  build(ctx) {
    const ph = phoneEls(ctx.root), sc = ph.screen, feed = lineAbs(sc), end = lineAbs(sc);
    for (const e of [feed, end]) cssCamel(e, { inset: '0' });
    const topShade = lineAbs(feed), bars = lineAbs(feed), av = avatarEl(feed), headRow = lineAbs(feed), name = h('span', null, null, headRow), place = h('span', null, null, headRow);
    cssCamel(headRow, { display: 'flex', alignItems: 'baseline' });
    const dots = lineAbs(feed), close = lineAbs(feed), rewind = lineAbs(feed), sticker = lineAbs(feed), stickerText = h('span', null, null, sticker), chip = lineAbs(sticker);
    const botShade = lineAbs(feed);
    const btns = { heart: lineAbs(feed), comment: lineAbs(feed), share: lineAbs(feed), save: lineAbs(feed) }, nums = { heart: lineAbs(feed), comment: lineAbs(feed), share: lineAbs(feed) };
    const av2 = avatarEl(feed), row2 = lineAbs(feed), name2 = h('span', null, null, row2), follow = h('span', null, null, row2), cap = lineAbs(feed), capText = h('span', null, null, cap), capMore = h('span', null, null, cap);
    const note = lineAbs(feed), marquee = lineAbs(feed), mq: [HTMLElement, HTMLElement] = [lineAbs(marquee, {}, 'span'), lineAbs(marquee, {}, 'span')];
    cssCamel(marquee, { overflow: 'hidden' });
    cssCamel(row2, { display: 'flex', alignItems: 'center' });
    const navBar = lineAbs(feed), navIcons = [0, 1, 2, 3].map(() => lineAbs(feed)), profile = avatarEl(feed);
    // end
    const card = lineAbs(end), pin = h('div', null, null, card), pinIcon = h('div', null, null, pin), pinText = h('span', null, null, pin);
    cssCamel(pin, { display: 'flex', alignItems: 'center', whiteSpace: 'pre', lineHeight: '1' });
    cssCamel(card, { whiteSpace: 'normal' });
    const rows: [Row, Row] = [rowEls(card), rowEls(card)];
    const toast = lineAbs(end), toastIcon = h('div', null, null, toast), toastText = h('span', null, null, toast);
    cssCamel(toast, { display: 'flex', alignItems: 'center' });
    const sheet = lineAbs(end), grab = lineAbs(sheet), sheetTitle = lineAbs(sheet), btn = lineAbs(sheet), targets = [0, 1, 2, 3].map(() => lineAbs(sheet)), ring = h('div', null, null, sheet);
    return { ph, feed, end, topShade, bars, barEls: [], av, headRow, name, place, dots, close, rewind, sticker, stickerText, chip, botShade, btns, nums, av2, row2, name2, follow, cap, capText, capMore, note, marquee, mq,
      navBar, navIcons, profile, card, pin, pinIcon, pinText, rows, toast, toastIcon, toastText, sheet, grab, sheetTitle, btn, targets, ring };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t } = ctx;
    const { sc, k, Hd, X } = phoneView(W, H, theme.safe, p);
    placePhone(s.ph, sc);
    const font = `'${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`, hand = `'${p.hand}', '${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`;
    const shadow = (b: number) => `0 0 ${b * k}px rgba(0,0,0,0.45)`;
    cssCamel(s.ph.screen, { color: p.color, fontFamily: font });
    const feed = p.mode !== 'end';
    cssCamel(s.feed, { display: feed ? 'block' : 'none' });
    cssCamel(s.end, { display: feed ? 'none' : 'block' });
    if (feed) drawFeed(); else drawEnd();

    function drawFeed() {
      // the dark at the top and bottom that keeps the white words readable on any footage
      const y0 = sc.body ? 112 : 0;
      cssCamel(s.topShade, { left: '0', top: '0', width: '100%', height: X(300 + y0), background: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0))' });
      const navH = p.nav ? 154 : 0, base = Hd - navH;
      cssCamel(s.botShade, { left: '0', top: X(base - 420), width: '100%', height: X(420), background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.62))' });
      // the segment bars
      const segs = liveSpans(p.segs), hook = parseHook(p.hook), n = segs.length, slow = Math.round(p.slow);
      if (s.barEls.length !== n) {
        for (const [a] of s.barEls) a.remove();
        s.barEls = segs.map(() => { const a = lineAbs(s.bars), b = lineAbs(a); return [a, b]; });
      }
      const x0 = 24, gap = 8, bw = n ? (1080 - 2 * x0 - gap * (n - 1)) / n : 0;
      s.barEls.forEach(([a, b], i) => {
        const f = segFill(segs, hook, slow, i, t);
        cssCamel(a, { left: X(x0 + i * (bw + gap)), top: X(y0 + 28), width: X(bw), height: X(7), borderRadius: X(3.5), background: withAlpha(p.color, 0.38), overflow: 'hidden' });
        cssCamel(b, { display: f > 0 ? 'block' : 'none', left: '0', top: '0', height: '100%', width: X(Math.max(7, bw * f)), borderRadius: X(3.5), background: p.color });
      });
      // the head: avatar with a story ring, account · place, the dots and the cross
      drawAvatar(s.av, { name: p.handle, text: p.avatar, color: p.avatarColor, size: 68 * k, ring: true, font: p.hand });
      cssCamel(s.av, { left: X(40), top: X(y0 + 70) });
      s.name.textContent = p.handle; s.place.textContent = p.place ? ` · ${p.place}` : '';
      const headSize = fitPx(`${p.handle} · ${p.place}`, 34, 780) / 34;
      cssCamel(s.headRow, { left: X(128), top: X(y0 + 104), transform: 'translateY(-50%)', textShadow: shadow(8) });
      cssCamel(s.name, { fontSize: X(34 * headSize), fontWeight: '700' });
      cssCamel(s.place, { fontSize: X(30 * headSize), fontWeight: '500', opacity: '0.85' });
      glyph(s.dots, `d${p.color}`, () => G.dots(p.color)); glyph(s.close, `c${p.color}`, () => G.close(p.color));
      cssCamel(s.dots, { left: X(910), top: X(y0 + 84), width: X(56), height: X(40), filter: `drop-shadow(${shadow(6)})` });
      cssCamel(s.close, { left: X(1004), top: X(y0 + 82), width: X(44), height: X(44), filter: `drop-shadow(${shadow(6)})` });
      // the rewind badge at the end of the cold open
      const rw = hook && t > hook.b - 0.55 && t < hook.b ? Math.sin((Math.PI * (t - (hook.b - 0.55))) / 0.55) : 0;
      glyph(s.rewind, `r${p.color}`, () => `<div style="position:absolute;inset:28% 30% 28% 26%">${G.rewind(p.color)}</div>`);
      cssCamel(s.rewind, { display: rw > 0 ? 'block' : 'none', left: X(430), top: X(Hd * 0.427 - 110), width: X(220), height: X(220), borderRadius: '50%', background: 'rgba(0,0,0,0.45)', opacity: String(rw) });
      // the title sticker and its segment chip
      const tin = Math.max(0, eBack(clamp(t / 0.35)));
      s.stickerText.textContent = p.title;
      const tsz = fitPx(p.title, 60, 820);
      cssCamel(s.sticker, { display: p.title && tin > 0.01 ? 'block' : 'none', left: X(500), top: X(y0 + 292), padding: `${X(18)} ${X(32)} ${X(14)}`, borderRadius: X(24), background: p.paper, color: p.ink,
        fontFamily: hand, fontSize: X(tsz), fontWeight: '700', boxShadow: `0 ${6 * k}px ${18 * k}px rgba(0,0,0,0.3)`, transform: `translate(-50%, -50%) rotate(-2deg) scale(${tin})` });
      const cur = segAt(segs, hook, t), chipOn = p.count && n > 1;
      s.chip.textContent = `${cur.i + 1}/${n}`;
      cssCamel(s.chip, { display: chipOn ? 'flex' : 'none', right: X(-54), top: X(-30), minWidth: X(124), height: X(68), borderRadius: X(34), alignItems: 'center', justifyContent: 'center', background: p.hl, color: p.ink,
        fontFamily: font, fontSize: X(38), fontWeight: '700', transform: `rotate(7deg) scale(${popAt(t, cur.since, 0.4)})` });
      // the button column
      const taps = timeList(p.taps), liked = taps.some((x) => t >= x), hs = taps.reduce((m, x) => m * popAt(t, x), 1);
      const sv = Number(p.saveAt), saved = sv >= 0 && t >= sv, cx = 1000;
      const col = [['heart', base - 616], ['comment', base - 464], ['share', base - 318], ['save', base - 174]] as const;
      for (const [key, y] of col) {
        const el = s.btns[key], size = key === 'save' ? 62 : 68;
        if (key === 'heart') glyph(el, `h${liked}${p.color}${p.heart}`, () => G.heart(p.color, liked ? p.heart : null));
        else if (key === 'save') glyph(el, `s${saved}${p.color}`, () => G.save(p.color, saved));
        else glyph(el, `${key}${p.color}`, () => g1(key, p.color));
        const sc2 = key === 'heart' ? hs : key === 'save' && sv >= 0 ? popAt(t, sv, 0.4) : 1;
        cssCamel(el, { left: X(cx - size / 2), top: X(y - size / 2), width: X(size), height: X(size), transform: `scale(${sc2})`, filter: `drop-shadow(${shadow(8)})` });
      }
      const counts: Array<[keyof S['nums'], string, number]> = [['heart', p.likes, base - 554], ['comment', p.comments, base - 402], ['share', p.shares, base - 256]];
      for (const [key, text, y] of counts) {
        const el = s.nums[key];
        el.textContent = fmtCount(countAt(text, t), p.counts);
        cssCamel(el, { left: X(cx), top: X(y), transform: 'translate(-50%, -50%)', fontSize: X(28), fontWeight: '700', textShadow: shadow(8) });
      }
      // the bottom: account and follow, the caption, the music
      const yA = base - 166;
      drawAvatar(s.av2, { name: p.handle, text: p.avatar, color: p.avatarColor, size: 52 * k, font: p.hand });
      cssCamel(s.av2, { left: X(40), top: X(yA - 26) });
      s.name2.textContent = p.handle;
      const nsz = fitPx(p.handle, 32, 560);
      cssCamel(s.row2, { left: X(106), top: X(yA), transform: 'translateY(-50%)' });
      cssCamel(s.name2, { fontSize: X(nsz), fontWeight: '700', textShadow: shadow(8) });
      s.follow.textContent = p.follow;
      cssCamel(s.follow, { display: p.follow ? 'flex' : 'none', marginLeft: X(22), height: X(46), padding: `0 ${X(18)}`, alignItems: 'center', boxSizing: 'border-box',
        border: `${3 * k}px solid ${withAlpha(p.color, 0.9)}`, borderRadius: X(12), fontSize: X(26), fontWeight: '700' });
      s.capText.textContent = p.caption; s.capMore.textContent = p.more ? `　${p.more}` : '';
      cssCamel(s.cap, { display: p.caption ? 'block' : 'none', left: X(44), top: X(yA + 62), transform: 'translateY(-50%)', fontSize: X(fitPx(`${p.caption}　${p.more}`, 30, 860)), fontWeight: '500', textShadow: shadow(8) });
      cssCamel(s.capMore, { opacity: '0.7', fontWeight: '700' });
      const yM = yA + 114, music = !!p.music;
      glyph(s.note, `n${p.color}`, () => G.note(p.color));
      cssCamel(s.note, { display: music ? 'block' : 'none', left: X(40), top: X(yM - 18), width: X(36), height: X(36), filter: `drop-shadow(${shadow(6)})` });
      // the marquee: two copies of the line, each as wide as the line plus a gap, sliding left at 70 px a second
      const mw = textEm(p.music) * 28 + 90, off = (t * 70) % mw;
      cssCamel(s.marquee, { display: music ? 'block' : 'none', left: X(90), top: X(yM - 24), width: X(560), height: X(48), textShadow: shadow(6) });
      s.mq.forEach((el, i) => {
        el.textContent = p.music;
        cssCamel(el, { left: X(i * mw - off), top: '50%', transform: 'translateY(-50%)', fontSize: X(28), fontWeight: '500' });
      });
      // the nav bar: home, search, new, short videos (lit), the profile
      cssCamel(s.navBar, { display: p.nav ? 'block' : 'none', left: '0', top: X(base), width: '100%', height: X(navH + 2), background: '#000', borderTop: `${2 * k}px solid rgba(255,255,255,0.14)` });
      const ny = base + 72, names: Glyph[] = ['home', 'search', 'plus', 'reel'];
      s.navIcons.forEach((el, i) => {
        glyph(el, `${names[i]}${p.color}`, () => g1(names[i], p.color));
        cssCamel(el, { display: p.nav ? 'block' : 'none', left: X(108 + i * 216 - 34), top: X(ny - 34), width: X(68), height: X(68) });
      });
      drawAvatar(s.profile, { name: p.handle, text: p.avatar, color: p.avatarColor, size: 60 * k, font: p.hand });
      cssCamel(s.profile, { display: p.nav ? 'flex' : 'none', left: X(972 - 30), top: X(ny - 30), border: `${4 * k}px solid ${p.color}`, boxSizing: 'border-box' });
    }

    function drawEnd() {
      const qa = p.qAt, ra = p.replyAt, sa = Number(p.saveAt), sh = p.sheetAt, ta = Number(p.tapAt);
      // the pinned card
      const cu = Math.max(0, eBack(clamp((t - qa) / 0.4)));
      cssCamel(s.card, { display: t >= qa ? 'block' : 'none', left: X(120), top: X(Hd * 0.29), width: X(840), boxSizing: 'border-box', padding: `${X(26)} ${X(32)} ${X(30)}`, borderRadius: X(32),
        background: withAlpha(p.paper, 0.97), color: p.ink, boxShadow: `0 ${14 * k}px ${40 * k}px rgba(0,0,0,0.35)`, transformOrigin: '50% 0', opacity: String(clamp((t - qa) / 0.2)), transform: `scale(${0.85 + 0.15 * cu})` });
      glyph(s.pinIcon, `p${p.ink}`, () => glyphSvg('pin', withAlpha(p.ink, 0.5), p.paper));
      cssCamel(s.pinIcon, { width: X(32), height: X(32), marginRight: X(8) });
      s.pinText.textContent = p.pinLabel;
      cssCamel(s.pin, { fontSize: X(28), fontWeight: '700', color: withAlpha(p.ink, 0.5), marginBottom: X(16) });
      const drawRow = (r: Row, name: string, text: string, color: string, indent: number, author: boolean, a: number, dy: number) => {
        const sz = indent ? 60 : 70, room = 840 - 64 - indent - sz - 18;
        drawAvatar(r.av, { name, color, size: sz * k, font: p.hand, text: author ? p.avatar : '' });
        cssCamel(r.av, { flex: 'none', marginRight: X(18), boxShadow: 'none' });
        r.name.textContent = name;
        cssCamel(r.name, { fontSize: X(28), fontWeight: '700', color: withAlpha(p.ink, 0.55) });
        r.badge.textContent = author ? p.authorLabel : '';
        cssCamel(r.badge, { display: author && p.authorLabel ? 'inline-block' : 'none', marginLeft: X(12), padding: `${X(3)} ${X(12)}`, borderRadius: X(10), fontSize: X(24), lineHeight: '1.2', fontWeight: '700', color: '#fff', background: p.accent, verticalAlign: 'middle' });
        const parts = barParts(text), key = text;
        if (r.text.dataset.v !== key) {
          r.text.dataset.v = key; r.text.textContent = '';
          for (const [x, bar] of parts) { const sp = h('span', null, null, r.text); sp.textContent = bar ? '　'.repeat(Math.max(2, [...x].length)) : x; if (bar) sp.dataset.bar = '1'; }
        }
        for (const sp of r.text.children as any as HTMLElement[]) if (sp.dataset.bar) cssCamel(sp, { background: p.ink, borderRadius: X(8) });
        const plain = parts.map(([x, bar]) => (bar ? '　'.repeat(Math.max(2, [...x].length)) : x)).join('');
        cssCamel(r.text, { fontSize: X(fitPx(plain, 46, room)), fontWeight: '700', marginTop: X(4) });
        cssCamel(r.box, { display: text && a > 0 ? 'flex' : 'none', marginLeft: X(indent), marginTop: X(indent ? 22 : 0), opacity: String(a), transform: `translateY(${dy * k}px)` });
      };
      drawRow(s.rows[0], p.qName, p.q, '#7aa6ff', 0, false, 1, 0);
      drawRow(s.rows[1], p.replyName || p.handle, p.reply, p.avatarColor, 70, true, clamp((t - ra) / 0.25), (1 - eOut(clamp((t - ra) / 0.3))) * 24);
      // the "saved" toast
      const tu = t - sa, tA = sa < 0 || !p.toast || tu < 0 ? 0 : tu < 0.25 ? tu / 0.25 : tu < 1.4 ? 1 : clamp(1 - (tu - 1.4) / 0.3);
      glyph(s.toastIcon, `t${p.color}`, () => G.save('#fff', true));
      cssCamel(s.toastIcon, { width: X(34), height: X(34), marginRight: X(14) });
      s.toastText.textContent = p.toast;
      cssCamel(s.toast, { display: tA > 0 ? 'flex' : 'none', left: '50%', top: X(Hd * 0.23), padding: `${X(18)} ${X(40)}`, borderRadius: X(40), background: 'rgba(20,20,20,0.88)', color: '#fff',
        fontSize: X(40), fontWeight: '700', opacity: String(tA), transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * tA})` });
      // the share sheet
      const su = eOut(clamp((t - sh) / 0.45)), top = Hd - 580, on = !!p.btn && t >= sh;
      cssCamel(s.sheet, { display: on ? 'block' : 'none', left: '0', top: X(top), width: '100%', height: X(640), background: '#fff', borderRadius: `${X(44)} ${X(44)} 0 0`, boxShadow: `0 ${-10 * k}px ${40 * k}px rgba(0,0,0,0.35)`,
        transform: `translateY(${(1 - su) * 640 * k}px)` });
      if (!on) return;
      cssCamel(s.grab, { left: X(490), top: X(18), width: X(100), height: X(10), borderRadius: X(5), background: '#ccc' });
      s.sheetTitle.textContent = p.sheetTitle;
      cssCamel(s.sheetTitle, { left: '50%', top: X(62), transform: 'translate(-50%, -50%)', fontSize: X(34), fontWeight: '700', color: '#333' });
      const press = ta >= 0 && t >= ta && t < ta + 0.3 ? 1 - Math.abs((t - ta) / 0.15 - 1) : 0, pulse = t >= sh + 0.5 && (ta < 0 || t < ta) ? 1 + 0.03 * Math.sin((t - sh) * 7) : 1;
      s.btn.textContent = p.btn;
      cssCamel(s.btn, { display: 'flex', left: X(140), top: X(120), width: X(800), height: X(140), borderRadius: X(70), alignItems: 'center', justifyContent: 'center', color: '#fff',
        background: `linear-gradient(90deg, ${p.accent}, ${withAlpha(p.accent, 0.72)}), #fff`, fontSize: X(fitPx(p.btn, 58, 720)), fontWeight: '700', boxShadow: `0 ${10 * k}px ${26 * k}px ${withAlpha(p.accent, 0.45)}`,
        transform: `scale(${pulse * (1 - 0.05 * press)})` });
      drawRipple(s.ring, 540 * k, 190 * k, ta >= 0 ? rippleAt(t, ta, 70 * k, k, 0.6) : null, p.accent);
      // where to share: drawn glyphs, no names (no real app's mark)
      const kinds: Glyph[] = ['link', 'share', 'add', 'dots'];
      s.targets.forEach((el, i) => {
        glyph(el, kinds[i], () => `<div style="position:absolute;inset:26%">${g1(kinds[i], '#333')}</div>`);
        cssCamel(el, { left: X(210 + i * 220 - 62), top: X(400 - 62), width: X(124), height: X(124), borderRadius: '50%', background: '#e9ecef' });
      });
    }
  },
};
