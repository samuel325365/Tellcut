// Each common block's sample moments: what `npm run golden` draws and compares with its saved picture (packages/plugin-common/golden/),
// and, the first of a block's samples at its last moment, the gallery's thumbnail of it (the server's gallery, `npm run thumbs`). A new
// block adds its samples here (golden.test.ts refuses a block without one; `npm run promote` appends one). Regenerate its picture with
// `npm run golden -- --update <name>` after a change you meant.
// The samples themselves are in samples/, in parts kept in order (the golden pictures and the gallery's first-sample thumbnails
// go by it): fixtures.ts holds the shared pieces; a new block's samples go at the end of BLOCKS below, before the combos'.
// A block marked over 'picture' (ItemType.over) also gets its cards drawn over the made-up street, derived here (streetSamples).
import { corePlugin, OLD_BLOCKS, type ItemType } from '@tellcut/engine';
import { commonItems } from './index.ts';
import { BASICS } from './samples/basics.ts';
import { KITS } from './samples/kits.ts';
import { GROUPS } from './samples/groups.ts';
import { STYLES } from './samples/styles.ts';
import { COMBO_SAMPLES } from './samples/combos.ts';
import { LENS_SAMPLES } from './samples/lens.ts';
import { PROGRESS_SAMPLES } from './samples/progress.ts';
import { REF, templateSample, type Sample } from './samples/fixtures.ts';

export type { Sample } from './samples/fixtures.ts';
export { CAP_EN, CAP_JA, HEAD_EN, HEAD_JA, templateSample } from './samples/fixtures.ts';
export { comboSample } from './samples/combos.ts';

/** the blocks whose cards are drawn over the street: they change or blend with the picture under them, or leave a window for it
 *  (an old block the gallery no longer offers, common.wash, has no card) */
const OVER = ([...corePlugin.items, ...commonItems] as ItemType[]).filter((t) => t.over === 'picture' && !OLD_BLOCKS[t.type]);

/** A sample drawn again over the made-up street (golden's photo, the street the gallery's preview plays at full size), named
 *  <name>-street: the block alone, as the preview shows it, so neither the sample's plain `bg` nor its several `items` (common.lens's
 *  stand-in ground and word) come along. Its other sources stay (a block may read one). */
export function streetSample(s: Sample): Sample {
  const { bg: _bg, items: _items, ...rest } = s;
  return { ...rest, name: `${s.name}-street`, sources: { ...s.sources, ...REF }, photo: 'ref', street: s.name };
}

/** the moments of a street sibling where its sample's last one shows little over the street (the card is the last moment): the
 *  default leak's warm glow, screened over the bright sky, is faint as it fades (2.2 s) and clearest at its peak */
const STREET_AT: Record<string, number[]> = { leak: [1.5] };

/** The street siblings of `list`: for each block marked over 'picture', its first sample (its card) and its templates' samples
 *  (their cards), each one not drawn over the street already (grade-photo, core.flash's and the grade templates' samples). */
export function streetSamples(list: Sample[], blocks: ItemType[] = OVER): Sample[] {
  const names = new Set(blocks.flatMap((t) => [list.find((s) => s.type === t.type)?.name, ...(t.templates ?? []).map((x) => templateSample(t.type, x.id))]));
  return list.filter((s) => names.has(s.name) && !s.photo).map((s) => ({ ...streetSample(s), ...(STREET_AT[s.name] ? { at: STREET_AT[s.name] } : {}) }));
}

/** every block's own samples, in order (the combos' come after them and their street siblings) */
const BLOCKS: Sample[] = [...BASICS, ...KITS, ...GROUPS, ...STYLES, ...LENS_SAMPLES, ...PROGRESS_SAMPLES];

const byName = new Map<string, Sample>();
/** The sample the gallery's card of a block is drawn from (or, given `template`, the card of that template): the block's first
 *  sample (the template's <block>-tpl-<id> one), or its street sibling when it has one. The server's gallery and `npm run thumbs`
 *  both ask here, so the card and its English and Japanese copies are the same picture. Undefined when there is no sample. */
export function cardSample(type: string, template?: string): Sample | undefined {
  if (!byName.size) for (const s of samples) byName.set(s.name, s);
  const own = template ? byName.get(templateSample(type, template)) : samples.find((s) => s.type === type && !s.street);
  const street = own && byName.get(`${own.name}-street`);
  return street?.street === own?.name ? street : own;
}

export const samples: Sample[] = [
  ...BLOCKS,
  // derived: the cards of the blocks marked over 'picture' drawn over the street (before the combos', which stay last)
  ...streetSamples(BLOCKS),
  // a block's samples go before the combos', which stay last (combos.test.ts: a new combo's sample goes at the very end)
  ...COMBO_SAMPLES,
];
