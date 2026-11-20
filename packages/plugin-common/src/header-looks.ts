// common.header's looks beyond chip and kicker (spec 2026-11-20, header looks): small chapter labels in a corner, each with its
// own entrance. slate: a clapperboard dropping in, its striped arm snapping shut; flip: a split-flap board, the number's cells
// flipping through a few letters to it, the title's plate opening last; side: an upright bookmark at the left edge, the number on a
// colour block above the title set vertically; big: a huge outlined number rising out of its own bottom edge, the title wiped
// open over its lower half. All DOM words (check measures them), all a pure function of t; each fades out over the last 0.3 s.
import { clamp, cssCamel, eOut3, graphemes, h, prog, textEm, type ItemCtx } from '@tellcut/engine';

export const ALT_LOOKS = ['slate', 'flip', 'side', 'big'] as const;
export type AltLook = (typeof ALT_LOOKS)[number];
export const isAltLook = (l: string): l is AltLook => (ALT_LOOKS as readonly string[]).includes(l);

/** what the looks read of common.header's params */
export interface AltParams { look: string; no: string; text: string; size: number; color: string; textColor: string; ink: string; outline: string; muted: string; font: string }
/** one look's elements, rebuilt when the look, the number or the title change */
export interface Alt { key: string; root: HTMLElement; el: Record<string, HTMLElement>; cells: Array<{ cell: HTMLElement; glyph: HTMLElement }> }

/** the time each flip cell starts after the one before it, and one flip */
export const FLIP_STAGGER = 0.08, FLIP_STEP = 0.09;
const DIGITS = '0123456789', LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const SLATE_DARK = '#1b1b1d';
const stripes = (a: string, b: string, deg: number) => `repeating-linear-gradient(${deg}deg, ${a} 0 0.32em, ${b} 0.32em 0.64em)`;

/** The letters a flip cell shows on its way to `target` (the last one is it): 3–5 of the digits (or capitals) before it, counting
 *  up to it, the count chosen by the letter and the cell's place; a letter of neither set (CJK, a sign) shows at once. */
export function flipRun(target: string, i: number): string[] {
  const pool = DIGITS.includes(target) ? DIGITS : LETTERS.includes(target.toUpperCase()) ? LETTERS : '';
  if (!pool) return [target];
  const at = pool.indexOf(target.toUpperCase()), n = 3 + ((target.codePointAt(0)! + i) % 3);
  const run = Array.from({ length: n }, (_, j) => pool[(at - n + j + pool.length * 4) % pool.length]);
  return [...run, target];
}

/** what flip cell `i` shows at item time `local`: '' before it starts, then each letter of its run for FLIP_STEP, with the fold (0
 *  shut, 1 open) of the flip in progress */
export function flipAt(target: string, i: number, local: number): { glyph: string; fold: number } {
  const run = flipRun(target, i), t = local - i * FLIP_STAGGER;
  if (t < 0) return { glyph: '', fold: 1 };
  const step = Math.floor(t / FLIP_STEP);
  if (step >= run.length - 1) return { glyph: run[run.length - 1], fold: 1 };
  const f = (t - step * FLIP_STEP) / FLIP_STEP;
  return { glyph: run[step], fold: Math.abs(1 - 2 * f) };
}
/** when the last flip cell of a `cells`-long number has landed (the title's plate opens then) */
export const flipDone = (no: string) => graphemes(no).reduce((end, g, i) => Math.max(end, i * FLIP_STAGGER + (flipRun(g, i).length - 1) * FLIP_STEP), 0);

/** slate: the arm's angle (degrees, open) at item time `local`: open while the board drops (0.25 s), snapped shut by 0.4 s, a small
 *  bounce after */
export function slateArm(local: number): number {
  if (local < 0.25) return 25;
  if (local < 0.4) { const u = prog(local, 0.25, 0.4); return 25 * (1 - u * u); }
  return 4 * Math.sin(Math.PI * prog(local, 0.4, 0.55));
}

/** side: the title's font size (px) and the words shown, set vertically in `room` px: the size asked for, shrunk to half at most,
 *  then cut with an ellipsis (a letter is about an em tall set vertically, a Latin one about half that, as textEm counts) */
export function sideFit(text: string, px: number, room: number): { px: number; text: string } {
  const em = Math.max(textEm(text), 0.01), size = Math.max(px / 2, Math.min(px, room / (em * 1.05)));
  if (em * 1.05 * size <= room) return { px: size, text };
  const gs = graphemes(text);
  let keep = gs.length;
  while (keep > 1 && (textEm(gs.slice(0, keep).join('')) + 1) * 1.05 * size > room) keep--;
  return { px: size, text: `${gs.slice(0, keep).join('')}…` };
}

/** side: the longest the bookmark runs down the frame (a share of its height) — a bookmark, not a banner down the whole side */
export const SIDE_MAX = 0.5;

