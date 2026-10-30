// The few words a block writes by itself when a parameter is left empty ("10 人中有 4 人", "第 12 名", 是／否), in the language of the
// film. The engine has no film language, and a film made by cut.ts never goes through the editor's values.en/ja, so the block reads
// it from its own words: the text it draws (a title, a question, the card's lines); when that has no letters at all, from the words
// the project's items were given; Chinese when neither says.
import type { ItemType, Project } from '@tellcut/engine';

export type WordsLang = 'zh' | 'en' | 'ja';

const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/g, HAN = /[㐀-䶿一-鿿豈-﫿]/g, LATIN = /[A-Za-zÀ-ɏ]/g;
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

/** the language of some text, null when it has no letters: a CJK character counts as about three Latin letters (a word); Japanese
 *  when kana are at least a third of the CJK characters (a lone の in a Chinese name stays Chinese) */
export function textLang(...texts: unknown[]): WordsLang | null {
  const s = texts.filter((x): x is string => typeof x === 'string').join(' ');
  const kana = count(s, KANA), cjk = kana + count(s, HAN), latin = count(s, LATIN);
  if (!cjk && !latin) return null;
  if (latin > cjk * 3) return 'en';
  return kana * 3 >= cjk ? 'ja' : 'zh';
}

/** the language of the words the project's items were given: the string parameters set on an item whose default is Chinese
 *  (titles, captions, lines; not ids, fonts or colours) */
export function projectLang(project: Pick<Project, 'tracks'> | undefined, types?: (type: string) => ItemType | undefined): WordsLang | null {
  if (!project || !types) return null;
  const words: string[] = [];
  for (const tr of project.tracks) for (const it of tr.items as Array<{ type?: string; params?: Record<string, unknown> }>) {
    const defs = it.type ? types(it.type)?.params : undefined;
    if (!defs || !it.params) continue;
    for (const d of defs) {
      const v = it.params[d.key];
      if ((d.type === 'string' || d.type === 'text') && typeof v === 'string' && count(String(d.default), HAN) > 0) words.push(v);
    }
  }
  return textLang(...words);
}

/** the language of a block's own words: its text first, then the project's, else Chinese */
export const wordsLang = (texts: unknown[], ctx?: { project?: Pick<Project, 'tracks'>; types?: (type: string) => ItemType | undefined }): WordsLang =>
  textLang(...texts) ?? projectLang(ctx?.project, ctx?.types) ?? 'zh';

/** "12th", "21st", "113th" */
export const ordinal = (n: number) => {
  const a = Math.abs(n) % 100, b = Math.abs(n) % 10;
  return `${n}${a >= 11 && a <= 13 ? 'th' : b === 1 ? 'st' : b === 2 ? 'nd' : b === 3 ? 'rd' : 'th'}`;
};

/** the words themselves */
export const WORDS = {
  /** common.chart people's line when `stat` is empty: k of n, the k counting up */
  people: { zh: (n: number, k: number) => `${n} 人中有 【${k}】 人`, en: (n: number, k: number) => `【${k}】 out of ${n}`, ja: (n: number, k: number) => `${n} 人中 【${k}】 人` },
  /** common.chart bars' gap bracket when `note` is empty */
  gap: { zh: (x: string) => `差 ${x}`, en: (x: string) => `Gap ${x}`, ja: (x: string) => `差 ${x}` },
  /** common.chart rank's tag on the lit row when `note` is empty */
  rank: { zh: (r: number) => `第 ${r} 名`, en: (r: number) => ordinal(r), ja: (r: number) => `${r} 位` },
  /** common.postcard's line under "Carte Postale" on the back */
  postcardSub: { zh: '寄給自己的明信片', en: 'A POSTCARD TO MYSELF', ja: '自分に宛てたはがき' },
  /** common.slip's label over the stub's "!" when there is no number */
  slipPoint: { zh: '重點', en: 'POINT', ja: 'ポイント' },
  /** common.story's answers when fewer than two are given */
  yesNo: { zh: ['是', '否'], en: ['Yes', 'No'], ja: ['はい', 'いいえ'] },
} as const;
