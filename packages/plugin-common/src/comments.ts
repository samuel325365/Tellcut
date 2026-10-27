// common.comments — a live stream of comments over any footage, from t2-reels' fx.reelsComments: each comment comes up from the
// bottom at its time (avatar, name, words on a dark bubble), pushes the older ones up, stays `hold` seconds and fades; the ones
// pushed past the top fade there. Laid out by phone.ts stackAt (grow up). Each line of `items`:
//   秒|名字|留言|key=值…    extras: color=#avatar colour · avatar=an emoji or a letter on the avatar (default: the name's first letter)
// On 9:16 it uses the frame; on a wide or square frame it sits on the same phone as common.reels (device none: the whole frame).
import { clamp, cssCamel, fitLines, h, type ItemType } from '@tellcut/engine';
import { avatarEl, DEVICES, drawAvatar, phoneEls, phoneScreen, placePhone, stackAt, stackEnter, type Device, type PhoneEls, type Screen, type StackItem } from './phone.ts';
import { nl } from './text.ts';
import { withAlpha } from './color.ts';

/** the avatar colours a comment without color= takes, by its line */
export const COMMENT_COLORS = ['#7aa6ff', '#ff8a65', '#b388ff', '#4db6ac', '#ffb74d', '#f06292', '#81c784'];
export interface Comment { at: number; name: string; text: string; color: string; avatar: string }

