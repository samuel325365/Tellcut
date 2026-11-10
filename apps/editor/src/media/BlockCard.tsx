// One block in the media panel's Effects page (spec 2026-11-10-media-panel-visual §3): a 3:4 card with the block's picture — the
// gallery's golden picture for a shared block, the saved thumbnail for one of My blocks — cropped to the part it draws (most
// golden pictures are a dark stage with the block small in it), and its name under it. A block with no picture (a project's own
// fx before it is saved) is a dark card with "fx". A disabled card (a block the timeline may hold only once) is greyed and does not
// drag; the corner holds what the old row had (☆ / from My blocks / Update).
import type { ComponentChildren } from 'preact';
import { useCropStyle } from './content-box.ts';

/** cards are this shape (width / height) */
const CARD_ASPECT = 3 / 4;

export function BlockCard(p: { name: string; thumb?: string; cls: string; attrs: Record<string, unknown>; disabled?: boolean; onPress?: (e: MouseEvent) => void; corner?: ComponentChildren }) {
  const pic = useCropStyle(p.thumb, CARD_ASPECT);
  return (
    <div class={`blk-wrap${p.disabled ? ' disabled' : ''}`}>
      <button {...p.attrs} class={`${p.cls} blk`} disabled={p.disabled} onMouseDown={p.disabled ? undefined : (p.onPress as any)}>
        {pic ? <span class="block-pic" style={pic} /> : <span class="block-pic none" />}
        <span class="blk-name">{p.name}</span>
      </button>
      {p.corner && <span class="blk-corner">{p.corner}</span>}
    </div>
  );
}
