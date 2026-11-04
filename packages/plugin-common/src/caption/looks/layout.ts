// Looks laid out for a situation: bar (a search snippet) and qa (a magazine interview's subtitle).
import { cssCamel, textEm, type Theme } from '@tellcut/engine';
import { luma } from '../../color.ts';
import { speakerColor } from '../colors.ts';
import type { CaptionLook } from '../types.ts';

/** white words on a dark rounded bar with a thin accent2 strip down its left side (a search snippet) */
export const bar: CaptionLook = {
  id: 'bar', weight: '700',
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
  const bg = tint ? speakerColor(speaker, color, theme) : theme.palette.accent;
  return { bg, fg: tint && (luma(bg) ?? 0) > 0.6 ? theme.palette.ink : '#ffffff' };
}

/** an interview subtitle set flush left in a serif over a dark wash rising from below the lines, with `name` (Q, A, or a short
 *  name: the badge widens) in a badge at the left of the first line */
export const qa: CaptionLook = {
  id: 'qa', weight: '700', font: 'Noto Serif TC', left: true,
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
