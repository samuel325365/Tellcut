// 「交給 Claude」(spec 2026-10-16-right-click-claude §2): the dialog's list and the message copied for the chat.
import { allItems, resolveTimes, type Project } from '@tellcut/engine';
import type { Lang } from '@tellcut/protocol';
import { t } from './i18n/index.ts';

const f2 = (v: number) => v.toFixed(2);
export function askMessage(o: { name: string; id: string; text: string; selection: string[]; playhead: number; range: [number, number] | null }, lang?: Lang): string {
  const sel = o.selection.length > 5 ? t('ed.askSelMore', { list: o.selection.slice(0, 5).join(t('ed.askSelSep', undefined, lang)), n: o.selection.length }, lang) : o.selection.join(t('ed.askSelSep', undefined, lang));
  const where = o.selection.length && o.range ? t('ed.askWhereSel', { sel, a: f2(o.range[0]), b: f2(o.range[1]) }, lang) : t('ed.askNear', { t: f2(o.playhead) }, lang);
  return t('ed.askMsg', { name: o.name, id: o.id, text: o.text, where }, lang);
}
export function askLines(p: Project, selection: string[], playhead: number, lang?: Lang): string[] {
  if (!selection.length) return [t('ed.askNear', { t: f2(playhead) }, lang)];
  const times = resolveTimes(p), all = allItems(p);
  return selection.map((id) => {
    const it: any = all.find((x) => x.item.id === id)?.item, r = times.get(id);
    const name = typeof it?.params?.text === 'string' ? it.params.text.replace(/\s+/g, ' ').slice(0, 20) : it?.label ?? it?.type ?? it?.source ?? it?.media ?? id;
    return r ? t('ed.askLine', { name, id, a: f2(r.start), b: f2(r.end) }, lang) : id;
  });
}
