// common.progress's character modes: the one place progress.ts calls. Each mode's Draw is one line of DRAWS; a mode not in it yet
// draws nothing (its root stays empty, the canvas hidden and given back).
import { cssCamel, h, type ItemCtx } from '@tellcut/engine';
import { freeCanvas } from '../inkline.ts';
import { drawBattery } from './battery.ts';
import { drawFuse } from './fuse.ts';
import { drawPaws } from './paws.ts';
import { drawRing } from './ring.ts';
import { drawRocket } from './rocket.ts';
import { drawRunner } from './runner.ts';
import { drawSegments } from './segments.ts';
import { fadeOut, type Draw, type More, type MoreMode, type MoreParams } from './shared.ts';
import { drawStretch } from './stretch.ts';
import { drawVine } from './vine.ts';

const DRAWS: Partial<Record<MoreMode, Draw>> = {
  runner: drawRunner,
  stretch: drawStretch,
  paws: drawPaws,
  segments: drawSegments,
  fuse: drawFuse,
  battery: drawBattery,
  rocket: drawRocket,
  ring: drawRing,
  vine: drawVine,
};

/** what rebuilds a mode's elements when it changes: the mode itself and the params that decide which elements there are */
export function moreKey(p: MoreParams): string {
  return [p.mode, p.dots, p.runner, p.goal, p.look].join('|');
}

/** builds (or reuses) the mode's root under `parent`, calls its Draw; a mode not yet written draws nothing */
export function drawMore(ctx: ItemCtx<MoreParams>, p: MoreParams, old: More | null, parent: HTMLElement, cv: HTMLCanvasElement): More {
  const key = moreKey(p);
  let m = old;
  // coming in from another mode (an old one may have left its picture and pen settings on the canvas) or rebuilding: start the
  // canvas afresh — setting its size resets the context's state too
  if (!m || m.key !== key || m.root.style.display === 'none') freeCanvas(cv);
  if (!m || m.key !== key || m.root.parentElement !== parent) {
    m?.root.remove();
    const root = h('div', null, null, parent);
    root.dataset.more = p.mode;
    cssCamel(root, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    m = { key, root, el: {}, list: [] };
  }
  cssCamel(m.root, { display: 'block', opacity: fadeOut(ctx.local, ctx.dur).toFixed(3) });
  cssCamel(cv, { display: 'none' });
  DRAWS[p.mode as MoreMode]?.(ctx, p, m, cv);
  if (cv.style.display === 'none' && cv.width) freeCanvas(cv);
  return m;
}
