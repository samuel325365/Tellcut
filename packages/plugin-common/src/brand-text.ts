// A line of text that resolves from a soft blur, rising slightly, then softens and fades out (the brand film's text, spec
// 2026-10-25-brand-preset §6.2-5; the spike's line() in 3-tellcut-film/scene.js). Drawn on a 2D canvas: common.headline's looks brand
// and proof.
import { clamp, eIn3, eOut5 } from '@tellcut/engine';
import type { GhostLine } from './text.ts';

/** how long a line takes to come in, and to go out at its end */
export const BLUR_IN = 0.7, BLUR_OUT = 0.4;

export interface BlurLine {
  text: string; x: number; y: number; size: number;
  /** font-family list as CSS takes it */
  family: string; weight?: number; color: string;
  align?: CanvasTextAlign; spacing?: number; shadow?: boolean;
  /** px it rises while coming in (default size / 4) */
  rise?: number;
}

/** 0–1: how far a line is in at `t` (t0 its start, t1 its end; t1 Infinity: it stays) */
export function blurLineAlpha(t: number, t0: number, t1 = Infinity): number {
  const pin = eOut5(clamp((t - t0) / BLUR_IN)), pout = eIn3(clamp((t - (t1 - BLUR_OUT)) / BLUR_OUT));
  return pin * (1 - pout);
}

/** draws the line; returns where it is, for its transparent DOM copy (text.ts ghostLine) */
export function drawBlurLine(g: CanvasRenderingContext2D, l: BlurLine, t: number, t0: number, t1 = Infinity): GhostLine {
  const pin = eOut5(clamp((t - t0) / BLUR_IN)), pout = eIn3(clamp((t - (t1 - BLUR_OUT)) / BLUR_OUT)), a = pin * (1 - pout);
  const ghost = blurGhost(l, t, t0, t1);
  if (a <= 0.003 || !l.text) return ghost;
  g.save();
  g.globalAlpha = a;
  g.font = `${l.weight ?? 300} ${l.size}px ${l.family}`;
  g.fillStyle = l.color; g.textAlign = l.align ?? 'left'; g.textBaseline = 'alphabetic';
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.spacing ?? 0}px`;
  const k = l.size / 56;
  g.filter = `blur(${(((1 - pin) * 9 + pout * 6) * k).toFixed(2)}px)`;
  if (l.shadow ?? true) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 30 * k; g.shadowOffsetY = 2 * k; }
  g.fillText(l.text, l.x, l.y + (1 - pin) * (l.rise ?? l.size / 4));
  g.restore();
  return ghost;
}

/** A text that starts with a number counts up to it from t0 over dur (easing out); what follows the number ('+', ' clips.')
 *  stays as it is. A text that does not start with a number is returned as it is. */
export function countUp(text: string, t: number, t0: number, dur = 0.7): string {
  const m = /^(\d+)(.*)$/s.exec(text);
  if (!m) return text;
  const k = eOut5(clamp((t - t0) / dur));
  return `${Math.round(Number(m[1]) * k)}${m[2]}`;
}

/** a character the Latin faces (Inter, Playfair…) have no drawing for: Chinese, Japanese, symbols */
const NON_LATIN = /[^\u0000-ɏ -⁯]/u;
/** the face every family list here falls back to for those characters */
export const CJK_FACE = 'Noto Sans TC';

/** Loads the faces lines are drawn with on a canvas (call it in ready()): `family` at `weight`, and Noto Sans TC at the same
 *  weight when the text has characters the family has not (it then draws them; by CSS weight matching 300 takes its 400 face,
 *  600 its 700). A canvas does not wait for a face: one that is not loaded draws in a system font on the first frame. */
export async function loadLineFaces(fonts: FontFaceSet | undefined, lines: Array<{ weight: number; family: string; text: string }>): Promise<void> {
  if (!fonts) return;
  const loads = new Map<string, [string, string]>();
  const add = (font: string, text: string) => loads.set(`${font}\n${text}`, [font, text]);
  for (const { weight, family, text } of lines) {
    add(`${weight} 40px "${family}"`, text || 'A');
    if (NON_LATIN.test(text) && family !== CJK_FACE) add(`${weight} 40px "${CJK_FACE}"`, text);
  }
  await Promise.all([...loads.values()].map(([font, text]) => fonts.load(font, text).catch(() => [])));
}

/** where drawBlurLine puts the line at `t`, as its transparent DOM copy (text.ts ghostLine) */
export function blurGhost(l: BlurLine, t: number, t0: number, t1 = Infinity): GhostLine {
  const pin = eOut5(clamp((t - t0) / BLUR_IN));
  return { text: l.text, x: l.x, y: l.y + (1 - pin) * (l.rise ?? l.size / 4), size: l.size, family: l.family, weight: l.weight ?? 300, align: l.align, spacing: l.spacing, alpha: blurLineAlpha(t, t0, t1) };
}
