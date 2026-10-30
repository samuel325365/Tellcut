// Parameter names in three languages. The Chinese comes from ParamDef.label itself ("name（hint）"); English and Japanese are kept in
// params.en.ts / params.ja.ts, keyed `<type id>.<param key>`. Only the NAME and its hint are translated here; the words a block starts
// with are values.ts's, and dropdown options and what the user types never are. Missing: requested language, then English, then the
// Chinese label split.
import type { Lang } from '@tellcut/protocol';
import { getLang } from './lang.ts';
import { PARAMS_EN } from './params.en.ts';
import { PARAMS_JA } from './params.ja.ts';

export type ParamText = { name: string; hint?: string };
export { PARAMS_EN, PARAMS_JA };

/** "name（hint）": the name is what comes before the first （, the hint what lies inside it. Only when that （ is closed by the
 * label's very last character; any other shape (two groups, text after the bracket) is all name, no hint. */
export function splitLabel(label: string): ParamText {
  const i = label.indexOf('（');
  if (i < 0) return { name: label.trim() };
  let depth = 0, close = -1;
  for (let k = i; k < label.length; k++) {
    if (label[k] === '（') depth++;
    else if (label[k] === '）' && --depth === 0) { close = k; break; }
  }
  if (close !== label.length - 1) return { name: label.trim() };
  const name = label.slice(0, i).trim(), hint = label.slice(i + 1, close).trim();
  return hint ? { name, hint } : { name };
}

/** the text of parameter `key` of block / sound `type`; a project's own effects (fx.*) have no table: their label is shown as written */
export function paramText(type: string, key: string, label: string, lang: Lang = getLang()): ParamText {
  const zh = splitLabel(label);
  if (type.startsWith('fx.')) return { name: label };
  if (lang === 'zh') return zh;
  const id = `${type}.${key}`, x = (lang === 'en' ? PARAMS_EN : PARAMS_JA)[id], e = lang === 'ja' ? PARAMS_EN[id] : undefined;
  const name = x?.name || e?.name || zh.name, hint = x?.hint || e?.hint || zh.hint;
  return hint ? { name, hint } : { name };
}
