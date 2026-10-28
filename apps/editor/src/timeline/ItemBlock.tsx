import type { AnyItem, Track } from '@tellcut/engine';
import { handleOf } from '@tellcut/protocol';
import { t } from '../i18n/index.ts';
import { GlyphIcon } from '../icons.tsx';
import type { Glyph, Tone } from './names.ts';

export interface ItemBlockProps { item: AnyItem; track: Track; left: number; top?: number; width: number; height: number; selected: boolean; offline: boolean; children?: any;
  /** what the clip is called on the timeline (names.ts itemName) and its glyph and tone (itemLook) */
  name: string; look: { glyph: Glyph; tone: Tone | null };
  /** extra state classes: proposed (changed by Claude's pending proposal), hanging (past the end of its clip) */
  marks?: string }

/** narrower than a glyph and one character: no name at all */
const NAME_MIN_W = 26;
/** the hover text: name, then the type id and gallery handle of a shared block or sound (MRK-03), and the id */
const titleOf = (it: any, name: string) => { const h = it.type && handleOf(it.type); return `${name}${it.type && it.type !== name ? ` · ${it.type}` : ''}${h ? ` · ${h}` : ''} (${it.id})`; };

export function ItemBlock({ item, track, left, top, width, height, selected, offline, children, name, look, marks }: ItemBlockProps) {
  // a narrow clip: the two grips must not cover each other
  const grip = `${Math.max(2, Math.min(6, Math.round(width / 3)))}px`;
  const title = titleOf(item, name);
  return (
    <div class={`item k-${track.kind}${look.tone ? ` tone-${look.tone}` : ''}${selected ? ' sel' : ''}${offline ? ' offline' : ''}${marks ? ` ${marks}` : ''}`} data-item-id={item.id} data-track={track.id}
      style={{ left: `${left}px`, top: `${top ?? 0}px`, width: `${Math.max(4, width)}px`, height: `${height}px` }} data-tip={title} aria-label={title}>
      {children}
      {width >= NAME_MIN_W && <span class="label">{offline ? t('ed.offline') : ''}<GlyphIcon glyph={look.glyph} />{name}</span>}
      {track.kind !== 'sfx' && <><i data-edge="start" style={{ width: grip }} /><i data-edge="end" style={{ width: grip }} /></>}
    </div>
  );
}
