// common.popup, the dialog of the pastel retro computer kit (desk-kit.ts): a notice with a question and two buttons, one pressed at
// `press`; mode sheet is the closing panel: a cream sheet with a typed line and a button that is pressed, turns into its done label and
// throws pixel confetti. A pure function of time.
import { clamp, eIO3 as eIO, rng, type ItemType } from '@tellcut/engine';
import { CJK, chrome, fit, fonts, type G, type Report } from './desk-kit.ts';
import { canvasIn, rr } from './inkline.ts';

/** a button with a hard shadow, its label fitted inside; pressed, it sits down into the shadow */
function button(g: G, x: number, y: number, w: number, h: number, k: number, fill: string, label: string, pressed: boolean, ink: string, report: Report) {
  const d = 6 * k, o = pressed ? d : 0;
  g.fillStyle = ink; rr(g, x + d, y + d, w, h, 8 * k); g.fill();
  g.fillStyle = fill; rr(g, x + o, y + o, w, h, 8 * k); g.fill();
  g.strokeStyle = ink; g.lineWidth = 4 * k; g.stroke();
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${fit(g, label, 48 * k, `"${CJK}"`, w - 28 * k)}px "${CJK}"`;
  g.fillText(label, x + o + w / 2, y + o + h / 2 + 2 * k); report(g, label, x + o + w / 2, y + o + h / 2 + 2 * k);
}

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
