// The outside media sources and their health (spec 2026-10-22-external-sources §4.4), like `npm run providers`:
//   npm run sources              every source: switch, key, whether it answers (one cheap request each, so it goes online)
//   npm run sources -- --live    also a real search and download from each
// The answers go to .cache/sources-health.json: a source found broken is hidden from the agents until a check passes again.
import { pathToFileURL } from 'node:url';
import { checkSources, contactOf, openSources, type Sources } from '@tellcut/media-node';

const STATE = { ok: '可用', temporary: '暫時不能用', broken: '壞掉' } as const;
const width = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(1, n - width(s)));

export async function sourcesReport(s: Sources, o: { live?: boolean } = {}): Promise<string> {
  const rows = await checkSources(s, o);
  const lines = rows.map(({ status: st, result }) => {
    const entry = s.config.sources[st.id], h = result ?? st.health;
    const name = `${st.id}${st.adapter?.unofficial ?? entry?.unofficial ? '（非官方）' : ''}`;
    const key = !st.adapter ? '—' : st.key === 'not-needed' ? '不需要' : st.key === 'present' ? '有' : `缺（${entry?.keyEnv ?? `keys.${st.id}`}）`;
    const state = !st.adapter ? '還沒有轉接程式' : result ? STATE[result.status] : '未檢查';
    const detail = result ? result.detail : h ? `上次 ${h.at.slice(0, 16).replace('T', ' ')}：${STATE[h.status]}，${h.detail}` : '';
    return `${pad(name, 22)}${pad(st.enabled ? '開' : '關', 6)}${pad(key, 18)}${pad(state, 16)}${detail}`.trimEnd();
  });
  return [
    `${pad('來源', 22)}${pad('開關', 6)}${pad('key', 18)}${pad('狀態', 16)}`.trimEnd(), ...lines, '',
    ...(contactOf(s.config, s.env) ? [] : ['⚠ 還沒填聯絡方式：在 tellcut/sources.local.json 寫 "contact": "<email 或網址>"（或設 TELLCUT_CONTACT）。沒填時 Wikimedia 等來源的額度較低。']),
    '開關：tellcut/sources.json 是預設值，個人的開關、key、聯絡方式寫在 sources.local.json（不進 git）。',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { console.log(await sourcesReport(openSources(), { live: process.argv.includes('--live') })); } catch (e) { console.error((e as Error).message); process.exit(1); }
}
