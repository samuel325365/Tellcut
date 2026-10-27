// A clip's crop as texture coordinates: the part of a srcW×srcH picture a w×h box shows (the engine's cover placement), so a
// picture on a WebGL face matches the same clip drawn by the stage.
import { coverPlacement, type Crop } from '@tellcut/engine';

export function coverUv(srcW: number, srcH: number, w: number, h: number, crop: Crop): { repeat: [number, number]; offset: [number, number] } {
  const b = coverPlacement(srcW, srcH, w, h, crop);
  const u0 = -b.left / b.width, uw = w / b.width, v0 = -b.top / b.height, vh = h / b.height;
  // WebGL's v runs bottom-up (textures are flipped on upload)
  return { repeat: [uw, vh], offset: [u0 + 0, 1 - v0 - vh + 0] };   // + 0: no -0
}
