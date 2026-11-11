// Looks laid out for a situation: bar (a search snippet) and qa (a magazine interview's subtitle).
import { cssCamel, textEm, type Theme } from '@tellcut/engine';
import { isLight } from '../../color.ts';
import { SVG_NS } from '../../shapes.ts';
import { speakerTextColor } from '../colors.ts';
import type { CaptionLook } from '../types.ts';
import { faceRoom } from './basic.ts';

/** white words on a dark rounded bar with a thin accent2 strip down its left side (a search snippet) */
export const bar: CaptionLook = {
  id: 'bar', title: false, weight: '700',
  room: (e, width) => width - 1.65 * e.px,
  box: (e) => ({ background: `linear-gradient(${e.theme.palette.accent2}, ${e.theme.palette.accent2}) 0.3em 0.28em / 0.14em calc(100% - 0.56em) no-repeat, ${e.p.boxBg}`,
    padding: '0.28em 0.7em 0.3em 0.95em', borderRadius: `${24 * e.k}px` }),
};

/** style qa's badge: one character (or none) in the 1.03 em square it always had, a line indented 1.45 em; a short name in a badge
 *  that grows round it (its estimated width in em of the caption: the serif italic letters at 0.83 em run a little wider than
 *  textEm, plus 0.22 em each side; draw measures the real one) and the indent 0.42 em past it */
export function qaBadge(name: string) {
  if ([...name].length <= 1) return { square: true, w: 1.03, indent: 1.45 };
  const w = Math.max(1.03, textEm(name) * 0.95 + 0.44);
  return { square: false, w, indent: w + 0.42 };
}
/** the qa badge's fill and letters: the caption colour (speaker 0), the accent colour, or with `tint` the speaker's own colour; ink
 *  letters on a light fill, white on a dark one */
export function qaBadgeColors(speaker: number, color: string, theme: Theme, tint: boolean) {
  if (!speaker) return { bg: color, fg: theme.palette.ink };
  const bg = tint ? speakerTextColor(speaker, color, theme) : theme.palette.accent;
  return { bg, fg: tint && isLight(bg) ? theme.palette.ink : '#ffffff' };
}

/** an interview subtitle set flush left in a serif over a dark wash rising from below the lines, with `name` (Q, A, or a short
 *  name: the badge widens) in a badge at the left of the first line */
export const qa: CaptionLook = {
  id: 'qa', title: false, weight: '700', font: 'Noto Serif TC', left: true,
  room: (e, width) => width - qaBadge(String(e.p.name ?? '')).indent * e.px,
  box: (e) => {
    const b = qaBadge(String(e.p.name ?? ''));
    return { textShadow: `0 ${4 * e.k}px ${12 * e.k}px rgba(0,0,0,0.8)`, padding: `0 0 0 ${b.square ? '1.45' : b.indent.toFixed(3)}em` };
  },
  name: (s, e) => {
    const b = qaBadge(String(e.p.name ?? '')), bc = qaBadgeColors(e.p.speaker ?? 0, e.p.color, e.theme, !!e.p.badgeTint);
    cssCamel(s.name, { display: e.p.name ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', left: '0', top: '0.11em', bottom: '', width: b.square ? '1.03em' : '', minWidth: b.square ? '' : '1.03em', height: '1.03em', transform: 'none', fontSize: '1em', padding: b.square ? '0' : '0 0.22em', boxSizing: 'border-box', borderRadius: '0',
      background: bc.bg, color: bc.fg, fontStyle: 'italic', lineHeight: '1', textShadow: 'none' });
    cssCamel(s.nameText, { fontSize: '0.83em' });
    return true;
  },
  after: (s, e) => {
    // a name longer than a character: indent the line 0.42 em past the badge as it was really laid out (the estimate when it was not)
    if (!qaBadge(String(e.p.name ?? '')).square && e.p.name) { const bw = s.name.offsetWidth; if (bw > 0) cssCamel(s.box, { padding: `0 0 0 ${(bw / e.fs + 0.42).toFixed(3)}em` }); }
    // a dark wash across the frame from 1.6 em above the box (clear), darkest 0.4 em below it, clear again 2.6 em further down
    const fs = e.fs, top = s.box.offsetTop - 1.6 * fs, dark = s.box.offsetTop + s.box.offsetHeight + 0.4 * fs, hh = dark + 2.6 * fs - top, f = ((dark - top) / hh) * 100;
    cssCamel(s.wash, { display: 'block', top: `${top.toFixed(1)}px`, height: `${hh.toFixed(1)}px`, opacity: String(e.opacity),
      background: `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${(f * 0.55).toFixed(1)}%, rgba(0,0,0,0.72) ${f.toFixed(1)}%, rgba(0,0,0,0.55) ${(f + (100 - f) * 0.4).toFixed(1)}%, rgba(0,0,0,0) 100%)` });
  },
};

