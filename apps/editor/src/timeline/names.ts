// What a clip on the timeline is called and how it looks (spec 2026-10-28-timeline-refresh A1): the words it shows rather than
// its type id, a glyph for its kind and, for blocks, a tone by gallery category.
import type { AnyItem, BlockCategory, Registry, TrackKind } from '@tellcut/engine';
import { CORE_CATEGORY, type Lang } from '@tellcut/protocol';
import { blockText } from '../i18n/blocks.ts';

/** string params that hold a block's main words (a 'string' param may also be a font name, so only these keys count) */
export const TEXT_KEYS = ['text', 'title', 'label', 'name', 'heading', 'headline', 'line'] as const;

const oneLine = (v: unknown) => (typeof v === 'string' ? v.replace(/\s*\n\s*/g, ' ').trim() : '');

/** label → the block's words → its display name (UI language) → the source / media → the id */
export function itemName(item: AnyItem, kind: TrackKind, reg: Registry | undefined, lang: Lang): string {
  const it = item as any;
  if (typeof it.label === 'string' && it.label.trim()) return it.label.trim();
  if (typeof it.type === 'string') {
    const def = kind === 'sfx' ? reg?.sfx(it.type) : reg?.item(it.type);
    if (!def) return it.type;
    if (kind !== 'sfx') {
      const params = def.params ?? [];
      const p = params.find((x) => x.type === 'text') ?? params.find((x) => x.type === 'string' && (TEXT_KEYS as readonly string[]).includes(x.key));
      const words = p ? oneLine(it.params?.[p.key] ?? p.default) : '';
      if (words) return words;
    }
    return blockText(it.type, { label: def.label, doc: '' }, lang).label;
  }
  return it.source ?? it.media ?? it.id;
}

export type Tone = 'words' | 'layout' | 'place' | 'look' | 'moment' | 'fx';
export type Glyph = Tone | 'scene' | 'video' | 'music' | 'audio' | 'sfx';
export const CATEGORY_TONE: Record<BlockCategory, Tone> = {
  text: 'words', chapter: 'words', card: 'layout', number: 'layout', frame: 'layout', phone: 'layout', travel: 'place', mark: 'place', look: 'look', moment: 'moment',
};

/** blocks: a glyph and tone by category (project fx, which have none: "fx"); media and sounds keep their track colour */
export function itemLook(item: AnyItem, kind: TrackKind, reg: Registry | undefined): { glyph: Glyph; tone: Tone | null } {
  if (kind === 'video' || kind === 'music' || kind === 'audio' || kind === 'sfx') return { glyph: kind, tone: null };
  const type = (item as any).type as string;
  const cat = reg?.item(type)?.category ?? CORE_CATEGORY[type];
  if (cat) { const tone = CATEGORY_TONE[cat]; return { glyph: tone, tone }; }
  if (type.startsWith('fx.') || !reg?.item(type)) return { glyph: 'fx', tone: 'fx' };
  return { glyph: 'scene', tone: null };
}
