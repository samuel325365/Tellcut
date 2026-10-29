// Export progress, result, failure and history (spec §7, §8, M8).
import { fileUrl, isTerminal } from './api.ts';
import { exportProgress } from './i18n/format.ts';
import { t } from './i18n/index.ts';
import { getLang } from './i18n/lang.ts';
import type { EditorState } from './store.ts';

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const LOCALE = { zh: 'zh-TW', en: 'en-GB', ja: 'ja-JP' } as const;
const when = (ms: number) => new Date(ms).toLocaleString(LOCALE[getLang()], { hour12: false });
const base = (rel: string) => rel.split('/').pop()!;

export function ExportPanel({ editor, s }: { editor: any; s: EditorState }) {
  if (!s.exportOpen) return null;
  const j = s.exportJob, id = editor.id as string;
  return (
    <section class="export-panel" data-export-panel>
      <header><strong>Export</strong><button data-export-close onClick={() => editor.toggleExports(false)}>Close</button></header>
      {s.exportError && <p class="notice" data-export-error>{s.exportError}</p>}
      {j && !isTerminal(j.status) && <div class="job">
        <div class="bar" data-export-progress><i style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>
        <div class="msg">{j.status === 'queued' ? t('ed.exQueued') : exportProgress(j.message) || t('export.prepare')} <button data-export-cancel onClick={() => editor.cancelExport()}>Cancel</button></div>
      </div>}
      {j?.status === 'done' && j.result && <p class="done">Done: <a data-export-result href={fileUrl(id, j.result.file)} target="_blank" rel="noopener">{base(j.result.file)}</a>{t('ed.exTook', { n: j.result.seconds })}</p>}
      {j?.status === 'done' && j.result && <button class="link" data-save-preset-after-export onClick={() => void editor.presetSave.start()}>{t('preset.saveAfterExport')}</button>}
      {j && (j.status === 'failed' || j.status === 'cancelled') && <div class="failed">
        <p class="notice" data-export-error>{j.status === 'cancelled' ? t('ed.exCancelled') : t('ed.exFailed', { err: j.error ?? '' })}</p>
        {j.log.length > 0 && <pre data-export-log>{j.log.slice(-20).join('\n')}</pre>}
      </div>}
      <h4>Exports</h4>
      {s.exports.length === 0 ? <p class="hint">{t('ed.exNone')}</p> : <ul class="history">
        {s.exports.map((x) => <li data-export-entry>
          <a href={x.url} target="_blank" rel="noopener">{base(x.file)}</a> <small>{mb(x.size)} · {when(x.mtime)}</small>
          {x.log && <> · <a href={fileUrl(id, x.log)} target="_blank" rel="noopener">Log</a></>}
        </li>)}
      </ul>}
    </section>
  );
}
