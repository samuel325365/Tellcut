// The timeline's tool tray (spec 2026-10-28-timeline-refresh A2): add a track; the cutting tools; snapping and track height;
// the zoom. A tool that cannot act is greyed (aria-disabled, so its tooltip still shows) and its tooltip says why.
import type { Editor } from '../editor.ts';
import type { Action } from '../keys.ts';
import { t, type Key } from '../i18n/index.ts';
import { IconCopy, IconCutLeft, IconCutRight, IconMagnet, IconMinus, IconPlus, IconRipple, IconRows, IconScissors, IconTrash } from '../icons.tsx';
import { trayState, type ToolId } from './tray.ts';
import type { EditorState } from '../store.ts';

const tip = (text: string) => ({ 'data-tip': text, 'aria-label': text });
const TOOLS: Array<{ id: ToolId; action: Action; icon: (p: { size?: number }) => any; tip: Key }> = [
  { id: 'split', action: 'split', icon: IconScissors, tip: 'ed.tool.split' },
  { id: 'deleteLeft', action: 'deleteLeft', icon: IconCutLeft, tip: 'ed.tool.deleteLeft' },
  { id: 'deleteRight', action: 'deleteRight', icon: IconCutRight, tip: 'ed.tool.deleteRight' },
  { id: 'delete', action: 'delete', icon: IconTrash, tip: 'ed.tool.delete' },
  { id: 'rippleDelete', action: 'rippleDelete', icon: IconRipple, tip: 'ed.tool.rippleDelete' },
  { id: 'duplicate', action: 'duplicate', icon: IconCopy, tip: 'ed.tool.duplicate' },
];

export function ToolTray({ editor, s, skip, addTrack, zoom }: { editor: Editor; s: Pick<EditorState, 'project' | 'playhead' | 'selection' | 'layout'>; skip: ReadonlySet<string>;
  /** the + Track menu and the zoom slider with its fit button, as the timeline builds them */
  addTrack: any; zoom: any }) {
  const state = trayState(s, skip);
  return (
    <div class="tl-tray" data-tray>
      {addTrack}
      <span class="sep" />
      {TOOLS.map((x) => {
        const st = state[x.id], Icon = x.icon;
        const text = t(x.tip) + (st.why ? ` — ${t(st.why)}` : st.note ? ` — ${t(st.note)}` : '');
        return <button class="tool" data-tool={x.id} aria-disabled={st.enabled ? 'false' : 'true'} {...tip(text)}
          onClick={() => { if (st.enabled) editor.run(x.action); }}><Icon size={15} /></button>;
      })}
      <span class="sep" />
      <button data-snap class={s.layout.snap ? 'on' : ''} {...tip(t('ed.snapTip'))}
        onClick={() => editor.setLayout({ snap: !s.layout.snap })}><IconMagnet size={14} /><span class="lbl">Snap: {s.layout.snap ? 'On' : 'Off'}</span></button>
      <button data-track-size {...tip(t('ed.trackSizeTip'))} onClick={() => editor.setLayout({ trackSize: s.layout.trackSize === 'compact' ? 'standard' : 'compact' })}><IconRows size={14} /><span class="lbl">Tracks: {s.layout.trackSize === 'compact' ? 'Compact' : 'Standard'}</span></button>
      <span class="grow" />
      <button class="tool" data-zoom-out {...tip(t('ed.tool.zoomOut'))} onClick={() => editor.run('zoomOut')}><IconMinus size={15} /></button>
      {zoom}
      <button class="tool" data-zoom-in {...tip(t('ed.tool.zoomIn'))} onClick={() => editor.run('zoomIn')}><IconPlus size={15} /></button>
    </div>
  );
}
