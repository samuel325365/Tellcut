// The film one block is shown in by itself: the gallery's previews in the page and a saved block's thumbnail in Node build it here,
// so both play it with the same ground, length and mix (the mix of a new project).
import { DEFAULT_MIX } from './schema.ts';

export const BLOCK_PREVIEW_LEN = 3;
/** the gallery's own picture a block marked over 'picture' (ItemType.over) is previewed over: a made-up street, 1080×1920, the one
 *  its gallery card is drawn over. The gallery player (media=api&id=_gallery) asks the server for it as a photo source of that id. */
export const PREVIEW_GROUND = 'street';

/** the plain ground a preview plays on when nothing else is said: a mid grey-blue, on which white and dark blocks both show (the
 *  golden pictures' default too) */
export const PREVIEW_BG = '#3a4256';
/** a film's shape other than 1080×1920: 'wide' 1920×1080, 'square' 1080×1080 (as a golden sample's `wide` / `square`) */
export type PreviewAspect = 'wide' | 'square';
const SIZE: Record<PreviewAspect | 'tall', [number, number]> = { tall: [1080, 1920], wide: [1920, 1080], square: [1080, 1080] };

/** A 1080×1920, 3 s film of one block over a mid grey-blue ground, the block over the whole length (as the golden pictures draw
 *  it). `fx`: the modules to load (a project's own or a saved block's), left out for a shared block; `theme`: the look, if any;
 *  `ground`: the street (PREVIEW_GROUND) on a video track under the block for the whole film, as golden's photo lies under a
 *  colour block's sample: for a block that works on the picture under it, which shows little over the plain ground.
 *  `background` (a CSS background) and `aspect`: the ground and shape of the block's gallery card (its sample's `bg`, `wide`,
 *  `square`), so the preview shows the block on what it was drawn to read on (dark ink on a light ground, a 16:9 look wide). */
export function blockPreviewProject(o: { type: string; kind: string; plugins: string[]; params?: Record<string, unknown>; fx?: string[]; theme?: unknown; ground?: boolean;
  background?: string; aspect?: PreviewAspect }) {
  const whole = { x: 0.5, y: 0.5, zoom: 1 }, [width, height] = SIZE[o.aspect ?? 'tall'];
  return {
    version: 1,
    meta: { name: o.type, width, height, fps: 30, duration: BLOCK_PREVIEW_LEN, plugins: o.plugins, background: o.background || PREVIEW_BG, mix: DEFAULT_MIX,
      ...(o.fx ? { fx: o.fx } : {}), ...(o.theme ? { theme: o.theme } : {}) },
    sources: o.ground ? { [PREVIEW_GROUND]: { path: `${PREVIEW_GROUND}.png`, duration: BLOCK_PREVIEW_LEN, width: 1080, height: 1920, kind: 'image' } } : {},
    media: {}, grids: [],
    tracks: [
      ...(o.ground ? [{ id: 'v', kind: 'video', items: [{ id: 'ground', source: PREVIEW_GROUND, start: 0, end: BLOCK_PREVIEW_LEN, in: 0, speed: 1, crop: { from: whole, to: whole } }] }] : []),
      { id: 'g', kind: o.kind, items: [{ id: 'block', type: o.type, start: 0, end: BLOCK_PREVIEW_LEN, params: o.params ?? {} }] },
    ],
  };
}