/** a news bar: ink words on a white bar with a thick block of the accent colour at its left */
export const news: CaptionLook = {
  id: 'news', title: false, weight: '900', left: true,
  // 0.8 + 0.6 em of padding and the 0.32 em accent block at the left
  room: (e, width) => width - 1.72 * e.px,
  color: (e) => e.theme.palette.ink,
  hl: (e) => e.p.accent || e.theme.palette.accent,
  box: (e) => ({ background: '#ffffff', padding: '0.14em 0.6em 0.16em 0.8em', borderLeft: `0.32em solid ${e.p.accent || e.theme.palette.accent}`,
    boxShadow: `0 ${(0.06 * e.fs).toFixed(1)}px ${(0.18 * e.fs).toFixed(1)}px rgba(0,0,0,0.35)` }),
};

/** a chat bubble: speaker 2 and 3 on the right in the accent colour, everyone else on the left in grey, a corner pointing at them */
export const chat: CaptionLook = {
  id: 'chat', title: false, weight: '700', room: (e, width) => width * 0.8 - 1.2 * e.px,
  color: (e) => ((e.p.speaker ?? 0) >= 2 ? '#ffffff' : e.theme.palette.ink),
  hl: (e) => ((e.p.speaker ?? 0) >= 2 ? e.p.hl : e.theme.palette.accent),
  box: (e) => {
    const right = (e.p.speaker ?? 0) >= 2;
    return { background: right ? (e.p.accent || e.theme.palette.accent) : '#eef0f3', padding: '0.28em 0.7em', borderRadius: right ? '0.9em 0.9em 0.2em 0.9em' : '0.9em 0.9em 0.9em 0.2em',
      boxShadow: `0 ${(0.05 * e.fs).toFixed(1)}px ${(0.14 * e.fs).toFixed(1)}px rgba(0,0,0,0.3)` };
  },
  pin: (e) => ` translateX(${(e.p.speaker ?? 0) >= 2 ? 9 : -9}%)`,
};

/** song lyrics: a classical serif in white, softly glowing, with the words not sung yet dim */
export const lyric: CaptionLook = {
  // its letters are 0.08 em apart, which the line breaking does not count
  id: 'lyric', title: false, weight: '400', font: 'Cactus Classical Serif', room: faceRoom(0.55, 0.08),
  box: (e) => ({ textShadow: `0 0 ${(0.2 * e.fs).toFixed(1)}px rgba(255,255,255,0.45), 0 ${(0.03 * e.fs).toFixed(1)}px ${(0.08 * e.fs).toFixed(1)}px rgba(0,0,0,0.6)`, letterSpacing: '0.08em' }),
  word: (e) => ({ hot: { color: e.p.hl, textShadow: `0 0 ${(0.3 * e.fs).toFixed(1)}px ${e.p.hl}` }, dim: { color: 'rgba(255,255,255,0.45)' } }),
};