const isNumber = (no: string) => /^\s*\d+\s*$/.test(no);

function make(look: AltLook, p: AltParams, parent: HTMLElement): Alt {
  const root = h('div', null, null, parent), el: Record<string, HTMLElement> = {}, cells: Alt['cells'] = [];
  cssCamel(root, { position: 'absolute', pointerEvents: 'none' });
  const add = (name: string, to: HTMLElement = root) => (el[name] = h('div', null, null, to));
  if (look === 'slate') {
    add('arm'); add('fixed'); add('board');
    add('num', el.board); const col = add('col', el.board); add('cap', col); add('title', col);
    el.cap.textContent = isNumber(p.no) ? 'SCENE' : 'CHAPTER';
  } else if (look === 'flip') {
    add('row');
    for (const _ of graphemes(p.no)) { const cell = h('div', null, null, el.row), glyph = h('div', null, null, cell); h('div', 'flip-slit', null, cell); cells.push({ cell, glyph }); }
    add('plate', el.row); add('title', el.plate);
  } else {   // side, big
    add('num'); add('title');
  }
  if (el.num) el.num.textContent = p.no;
  return { key: '', root, el, cells };
}

/** Draws look `look` (one of ALT_LOOKS) into `alt` (built, or rebuilt when the look, number or title changed), at `left` / `top` px. */
export function drawAlt(ctx: ItemCtx, p: AltParams, look: AltLook, alt: Alt | null, parent: HTMLElement, left: number, top: number): Alt {
  const key = JSON.stringify([look, p.no, p.text]);
  if (!alt || alt.key !== key) { alt?.root.remove(); alt = make(look, p, parent); alt.key = key; }
  const { W, H, local, dur, theme } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * H, room = W - 2 * left;
  const fade = 1 - prog(local, dur - 0.3, dur), fam = `'${p.font}', 'Noto Sans TC', sans-serif`;
  cssCamel(alt.root, { display: '', left: `${left}px`, top: `${top}px`, fontFamily: fam, fontSize: `${px}px`, fontWeight: '900', opacity: fade.toFixed(3), transform: 'none' });
  if (look === 'slate') drawSlate(alt, p, local, k, px, room, fade);
  else if (look === 'flip') drawFlip(alt, p, local, k, px, room);
  else if (look === 'side') drawSide(alt, p, local, k, px, left, top, Math.min(SIDE_MAX * H, H * (1 - theme.safe.bottom) - top));
  else drawBig(alt, p, local, k, px, room);
  return alt;
}

function drawSlate(alt: Alt, p: AltParams, local: number, k: number, px: number, room: number, fade: number) {
  const e = alt.el, drop = eOut3(prog(local, 0, 0.25)), stick = `${(0.5 * px).toFixed(1)}px`;
  e.title.textContent = p.text;
  cssCamel(alt.root, { display: 'flex', flexDirection: 'column', alignItems: 'stretch', maxWidth: `${room}px`,
    transform: `translateY(${(-(1 - drop) * 140 * k).toFixed(2)}px)`, opacity: (fade * clamp(drop * 3)).toFixed(3),
    filter: `drop-shadow(0 ${4 * k}px ${10 * k}px rgba(0,0,0,.45))` });
  // the hinged arm over the fixed stick: both striped, the arm turning on its left end
  cssCamel(e.arm, { height: stick, background: stripes('#f4f1ea', SLATE_DARK, 45), borderRadius: `${3 * k}px ${3 * k}px 0 0`, transformOrigin: '0% 100%', transform: `rotate(${(-slateArm(local)).toFixed(2)}deg)` });
  cssCamel(e.fixed, { height: stick, background: stripes(SLATE_DARK, '#f4f1ea', 45), marginTop: `${2 * k}px` });
  cssCamel(e.board, { display: 'flex', alignItems: 'center', gap: '0.45em', padding: '0.25em 0.55em 0.3em', background: SLATE_DARK, color: p.ink, borderRadius: `0 0 ${6 * k}px ${6 * k}px` });
  cssCamel(e.num, { flex: 'none', fontSize: '1.7em', lineHeight: '1', color: p.textColor, letterSpacing: '-0.02em' });
  cssCamel(e.col, { display: 'flex', flexDirection: 'column', gap: `${2 * k}px`, minWidth: '0' });
  cssCamel(e.cap, { fontSize: '0.42em', letterSpacing: '0.24em', fontWeight: '700', color: p.color });
  cssCamel(e.title, { lineHeight: '1.15', whiteSpace: 'pre-wrap' });
}

