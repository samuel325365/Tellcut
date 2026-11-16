// Named templates on any block (spec 2026-11-16-block-templates): a block's ItemType may list a few named sets of its own params.
// Choosing one WRITES those params into the item (the properties panel, the gallery's Add, the cut script's `template:` option);
// the item never remembers which template it came from, so nothing at draw time or export time reads them, an old project is
// untouched, and changing a template later never changes a finished film.
// Not to be confused with common.caption's and common.heading's `template` PARAMETER (caption and title templates, resolved when the
// block draws, @tellcut/protocol TEMPLATE_KINDS): those two blocks never carry this list (a test checks), so a block has one kind or
// the other and `template` means one thing for it.
import type { BlockTemplate, ItemType, ParamDef } from './plugin.ts';

/** at most this many templates a block: more means the block should be split, or old templates dropped */
export const MAX_TEMPLATES = 8;
/** a template id: lower-case kebab-case words */
export const TEMPLATE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** the params that pick a block's look: two templates differing in one of them differ in more than colour (rule 1) */
export const MAIN_PARAMS = ['look', 'mode', 'pattern'] as const;

/** how a template is named outside its block: `leak/prism-sweep` (templates have no gallery handle) */
export const templateName = (type: string, id: string) => `${type.replace(/^common\./, '')}/${id}`;

/** a param that is a colour: a colour field, or a list of colours by its name (colors, textColor) */
export const isColourParam = (d: ParamDef) => d.type === 'color' || /colou?rs?\d*$/i.test(d.key);

/** why a value is not one the param takes (the editor refuses the same), or undefined when it is */
export function paramValueProblem(d: ParamDef, v: unknown): string | undefined {
  switch (d.type) {
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return `要是數字，現在是 ${JSON.stringify(v)}`;
      if (d.min !== undefined && v < d.min) return `${v} 小於最小值 ${d.min}`;
      if (d.max !== undefined && v > d.max) return `${v} 大於最大值 ${d.max}`;
      return undefined;
    case 'enum': return d.options.includes(v as string) ? undefined : `「${String(v)}」不在選項 ${d.options.join(' / ')} 裡`;
    case 'bool': return typeof v === 'boolean' ? undefined : `要是 true 或 false，現在是 ${JSON.stringify(v)}`;
    case 'json': return undefined;
    default: return typeof v === 'string' ? undefined : `要是文字，現在是 ${JSON.stringify(v)}`;
  }
}

/** What is wrong with a block's templates (none: an empty list): ids unique and kebab-case, at most MAX_TEMPLATES, every param one
 *  the block declares and every value one it takes, no empty template nor one that only writes the defaults, and no list on a block
 *  that has a `template` param. */
export function templateProblems(t: Pick<ItemType, 'type' | 'params' | 'templates'>): string[] {
  const list = t.templates;
  if (list === undefined) return [];
  if (!Array.isArray(list)) return [`${t.type} 的 templates 要是陣列`];
  const out: string[] = [], seen = new Set<string>();
  if (t.params.some((d) => d.key === 'template')) out.push(`${t.type} 有 template 參數（字幕、標題範本那一種），不能再有 templates`);
  if (list.length > MAX_TEMPLATES) out.push(`${t.type} 有 ${list.length} 個範本，最多 ${MAX_TEMPLATES} 個（太多就該拆積木或刪掉舊的）`);
  for (const x of list) {
    const id = String(x?.id), name = templateName(t.type, id);
    if (!TEMPLATE_ID.test(id)) out.push(`${name}：id 要是小寫 kebab-case（例如 prism-sweep）`);
    if (seen.has(id)) out.push(`${name}：id 重複`);
    seen.add(id);
    if (typeof x?.label !== 'string' || !x.label.trim()) out.push(`${name}：沒有 label`);
    if (typeof x?.doc !== 'string' || !x.doc.trim()) out.push(`${name}：沒有 doc（要寫用在什麼場合）`);
    const params = x?.params && typeof x.params === 'object' && !Array.isArray(x.params) ? x.params : null;
    if (!params || !Object.keys(params).length) { out.push(`${name}：params 是空的`); continue; }
    let changes = false;
    for (const [k, v] of Object.entries(params)) {
      const d = t.params.find((p) => p.key === k);
      if (!d) { out.push(`${name}：${t.type} 沒有 ${k} 參數`); changes = true; continue; }
      const bad = paramValueProblem(d, v);
      if (bad) out.push(`${name}：${k} ${bad}`);
      if (!same(v, d.default)) changes = true;
    }
    // applying it would change nothing: the block as it comes
    if (!changes) out.push(`${name}：params 全都是預設值，套用它什麼都不會變`);
  }
  return out;
}

/** a param's value as the template draws it: its own, else the block's default (the theme is the same for both: not looked at) */
const valueIn = (t: Pick<ItemType, 'params'>, x: BlockTemplate, key: string) => (Object.hasOwn(x.params, key) ? x.params[key] : t.params.find((d) => d.key === key)?.default);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** whether two templates (or a template and the block's defaults, an empty template) differ in nothing but colour: colours dropped,
 *  they must differ in the block's main choice (look / mode / pattern), or in at least two other params */
function colourOnly(t: Pick<ItemType, 'params'>, a: BlockTemplate, b: BlockTemplate): boolean {
  const differ = t.params.filter((d) => !isColourParam(d)).map((d) => d.key).filter((k) => !same(valueIn(t, a, k), valueIn(t, b, k)));
  return !differ.some((k) => (MAIN_PARAMS as readonly string[]).includes(k)) && differ.length < 2;
}

/** Admission rule 1: the pairs of a block's templates that differ in nothing but colour. Colours dropped, two templates must still
 *  differ in the block's main choice (look / mode / pattern), or in at least two other params. */
export function colourOnlyPairs(t: Pick<ItemType, 'type' | 'params' | 'templates'>): Array<[string, string]> {
  const list = t.templates ?? [], out: Array<[string, string]> = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (colourOnly(t, list[i], list[j])) out.push([list[i].id, list[j].id]);
  return out;
}

/** Admission rule 1 against the block itself: the templates that differ from the block's defaults in nothing but colour (by the same
 *  measure as two templates), so choosing one would only recolour the block as it comes. */
export function colourOnlyFromDefault(t: Pick<ItemType, 'type' | 'params' | 'templates'>): string[] {
  const plain: BlockTemplate = { id: '', label: '', doc: '', params: {} };
  return (t.templates ?? []).filter((x) => colourOnly(t, x, plain)).map((x) => x.id);
}

/** The params an item of block `t` gets from template `id`: the template's, with `own` (what the caller sets itself) over them.
 *  An unknown id throws, naming the block and the ids it has. */
export function applyTemplate(t: Pick<ItemType, 'type' | 'templates'>, id: string, own: Record<string, unknown> = {}): Record<string, unknown> {
  const x = t.templates?.find((y) => y.id === id);
  if (!x) {
    const ids = (t.templates ?? []).map((y) => y.id);
    throw new Error(ids.length ? `${t.type} 沒有「${id}」這個範本；它有：${ids.join('、')}` : `${t.type} 沒有範本（「${id}」）`);
  }
  return { ...x.params, ...own };
}
