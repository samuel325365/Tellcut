// One stretch of a source in the media panel's Video page (spec 2026-11-10-media-panel-visual §1): a 16:9 card with the stretch's
// middle frame from the source's thumbnail atlas (a portrait source sits in the middle with dark sides), its start time and its
// length. The pointer moved across the card shows that part of the stretch (scrubbing, from the same atlas: nothing more is
// loaded). Before analysis a grey card with the times. A photo is one card, labelled Photo.
import { useState } from 'preact/hooks';
import type { ThumbInfo } from '../store.ts';
import { formatTime } from '../timeline/geometry.ts';
import { thumbPct } from '../timeline/thumbs.ts';

export function SceneCard(p: { info?: ThumbInfo; a: number; b: number; photo?: boolean; cls: string; attrs: Record<string, unknown>; onPress: (e: MouseEvent) => void }) {
  const [at, setAt] = useState<number | null>(null);
  const pic = p.info && thumbPct(p.info, at ?? (p.photo ? 0 : (p.a + p.b) / 2));
  const scrub = (e: MouseEvent) => {
    if (!p.info || p.photo) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (r.width > 0) setAt(p.a + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (p.b - p.a));
  };
  return (
    <button {...p.attrs} class={`${p.cls}${pic ? '' : ' no-pic'}`} onMouseDown={p.onPress as any} onMouseMove={scrub as any} onMouseLeave={() => setAt(null)}>
      <span class="seg-frame">{pic && <span class="seg-pic" style={{ backgroundImage: `url(${p.info!.url})`, backgroundPosition: pic.bg, backgroundSize: pic.size, aspectRatio: String(pic.aspect) }} />}</span>
      {p.photo ? <span class="seg-t">Photo</span> : <><span class="seg-t">{formatTime(p.a)}</span><small>{(p.b - p.a).toFixed(1)}s</small></>}
    </button>
  );
}
