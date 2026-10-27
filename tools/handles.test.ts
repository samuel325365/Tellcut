import { loadStyles, SCORE_LIBRARY, STYLES } from '@tellcut/media-node';
import { plugins } from '@tellcut/plugins';
import { BLOCK_PREFIX, CLIP_FX, CLIP_PREFIX, CORE_CATEGORY, HANDLE_FORMAT, HANDLES, handleOf, idOfHandle, MOVED, normalizeHandle, RECIPE_PREFIX, RETIRED, SFX_PREFIX, STYLE_PREFIX } from '@tellcut/protocol';
import { RECIPES } from './cut/recipes/index.ts';

const prefixOf = (h: string) => h.replace(/-\d+$/, '');
const numberOf = (h: string) => Number(/\d+$/.exec(h)![0]);

/** everything that should have a handle, with the prefix its category gives it */
async function wanted(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const common = plugins.find((p) => p.id === 'common')!, core = plugins.find((p) => p.id === 'core')!;
  for (const t of common.items ?? []) out.set(t.type, BLOCK_PREFIX[t.category!]);
  for (const t of core.items ?? []) out.set(t.type, BLOCK_PREFIX[CORE_CATEGORY[t.type]]);
  for (const s of common.sfx ?? []) out.set(s.type, SFX_PREFIX[s.category!]);
  const lib = await loadStyles([SCORE_LIBRARY]);
  for (const id of [...Object.keys(STYLES), ...Object.keys(lib.styles)]) out.set(`style:${id}`, STYLE_PREFIX);
  for (const id of Object.keys(RECIPES)) out.set(`recipe:${id}`, RECIPE_PREFIX);
  for (const c of CLIP_FX) out.set(c.key, CLIP_PREFIX);
  return out;
}

test('every shared block, sound effect, music style, recipe and clip effect has a handle, and no handle points at something gone', async () => {
  const want = await wanted();
  const missing = [...want.keys()].filter((id) => !handleOf(id));
  expect(missing, '沒有代號：在 packages/protocol/src/handles.ts 的 HANDLES 加下一個號碼').toEqual([]);
  const stale = Object.entries(HANDLES).filter(([, id]) => !want.has(id)).map(([h, id]) => `${h} ${id}`);
  expect(stale, '代號指向已經不在的東西：移到 RETIRED（代號不能重用）').toEqual([]);
  // a handle's prefix is its category's (unless it changed category later and kept its handle)
  const wrong = Object.entries(HANDLES).filter(([h, id]) => !MOVED.includes(id) && want.has(id) && prefixOf(h) !== want.get(id)).map(([h, id]) => `${h} ${id}（應為 ${want.get(id)}）`);
  expect(wrong).toEqual([]);
  for (const id of MOVED) expect(handleOf(id), id).toBeTruthy();
  // the retired ones are gone for good
  for (const [h, id] of Object.entries(RETIRED)) expect(want.has(id) && !Object.values(HANDLES).includes(id), `${h} ${id} 作廢了又出現：給它新的代號`).toBe(false);
});

test('handles: the format, one per id, each prefix numbered 01…N with no gap, retired ones never reused', () => {
  const all = [...Object.keys(HANDLES), ...Object.keys(RETIRED)];
  for (const h of all) expect(h, h).toMatch(HANDLE_FORMAT);
  for (const h of Object.keys(RETIRED)) expect(HANDLES[h], `${h} 已作廢，不能再用`).toBeUndefined();
  const ids = Object.values(HANDLES);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i), '同一個 id 有兩個代號').toEqual([]);
  const byPrefix = new Map<string, number[]>();
  for (const h of all) byPrefix.set(prefixOf(h), [...(byPrefix.get(prefixOf(h)) ?? []), numberOf(h)]);
  for (const [p, ns] of byPrefix) expect(ns.sort((a, b) => a - b), `${p} 的號碼要從 01 連續編（作廢的也算）`).toEqual(ns.map((_, i) => i + 1));
});

test('a block and a sound effect never share a type id (a handle names one thing)', () => {
  const items = plugins.flatMap((p) => (p.items ?? []).map((t) => t.type)), sfx = plugins.flatMap((p) => (p.sfx ?? []).map((s) => s.type));
  expect(items.filter((t) => sfx.includes(t))).toEqual([]);
  expect(items.filter((t, i) => items.indexOf(t) !== i)).toEqual([]);
  expect(sfx.filter((t, i) => sfx.indexOf(t) !== i)).toEqual([]);
});

test('what people type is read as a handle: any case, with or without the dash, with or without the leading zero', () => {
  expect(normalizeHandle('mrk-3')).toBe('MRK-03');
  expect(normalizeHandle('MRK3')).toBe('MRK-03');
  expect(normalizeHandle(' Mrk-003 ')).toBe('MRK-03');
  expect(normalizeHandle('mrk-120')).toBe('MRK-120');
  expect(normalizeHandle('sfx-hit-2')).toBe('SFX-HIT-02');
  expect(normalizeHandle('SFXHIT02')).toBe('SFX-HIT-02');
  expect(normalizeHandle('sfx hit 2')).toBe('SFX-HIT-02');
  for (const s of ['stamp', 'common.stamp', 'MR-03', 'MRKS-03', '03', '']) expect(normalizeHandle(s), s).toBeUndefined();
  expect(idOfHandle('txt2')).toBe(HANDLES['TXT-02']);
  expect(idOfHandle('ZZZ-01')).toBeUndefined();
});
