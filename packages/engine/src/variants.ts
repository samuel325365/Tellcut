// A block's variants (spec 2026-11-23-block-variants): many shared blocks are one block with several looks, picked by one enum
// param (mode, look, pattern…). `ItemType.variants` names that param and gives each of its options a name and a sentence, so the
// catalog can answer a search with the one look that matches and the gallery can show every look. Drawing and export never read
// it, and project.json never names a variant: choosing one is just setting the param.
import type { ItemType } from './plugin.ts';

/** the param names that pick a block's look: a common block with such an enum of 3+ options must declare variants */
export const VARIANT_PARAMS = ['mode', 'look', 'pattern', 'kind', 'layout', 'content', 'shape', 'style'] as const;
/** at most this many characters in the doc of a block that declares variants */
export const VARIANT_BLOCK_DOC = 500;

/** how a variant is written in cut.ts and shown in the catalog: mode: 'rocket' */
export const variantCode = (param: string, value: string) => `${param}: '${value}'`;

/** What is wrong with a block's variants (none: an empty list): `variants` is `{ param, list }`, `param` is one of the block's enum
 *  params, the list's values are that param's options in their order (naming the missing and the extra ones), no value twice, and
 *  every variant has a label and a doc. */
export function variantProblems(t: Pick<ItemType, 'type' | 'params' | 'variants'>): string[] {
  const v = t.variants as unknown;
  if (v === undefined) return [];
  const shaped = v as { param?: unknown; list?: unknown } | null;
  if (!shaped || typeof shaped !== 'object' || Array.isArray(shaped) || typeof shaped.param !== 'string' || !Array.isArray(shaped.list)) {
    return [`${t.type} 的 variants 要是 { param, list }`];
  }
  const param = shaped.param, list = shaped.list as Array<{ value?: unknown; label?: unknown; doc?: unknown }>;
  const def = t.params.find((d) => d.key === param);
  if (!def || def.type !== 'enum') return [`${t.type} 的 variants.param「${param}」不是它的選項（enum）參數`];
  const out: string[] = [], seen = new Set<string>();
  const values = list.map((x) => String(x?.value));
  for (const x of list) {
    const value = String(x?.value), name = `${t.type}@${value}`;
    if (seen.has(value)) out.push(`${name}：value 重複`);
    seen.add(value);
    if (typeof x?.label !== 'string' || !x.label.trim()) out.push(`${name}：沒有 label`);
    if (typeof x?.doc !== 'string' || !x.doc.trim()) out.push(`${name}：沒有 doc（要寫長什麼樣、用在什麼場合）`);
  }
  const options = def.options, missing = options.filter((o) => !seen.has(o)), extra = [...seen].filter((o) => !options.includes(o));
  if (missing.length) out.push(`${t.type} 的樣式少了 ${missing.join('、')}（${param} 的選項是 ${options.join(' / ')}）`);
  if (extra.length) out.push(`${t.type} 的樣式多了 ${extra.join('、')}（${param} 沒有這個選項）`);
  // the same set, but not in the options' order (a value listed twice is reported above, not as an order)
  if (!missing.length && !extra.length && seen.size === values.length && values.some((x, i) => x !== options[i])) {
    out.push(`${t.type} 的樣式順序要和 ${param} 的選項相同：${options.join(' / ')}`);
  }
  return out;
}
