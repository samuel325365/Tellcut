import { isTerminal } from './api.ts';
import type { EditorState } from './store.ts';
import { LiveMeter } from './Meter.tsx';
import { arrangementOf, nextArrange, orientationOf, previewWOf, WIDEST_PREVIEW } from './layout.ts';
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
      {s.project && (() => {
        // the tip says what the layout is now and what a click makes it (Auto names what it would pick)
        const o = orientationOf(s.project.meta), choice = s.layout.arrange[o], now = arrangementOf(s.layout, s.project.meta), next = nextArrange(choice);
        const word = (a: string) => t(a === 'side' ? 'ed.layoutSide' : a === 'stacked' ? 'ed.layoutStacked' : 'ed.layoutAuto');
        const nextText = next === 'auto' ? `${word('auto')} (${word(o === 'portrait' ? 'side' : 'stacked')})` : word(next);
        return <button data-layout {...tip(t('ed.layoutTip', { now: word(now), next: nextText }))}
          onClick={() => editor.run('layout')}>Layout: {choice === 'auto' ? 'Auto' : choice === 'side' ? 'Side' : 'Stacked'}</button>;
      })()}
      {s.project && (() => {
        const side = arrangementOf(s.layout, s.project.meta) === 'side', on = side ? previewWOf(s.layout, s.project.meta) === WIDEST_PREVIEW : s.layout.maxPreview;
        return <button data-max-preview class={on ? 'on' : ''} {...tip(t(side ? 'ed.widenTip' : 'ed.enlargeTip'))} onClick={() => editor.run('maxPreview')}>⤢ {side ? 'Widen preview' : 'Enlarge preview'}</button>;
      })()}
      <select data-quality value={s.quality} {...tip(t('ed.qualityTip'))} onChange={(e) => editor.setQuality((e.target as HTMLSelectElement).value)}>
        <option value="full">Preview: Full</option><option value="draft">Preview: Smooth</option>
      </select>
      <button data-exports onClick={() => editor.toggleExports()}>Exports</button>
      <button class="primary" data-export onClick={() => void editor.exportVideo()}>{running ? `Exporting ${Math.round(j!.progress * 100)}%` : 'Export'}</button>
    </header>
  );
}
