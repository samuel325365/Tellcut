// The outside media sources and their health (spec 2026-10-22-external-sources §4.4), like `npm run providers`:
//   npm run sources              every source: switch, key, whether it answers (one cheap request each, so it goes online)
//   npm run sources -- --live    also a real search and download from each
// The answers go to .cache/sources-health.json: a source found broken is hidden from the agents until a check passes again.
import { pathToFileURL } from 'node:url';
import { checkSources, contactOf, openSources, type Sources } from '@tellcut/media-node';
import { parseArgsOrExit } from './args.ts';
import { hasCjk } from './setup/checks.ts';

const WORDS = {
  zh: { state: { ok: '可用', temporary: '暫時不能用', broken: '壞掉' }, unofficial: '（非官方）', notNeeded: '不需要', present: '有', missing: (k: string) => `缺（${k}）`,
    noAdapter: '還沒有轉接程式', unchecked: '未檢查', last: (at: string, st: string, d: string) => `上次 ${at}：${st}，${d}`, on: '開', off: '關',
    head: ['來源', '開關', 'key', '狀態'], nameWidth: 22,
    contact: '⚠ 還沒填聯絡方式：在 tellcut/sources.local.json 寫 "contact": "<email 或網址>"（或設 TELLCUT_CONTACT）。沒填時 Wikimedia 等來源的額度較低。',
    foot: '開關：tellcut/sources.json 是預設值，個人的開關、key、聯絡方式寫在 sources.local.json（不進 git）。' },
  en: { state: { ok: 'works', temporary: 'down for now', broken: 'broken' }, unofficial: ' (unofficial)', notNeeded: 'not needed', present: 'yes', missing: (k: string) => `missing (${k})`,
    noAdapter: 'no adapter yet', unchecked: 'not checked', last: (at: string, st: string, d: string) => `last checked ${at}: ${st}${d ? `, ${d}` : ''}`, on: 'on', off: 'off',
    head: ['source', 'switch', 'key', 'status'], nameWidth: 26,
    contact: '⚠ No contact yet: write "contact": "<email or web address>" in tellcut/sources.local.json (or set TELLCUT_CONTACT). Without one, Wikimedia and some other sources allow fewer requests.',
    foot: 'Switches: tellcut/sources.json holds the defaults; your own switches, keys and contact go in sources.local.json (not in git).' },
};
const width = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(1, n - width(s)));

/** `lang` 'en' for doctor, which prints English (tools/setup/checks.ts): a source's own words are Chinese, so there only those
 *  that read in English are kept. */
export async function sourcesReport(s: Sources, o: { live?: boolean; lang?: 'zh' | 'en' } = {}): Promise<string> {
  const w = WORDS[o.lang ?? 'zh'], said = (d: string) => (o.lang === 'en' && hasCjk(d) ? '' : d);
  const rows = await checkSources(s, { live: o.live });
  const lines = rows.map(({ status: st, result }) => {
    const entry = s.config.sources[st.id], h = result ?? st.health;
    const name = `${st.id}${st.adapter?.unofficial ?? entry?.unofficial ? w.unofficial : ''}`;
    const key = !st.adapter ? '—' : st.key === 'not-needed' ? w.notNeeded : st.key === 'present' ? w.present : w.missing(entry?.keyEnv ?? `keys.${st.id}`);
    const state = !st.adapter ? w.noAdapter : result ? w.state[result.status] : w.unchecked;
    const detail = result ? said(result.detail) : h ? w.last(h.at.slice(0, 16).replace('T', ' '), w.state[h.status], said(h.detail)) : '';
    return `${pad(name, w.nameWidth)}${pad(st.enabled ? w.on : w.off, 6)}${pad(key, 18)}${pad(state, 16)}${detail}`.trimEnd();
  });
  const [a, b, c, d] = w.head;
  return [
    `${pad(a, w.nameWidth)}${pad(b, 6)}${pad(c, 18)}${pad(d, 16)}`.trimEnd(), ...lines, '',
    ...(contactOf(s.config, s.env) ? [] : [w.contact]),
    w.foot,
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { console.log(await sourcesReport(openSources(), { live: parseArgsOrExit(process.argv.slice(2), { '--live': 'switch' }, '用法：npm run sources [-- --live]').has('--live') })); } catch (e) { console.error((e as Error).message); process.exit(1); }
}
