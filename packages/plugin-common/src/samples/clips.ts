// The clip effects' cards (protocol CLIP_FX, spec 2026-11-22-gallery-effect-previews §2): each effect the gallery previews drawn from
// the same clips its preview plays (engine clipPreviewClips) over the gallery's own two pictures, at the one moment that shows it.
// These are no block's samples: `clips` marks them, `type` is the effect's key (clip.transition.iris), and nothing reads them as a block.
import { CLIP_PREVIEW_CUT, CLIP_PREVIEW_TRANSITION, clipPreviewClips, PREVIEW_GROUND, PREVIEW_SECOND } from '@tellcut/engine';
import { CLIP_FX } from '@tellcut/protocol';
import type { Sample } from './fixtures.ts';

/** the gallery player's pictures (apps/server gallery.ts GALLERY_IMAGES), under the ids the preview names them by */
export const CLIP_SOURCES: NonNullable<Sample['sources']> = {
  [PREVIEW_GROUND]: { file: 'fixtures/street.png', width: 1080, height: 1920 },
  [PREVIEW_SECOND]: { file: 'fixtures/fake-map.png', width: 360, height: 640 },
};

/** a clip effect's card sample's name: clip-transition-iris for clip.transition.iris */
export const clipSampleName = (key: string) => key.replace(/\./g, '-');

/** where a card is drawn: a transition in its middle (both pictures at once), except a dip or a flash, whose middle is all black or
 *  white: a quarter in, the street half gone dark, and two fifths in, the white coming up over it; a clock wipe a little before its
 *  middle, where the swept sector (about 130°) still shows the hand's slant, not the straight half a wipe would leave; the shake
 *  where it is strongest (it decays from its start); a shape any time (it is still) */
const CARD_POINT: Partial<Record<string, number>> = { dip: 0.25, flash: 0.42, clock: 0.45 };
function cardAt(key: string): number {
  const f = CLIP_FX.find((x) => x.key === key)!, tr = f.preview?.transitionIn, start = CLIP_PREVIEW_CUT - CLIP_PREVIEW_TRANSITION / 2;
  if (tr) return +(start + CLIP_PREVIEW_TRANSITION * (CARD_POINT[tr.type] ?? 0.5)).toFixed(2);
  if (f.preview?.shake) return f.preview.shake[0].at;
  return 1.5;
}

export const CLIP_SAMPLES: Sample[] = CLIP_FX.filter((f) => f.preview).map((f): Sample => ({
  name: clipSampleName(f.key), type: f.key, clips: clipPreviewClips(f.preview!), sources: CLIP_SOURCES, len: 3, at: [cardAt(f.key)],
}));
