// The 「交給 Agent」 dialog (spec 2026-10-16-right-click-claude §2.2): what is selected, the instruction, copy for the chat.
import { useEffect, useRef, useState } from 'preact/hooks';
import { askLines } from './ask.ts';
import type { EditorState } from './store.ts';
import { t } from './i18n/index.ts';

export function AskAgent({ s, editor }: { s: EditorState; editor: any }) {
  const a = s.ask!, [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null), manual = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => { if (a.state === 'manual') manual.current?.select(); }, [a.state]);
  const send = () => { if (text.trim() && a.state === 'edit') void editor.sendAskToChat(text); };
  const copy = () => { if (text.trim() && a.state === 'edit') void editor.sendAsk(text); };
  return (
    <div class="ask-dialog" data-ask onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); editor.closeAsk(); } }}>
      <h4>Ask Agent</h4>
      <ul class="ask-sel">{askLines(s.project!, a.selection, a.playhead).map((l) => <li>{l}</li>)}</ul>
      {a.state === 'copied' && <p class="ask-done">{t('ed.askCopied')}</p>}
      {a.state === 'manual' && <>
        <p>{t('ed.askManual')}</p>
        <textarea data-ask-manual ref={manual} readOnly rows={4} value={a.message ?? ''} />
        <div class="ask-buttons"><button onClick={() => editor.closeAsk()}>Close</button></div>
      </>}
      {(a.state === 'edit' || a.state === 'sending') && <>
        <textarea data-ask-text ref={box} rows={3} placeholder={t('ed.askPh')} value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !(e as any).isComposing) { e.preventDefault(); send(); } }} />
        {a.error && <p class="notice">{a.error}</p>}
        <div class="ask-buttons">
          <button onClick={() => editor.closeAsk()}>Cancel</button>
          <button data-tip={t('ed.askCopyTip')} aria-label={t('ed.askCopyTip')} disabled={!text.trim() || a.state === 'sending'} onClick={copy}>Copy</button>
          <button class="primary" disabled={!text.trim() || a.state === 'sending'} onClick={send}>Send</button>
        </div>
      </>}
    </div>
  );
}
