// common.rolldoor — a steel roll-down shutter (鐵捲門) that closes over a rectangle — usually the video window — and a paper sign taped
// on it once it is down (今日打烊). dir up rolls it open instead. From the food-receipt short's ending. Pair with common.rattle.
import { abs, clamp, cssCamel, eBack, eOut3 as eOut, type ItemType, prog } from '@tellcut/engine';
import { PANEL_FRAME, PANEL_RADIUS } from './panel.ts';
import { fitPx } from './text.ts';

interface P { x: number; y: number; w: number; h: number; radius: number; at: number; dur: number; dir: 'down' | 'up'; sign: string; font: string; signColor: string; signPaper: string; steel: string }
interface S { win: HTMLElement; door: HTMLElement; bar: HTMLElement; handle: HTMLElement; sign: HTMLElement; tape: HTMLElement; word: HTMLElement }

/** how far down the shutter is (0 open – 1 closed) at `local` */
export const doorAt = (local: number, at: number, dur: number, dir: 'down' | 'up') => {
  const q = eOut(prog(local, at, at + Math.max(0.05, dur)));
  return dir === 'up' ? 1 - q : q;
};

export const rolldoor: ItemType<P, S> = {
  type: 'common.rolldoor', label: '鐵捲門', category: 'moment', kind: 'overlay',
  doc: '鐵捲門：一片片鋼板從上往下拉下來蓋住一個框（通常是影片窗），拉到底後貼上一張紙牌（今日打烊）彈出來；dir up 是一開始關著、到時間往上捲開；收工、結尾、打烊、下集待續；配 common.rattle 音效',
  params: [
    { key: 'x', label: 'x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: PANEL_FRAME[0] },
    { key: 'y', label: 'y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: PANEL_FRAME[1] },
    { key: 'w', label: '寬（畫面寬比例）', type: 'number', min: 0.05, max: 1, step: 0.005, default: PANEL_FRAME[2] },
    { key: 'h', label: '高（畫面高比例）', type: 'number', min: 0.05, max: 1, step: 0.005, default: PANEL_FRAME[3] },
    { key: 'radius', label: '圓角（px）', type: 'number', min: 0, max: 200, step: 1, default: PANEL_RADIUS, theme: 'radius' },
    { key: 'at', label: '開始拉的時間（秒）', type: 'number', min: 0, max: 600, step: 0.05, default: 0.3 },
    { key: 'dur', label: '拉下來要多久（秒）', type: 'number', min: 0.05, max: 5, step: 0.05, default: 0.6 },
    { key: 'dir', label: '方向（down 拉下、up 捲開）', type: 'enum', options: ['down', 'up'], default: 'down' },
    { key: 'sign', label: '紙牌上的字（空＝沒有紙牌）', type: 'string', default: '今日打烊' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'signColor', label: '紙牌字色', type: 'color', default: '#d4213a', theme: 'palette.accent' },
    { key: 'signPaper', label: '紙牌顏色', type: 'color', default: '#fbf7ee' },
    { key: 'steel', label: '鋼板顏色', type: 'color', default: '#c9d0d6' },
  ],
  build(ctx) {
    const win = abs(ctx.root), door = abs(win), bar = abs(door), handle = abs(door), sign = abs(ctx.root), tape = abs(sign), word = abs(sign);
    cssCamel(win, { overflow: 'hidden' });
    cssCamel(sign, { display: 'flex', alignItems: 'center', justifyContent: 'center' });
    cssCamel(word, { position: 'relative', whiteSpace: 'pre', fontWeight: '900', lineHeight: '1' });
    return { win, door, bar, handle, sign, tape, word };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local } = ctx, k = Math.min(W, H) / 1080, x = p.x * W, y = p.y * H, w = p.w * W, hh = p.h * H, slat = 22 * k;
    const cl = doorAt(local, p.at, p.dur, p.dir), out = 1 - prog(local, ctx.dur - 0.2, ctx.dur);
    cssCamel(s.win, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px`, borderRadius: `${p.radius * k}px`, display: cl > 0 ? 'block' : 'none', opacity: String(out) });
    // the slats travel with the door: the whole door is the window's height, pushed up out of it
    cssCamel(s.door, { left: '0', top: '0', width: '100%', height: `${hh}px`, transform: `translateY(${((cl - 1) * hh).toFixed(2)}px)`,
      background: `repeating-linear-gradient(0deg, #4d555c 0 ${slat * 0.08}px, #7c858d ${slat * 0.2}px, ${p.steel} ${slat * 0.55}px, #9aa3ab ${slat}px)`, backgroundPosition: '0 100%' });
    cssCamel(s.bar, { left: '0', bottom: '0', width: '100%', height: `${16 * k}px`, background: '#3b4248' });
    cssCamel(s.handle, { left: '50%', bottom: `${4 * k}px`, width: `${120 * k}px`, marginLeft: `${-60 * k}px`, height: `${8 * k}px`, background: '#20262b', borderRadius: `${2 * k}px` });
    // the sign, taped on once the door is down (and gone the moment it starts to roll up)
    const down = p.dir === 'down' ? p.at + p.dur : 0, shown = !!p.sign && cl >= 1 && (p.dir === 'down' ? local >= down : local < p.at);
    const q = p.dir === 'down' ? eBack(clamp((local - down) / 0.3), 1.9) : 1, sw = Math.min(460 * k, w * 0.8), sh = 156 * k * (sw / (460 * k));
    s.word.textContent = p.sign;
    cssCamel(s.sign, { display: shown ? 'flex' : 'none', left: `${x + w / 2 - sw / 2}px`, top: `${y + hh * 0.45 - sh / 2}px`, width: `${sw}px`, height: `${sh}px`, background: p.signPaper,
      boxShadow: `0 ${6 * k}px ${14 * k}px rgba(0,0,0,0.35)`, transform: `rotate(-3deg) scale(${Math.max(0.01, q).toFixed(4)})`, opacity: String(out) });
    cssCamel(s.tape, { left: '50%', top: `${-16 * k}px`, width: `${120 * k}px`, height: `${30 * k}px`, marginLeft: `${-60 * k}px`, background: 'rgba(230,200,120,0.75)' });
    cssCamel(s.word, { color: p.signColor, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${fitPx(p.sign, Math.min(92 * k, sh * 0.6), sw - 50 * k)}px`, top: `${6 * k}px` });
  },
};
