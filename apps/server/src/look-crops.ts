// The gallery index's crops of the blocks' small pictures (content-box.ts says where a look is): each block's strip pictures
// (variants, then templates) grouped by ground and shape, decoded and measured once per set of files, then kept by the files'
// names and modification times, so the index (built on every request) decodes them again only when golden pictures change. The
// first measure of every block takes a couple of seconds (about 250 pictures); it lets other requests in between blocks.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, type Rgba } from '@tellcut/media-node';
import type { GalleryBlock } from '@tellcut/protocol';
import { contentBoxes, type Crop } from './content-box.ts';

const THUMB_URL = /^\/api\/gallery\/thumb\/([^/?#]+)$/;
/** a look's picture: its card ground (`bg`, `aspect`) and the file it is in */
interface Pic { bg?: string; aspect?: string; thumb?: string; crop?: Crop }

/** the crops measured, by file, for each block's group (folder, block, ground and shape), with the files' names and modification
 *  times they were measured at (`sig`): one that differs is measured again in its place */
const CACHE = new Map<string, { sig: string; crops: Map<string, Crop | undefined> }>();

/** Sets `crop` on every variant and template of these blocks whose picture shows its look in a small part of the frame, reading
 *  the pictures from `dir` (the golden folder). A picture that cannot be read leaves its group uncropped. */
export async function attachCrops(blocks: readonly GalleryBlock[], dir: string): Promise<void> {
  for (const b of blocks) {
    const looks: Pic[] = [...(b.variants?.list ?? []), ...(b.templates ?? [])];
    if (looks.length < 3) continue;
    // a group: the looks of one ground and shape (the pixel size is checked once decoded)
    const groups = new Map<string, Pic[]>();
    for (const l of looks) {
      if (!l.thumb || !THUMB_URL.test(l.thumb)) continue;
      const k = `${l.bg ?? ''}|${l.aspect ?? ''}`;
      groups.set(k, [...(groups.get(k) ?? []), l]);
    }
    for (const [k, list] of groups) {
      const files = [...new Set(list.map((l) => THUMB_URL.exec(l.thumb!)![1]))];
      if (files.length < 3) continue;
      let sig: string;
      try { sig = files.map((f) => `${f}@${statSync(join(dir, f)).mtimeMs}`).join('|'); } catch { continue; }
      const key = `${dir}|${b.type}|${k}`;
      let hit = CACHE.get(key);
      if (hit?.sig !== sig) {
        await new Promise((go) => setImmediate(go));
        CACHE.set(key, hit = { sig, crops: measure(files, dir) });
      }
      for (const l of list) { const c = hit.crops.get(THUMB_URL.exec(l.thumb!)![1]); if (c) l.crop = c; }
    }
  }
}

/** each file's crop: the files decoded and grouped by pixel size (a group of one ground and shape should be one size) */
function measure(files: string[], dir: string): Map<string, Crop | undefined> {
  const out = new Map<string, Crop | undefined>(), bySize = new Map<string, { file: string; pic: Rgba }[]>();
  try {
    for (const file of files) {
      const pic = readPng(join(dir, file)), k = `${pic.width}x${pic.height}`;
      bySize.set(k, [...(bySize.get(k) ?? []), { file, pic }]);
    }
  } catch { return out; }
  for (const list of bySize.values()) {
    const boxes = contentBoxes(list.map((x) => x.pic));
    list.forEach((x, i) => out.set(x.file, boxes[i]));
  }
  return out;
}
