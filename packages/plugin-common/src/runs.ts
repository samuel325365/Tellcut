// Draws runs of text (see markup.ts) into a box as one div per line; rebuilt only when the content changes.
import { cssCamel, h } from '@tellcut/engine';
import type { Run } from './markup.ts';

export interface RunBox { el: HTMLElement; key: string }

export function runBox(parent: HTMLElement): RunBox {
  const el = h('div', null, null, parent);
  return { el, key: '' };
}

/** Fill the box with `lines`; a highlighted run takes `hl` (and `hlScale` × the size). `perChar` gives every character its own
 * inline-block span, for animating them one by one. Nothing is touched when the same lines come again. */
export function setRuns(box: RunBox, lines: Run[][], hl: string, opts: { perChar?: boolean; hlScale?: number } = {}) {
  const per = !!opts.perChar, sc = opts.hlScale ?? 1, key = JSON.stringify([lines, hl, per, sc]);
  if (key === box.key) return;
  box.key = key;
  box.el.innerHTML = '';
  for (const runs of lines) {
    const line = h('div', null, null, box.el);
    for (const r of runs) {
      for (const piece of per ? [...r.t] : [r.t]) {
        const span = h('span', null, null, line);
        span.textContent = piece;
        if (per) cssCamel(span, { display: 'inline-block', whiteSpace: 'pre' });
        if (r.kind === 'hl') cssCamel(span, sc !== 1 ? { color: hl, fontSize: `${sc}em` } : { color: hl });
      }
    }
    if (!runs.length) line.innerHTML = '&nbsp;';
  }
}
