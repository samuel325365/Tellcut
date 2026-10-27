import { useEffect, useRef } from 'preact/hooks';
import type { Editor } from './editor.ts';
import type { PlayerBridge } from './bridge.ts';
import { useStoreSelector, type EditorState } from './store.ts';
import { formatTime } from './timeline/geometry.ts';
import { t } from './i18n/index.ts';

/** a tooltip: the explanation goes in data-tip (the TooltipLayer shows it) and aria-label */
const tip = (text: string) => ({ 'data-tip': text, 'aria-label': text });

export function Preview({ editor, bridge, s }: { editor: Editor; bridge: PlayerBridge; s: EditorState }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const win = frame.current!.contentWindow!;
    bridge.attach(win);
    const on = (e: MessageEvent) => { if (e.origin === location.origin && e.source === win) bridge.handle(e.data); };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, [bridge]);
  return (
    <section class="preview">
      <div class="banners">
      {s.crop && <div class="crop-banner" data-crop-banner>{t('ed.cropBanner', { which: s.crop.which === 'from' ? t('ed.cropFrom') : s.crop.which === 'to' ? t('ed.cropTo') : t('ed.cropKey', { n: s.crop.which + 1 }) })}
        <button onClick={() => editor.exitCrop()}>Done</button></div>}
      {s.audition && <div class="audition-banner" data-audition>{t('ed.auditionBanner', { label: s.audition.label })}
        {s.audition.addable && <button class="primary" data-audition-add {...tip(t('ed.auditionAddTip'))} onClick={() => editor.addAuditioned()}>Add</button>}
        {s.audition.result !== null && <button class="primary" data-audition-result {...tip(t('ed.auditionResultTip'))} onClick={() => editor.playResult()}>▶ Play result</button>}
        <button data-audition-stop onClick={() => editor.endAudition()}>End</button></div>}
      </div>
      <iframe ref={frame} aria-label={t('ed.previewFrame')} src={`/player/index.html?embed=1&media=api&id=${encodeURIComponent(s.id)}`} data-player={s.playerReady ? 'ready' : 'loading'} />
      <div class="transport">
        <button data-transport="home" {...tip(t('ed.tHome'))} onClick={() => editor.run('home')}>⏮</button>
        <button data-transport="prev" {...tip(t('ed.tPrev'))} onClick={() => editor.run('prevFrame')}>◀︎|</button>
        <button data-transport="play" onClick={() => editor.togglePlay()} {...tip(t('ed.tPlay'))}>{s.playing ? '❚❚' : '▶'}</button>
        <button data-transport="next" {...tip(t('ed.tNext'))} onClick={() => editor.run('nextFrame')}>|▶︎</button>
        <button data-transport="end" {...tip(t('ed.tEnd'))} onClick={() => editor.run('end')}>⏭</button>
        <button data-loop class={s.loop ? 'on' : ''} {...tip(t('ed.tLoop'))} onClick={() => editor.toggleLoop()}>🔁</button>
        <Clock editor={editor} duration={s.project!.meta.duration} />
      </div>
    </section>
  );
}

/** The transport clock subscribes to the playhead by itself. */
function Clock({ editor, duration }: { editor: Editor; duration: number }) {
  const time = useStoreSelector(editor.store, (x) => x.playhead);
  return <span class="clock">{formatTime(time, true)} / {formatTime(duration, true)}</span>;
}
