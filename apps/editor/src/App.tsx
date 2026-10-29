import { useEffect, useRef, useState } from 'preact/hooks';
import { equalIgnoring, useStoreSelector, type EditorState } from './store.ts';
import { ErrorView } from './ErrorView.tsx';
import { Toolbar } from './Toolbar.tsx';
import { Preview } from './Preview.tsx';
import { Timeline } from './timeline/Timeline.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import { LibraryPanel } from './LibraryPanel.tsx';
import { ExportPanel } from './ExportPanel.tsx';
import { ProposalBar } from './ProposalBar.tsx';
import { AskAgent } from './AskAgent.tsx';
import { SaveBlockDialog } from './library/SaveBlockDialog.tsx';
import { SavePresetDialog } from './presets/SavePresetDialog.tsx';
import { formatTime } from './timeline/geometry.ts';
import { ChatPanel } from './ChatPanel.tsx';
import { ImportDialog } from './ImportDialog.tsx';
import type { Attachment } from './attachments.ts';
import { HelpPanel } from './HelpPanel.tsx';
import { CLIPBOARD_ACTIONS, clipboardFree, keyAction, editorTakes } from './keys.ts';
import { arrangementOf, gridFor, previewWFromX, sideWFromX, sideWidth, sizePatch, splitFromY, type Layout } from './layout.ts';
import type { Editor } from './editor.ts';
import type { PlayerBridge } from './bridge.ts';
import { t } from './i18n/index.ts';

/** the project chat, with ＋ to attach photos or footage from this PC (as paths, like the home page) */
function EditorChat({ editor }: { editor: Editor }) {
  const [importing, setImporting] = useState(false);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const add = (a: Attachment[]) => setAtts([...atts, ...a.filter((x) => !atts.some((y) => y.path === x.path))]);
  const fs = editor.fs;
  return <>
    <ChatPanel session={editor.chat} surface="editor" hint={t('ed.chatHint')} attachments={atts} onAttach={fs && (() => setImporting(true))}
      onDetach={(i) => setAtts(atts.filter((_, k) => k !== i))} onSent={() => setAtts([])} />
    {importing && fs && <ImportDialog api={fs} surface="editor" onAdd={add} onClose={() => setImporting(false)} />}
  </>;
}

const useViewSize = () => {
  const [v, setV] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => { const on = () => setV({ w: innerWidth, h: innerHeight }); addEventListener('resize', on); return () => removeEventListener('resize', on); }, []);
  return v;
};

/** Drag to resize, double-click for the default. While dragging only the grid is restyled (re-rendering the whole
 *  editor per mouse move made it heavy); the size is stored on release. The preview iframe ignores the mouse meanwhile. */
function Splitter({ dir, editor, root, side = 0, meta, view }: { dir: 'rows' | 'cols'; editor: Editor; root: { current: HTMLElement | null }; side?: number;
  meta: { width: number; height: number }; view: { w: number; h: number } }) {
  const down = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = root.current!, r = el.getBoundingClientRect();
    document.body.classList.add('resizing');
    let last: Partial<Layout> | null = null;
    const move = (m: MouseEvent) => {
      if (m.buttons === 0) { up(); return; }   // released outside the window (Alt+Tab, another app)
      const l = editor.store.get().layout;
      last = dir === 'rows' ? { ...sizePatch(l, meta, { split: splitFromY(m.clientY, r.top, r.height) }), maxPreview: false } : sizePatch(l, meta, { previewW: previewWFromX(m.clientX, r.right, r.width, side) });
      const g = gridFor({ ...editor.store.get().layout, ...last }, meta, view);
      el.style.gridTemplateColumns = g.columns; el.style.gridTemplateRows = g.rows;
    };
    const up = () => {
      removeEventListener('mousemove', move); removeEventListener('mouseup', up); removeEventListener('blur', up);
      document.body.classList.remove('resizing');
      if (last) editor.setLayout(last);
    };
    addEventListener('mousemove', move); addEventListener('mouseup', up); addEventListener('blur', up);
  };
  const reset = () => { const l = editor.store.get().layout; editor.setLayout(dir === 'rows' ? { ...sizePatch(l, meta, { split: null }), maxPreview: false } : sizePatch(l, meta, { previewW: null })); };
  return <div class={`splitter ${dir}`} data-splitter={dir} data-tip={t('ed.splitTip')} aria-label={t('ed.splitTip')} onMouseDown={down as any} onDblClick={reset} />;
}

/** The left panel's right edge (素材／屬性／對話): drag to widen or narrow it, double-click for the default. Like Splitter, only
 *  the grid is restyled while dragging; the width is stored on release. */
