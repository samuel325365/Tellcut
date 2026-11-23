// The variants of every shared block (engine variants.ts, spec 2026-11-23-block-variants): well formed, and the doc of a block
// that declares them short, since what only one look needs is said in that look's own doc.
import { corePlugin, VARIANT_BLOCK_DOC, variantProblems, type ItemType } from '@tellcut/engine';
import { commonPlugin } from './index.ts';

const blocks = [...(corePlugin.items ?? []), ...(commonPlugin.items ?? [])] as ItemType[];
const withVariants = blocks.filter((t) => t.variants);

test('some blocks declare variants (progress at least)', () => {
  expect(withVariants.map((t) => t.type)).toContain('common.progress');
});

test('every shared block\'s variants are well formed: an enum param, every option once and in order, each with a label and a doc', () => {
  expect(blocks.flatMap((t) => variantProblems(t))).toEqual([]);
});

test(`a block that declares variants keeps its own doc to ${VARIANT_BLOCK_DOC} characters`, () => {
  const long = withVariants.filter((t) => (t.doc ?? '').length > VARIANT_BLOCK_DOC).map((t) => `${t.type}: ${t.doc!.length}`);
  expect(long).toEqual([]);
});
