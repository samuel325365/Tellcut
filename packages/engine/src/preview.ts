// The film one block is shown in by itself: the gallery's previews in the page and a saved block's thumbnail in Node build it here,
// so both play it with the same ground, length and mix (the mix of a new project).
import { DEFAULT_MIX } from './schema.ts';

export const BLOCK_PREVIEW_LEN = 3;

/** A 1080×1920, 3 s film of one block over a mid grey-blue ground, the block over the whole length (as the golden pictures draw
 *  it). `fx`: the modules to load (a project's own or a saved block's), left out for a shared block; `theme`: the look, if any. */
export function blockPreviewProject(o: { type: string; kind: string; plugins: string[]; params?: Record<string, unknown>; fx?: string[]; theme?: unknown }) {
  return {
    version: 1,
    meta: { name: o.type, width: 1080, height: 1920, fps: 30, duration: BLOCK_PREVIEW_LEN, plugins: o.plugins, background: '#3a4256', mix: DEFAULT_MIX,
      ...(o.fx ? { fx: o.fx } : {}), ...(o.theme ? { theme: o.theme } : {}) },
    sources: {}, media: {}, grids: [],
    tracks: [{ id: 'g', kind: o.kind, items: [{ id: 'block', type: o.type, start: 0, end: BLOCK_PREVIEW_LEN, params: o.params ?? {} }] }],
  };
}
