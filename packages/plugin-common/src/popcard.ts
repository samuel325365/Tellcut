// common.popcard, the Dopamine Colors kit's (dopamine-kit.ts) photo card: tilted and white, with a black line and an offset colour
// shadow; it pops in and plays its own shots (each with an item pill on a corner), or holds a still. A pure function of time.
import { clamp, cssCamel, h, type ItemType, type MediaRef, type Project, type SceneItem, textEm } from '@tellcut/engine';
import { springPopAt } from './dopamine-kit.ts';
import { cropText } from './polaroid.ts';
import { imagesReady, windowEl } from './window.ts';

const lerp = (a: number, b: number, q: number) => a + (b - a) * q;

export interface Shot { t: number; source: string; from: number; crop: { x: number; y: number; zoom: number }; label: string; still: boolean; len: number }
/** "seconds|source|from|x,y,zoom|label|still" lines: seconds from the item's start, each shot running until the next (the last to `dur`);
 *  a line with no source is dropped before the lengths are worked out, so the shot before it plays on instead of freezing */
export function parseShots(text: string, dur: number): Shot[] {
  const shots = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [t, source = '', from, crop, label = '', still] = l.split('|').map((x) => x.trim());
    return { t: Number(t) || 0, source, from: Number(from) || 0, crop: cropText(crop), label, still: still === 'still', len: 0 };
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
interface PS { wrap: HTMLElement; shade: HTMLElement; card: HTMLElement; box: HTMLElement; ph: HTMLElement; pill: HTMLElement; shots: Shot[]; imgs: Array<HTMLImageElement | null>; text: string }
const SERIF = "'Noto Serif TC', serif";

export const popcard: ItemType<PP, PS> = {
  type: 'common.popcard', label: '彈出相片卡', category: 'photo', kind: 'overlay',
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
    // the painted stand-in (window.ts) under the shots, shown when the card has none
    const ph = windowEl(box).box;
    cssCamel(ph, { left: '0', top: '0', width: '100%', height: '100%' });
    const shots = parseShots(ctx.params.shots, ctx.dur);
    const imgs = shots.map((s) => {
      if (!s.still) return null;
      const im = h('img', null, null, box) as HTMLImageElement;
      im.src = ctx.media.stillUrl({ source: s.source, t: s.from, w: 1080 });
      cssCamel(im, { position: 'absolute', display: 'none' });
      return im;
    });
    return { wrap, shade, card, box, ph, pill, shots, imgs, text: shots.map((s) => s.label).join('') };
  },
  ready: (s) => Promise.all([document.fonts.load(`900 40px 'Noto Serif TC'`, s.text || '標'),
    imagesReady(s.imgs)]).then(() => undefined),
  draw(ctx, s) {
    const { local, W, H, params: p, media, project } = ctx, k = Math.min(W, H) / 1080, pop = clamp(springPopAt(local, p.popAt), 0, 1.2);
    const { i, labelFrom } = shotAt(s.shots, local), shot = s.shots[i];
    const bump = i > 0 && shot ? 1 - 0.035 * Math.sin(Math.PI * clamp((local - shot.t) / 0.2)) : 1;
    const cw = p.w * W, ch = p.h * H, line = 5 * k, pad = 16 * k, off = 18 * k, rad = 20 * k;
    cssCamel(s.wrap, { left: `${(p.x * W).toFixed(2)}px`, top: `${(p.y * H).toFixed(2)}px`, width: `${cw.toFixed(2)}px`, height: `${ch.toFixed(2)}px`, display: pop > 0.001 ? 'block' : 'none',
      transform: `rotate(${(p.tilt + (1 - Math.min(1, pop)) * -8).toFixed(3)}deg) scale(${(lerp(0.5, 1, pop) * bump).toFixed(4)})`, opacity: String(clamp(pop * 3)) });
    cssCamel(s.shade, { left: `${off}px`, top: `${off}px`, width: `${cw}px`, height: `${ch}px`, background: p.shadow, border: `${line}px solid ${p.ink}`, borderRadius: `${rad}px` });
    cssCamel(s.card, { background: p.paper, border: `${line}px solid ${p.ink}`, borderRadius: `${rad}px` });
    const bw = cw - 2 * (pad + line), bh = ch - 2 * (pad + line);
    cssCamel(s.box, { left: `${pad}px`, top: `${pad}px`, width: `${bw}px`, height: `${bh}px`, borderRadius: `${rad * 0.5}px`, background: shot ? '#222' : 'none' });
    cssCamel(s.ph, { display: shot ? 'none' : 'block' });
    s.imgs.forEach((im, j) => { if (im) cssCamel(im, { display: j === i ? 'block' : 'none' }); });
    if (shot) {
      const src = (project as Project).sources?.[shot.source] as { width?: number; height?: number } | undefined;
      const img = s.imgs[i];
      if (img) media.place(img as unknown as HTMLVideoElement, bw, bh, shot.crop, src?.width, src?.height);
      else { const v = media.video(shotRef(shot), s.box, clamp(local - shot.t, 0, shot.len - 0.04), false); media.place(v, bw, bh, shot.crop, src?.width, src?.height); }
    }
    // a long label shrinks (padding and all) to 92 % of the card's width, down to 40 %
    const label = shot?.label ?? '', fs = Math.max(17.6 * k, Math.min(44 * k, (0.92 * cw) / (textEm(label) + 1.2))), lp = clamp(springPopAt(local, Math.max(p.popAt + 0.2, s.shots[labelFrom]?.t ?? 0), 0.35), 0, 1.2), left = p.pillSide !== 'right';
    s.pill.textContent = label;
    cssCamel(s.pill, { display: label ? 'block' : 'none', fontSize: `${fs.toFixed(2)}px`, color: p.pillInk, background: p.pill, border: `${4 * k}px solid ${p.ink}`, borderRadius: `${fs}px`,
      padding: `${0.18 * fs}px ${0.6 * fs}px ${0.22 * fs}px`, top: `${-0.55 * fs}px`, left: left ? `${-0.04 * cw}px` : 'auto', right: left ? 'auto' : `${-0.04 * cw}px`,
      transform: `rotate(${left ? -4 : 4}deg) scale(${lp.toFixed(4)})`, transformOrigin: left ? '0% 50%' : '100% 50%' });
  },
};
