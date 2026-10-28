// The recipes (toolkit phase 4): `c.recipe('<id>', content)` in a cut.ts; `npm run tellcut -- recipe <id>` shows the content to fill in.
import type { z } from 'zod';
import { handleOf, idOfHandle } from '@tellcut/protocol';
import { hook } from './hook.ts';
import { montage } from './montage.ts';
import { travel } from './travel.ts';
import type { Recipe } from './types.ts';

export const RECIPES: Record<string, Recipe<z.ZodTypeAny>> = { travel, hook, montage } as Record<string, Recipe<z.ZodTypeAny>>;
export type { Recipe } from './types.ts';
export type { TravelContent } from './travel.ts';
export type { HookContent } from './hook.ts';
export type { MontageContent } from './montage.ts';

/** The content checked against the recipe; a sentence per wrong field. */
export function parseContent(id: string, content: unknown): unknown {
  const r = RECIPES[id];
  if (!r) throw new Error(`沒有「${id}」這個配方；有：${Object.keys(RECIPES).join('、')}`);
  const p = r.schema.safeParse(content);
  if (!p.success) throw new Error(`配方 ${id} 的內容不對：\n${p.error.issues.map((i) => `  ${i.path.join('.') || '(整個)'}：${i.message}`).join('\n')}\n看格式：npm run tellcut -- recipe ${id}`);
  return p.data;
}

/** What `npm run tellcut -- recipe [<id>]` prints: the list, or one recipe's fields and a filled-in example. */
export function describeRecipe(id?: string): string {
  if (!id) return ['配方（cut.ts 裡 c.recipe(\'<名稱>\', 內容)）：', ...Object.values(RECIPES).map((r) => `  ${(handleOf(`recipe:${r.id}`) ?? '').padEnd(6)}  ${r.id.padEnd(9)} ${r.label} — ${r.doc}`), '', '看某個配方的內容格式：npm run tellcut -- recipe <名稱或代號>'].join('\n');
  const r = RECIPES[id] ?? RECIPES[idOfHandle(id)?.replace(/^recipe:/, '') ?? ''];
  if (!r) throw new Error(`沒有「${id}」這個配方；有：${Object.keys(RECIPES).join('、')}`);
  return [`${r.id} ${r.label} — ${r.doc}`, '', '內容範例（照這個形狀填，沒寫的欄位用預設值）：', JSON.stringify(r.example, null, 2), '', ...(r.notes?.length ? ['注意：', ...r.notes.map((n) => `  · ${n}`), ''] : []), `cut.ts：export default async function (c) { c.recipe('${r.id}', { … }); }`].join('\n');
}