function drawFlip(alt: Alt, p: AltParams, local: number, k: number, px: number, room: number) {
  const e = alt.el, cellH = 1.45 * px, gap = 0.1 * px, done = flipDone(p.no), open = eOut3(prog(local, done, done + 0.18));
  const cellsW = alt.cells.length * (0.92 * px + gap);
  cssCamel(e.row, { display: 'flex', alignItems: 'stretch', gap: `${gap.toFixed(1)}px` });
  graphemes(p.no).forEach((g, i) => {
    const c = alt.cells[i], f = flipAt(g, i, local);
    c.glyph.textContent = f.glyph;
    cssCamel(c.cell, { position: 'relative', flex: 'none', minWidth: `${(0.92 * px).toFixed(1)}px`, height: `${cellH.toFixed(1)}px`, padding: '0 0.08em', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center', background: SLATE_DARK, borderRadius: `${4 * k}px`, color: p.textColor, fontSize: `${(1.2 * px).toFixed(1)}px`, lineHeight: '1' });
    cssCamel(c.glyph, { transform: `scaleY(${f.fold.toFixed(3)})` });
    const slit = c.cell.querySelector<HTMLElement>('.flip-slit');
    if (slit) cssCamel(slit, { position: 'absolute', left: '0', right: '0', top: '50%', height: `${Math.max(1, 2 * k).toFixed(1)}px`, background: 'rgba(0,0,0,.6)' });
  });
  e.title.textContent = p.text;
  cssCamel(e.plate, { display: 'flex', alignItems: 'center', minHeight: `${cellH.toFixed(1)}px`, padding: '0.1em 0.5em', boxSizing: 'border-box', background: SLATE_DARK, color: p.ink,
    borderLeft: `${(0.18 * px).toFixed(1)}px solid ${p.color}`, borderRadius: `${4 * k}px`, maxWidth: `${Math.max(px, room - cellsW - gap).toFixed(1)}px`,
    transformOrigin: '50% 50%', transform: `scaleY(${open.toFixed(3)})` });
  cssCamel(e.title, { lineHeight: '1.15', whiteSpace: 'pre-wrap' });
}

function drawSide(alt: Alt, p: AltParams, local: number, k: number, px: number, left: number, top: number, room: number) {
  const e = alt.el, a = eOut3(prog(local, 0, 0.35)), numH = 1.5 * px, fit = sideFit(p.text, px, Math.max(px, room - numH - 0.9 * px));
  e.title.textContent = fit.text;
  // the tab runs from the frame's edge; its words start at the side safe margin
  cssCamel(alt.root, { left: '0', top: `${top}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingLeft: `${left.toFixed(1)}px`, paddingRight: '0.3em', paddingBottom: '0.45em',
    background: `${p.outline}e6`, borderRadius: `0 0 ${10 * k}px 0`, transform: `translateX(${(-(1 - a) * 100).toFixed(2)}%)` });
  cssCamel(e.num, { minWidth: '1.4em', padding: '0.18em 0.25em', boxSizing: 'border-box', textAlign: 'center', background: p.color, color: p.textColor, lineHeight: '1.1',
    borderRadius: `0 0 ${6 * k}px ${6 * k}px`, marginBottom: '0.35em' });
  cssCamel(e.title, { writingMode: 'vertical-rl', textOrientation: 'mixed', whiteSpace: 'pre', fontSize: `${fit.px.toFixed(1)}px`, color: p.ink, letterSpacing: '0.08em', lineHeight: '1' });
}

function drawBig(alt: Alt, p: AltParams, local: number, k: number, px: number, room: number) {
  const e = alt.el, numPx = Math.min(4 * px, (room * 0.9) / Math.max(0.5, textEm(p.no))), rise = eOut3(prog(local, 0, 0.45)), wipe = eOut3(prog(local, 0.2, 0.55));
  e.title.textContent = p.text;
  cssCamel(alt.root, { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: `${room}px` });
  cssCamel(e.num, { fontSize: `${numPx.toFixed(1)}px`, lineHeight: '0.9', letterSpacing: '-0.03em', color: 'transparent', webkitTextStroke: `${Math.max(2, 6 * k).toFixed(1)}px ${p.color}`, filter: `drop-shadow(0 ${2 * k}px ${6 * k}px rgba(0,0,0,.35))`,
    opacity: '0.92', clipPath: `inset(${((1 - rise) * 100).toFixed(2)}% 0 0 0)`, transform: `translateY(${((1 - rise) * 0.15 * numPx).toFixed(1)}px)` });
  cssCamel(e.title, { marginTop: `${(-0.3 * numPx).toFixed(1)}px`, marginLeft: `${(0.12 * numPx).toFixed(1)}px`, maxWidth: `${Math.max(px, room - 0.12 * numPx).toFixed(1)}px`,
    whiteSpace: 'pre-wrap', lineHeight: '1.15', color: p.ink, webkitTextStroke: `${(4 * 0.75 * k).toFixed(2)}px ${p.outline}`, paintOrder: 'stroke fill',
    textShadow: `0 ${2 * k}px ${10 * k}px rgba(0,0,0,.6)`, clipPath: `inset(-20% ${((1 - wipe) * 100).toFixed(2)}% -20% -5%)` });
}