function SideEdge({ editor, root, meta, view }: { editor: Editor; root: { current: HTMLElement | null }; meta: { width: number; height: number }; view: { w: number; h: number } }) {
  const down = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = root.current!, left = el.getBoundingClientRect().left;
    document.body.classList.add('resizing');
    let last: number | null = null;
    const move = (m: MouseEvent) => {
      if (m.buttons === 0) { up(); return; }
      last = sideWFromX(m.clientX, left, view.w);
      const g = gridFor({ ...editor.store.get().layout, sideW: last }, meta, view);
      el.style.gridTemplateColumns = g.columns;
    };
    const up = () => {
      removeEventListener('mousemove', move); removeEventListener('mouseup', up); removeEventListener('blur', up);
      document.body.classList.remove('resizing');
      if (last !== null) editor.setLayout({ sideW: last });
    };
    addEventListener('mousemove', move); addEventListener('mouseup', up); addEventListener('blur', up);
  };
  return <div class="side-edge" data-side-edge data-tip={t('ed.sideTip')} aria-label={t('ed.sideTip')} onMouseDown={down as any} onDblClick={() => editor.setLayout({ sideW: null })} />;
}

export function App({ editor, bridge }: { editor: Editor; bridge: PlayerBridge }) {
  // the playhead and the meter have their own subscribers: playback must not re-render the whole editor
  // (it would also rewrite every input under the cursor 60×/s)
  const s = useStoreSelector(editor.store, (x) => x, equalIgnoring<EditorState>(['playhead', 'level']));
  const root = useRef<HTMLDivElement>(null), view = useViewSize();
  useEffect(() => { void editor.open(); }, [editor]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const a = keyAction(e);
      if (!a || (CLIPBOARD_ACTIONS.has(a) && !clipboardFree(document, e.target)) || !editorTakes(a, editor.store.get().helpOpen)) return;
      e.preventDefault(); editor.run(a);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [editor]);
  if (s.error) return <ErrorView error={s.error} history={s.history} onRestore={(n) => void editor.restore(n)} failed={s.restoreError} />;
  if (!s.project) return <div class="loading">{t('ed.loading')}</div>;
  const l = s.layout, side = arrangementOf(l, s.project.meta) === 'side', g = gridFor(l, s.project.meta, view);
  const expander = (which: 'library' | 'props', area: string) => (
    <button class="expander" data-expand={which} style={{ gridArea: area }} data-tip={t(which === 'library' ? 'ed.openLibrary' : 'ed.openProps')} aria-label={t(which === 'library' ? 'ed.openLibrary' : 'ed.openProps')}
      onClick={() => editor.setLayout(which === 'library' ? { libClosed: false } : { propsClosed: false })}>{which === 'library' ? '»' : '«'}</button>
  );
  const library = <LibraryPanel editor={editor} s={s} />, props = <PropertiesPanel editor={editor} s={s} />;
  const chat = editor.chat && <div class="chat-tab"><div class="chat-head"><span>Project chat</span>
    <button data-save-preset disabled={s.presetSave.drafting} {...{ 'data-tip': t(s.presetSave.drafting ? 'preset.drafting' : 'preset.saveTip'), 'aria-label': t('preset.saveTip') }} onClick={() => void editor.presetSave.start()}>{s.presetSave.drafting ? 'Drafting…' : 'Save as preset'}</button>
    <button {...{ 'data-tip': t('ed.chatClearTip'), 'aria-label': t('ed.chatClearTip') }} onClick={() => { if (confirm(t('ed.chatClearConfirm'))) void editor.chat.clear(); }}>Clear</button></div>
    <EditorChat editor={editor} /></div>;
  return (
    <div class={`editor ${side ? 'layout-side' : 'layout-stacked'}`} ref={root} style={{ gridTemplateAreas: g.areas, gridTemplateColumns: g.columns, gridTemplateRows: g.rows }}>
      <Toolbar s={s} editor={editor} noticeHere={!(side ? !l.libClosed && l.sideTab === 'props' : !l.propsClosed)} />
      {side ? <>
        {l.libClosed ? expander('library', 'sd') : (
          <aside class="side" data-side>
            <div class="tabs">
              <button data-tab="library" class={l.sideTab === 'library' ? 'on' : ''} onClick={() => editor.setLayout({ sideTab: 'library' })}>Media</button>
              <button data-tab="props" class={l.sideTab === 'props' ? 'on' : ''} onClick={() => editor.setLayout({ sideTab: 'props' })}>Properties</button>
              <button data-tab="chat" class={l.sideTab === 'chat' ? 'on' : ''} onClick={() => editor.setLayout({ sideTab: 'chat' })}>Chat</button>
              <button class="collapse" data-collapse="library" data-tip={t('ed.collapse')} aria-label={t('ed.collapse')} onClick={() => editor.setLayout({ libClosed: true })}>«</button>
            </div>
            {/* both stay mounted: switching tabs keeps the library's scroll position */}
            <div class="tab-pane" hidden={l.sideTab !== 'library'}>{library}</div>
            <div class="tab-pane" hidden={l.sideTab !== 'props'}>{props}</div>
            <div class="tab-pane" hidden={l.sideTab !== 'chat'}>{chat}</div>
            <SideEdge editor={editor} root={root} meta={s.project.meta} view={view} />
          </aside>
        )}
        <Timeline editor={editor} />
        <Splitter dir="cols" editor={editor} root={root} side={sideWidth(l)} meta={s.project.meta} view={view} />
        <Preview editor={editor} bridge={bridge} s={s} />
      </> : <>
        {l.libClosed ? expander('library', 'lib') : (
          <div class="panel-wrap lib">
            <div class="tabs">
              <button data-tab="library" class={l.sideTab !== 'chat' ? 'on' : ''} onClick={() => editor.setLayout({ sideTab: 'library' })}>Media</button>
              <button data-tab="chat" class={l.sideTab === 'chat' ? 'on' : ''} onClick={() => editor.setLayout({ sideTab: 'chat' })}>Chat</button>
              <button class="collapse" data-collapse="library" data-tip={t('ed.collapseLibrary')} aria-label={t('ed.collapseLibrary')} onClick={() => editor.setLayout({ libClosed: true })}>«</button>
            </div>
            <div class="tab-pane" hidden={l.sideTab === 'chat'}>{library}</div>
            <div class="tab-pane" hidden={l.sideTab !== 'chat'}>{chat}</div>
            <SideEdge editor={editor} root={root} meta={s.project.meta} view={view} />
          </div>
        )}
        <Preview editor={editor} bridge={bridge} s={s} />
        {l.propsClosed ? expander('props', 'pr') : (
          <div class="panel-wrap pr"><button class="collapse" data-collapse="props" data-tip={t('ed.collapseProps')} aria-label={t('ed.collapseProps')} onClick={() => editor.setLayout({ propsClosed: true })}>»</button>{props}</div>
        )}
        <Splitter dir="rows" editor={editor} root={root} meta={s.project.meta} view={view} />
        <Timeline editor={editor} />
      </>}
      <ExportPanel editor={editor} s={s} />
      <ProposalBar editor={editor} s={s} />
      {s.ask && <AskAgent editor={editor} s={s} />}
      {s.library.saving && <SaveBlockDialog d={s.library.saving} project={s.project} projectId={s.id} kind={editor.registry?.item(s.library.saving.target)?.kind}
        onPatch={(p) => editor.library.patch(p)} onSave={(c) => void editor.library.save(c)} onClose={() => editor.library.close()} />}
      {s.presetSave.draft && (() => {
        // the draft the agent wrote, and what the film would bring along (its theme, music style and own effects)
        const d = s.presetSave.draft, th = (d.theme ?? s.project.meta.theme ?? {}) as { fonts?: Record<string, unknown>; palette?: Record<string, unknown> };
        const strs = (o?: Record<string, unknown>) => [...new Set(Object.values(o ?? {}).filter((x): x is string => typeof x === 'string'))];
        return <SavePresetDialog mode="save" surface="editor" initial={{ name: d.name, summary: d.summary, rows: d.points.map((p) => ({ text: p.text, orig: p.text, prompt: p.prompt })) }}
          bring={{ fonts: strs(th.fonts), colors: strs(th.palette), score: d.score ? s.library.project?.styles.find((x) => x.id === d.score)?.label ?? d.score : undefined, blocks: d.blocks.flatMap((b) => b.names) }}
          poster={{ src: s.presetSave.poster, frameAt: formatTime(s.playhead) }} onSave={(v) => editor.presetSave.save(v)} onClose={() => editor.presetSave.close()} />;
      })()}
      {s.presetSave.toast && <div class="lib-toast" role="status" data-preset-toast>{s.presetSave.toast}<button aria-label={t('lib.close')} onClick={() => editor.presetSave.dismiss()}>×</button></div>}
      {s.library.toast && <div class="lib-toast" role="status" data-lib-toast>{t('lib.saved', { name: s.library.toast.name })}
        <a href="./?gallery" target="_blank" rel="noopener">{t('lib.seeIt')}</a><button aria-label={t('lib.close')} onClick={() => editor.library.dismissToast()}>×</button></div>}
      {s.helpOpen && <HelpPanel onClose={() => editor.toggleHelp(false)} />}
    </div>
  );
}
