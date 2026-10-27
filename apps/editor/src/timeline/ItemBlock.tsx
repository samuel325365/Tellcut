import type { AnyItem, Track } from '@tellcut/engine';
import { handleOf } from '@tellcut/protocol';
import { t } from '../i18n/index.ts';

export interface ItemBlockProps { item: AnyItem; track: Track; left: number; top?: number; width: number; height: number; selected: boolean; offline: boolean; children?: any;
  /** extra state classes: proposed (changed by Claude's pending proposal), hanging (past the end of its clip) */
  marks?: string }

const labelOf = (it: any) => it.label ?? it.type ?? it.source ?? it.media ?? it.id;
/** the hover text: name, the gallery handle of a shared block or sound (MRK-03), id */
const titleOf = (it: any) => { const h = it.type && handleOf(it.type); return `${labelOf(it)}${h ? ` · ${h}` : ''} (${it.id})`; };

export function ItemBlock({ item, track, left, top, width, height, selected, offline, children, marks }: ItemBlockProps) {
  // a narrow clip: the two grips must not cover each other
  const grip = `${Math.max(2, Math.min(6, Math.round(width / 3)))}px`;
  return (
    <div class={`item k-${track.kind}${selected ? ' sel' : ''}${offline ? ' offline' : ''}${marks ? ` ${marks}` : ''}`} data-item-id={item.id} data-track={track.id}
      style={{ left: `${left}px`, top: `${top ?? 0}px`, width: `${Math.max(4, width)}px`, height: `${height}px` }} data-tip={titleOf(item)} aria-label={titleOf(item)}>
      {children}
      <span class="label">{offline ? t('ed.offline') : ''}{labelOf(item)}</span>
      {track.kind !== 'sfx' && <><i data-edge="start" style={{ width: grip }} /><i data-edge="end" style={{ width: grip }} /></>}
    </div>
  );
}
