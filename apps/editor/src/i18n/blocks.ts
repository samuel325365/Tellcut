// The gallery's block texts (spec 2026-10-23 languages-b §9): the Chinese comes from the sources the gallery reads (ItemType.label/doc,
// styles, recipes, CLIP_FX); English and Japanese are kept here, keyed by the ids HANDLES points at. Missing: requested language, then English, then Chinese.
import type { Lang } from '@tellcut/protocol';
import { getLang } from './lang.ts';
import { BLOCKS_EN } from './blocks.en.ts';
import { BLOCKS_JA } from './blocks.ja.ts';

export type BlockText = { label: string; doc: string; notes?: string[] };
export { BLOCKS_EN, BLOCKS_JA };

/** the text of block `id` in `lang`: zh is the given one; en / ja the file's, a missing field taken from English (for ja), then from zh */
export function blockText(id: string, zh: BlockText, lang: Lang = getLang()): BlockText {
  if (lang === 'zh') return zh;
  const x = (lang === 'en' ? BLOCKS_EN : BLOCKS_JA)[id], e = lang === 'ja' ? BLOCKS_EN[id] : undefined;
  if (!x && !e) return zh;
  const notes = x?.notes?.length ? x.notes : e?.notes?.length ? e.notes : zh.notes;
  return { label: x?.label || e?.label || zh.label, doc: x?.doc || e?.doc || zh.doc, ...(notes ? { notes } : {}) };
}
