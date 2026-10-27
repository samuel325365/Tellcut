// common.notify — a phone's stack of notifications, from t2-notify's fx.notifyStack: one notification per line comes in (the newest
// at the top, older ones pushed down; or grow up, the newest at the bottom like a chat), cards past `full` pile up under the last
// one, a card can slide off to the right, unfold a button and have it pressed, highlight 【words】 and hide its preview.
// Each line:  秒[-秒]|圖示|App|標題|內文|key=值…   (秒-秒: it slides off at the second time; 內文: "/" between lines)
//   extras: sub=a gloss under the body (wrapped) · when=the time at the right ("now" when absent) · tone=plain/light/dark/accent
//   (or the bare tone name) · lock (preview hidden: the body dim, a padlock) · chip=button words, chipAt=s (default 0.6 s after
//   the card), press=s · who=#colour of the title (a person's name)
// The stack lives on a phone screen (phone.ts): the frame itself on 9:16, a phone in the middle of a wide or square frame.
import { clamp, cssCamel, eBack, eOut3 as eOut, fitLines, h, textEm, type ItemType } from '@tellcut/engine';
import { DEVICES, drawRipple, iconTile, phoneEls, phoneView, placePhone, rippleAt, stackAt, stackEnter, timeSpan, type Device, type PhoneEls, type StackItem } from './phone.ts';
import { emParts, fitPx, lineAbs, nl } from './text.ts';
import { withAlpha } from './color.ts';

export const TONES = ['plain', 'light', 'dark', 'accent'] as const;
export type Tone = typeof TONES[number];
export interface Note {
  at: number; out?: number; icon: string; app: string; title: string; body: string[]; sub: string; when: string; tone: Tone; lock: boolean; who: string;
  chip: string; chipAt: number; press: number;
}

