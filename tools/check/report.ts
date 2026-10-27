// The text report of `npm run check`: one finding a line, by time, and a total.
import { timecode1 } from '@tellcut/media-node';
import { byTime, type Finding } from './rules.ts';

const WORD = { error: '錯誤', warn: '警告', note: '提醒' } as const;

export function formatReport(findings: Finding[]): string {
  if (!findings.length) return '沒有發現問題';
  const n = (l: Finding['level']) => findings.filter((f) => f.level === l).length;
  return [...byTime(findings).map((f) => `${WORD[f.level]}  ${f.t ? `${timecode1(f.t[0])}–${timecode1(f.t[1])}  ` : ''}${f.msg}`),
    '', `共 ${n('error')} 個錯誤、${n('warn')} 個警告、${n('note')} 個提醒`].join('\n');
}

/** Why the page layer (the player's pictures and mix) is not run this time: '' for --quick (nothing to say), a reason to print, or
 *  null to run it. An old player build would measure code that is not the code anymore: a minute spent on a wrong answer. */
export function pageLayerSkip(o: { quick: boolean; offline: boolean; stale: string | null }): string | null {
  if (o.quick) return '';
  if (o.offline) return '有離線的素材，略過畫面與聲音的檢查';
  if (o.stale) return `播放器的建置檔是舊的，略過畫面與聲音的檢查：${o.stale}`;
  return null;
}

/** material the page layer needs and cannot find: footage, music or a sound file (rules.ts's findings with code 'offline') */
export const isOffline = (f: Finding) => f.code === 'offline';

/** the page layer, a failure in it (Chrome missing, a file prepare cannot find) an error in the report: thrown, it took the
 *  findings already made down with it */
export async function pageLayer(run: () => Promise<{ findings: Finding[]; sheet?: string }>): Promise<{ findings: Finding[]; sheet?: string }> {
  try { return await run(); } catch (e) { return { findings: [{ level: 'error', msg: `畫面與聲音的檢查沒有跑完：${(e as Error).message.split('\n')[0]}` }] }; }
}
