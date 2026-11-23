// The variants of every shared block (engine variants.ts, spec 2026-11-23-block-variants): well formed, and the doc of a block
// that declares them short, since what only one look needs is said in that look's own doc.
import { corePlugin, OLD_BLOCKS, VARIANT_BLOCK_DOC, VARIANT_PARAMS, variantProblems, type ItemType } from '@tellcut/engine';
import { commonPlugin } from './index.ts';

const blocks = [...(corePlugin.items ?? []), ...(commonPlugin.items ?? [])] as ItemType[];
const withVariants = blocks.filter((t) => t.variants);

test('some blocks declare variants (progress at least)', () => {
  expect(withVariants.map((t) => t.type)).toContain('common.progress');
});

test('every shared block\'s variants are well formed: an enum param, every option once and in order, each with a label and a doc', () => {
  expect(blocks.flatMap((t) => variantProblems(t))).toEqual([]);
});

// blocks kept only for older projects (OLD_BLOCKS: common.frame, behind common.flatlay) are not offered anywhere and need none
/** shared blocks that have a look-picking enum of 3+ options but declare no variants, and why */
const EXEMPT: Record<string, string> = {
  'common.caption': 'its looks are its own list of caption templates (the template param, catalog CAP), not variants',
  'common.heading': 'its looks are its own list of title templates (the template param, catalog TTL), not variants',
};

/** the enum params named like a look-picker (VARIANT_PARAMS) with 3 or more options */
const lookParams = (t: ItemType) => t.params.filter((d) => d.type === 'enum' && (VARIANT_PARAMS as readonly string[]).includes(d.key) && d.options.length >= 3).map((d) => d.key);

test('a shared block with a look-picking enum of 3+ options declares its variants, or is exempt with a reason', () => {
  const missing = blocks.filter((t) => !t.variants && !EXEMPT[t.type] && !OLD_BLOCKS[t.type] && lookParams(t).length).map((t) => `${t.type} (${lookParams(t).join(', ')})`);
  expect(missing).toEqual([]);
});

test('the exemptions name only blocks that exist, declare no variants and would otherwise need them', () => {
  const byType = new Map(blocks.map((t) => [t.type, t]));
  const stale = Object.keys(EXEMPT).filter((type) => { const t = byType.get(type); return !t || t.variants || !lookParams(t).length; });
  expect(stale).toEqual([]);
  expect(Object.values(EXEMPT).every((why) => why.trim().length > 0)).toBe(true);
});

test(`a block that declares variants keeps its own doc to ${VARIANT_BLOCK_DOC} characters`, () => {
  const long = withVariants.filter((t) => (t.doc ?? '').length > VARIANT_BLOCK_DOC).map((t) => `${t.type}: ${t.doc!.length}`);
  expect(long).toEqual([]);
});
