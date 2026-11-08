// What sits behind a title (common.heading's `backing`): nothing, a dark band across the frame, the whole frame darkened, blurred or
// black, a card, two rules above and below drawn out from the middle, a bar at its left, or (frame, 2026-11-06, the Wes Anderson pilot
// film's title card) the whole frame in one colour with a double thin frame round the title. Laid out from the title block's box.
import { cssCamel, h } from '@tellcut/engine';

export const BACKINGS = ['none', 'band', 'scrim', 'blur', 'card', 'rules', 'bar', 'black', 'frame'] as const;
export type Backing = typeof BACKINGS[number];

export interface BackingEls { full: HTMLElement; band: HTMLElement; card: HTMLElement; ruleA: HTMLElement; ruleB: HTMLElement; bar: HTMLElement }

/** the backing's elements, first in `root` so they lie under the title */
export function buildBacking(root: HTMLElement): BackingEls {
  const el = () => { const e = h('div', null, null, root); cssCamel(e, { position: 'absolute', display: 'none', pointerEvents: 'none' }); return e; };
  return { full: el(), band: el(), card: el(), ruleA: el(), ruleB: el(), bar: el() };
}

/** the title block's box in the item's frame pixels (no animation transforms: layout values) */
export interface Block { x: number; y: number; w: number; h: number }

export interface BackingDraw {
  backing: string; block: Block; fs: number; W: number; H: number; k: number;
  /** centred over the block (else flush with its left edge) */
  centered: boolean;
  color: string; accent: string; radius: number;
  /** 0–1: the backing's own fade in and out */
  opacity: number;
  /** 0–1: how far the rules are drawn */
  ruleP: number;
}

/** shows the one backing asked for and hides the others */
export function drawBacking(els: BackingEls, d: BackingDraw) {
  for (const e of Object.values(els)) cssCamel(e, { display: 'none', border: '', outline: '', outlineOffset: '' });
  const { block: b, fs, opacity } = d, o = opacity.toFixed(3);
  switch (d.backing) {
    case 'scrim': cssCamel(els.full, { display: 'block', inset: '0', background: d.color, backdropFilter: '', opacity: o }); break;
    case 'blur': cssCamel(els.full, { display: 'block', inset: '0', background: 'rgba(0,0,0,0.12)', backdropFilter: `blur(${(18 * d.k).toFixed(2)}px)`, opacity: o }); break;
    case 'black': cssCamel(els.full, { display: 'block', inset: '0', background: '#000000', backdropFilter: '', opacity: o }); break;
    case 'band': cssCamel(els.band, { display: 'block', left: '0', width: '100%', top: `${(b.y - 0.35 * fs).toFixed(2)}px`, height: `${(b.h + 0.7 * fs).toFixed(2)}px`, background: d.color, opacity: o }); break;
    case 'card': cssCamel(els.card, { display: 'block', left: `${(b.x - 0.5 * fs).toFixed(2)}px`, top: `${(b.y - 0.4 * fs).toFixed(2)}px`, width: `${(b.w + fs).toFixed(2)}px`, height: `${(b.h + 0.8 * fs).toFixed(2)}px`,
      background: d.color, borderRadius: `${d.radius.toFixed(2)}px`, boxShadow: `0 ${(0.08 * fs).toFixed(2)}px ${(0.3 * fs).toFixed(2)}px rgba(0,0,0,0.35)`, opacity: o }); break;
    case 'rules': {
      const len = (b.w + 0.6 * fs) * d.ruleP, th = Math.max(2, 3 * d.k), left = d.centered ? b.x + b.w / 2 - len / 2 : b.x;
      cssCamel(els.ruleA, { display: 'block', left: `${left.toFixed(2)}px`, width: `${len.toFixed(2)}px`, top: `${(b.y - 0.3 * fs).toFixed(2)}px`, height: `${th}px`, background: d.accent, opacity: o });
      cssCamel(els.ruleB, { display: 'block', left: `${left.toFixed(2)}px`, width: `${len.toFixed(2)}px`, top: `${(b.y + b.h + 0.3 * fs - th).toFixed(2)}px`, height: `${th}px`, background: d.accent, opacity: o });
      break;
    }
    case 'frame': {
      // the page, then a frame at least 78% of the width and 30% of the height round the title: a 2.5 px line and a thin one 12 px
      // inside it, an outline pulled in by a negative offset (an inset shadow of the page colour for the gap doubled a see-through
      // backColor between the lines into a darker ring)
      cssCamel(els.full, { display: 'block', inset: '0', background: d.color, backdropFilter: '', opacity: o });
      const fw = Math.max(b.w + 1.6 * fs, 0.78 * d.W), fh = Math.max(b.h + 1.6 * fs, 0.3 * d.H), k = d.k;
      cssCamel(els.card, { display: 'block', left: `${(b.x + b.w / 2 - fw / 2).toFixed(2)}px`, top: `${(b.y + b.h / 2 - fh / 2).toFixed(2)}px`, width: `${fw.toFixed(2)}px`, height: `${fh.toFixed(2)}px`,
        background: 'transparent', borderRadius: '0', border: `${(2.5 * k).toFixed(2)}px solid ${d.accent}`, boxShadow: 'none',
        outline: `${(1.5 * k).toFixed(2)}px solid ${d.accent}`, outlineOffset: `${(-16 * k).toFixed(2)}px`, opacity: o });
      break;
    }
    case 'bar': cssCamel(els.bar, { display: 'block', left: `${(b.x - 0.45 * fs).toFixed(2)}px`, top: `${b.y.toFixed(2)}px`, width: `${(0.14 * fs).toFixed(2)}px`, height: `${b.h.toFixed(2)}px`, background: d.accent, opacity: o }); break;
  }
}
