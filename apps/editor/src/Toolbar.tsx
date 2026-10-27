import { isTerminal } from './api.ts';
import type { EditorState } from './store.ts';
import { LiveMeter } from './Meter.tsx';
import { orientationOf, WIDEST_PREVIEW } from './layout.ts';
import { t } from './i18n/index.ts';

const SAVE_KEY = { saved: 'ed.save.saved', pending: 'ed.save.pending', saving: 'ed.save.saving', error: 'ed.save.error' } as const;

/** a tooltip: the explanation goes in data-tip (the TooltipLayer shows it) and aria-label */
const tip = (text: string) => ({ 'data-tip': text, 'aria-label': text });

/** noticeHere: the properties panel (where refusal notices show) is hidden, so the toolbar shows them. */
export function Toolbar({ s, editor, noticeHere = false }: { s: EditorState; editor: any; noticeHere?: boolean }) {
  const j = s.exportJob, running = !!j && !isTerminal(j.status);
  return (
    <header class="toolbar">
      <a class="home-btn" data-home href="/editor/" {...tip(t('ed.homeTip'))}>⌂</a>
      <button class="help-btn" data-help {...tip(t('ed.helpTip'))} onClick={() => editor.toggleHelp()}>Help</button>
      <strong class="name">{s.project?.meta.name ?? s.id}</strong>
      <button disabled={!s.canUndo} onClick={() => editor.undo()} {...tip(t('ed.undoTip'))}>↶</button>
      <button disabled={!s.canRedo} onClick={() => editor.redo()} {...tip(t('ed.redoTip'))}>↷</button>
      <LiveMeter store={editor.store} />
      <span class={`save ${s.save}`} data-save={s.save} {...(s.saveError ? tip(s.saveError) : {})}>{t(SAVE_KEY[s.save])}</span>
      {s.analyzing > 0 && <span class="analyzing">{t('ed.analyzing', { n: s.analyzing })}</span>}
      {noticeHere && s.notice && <span class="toolbar-notice" data-toolbar-notice {...tip(s.notice)}>{s.notice}</span>}
      {s.playerError && <span class="player-error" {...tip(s.playerError)}>{t('ed.previewError')}</span>}
      <button data-snap class={s.layout.snap ? 'on' : ''} {...tip(t('ed.snapTip'))}
        onClick={() => editor.setLayout({ snap: !s.layout.snap })}>Snap: {s.layout.snap ? 'On' : 'Off'}</button>
      <button data-track-size {...tip(t('ed.trackSizeTip'))} onClick={() => editor.setLayout({ trackSize: s.layout.trackSize === 'compact' ? 'standard' : 'compact' })}>Tracks: {s.layout.trackSize === 'compact' ? 'Compact' : 'Standard'}</button>
      {s.project && (() => {
        const portrait = orientationOf(s.project.meta) === 'portrait', on = portrait ? s.layout.previewW === WIDEST_PREVIEW : s.layout.maxPreview;
        return <button data-max-preview class={on ? 'on' : ''} {...tip(t(portrait ? 'ed.widenTip' : 'ed.enlargeTip'))} onClick={() => editor.run('maxPreview')}>⤢ {portrait ? 'Widen preview' : 'Enlarge preview'}</button>;
      })()}
      <select data-quality value={s.quality} {...tip(t('ed.qualityTip'))} onChange={(e) => editor.setQuality((e.target as HTMLSelectElement).value)}>
        <option value="full">Preview: Full</option><option value="draft">Preview: Smooth</option>
      </select>
      <button data-exports onClick={() => editor.toggleExports()}>Exports</button>
      <button class="primary" data-export onClick={() => void editor.exportVideo()}>{running ? `Exporting ${Math.round(j!.progress * 100)}%` : 'Export'}</button>
    </header>
  );
}