/** the comments of `items`, one per line (a typed \n too); lines without a time are dropped */
export function parseComments(text: string): Comment[] {
  const out: Comment[] = [];
  for (const line of nl(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [when = '', name = '', body = '', ...extra] = line.split('|').map((x) => x.trim());
    const at = Number(when);
    if (when === '' || !Number.isFinite(at)) continue;
    const c: Comment = { at, name, text: body, color: COMMENT_COLORS[out.length % COMMENT_COLORS.length], avatar: '' };
    for (const e of extra) {
      const i = e.indexOf('='), key = (i < 0 ? e : e.slice(0, i)).trim(), v = i < 0 ? '' : e.slice(i + 1).trim();
      if (key === 'color' && v) c.color = v;
      else if (key === 'avatar') c.avatar = v;
    }
    out.push(c);
  }
  return out;
}

const AV = 60, NAME = 26, TEXT = 40, LH = 1.3, PADY = 10, PADX = 24, GAP_AV = 16;
/** a comment's words in lines (at most two, shrunk to fit `room` design px) and its height in design px */
export function commentLayout(c: Comment, room: number): { lines: string[]; size: number; h: number } {
  const f = fitLines(c.text, (room - 2 * PADX) / TEXT, 2, 0.75), size = TEXT * f.scale;
  const hh = PADY * 2 + NAME * 1.2 + f.lines.length * size * LH;
  return { lines: f.lines, size, h: Math.max(AV, hh) };
}

/** the whole frame as the "screen" (device none): no phone, sizes by the short side */
export const frameScreen = (W: number, H: number): Screen => ({ x: 0, y: 0, w: W, h: H, k: Math.min(W, H) / 1080, r: 0, body: false, bezel: 0, full: true });
export const COMMENT_DEVICES = [...DEVICES, 'none'] as const;

interface P { items: string; hold: number; x: number; w: number; bottom: number; top: number; device: Device | 'none'; px: number; font: string; color: string; bubble: string; alpha: number }
interface Row { box: HTMLElement; av: HTMLElement; bub: HTMLElement; name: HTMLElement; text: HTMLElement }
interface S { ph: PhoneEls; layer: HTMLElement; rows: Row[]; key: string }

export const comments: ItemType<P, S> = {
  type: 'common.comments', label: '留言串', category: 'phone', kind: 'overlay',
  doc: '即時留言串，可以疊在任何影片上：items 一行一則「秒|名字|留言|key=值」，到時間從下面冒出來（頭像＋名字＋深色泡泡裡的留言，太長自動換兩行），把舊的往上推，停 hold 秒後淡掉，推到 top 以上的也淡掉；color= 頭像底色（沒寫照順序配色）、avatar= 頭像上的 emoji 或字（沒寫用名字的第一個字）；x、w 是左緣與最大寬、bottom 最新一則的底、top 淡出的高度（-1 自動：9:16 在安全區下緣、讓開 common.reels 的右側按鈕）；9:16 用整個畫面，16:9／1:1 跟 common.reels 疊在同一支手機上（device；none 是不要手機、直接用整個畫面）；音效配 common.recv（每則一下）',
  params: [
    { key: 'items', label: '留言（一行一則：秒|名字|留言|key=值：color=頭像色、avatar=頭像上的 emoji 或字）', type: 'text',
      default: '0.2|kiki_trip|這裡也太美了吧 😍\n0.9|阿哲|等等 浪也太大 😂\n1.6|小蔓|收藏了，下次去|avatar=🌸\n2.3|Ken|求地點 🙏' },
    { key: 'hold', label: '每則停幾秒（之後淡掉）', type: 'number', min: 0.5, max: 60, step: 0.1, default: 4.6 },
    { key: 'x', label: '左緣（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.06 },
    { key: 'w', label: '最大寬（畫面寬比例，含頭像）', type: 'number', min: 0.2, max: 1, step: 0.01, default: 0.74 },
    { key: 'bottom', label: '最新一則的底（畫面高比例；-1＝自動：安全區下緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'top', label: '推到這裡淡出（畫面高比例；-1＝自動：bottom 往上約三則）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'device', label: '手機（auto：9:16 用整個畫面、其他比例畫一支手機；phone 一律畫手機；bare 只要 9:16 的畫面不畫機身；none 不要手機，用整個畫面）', type: 'enum', options: [...COMMENT_DEVICES], default: 'auto' },
    { key: 'px', label: '手機中心 x（畫面寬比例；有手機時）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'color', label: '字色', type: 'color', default: '#ffffff' },
    { key: 'bubble', label: '泡泡底色', type: 'color', default: '#000000' },
    { key: 'alpha', label: '泡泡不透明度（0–1）', type: 'number', min: 0, max: 1, step: 0.02, default: 0.42 },
  ],
  build(ctx) {
    const ph = phoneEls(ctx.root), layer = h('div', null, null, ph.screen);
    cssCamel(layer, { position: 'absolute', inset: '0' });
    return { ph, layer, rows: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t } = ctx;
    const none = p.device === 'none', sc = none ? frameScreen(W, H) : phoneScreen(W, H, theme.safe, p.device as Device, p.px);
    const k = sc.k, Wd = sc.w / k, Hd = sc.h / k, X = (v: number) => `${v * k}px`;
    if (none) cssCamel(s.ph.body, { display: 'none' });
    if (none) cssCamel(s.ph.island, { display: 'none' });
    if (none) cssCamel(s.ph.screen, { left: '0', top: '0', width: `${W}px`, height: `${H}px`, borderRadius: '0' });
    else placePhone(s.ph, sc);
    const list = parseComments(p.items), room = p.w * Wd - AV - GAP_AV, lays = list.map((c) => commentLayout(c, room));
    // the safe area's bottom on the frame (and on 9:16), a little above the screen's foot on a phone
    const bot = (p.bottom >= 0 ? p.bottom : sc.full ? 1 - theme.safe.bottom : 0.78) * Hd, top = p.top >= 0 ? p.top * Hd : bot - 400;
    const key = p.items;
    if (s.key !== key) {
      s.key = key;
      for (const r of s.rows) r.box.remove();
      s.rows = list.map(() => {
        const box = h('div', null, null, s.layer), av = avatarEl(box), bub = h('div', null, null, box), name = h('div', null, null, bub), text = h('div', null, null, bub);
        cssCamel(box, { position: 'absolute', left: '0', top: '0' });
        cssCamel(bub, { position: 'absolute', top: '0', boxSizing: 'border-box' });
        for (const e of [name, text]) cssCamel(e, { whiteSpace: 'pre' });
        return { box, av, bub, name, text };
      });
    }
    const hold = Math.max(0.1, p.hold);
    const items: StackItem[] = list.map((c, i) => ({ at: c.at, out: c.at + hold, h: lays[i].h }));
    const pos = stackAt(items, t, { grow: 'up', top, bottom: bot, gap: 18, full: 99, peek: 0, move: 0.3, fade: 120 });
    const shown = new Set(pos.map((q) => q.i));
    s.rows.forEach((r, i) => { if (!shown.has(i)) cssCamel(r.box, { display: 'none' }); });
    const font = `'${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`;
    for (const q of pos) {
      const c = list[q.i], L = lays[q.i], r = s.rows[q.i], en = stackEnter(q.enter, 'up', 50), a = en.alpha * (1 - q.out) * q.fade;
      cssCamel(r.box, { display: a > 0.01 ? 'block' : 'none', left: X(p.x * Wd), top: X(q.y + en.dy), height: X(q.h), opacity: String(clamp(a)), fontFamily: font, color: p.color });
      drawAvatar(r.av, { name: c.name, text: c.avatar, color: c.color, size: AV * k, font: p.font });
      cssCamel(r.av, { left: '0', top: X((q.h - AV) / 2) });
      r.name.textContent = c.name; r.text.textContent = L.lines.join('\n');
      cssCamel(r.bub, { left: X(AV + GAP_AV), height: X(q.h), padding: `${X(PADY)} ${X(PADX)}`, borderRadius: X(24), background: withAlpha(p.bubble, p.alpha), maxWidth: X(room) });
      cssCamel(r.name, { fontSize: X(NAME), lineHeight: '1.2', fontWeight: '700', opacity: '0.72' });
      cssCamel(r.text, { fontSize: X(L.size), lineHeight: String(LH), fontWeight: '700' });
    }
  },
};
