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
import { ChatPanel } from './ChatPanel.tsx';
import { ImportDialog } from './ImportDialog.tsx';
import type { Attachment } from './attachments.ts';
import { HelpPanel } from './HelpPanel.tsx';
import { keyAction } from './keys.ts';
import { gridFor, orientationOf, previewWFromX, sideWFromX, sideWidth, splitFromY, type Layout } from './layout.ts';
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
      last = dir === 'rows' ? { split: splitFromY(m.clientY, r.top, r.height), maxPreview: false } : { previewW: previewWFromX(m.clientX, r.right, r.width, side) };
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
  const reset = () => editor.setLayout(dir === 'rows' ? { split: null, maxPreview: false } : { previewW: null });
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
    const on = (e: KeyboardEvent) => { const a = keyAction(e); if (a) { e.preventDefault(); editor.run(a); } };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [editor]);
  if (s.error) return <ErrorView error={s.error} history={s.history} onRestore={(n) => void editor.restore(n)} failed={s.restoreError} />;
  if (!s.project) return <div class="loading">{t('ed.loading')}</div>;
  const l = s.layout, portrait = orientationOf(s.project.meta) === 'portrait', g = gridFor(l, s.project.meta, view);
  const expander = (which: 'library' | 'props', area: string) => (
    <button class="expander" data-expand={which} style={{ gridArea: area }} data-tip={t(which === 'library' ? 'ed.openLibrary' : 'ed.openProps')} aria-label={t(which === 'library' ? 'ed.openLibrary' : 'ed.openProps')}
      onClick={() => editor.setLayout(which === 'library' ? { libClosed: false } : { propsClosed: false })}>{which === 'library' ? '»' : '«'}</button>
  );
  const library = <LibraryPanel editor={editor} s={s} />, props = <PropertiesPanel editor={editor} s={s} />;
  const chat = editor.chat && <div class="chat-tab"><div class="chat-head"><span>Project chat</span>
    <button {...{ 'data-tip': t('ed.chatClearTip'), 'aria-label': t('ed.chatClearTip') }} onClick={() => { if (confirm(t('ed.chatClearConfirm'))) void editor.chat.clear(); }}>Clear</button></div>
    <EditorChat editor={editor} /></div>;
  return (
    <div class={`editor ${portrait ? 'portrait' : 'landscape'}`} ref={root} style={{ gridTemplateAreas: g.areas, gridTemplateColumns: g.columns, gridTemplateRows: g.rows }}>
      <Toolbar s={s} editor={editor} noticeHere={!(portrait ? !l.libClosed && l.sideTab === 'props' : !l.propsClosed)} />
      {portrait ? <>
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
      {s.helpOpen && <HelpPanel onClose={() => editor.toggleHelp(false)} />}
    </div>
  );
}
