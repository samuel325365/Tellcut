// A proposal's summary lines (engine summarize) in the page's language. The Chinese ones read as media-node's namedSummary
// does: a block by its gallery handle and short name (TXT-02 caption), so it matches the gallery.
import type { SummaryLine } from '@tellcut/engine';
import { handleOf } from '@tellcut/protocol';
import { t, tn } from './i18n/index.ts';

const block = (type: string) => { const h = handleOf(type); return `${h ? `${h} ` : ''}${type.replace(/^common\./, '')}`; };

export function lineText(l: SummaryLine): string {
  switch (l.k) {
    case 'add': return t('prop.add', { id: l.type ? `${l.id} ${block(l.type)}` : l.id, track: l.track });
    case 'num': return t('prop.num', { id: l.id, key: l.key, from: l.from, to: l.to });
    case 'edit': return l.key === 'type' && l.from && l.to ? t('prop.block', { id: l.id, from: block(l.from), to: block(l.to) }) : t('prop.edit', { id: l.id, key: l.key });
    case 'track': return t('prop.track', { id: l.id, track: l.track });
    case 'del': return t('prop.del', { id: l.id });
    case 'shift': return tn('prop.shift', l.n, { by: l.by });
  }
}