/** the notifications of `items`, one per line (a typed \n too); lines without a time are dropped */
export function parseNotes(text: string): Note[] {
  const out: Note[] = [];
  for (const line of nl(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [when0 = '', icon = '', app = '', title = '', body = '', ...extra] = line.split('|').map((x) => x.trim());
    const span = timeSpan(when0);
    if (!span) continue;
    const n: Note = { at: span[0], out: span[1], icon: icon || 'bell', app, title, body: body.split('/').map((x) => x.trim()).filter(Boolean), sub: '', when: '', tone: 'plain', lock: false, who: '',
      chip: '', chipAt: NaN, press: -1 };
    for (const e of extra) {
      const i = e.indexOf('='), key = (i < 0 ? e : e.slice(0, i)).trim(), v = i < 0 ? '' : e.slice(i + 1).trim();
      if ((TONES as readonly string[]).includes(key) && i < 0) n.tone = key as Tone;
      else if (key === 'tone' && (TONES as readonly string[]).includes(v)) n.tone = v as Tone;
      else if (key === 'lock') n.lock = i < 0 || !/^(0|false|no)$/i.test(v);
      else if (key === 'sub') n.sub = v;
      else if (key === 'when') n.when = v;
      else if (key === 'who') n.who = v;
      else if (key === 'chip') n.chip = v;
      else if (key === 'chipAt') n.chipAt = Number(v);
      else if (key === 'press') n.press = Number.isFinite(Number(v)) && v !== '' ? Number(v) : -1;
    }
    if (n.chip && !Number.isFinite(n.chipAt)) n.chipAt = n.at + 0.6;
    out.push(n);
  }
  return out;
}

/** the type of each tone: size and line height of the body, its weight, whether it takes the rounded face */
export const TONE_TYPE: Record<Tone, { size: number; lh: number; weight: string; round: boolean }> = {
  plain: { size: 50, lh: 64, weight: '500', round: false },
  light: { size: 56, lh: 72, weight: '700', round: false },
  dark: { size: 50, lh: 64, weight: '500', round: false },
  accent: { size: 58, lh: 76, weight: '700', round: true },   // Huninn has one weight: Chrome thickens it like the source's bold rounded face
};
const PAD = 34, HEAD = 66, TITLE = 64, SUB = 48, SUB_LH = 58, CHIP = 104;
/** A card's rows in design px (1080 wide), its width `cw`: the height without and with the button, and where each row's middle is. */
export function noteLayout(n: Note, cw: number) {
  const ty = TONE_TYPE[n.tone], body = n.body.length ? n.body : [], sub = n.sub ? fitLines(n.sub, (cw - 2 * PAD) / SUB, 12, 1).lines : [];
  let cy = PAD + HEAD;
  const title = n.title ? cy + TITLE / 2 : -1;
  if (n.title) cy += TITLE;
  const rows = body.map((_, i) => cy + ty.lh * (i + 0.5));
  cy += body.length * ty.lh;
  if (sub.length) cy += 12;
  const subs = sub.map((_, i) => cy + SUB_LH * (i + 0.5));
  cy += sub.length * SUB_LH;
  return { base: cy + PAD, chip: n.chip ? CHIP : 0, head: PAD + 27, title, rows, subs, sub, chipTop: cy + 18 };
}

interface P {
  items: string; grow: 'down' | 'up'; full: number; y: number; bottom: number; w: number; x: number; device: Device; px: number;
  now: string; lockText: string; font: string; round: string; paper: string; ink: string; accent: string; hl: string;
}
interface Card { box: HTMLElement; inner: HTMLElement; icon: HTMLElement; app: HTMLElement; when: HTMLElement; title: HTMLElement; body: HTMLElement[]; lock: HTMLElement; sub: HTMLElement[]; chip: HTMLElement; ring: HTMLElement }
interface S { ph: PhoneEls; stack: HTMLElement; cards: Card[]; key: string }

const LOCK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 44" width="100%" height="100%" style="display:block"><path d="M5 18V12a11 11 0 0 1 22 0v6" fill="none" stroke="currentColor" stroke-width="5"/><rect x="0" y="17" width="32" height="27" rx="6" fill="currentColor"/></svg>';

/** the colours of a tone: card, app name, body, gloss, time */
function toneColors(t: Tone, p: P) {
  if (t === 'light') return { bg: 'rgba(252,252,253,0.95)', app: '#6e6e73', body: '#111111', sub: '#555555', when: '#8e8e93' };
  if (t === 'dark') return { bg: 'rgba(30,30,38,0.9)', app: '#c9c0ff', body: '#ffffff', sub: '#c9c0ff', when: '#a6a1c2' };
  if (t === 'accent') return { bg: withAlpha(p.paper, 0.95), app: p.accent, body: p.ink, sub: withAlpha(p.ink, 0.62), when: withAlpha(p.ink, 0.5) };
  return { bg: 'rgba(238,240,244,0.93)', app: '#495057', body: '#16181b', sub: '#495057', when: '#8e8e93' };
}

export const notify: ItemType<P, S> = {
  type: 'common.notify', label: '通知堆疊', category: 'phone', kind: 'overlay',
  doc: '手機的通知堆疊：items 一行一則「秒[-滑掉秒]|圖示|App|標題|內文|key=值…」，到時間就推進來（最新在最上面、舊的往下擠；grow up 像聊天，最新在最下面），超過 full 則的疊在最後一則下面，「秒-秒」到第二個時間往右滑掉；內文用 / 分行、【詞】高亮；sub= 第二語言小字、when= 時間、tone= plain／light／dark／accent（accent 是 theme 紙色的大圓體字卡）、lock 隱藏預覽（內文變淡加鎖頭）、chip= 按鈕字＋chipAt=／press= 展開按鈕與按下；圖示是內建通用圖示（bell work group cal mail phone msg mic play moon camera torch lock heart star pin bag music news plane gift sun clock user check alert app image search share trash info）或一個 emoji；9:16 鋪滿畫面，16:9／1:1 是畫面中間一支手機（device）；疊在 common.lockscreen 上（y 設 0.43）；音效配 common.buzz（震動）、common.recv（訊息）、common.hush（靜音）、common.send（滑掉／送出）',
  params: [
    { key: 'items', label: '通知（一行一則：秒[-滑掉秒]|圖示|App|標題|內文（/ 分行、【詞】高亮）|key=值：sub=小字、when=時間、tone=plain/light/dark/accent、lock 隱藏預覽、chip=按鈕字、chipAt=秒、press=按下秒、who=標題色）', type: 'text',
      default: '0.1-2.3|work|工作群組||@所有人 報告今天交\n0.4|cal|行事曆|15:00 週會|記得帶筆電|when=10 分鐘後\n0.8|msg|小美||晚餐要吃什麼？\n1.3|bell|提醒|今天的重點|下班後去【海邊】走走|tone=accent|chip=好主意|chipAt=1.9|press=2.5' },
    { key: 'grow', label: '方向（down 最新在最上面、舊的往下擠；up 像聊天，最新在最下面、舊的往上推）', type: 'enum', options: ['down', 'up'], default: 'down' },
    { key: 'full', label: '完整顯示幾則（down；其餘疊在最後一則下面）', type: 'number', min: 1, max: 8, step: 1, default: 2 },
    { key: 'y', label: '堆疊上緣（手機畫面高的比例；up：舊的推到這裡淡出；-1＝自動：安全區上緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'bottom', label: '堆疊下緣（down：往下擠到這裡淡出；up：最新一則的底；-1＝自動：安全區下緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '卡片寬（手機畫面寬的比例；-1＝自動：9:16 讓開右側按鈕區）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'x', label: '卡片中心（手機畫面寬的比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'device', label: '手機（auto：9:16 鋪滿畫面、其他比例畫一支手機；phone 一律畫手機；bare 只要 9:16 的畫面不畫機身）', type: 'enum', options: DEVICES, default: 'auto' },
    { key: 'px', label: '手機中心 x（畫面寬比例；有手機時）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'now', label: '沒寫時間時右上角的字', type: 'string', default: '現在' },
    { key: 'lockText', label: '隱藏預覽又沒有內文時的字', type: 'string', default: '預覽已隱藏' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'round', label: '圓體（accent 卡片的內文）', type: 'string', default: 'Huninn' },
    { key: 'paper', label: 'accent 卡片的底色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'ink', label: 'accent 卡片的字色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'accent', label: '強調色（accent 的 App 名、按下的按鈕）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'hl', label: '【詞】的螢光底色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
  ],
  build(ctx) {
    const ph = phoneEls(ctx.root), stack = h('div', null, null, ph.screen);
    cssCamel(stack, { position: 'absolute', left: '0', top: '0', width: '100%', overflow: 'hidden' });
    return { ph, stack, cards: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local: t } = ctx;
    const { sc, k, Hd } = phoneView(W, H, theme.safe, p);
    placePhone(s.ph, sc);
    const notes = parseNotes(p.items), up = p.grow === 'up';
    const cwf = p.w > 0 ? p.w : sc.full ? 0.8 : 0.92, cw = cwf * 1080;
    const topD = (p.y >= 0 ? p.y : sc.full ? theme.safe.top + 0.015 : 0.09) * Hd;
    const botD = (p.bottom >= 0 ? p.bottom : sc.full ? 1 - theme.safe.bottom : 0.97) * Hd;
    const lays = notes.map((n) => noteLayout(n, cw));
    // the cards are rebuilt only when the text changes
    const key = `${p.items}|${cw}`;
    if (s.key !== key) {
      s.key = key;
      for (const c of s.cards) c.box.remove();
      s.cards = notes.map((n, i) => {
        const box = h('div', null, null, s.stack), inner = h('div', null, null, box);
        cssCamel(box, { position: 'absolute', left: '0', top: '0' });
        cssCamel(inner, { position: 'absolute', inset: '0' });
        const icon = h('div', null, null, inner); cssCamel(icon, { position: 'absolute' });
        const lock = h('div', null, LOCK_SVG, inner); cssCamel(lock, { position: 'absolute' });
        const chip = lineAbs(inner), ring = h('div', null, null, inner);
        return { box, inner, icon, app: lineAbs(inner), when: lineAbs(inner), title: lineAbs(inner), body: n.body.map(() => lineAbs(inner)), lock, sub: lays[i].sub.map(() => lineAbs(inner)), chip, ring };
      });
    }
    cssCamel(s.stack, { height: `${(up ? botD + 40 : botD) * k}px` });
    const items: StackItem[] = notes.map((n, i) => ({ at: n.at, out: n.out, h: lays[i].base, more: n.chip ? [[n.chipAt, CHIP]] : [] }));
    const pos = stackAt(items, t, { grow: p.grow, top: topD, bottom: botD, gap: 18, full: p.full, peek: 22, fade: up ? 200 : 220 });
    const shown = new Set(pos.map((q) => q.i));
    s.cards.forEach((c, i) => { if (!shown.has(i)) cssCamel(c.box, { display: 'none' }); });
    // lower / older first, so the newest sits on top
    const order = [...pos].sort((a, b) => b.lvl - a.lvl || notes[a.i].at - notes[b.i].at);
    const font = `'${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`, round = `'${p.round}', '${p.font}', 'Noto Sans TC', 'Segoe UI Emoji', sans-serif`;
    order.forEach((q, z) => {
      const n = notes[q.i], L = lays[q.i], c = s.cards[q.i], col = toneColors(n.tone, p), ty = TONE_TYPE[n.tone];
      const en = stackEnter(q.enter, p.grow, 70), a = en.alpha * (1 - q.out) * q.fade * (1 - 0.3 * clamp(q.lvl));
      const scale = en.scale * (1 - 0.045 * q.lvl), x = (p.x * 1080 - cw / 2 + eOut(q.out) * 1150) * k, y = (q.y + en.dy) * k;
      cssCamel(c.box, { display: a > 0.01 ? 'block' : 'none', zIndex: String(z + 1), left: `${x}px`, top: `${y}px`, width: `${cw * k}px`, height: `${q.h * k}px`, opacity: String(a),
        transformOrigin: '50% 0', transform: `scale(${scale})`, background: col.bg, borderRadius: `${44 * k}px`, boxShadow: `0 ${12 * k}px ${36 * k}px rgba(0,0,0,0.28)`, overflow: 'hidden', fontFamily: font });
      // a card in the pile shows only its edge
      cssCamel(c.inner, { display: q.lvl > 0.5 ? 'none' : 'block' });
      if (q.lvl > 0.5 || a <= 0.01) return;
      iconTile(c.icon, n.icon, 62 * k);
      cssCamel(c.icon, { left: `${PAD * k}px`, top: `${(PAD - 4) * k}px` });
      c.app.textContent = n.app; c.when.textContent = n.when || p.now;
      const whenW = textEm(c.when.textContent) * 38 * k;
      cssCamel(c.app, { left: `${(PAD + 80) * k}px`, top: `${L.head * k}px`, transform: 'translateY(-50%)', fontSize: `${fitPx(n.app, 40 * k, (cw - PAD * 2 - 100) * k - whenW)}px`, fontWeight: '700', color: col.app });
      cssCamel(c.when, { right: `${PAD * k}px`, top: `${L.head * k}px`, transform: 'translateY(-50%)', fontSize: `${38 * k}px`, fontWeight: '500', color: col.when });
      c.title.textContent = n.title;
      cssCamel(c.title, { display: n.title ? 'block' : 'none', left: `${PAD * k}px`, top: `${L.title * k}px`, transform: 'translateY(-50%)', fontWeight: '900', color: n.who || col.body,
        fontSize: `${fitPx(n.title, 50 * k, (cw - 2 * PAD) * k)}px` });
      const bodyLines = n.body.length ? n.body : [];
      bodyLines.forEach((line, j) => {
        const el = c.body[j], parts = emParts(line), plain = parts.map(([x]) => x).join('');
        if (el.dataset.v !== line) {
          el.dataset.v = line; el.textContent = '';
          for (const [x, em] of parts) { const sp = h('span', null, null, el); sp.textContent = x; if (em) sp.dataset.em = '1'; }
        }
        const size = fitPx(plain, ty.size * k, (cw - 2 * PAD - (n.lock && j === 0 ? 50 : 0)) * k);
        for (const sp of el.children as any as HTMLElement[]) {
          cssCamel(sp, sp.dataset.em ? { background: withAlpha(p.hl, 0.9), borderRadius: `${10 * k}px`, padding: `0 ${4 * k}px`, margin: `0 ${2 * k}px` } : {});
        }
        cssCamel(el, { left: `${PAD * k}px`, top: `${L.rows[j] * k}px`, transform: 'translateY(-50%)', fontSize: `${size}px`, fontWeight: ty.weight, fontFamily: ty.round ? round : font,
          color: n.lock ? col.sub : col.body });
      });
      // a hidden preview: a padlock after the first line
      const first = bodyLines.length ? emParts(bodyLines[0]).map(([x]) => x).join('') : '', room = (cw - 2 * PAD - 50) * k;
      const firstW = Math.min(room, textEm(first) * fitPx(first, ty.size * k, room));
      cssCamel(c.lock, { display: n.lock && first ? 'block' : 'none', left: `${PAD * k + firstW + 20 * k}px`, top: `${(L.rows[0] ?? 0) * k - 19 * k}px`, width: `${27 * k}px`, height: `${37 * k}px`, color: col.sub });
      L.sub.forEach((line, j) => {
        const el = c.sub[j]; el.textContent = line;
        cssCamel(el, { left: `${PAD * k}px`, top: `${L.subs[j] * k}px`, transform: 'translateY(-50%)', fontSize: `${SUB * k}px`, fontWeight: '400', color: col.sub });
      });
      // the button: pops out at chipAt, filled with the accent once pressed, a ripple from its middle
      const on = !!n.chip && t >= n.chipAt, pressed = on && n.press >= 0 && t >= n.press, pp = pressed ? clamp((t - n.press) / 0.25) : 0;
      const chipW = (textEm(n.chip) * 46 + 80) * k, chipH = 76 * k, bx = PAD * k, by = L.chipTop * k;
      // a note without a button has chipAt NaN: nothing about the chip is worked out until it shows
      const cs = !on ? 1 : pressed ? 1 - 0.08 * Math.sin(pp * Math.PI) : Math.max(0.01, eBack(clamp((t - n.chipAt) / 0.4)));
      c.chip.textContent = n.chip;
      cssCamel(c.chip, { display: on ? 'flex' : 'none', left: `${bx}px`, top: `${by}px`, width: `${chipW}px`, height: `${chipH}px`, borderRadius: `${chipH / 2}px`, alignItems: 'center', justifyContent: 'center',
        fontSize: `${46 * k}px`, fontWeight: '700', background: pressed ? p.accent : 'rgba(0,0,0,0.08)', color: pressed ? '#fff' : n.tone === 'dark' ? '#fff' : p.accent,
        opacity: String(on ? clamp((t - n.chipAt) / 0.25) : 0), transformOrigin: '0 50%', transform: `scale(${cs})` });
      drawRipple(c.ring, bx + chipW / 2, by + chipH / 2, pressed ? rippleAt(t, n.press, chipH / 2, k) : null, p.accent);
    });
  },
};
