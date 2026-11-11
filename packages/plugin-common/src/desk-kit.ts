// A pastel retro computer, promoted 2026-11-05 from the retro desktop pilot film's fx.retrodesk / fx.retrowin / fx.retrodialog /
// fx.retroend (after the user's own Retro UI style film). This file holds what its blocks share:
//   common.desktop  (desktop.ts) the desktop for the whole film: a gradient that changes colour each chapter, a faint grid, pixel clouds
//                   drifting, twinkles, a menu bar, a globe and folders, and a taskbar whose buttons are the chapters, the current one lit
//   common.window   (deskwindow.ts) a window (file name, three buttons, ink border, hard shadow) that plays its own clip or photo, or
//                   holds a search box being typed, a profile list or a progress bar; it pops in and at its end flies into its chapter's
//                   taskbar button, closes, or grows to fill the top of the frame
//   common.popup    (popup.ts) a notice dialog with a question and two buttons, one pressed at `press`; mode sheet is the closing panel:
//                   a cream sheet with a typed line and a button that is pressed, turns into its done label and throws pixel confetti
// The pointer is common.touch's look cursor; the message box is the caption template desk-type. All pure functions of time.
import { clamp } from '@tellcut/engine';
import { fitMeasuredSize } from './headline.ts';

export const CJK = 'Huninn', PIX = 'VT323';
export const DESK_BARS: Record<string, string> = { lav: '#c3b1f5', pink: '#f7b2cf', mint: '#97e0c6', yellow: '#ffd879' };
const bar = (c: string) => DESK_BARS[c] ?? c;
export type G = CanvasRenderingContext2D;
/** the size (at most `px`) at which `text` in `family` fits in `room` px on `g`: a long question or label shrinks instead of
 *  running out of its dialog or button */
export const fit = (g: G, text: string, px: number, family: string, room: number) => fitMeasuredSize(g, [text], px, family, 400, room);

export const fonts = (text: string) => Promise.all([document.fonts.load(`40px "${PIX}"`, 'Aa.exe0123456789%_'), document.fonts.load(`56px "${CJK}"`, text || '桌面')]).then(() => undefined);

/** the taskbar's button n (from 1) of `count`: centre and size in frame px (common.window flies into it) */
export function deskSlot(n: number, count: number, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const k = Math.min(W, H) / 1080, x0 = 190 * k, x1 = W - 18 * k, gap = 10 * k, c = Math.max(1, count), bw = (x1 - x0 - gap * (c - 1)) / c;
  return { x: x0 + (clamp(n, 1, c) - 1) * (bw + gap) + bw / 2, y: H - 40 * k, w: bw, h: 50 * k };
}

export type Report = (g: G, text: string, x: number, y: number) => void;
/** a window's chrome: hard shadow, cream body, title bar with its name (fitted to the room left of the buttons) and three buttons, ink
 *  border; k = px per 1080 */
export function chrome(g: G, w: number, h: number, k: number, colour: string, title: string, ink: string, paper: string, report: Report) {
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
