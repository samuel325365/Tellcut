// The words a shared block starts with, in the UI language (spec 2026-10-30-showcase-films part 2). Many blocks' text parameters
// default to Chinese words (片名, 已讀, 搜尋中…); in the English or Japanese UI a block added from the gallery gets these instead,
// written into its params so what the properties panel shows is what is drawn. A block already on the timeline keeps what it has.
import type { ParamDef } from '@tellcut/engine';
import type { Lang } from '@tellcut/protocol';
import { getLang } from './lang.ts';
import { VALUES_EN } from './values.en.ts';
import { VALUES_JA } from './values.ja.ts';

export { VALUES_EN, VALUES_JA };

/** whether a default shows Chinese (CJK characters, their punctuation or full-width forms) */
export const hasCjk = (v: unknown): v is string => typeof v === 'string' && /[　-鿿＀-￯]/.test(v);

/** a block's parameters whose default is Chinese, with their words in `lang` ({} in Chinese, and for a block with no table); a choice
 *  of language that defaults to zh (common.reels' counts: 1.2萬) takes the UI language when it is one of the options */
export function localValues(type: string, defs: ParamDef[], lang: Lang = getLang()): Record<string, string> {
  if (lang === 'zh') return {};
  const table = lang === 'ja' ? VALUES_JA : VALUES_EN, out: Record<string, string> = {};
  for (const d of defs) {
    const v = table[`${type}.${d.key}`];
    if (v !== undefined && hasCjk(d.default)) out[d.key] = v;
    else if (d.type === 'enum' && d.default === 'zh' && d.options.includes(lang)) out[d.key] = lang;
  }
  return out;
}
