// The film one block is shown in by itself: the gallery's previews in the page and a saved block's thumbnail in Node build it here,
// so both play it with the same ground, length and mix (the mix of a new project).
import { DEFAULT_MIX, type TransitionType } from './schema.ts';
import type { NamedShape } from './shapes.ts';

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
    sources: o.ground ? previewSources([PREVIEW_GROUND]) : {},
    media: {}, grids: [],
    tracks: [
      ...(o.ground ? [{ id: 'v', kind: 'video', items: [{ id: 'ground', source: PREVIEW_GROUND, start: 0, end: BLOCK_PREVIEW_LEN, in: 0, speed: 1, crop: { from: whole, to: whole } }] }] : []),
      { id: 'g', kind: o.kind, items: [{ id: 'block', type: o.type, start: 0, end: BLOCK_PREVIEW_LEN, params: o.params ?? {} }] },
    ],
  };
}

// ---------------------------------------------------------------- what a clip itself does (protocol CLIP_FX's previews)
/** the gallery's second picture, the one a transition goes to: the made-up map (golden/fixtures/fake-map.png, 360×640) */
export const PREVIEW_SECOND = 'map';
/** the length of a previewed transition, and where its two clips meet: the cut in the middle of the 3 s film */
export const CLIP_PREVIEW_TRANSITION = 0.6, CLIP_PREVIEW_CUT = 1.5;
/** the smaller window a shape is previewed in (frame fractions): nearly square, so the shapes that keep their own proportion and
 *  the ones that fill the frame both show whole, with the plain ground round it */
export const CLIP_PREVIEW_FRAME: [number, number, number, number] = [0.1, 0.22, 0.8, 0.56];

/** What a clip effect's preview puts on its clips (the fields of a video item, as project.json has them): `transitionIn` on the
 *  second of two clips, the street then the map, linked to their overlap; `shape` (with an `outline`) on the street in a smaller
 *  window over the plain ground; `shake` on the street filling the frame. */
export interface ClipPreview {
  transitionIn?: { type: Exclude<TransitionType, 'cut'>; dur: number; dir?: 'l' | 'r' | 'u' | 'd'; x?: number; y?: number };
  shape?: NamedShape; outline?: { width?: number; color?: string };
  shake?: Array<{ at: number; dur: number; px: number; hz?: number }>;
}
/** a video-track item of a clip preview (film seconds, the whole picture of its source) */
export interface PreviewClip { id: string; source: string; start: number; end: number; in: number; speed: number; crop: { from: Crop0; to: Crop0 }; frame?: [number, number, number, number];
  transitionIn?: ClipPreview['transitionIn']; shape?: NamedShape; outline?: ClipPreview['outline']; shake?: ClipPreview['shake'] }
type Crop0 = { x: number; y: number; zoom: number };

/** The clips of a clip effect's 3 s preview, on one video track: a transition is the street up to just past the middle and the map
 *  from just before it, overlapping by the transition's length (so it is linked to the overlap and both pictures do their half:
 *  every type is drawn as itself, both frames being the whole picture and neither clip cut to a shape); a shape is the street in
 *  CLIP_PREVIEW_FRAME; anything else (the shake) the street over the whole film with its fields. The golden card of each is drawn
 *  from the same clips (plugin-common samples/clips.ts). */
export function clipPreviewClips(p: ClipPreview): PreviewClip[] {
  const whole = { x: 0.5, y: 0.5, zoom: 1 }, clip = (id: string, source: string, start: number, end: number): PreviewClip =>
    ({ id, source, start, end, in: 0, speed: 1, crop: { from: whole, to: whole } });
  if (p.transitionIn) {
    const d = p.transitionIn.dur, a = +(CLIP_PREVIEW_CUT - d / 2).toFixed(6), b = +(CLIP_PREVIEW_CUT + d / 2).toFixed(6);
    return [clip('a', PREVIEW_GROUND, 0, b), { ...clip('b', PREVIEW_SECOND, a, BLOCK_PREVIEW_LEN), transitionIn: p.transitionIn }];
  }
  if (p.shape) return [{ ...clip('a', PREVIEW_GROUND, 0, BLOCK_PREVIEW_LEN), frame: CLIP_PREVIEW_FRAME, shape: p.shape, ...(p.outline ? { outline: p.outline } : {}) }];
  return [{ ...clip('a', PREVIEW_GROUND, 0, BLOCK_PREVIEW_LEN), ...(p.shake ? { shake: p.shake } : {}) }];
}

/** the sources a preview of the gallery's own pictures names (the gallery player asks the server for them by these ids) */
export const previewSources = (ids: string[]) => Object.fromEntries([...new Set(ids)].map((id) => [id, id === PREVIEW_SECOND
  ? { path: `${id}.png`, duration: BLOCK_PREVIEW_LEN, width: 360, height: 640, kind: 'image' }
  : { path: `${id}.png`, duration: BLOCK_PREVIEW_LEN, width: 1080, height: 1920, kind: 'image' }]));

/** A 1080×1920, 3 s film of a clip effect (clipPreviewClips) over the plain ground, with nothing else on it. */
export function clipPreviewProject(p: ClipPreview, name = 'clip') {
  const clips = clipPreviewClips(p);
  return {
    version: 1,
    meta: { name, width: 1080, height: 1920, fps: 30, duration: BLOCK_PREVIEW_LEN, plugins: [] as string[], background: PREVIEW_BG, mix: DEFAULT_MIX },
    sources: previewSources(clips.map((c) => c.source)), media: {}, grids: [],
    tracks: [{ id: 'v', kind: 'video', items: clips }],
  };
}