/** a game's dialogue box: a dark blue box with a double white frame, white words set flush left */
export const dialog: CaptionLook = {
  id: 'dialog', title: false, weight: '700', left: true, room: (e, width) => width - 1.6 * e.px,
  hl: (e) => e.p.hl,
  box: (e) => ({ background: 'linear-gradient(180deg, #1f2e7a, #101a4d)', padding: '0.4em 0.8em', borderRadius: `${(0.12 * e.fs).toFixed(1)}px`, minWidth: '70%',
    boxShadow: `inset 0 0 0 ${(0.05 * e.fs).toFixed(1)}px #ffffff, inset 0 0 0 ${(0.1 * e.fs).toFixed(1)}px #101a4d, inset 0 0 0 ${(0.13 * e.fs).toFixed(1)}px #c9d4ff, 0 ${(0.06 * e.fs).toFixed(1)}px ${(0.2 * e.fs).toFixed(1)}px rgba(0,0,0,0.5)` }),
};

/** a comic panel: ink words on a white box with a heavy ink border over a halftone of the highlight colour, tilted a little */
export const comic: CaptionLook = {
  // 0.7 em of padding and a 0.07 em border a side
  id: 'comic', paper: true, weight: '900', room: (e, width) => width - 1.54 * e.px,
  color: (e) => e.p.outline,
  hl: (e) => e.theme.palette.accent,
  box: (e) => ({ backgroundColor: '#ffffff', backgroundImage: `radial-gradient(circle, color-mix(in srgb, ${e.p.hl} 70%, transparent) 28%, transparent 30%)`, backgroundSize: '0.32em 0.32em',
    padding: '0.22em 0.7em', border: `${(0.07 * e.fs).toFixed(1)}px solid ${e.p.outline}`, boxShadow: `${(0.1 * e.fs).toFixed(1)}px ${(0.1 * e.fs).toFixed(1)}px 0 ${e.p.outline}` }),
  pin: () => ' rotate(-1.5deg)',
};

/** a comic's narration box (the comic pilot film's fx.comicbox, 2026-11-05): ink words on a flat box of the highlight colour with a
 *  thin ink border, square, set flush left: the yellow box in a panel's corner */
export const narration: CaptionLook = {
  id: 'narration', paper: true, weight: '700', left: true, room: (e, width) => width - 1.1 * e.px,
  color: (e) => e.p.outline,
  hl: (e) => e.theme.palette.accent,
  box: (e) => ({ backgroundColor: e.p.hl, padding: '0.2em 0.45em', border: `${(0.08 * e.fs).toFixed(1)}px solid ${e.p.outline}` }),
};

/** chalk on a blackboard: a dark green board with a wooden edge, the words in white chalk with rough edges */
export const chalk: CaptionLook = {
  // 0.7 em of padding and the 0.12 em wooden frame a side
  id: 'chalk', weight: '400', font: 'Iansui', room: (e, width) => width - 1.64 * e.px,
  color: () => '#f4f4ee',
  hl: () => '#ffe98a',
  box: (e) => ({ background: 'radial-gradient(120% 140% at 30% 20%, #2f4a3a, #1b2b22)', padding: '0.3em 0.7em', border: `${(0.12 * e.fs).toFixed(1)}px solid #7a5230`, borderRadius: `${(0.06 * e.fs).toFixed(1)}px`,
    textShadow: `0 0 ${(0.03 * e.fs).toFixed(1)}px rgba(255,255,255,0.7)`, boxShadow: `0 ${(0.06 * e.fs).toFixed(1)}px ${(0.2 * e.fs).toFixed(1)}px rgba(0,0,0,0.5)`, filter: 'url(#tc-chalk)' }),
  after: () => {
    // the chalk's rough edge: a noise filter the box points at, made once a page
    if (typeof document === 'undefined' || document.getElementById('tc-chalk')) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    svg.innerHTML = '<filter id="tc-chalk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>';
    document.body.appendChild(svg);
  },
};
