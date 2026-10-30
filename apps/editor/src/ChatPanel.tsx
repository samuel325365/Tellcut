// A chat thread on screen (spec 2026-10-16-in-editor-chat §2.3), the same on the home page and in the editor's 對話 tab:
// a welcome when empty, messages in a reading column, steps folded into one line, a composer with attached material.
// Labels follow the surface (English in the editor); explanations and status notes follow the chosen language on both.
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { pickText, type Lang, type PresetInfo } from '@tellcut/protocol';
import type { ChatMessage, ChatSession, ChatTool, Usage } from './chat.ts';
import { renderMarkdown } from './markdown.tsx';
import { withAttachments, type Attachment } from './attachments.ts';
import { listJoin, t, tn, uiLabel } from './i18n/index.ts';
import { getLang, useLang } from './i18n/lang.ts';
import { analysisText, chatErrorText, noticeText, toolText } from './i18n/format.ts';
import { IconArrowUp, IconPlug, IconPlus, IconSpark, IconStop, IconX, kindIcon } from './icons.tsx';
import { SourcePicker, sourceName } from './SourcePicker.tsx';
import type { SourceInfo } from '@tellcut/protocol';

function Steps({ tools }: { tools: ChatTool[] }) {
  const [open, setOpen] = useState(false), [detail, setDetail] = useState<number | null>(null);
  const denied = tools.filter((x) => x.kind === 'denied').length;
  return (
    <div class="steps">
      <button class="steps-fold" data-steps onClick={() => setOpen(!open)}>
        <span class={`caret${open ? ' open' : ''}`}>▸</span>{tn('chat.steps', tools.length)}{denied ? t('chat.denied', { n: denied }) : ''}
      </button>
      {open && <div class="tools">{tools.map((x, i) => (
        <div class={`tool k-${x.kind}`} data-tip={x.detail} onClick={() => setDetail(detail === i ? null : i)}>
          {toolText(x)}{detail === i && x.detail && <pre>{x.detail}</pre>}
        </div>
      ))}</div>}
    </div>
  );
}

const num = (n: number) => n.toLocaleString('en-US');
/** tokens in the language's own unit: 萬 / 万 (10,000) for zh and ja, k (1,000) for en */
export const tokensText = (n: number, lang: Lang = getLang()) => n < 10000 ? t('chat.tokens', { n: num(n) }, lang)
  : t('chat.tokensBig', { n: (n / (lang === 'en' ? 1000 : 10000)).toFixed(1) }, lang);
/** what Claude Code says the tokens would cost at Claude API prices — never what was charged: on a subscription nothing is */
export const costText = (usd: number) => t('chat.apiPrice', { usd: `US$${usd < 0.01 ? usd.toFixed(3) : usd.toFixed(2)}` });
const total = (u: Usage) => u.input + u.cacheWrite + u.cacheRead + u.output;
/** one reply: its tokens; the API price only in the tooltip (the film's estimate is the thread total) */
function UsageLine({ u }: { u: Usage }) {
  const tip = t('chat.usageTip', { input: num(u.input), cacheWrite: num(u.cacheWrite), cacheRead: num(u.cacheRead), output: num(u.output) });
  const full = u.cost !== undefined ? `${tip}\n${costText(u.cost)}\n${t('chat.priceNote')}` : tip;
  return <div class="usage" data-usage data-tip={full} aria-label={full}>{tokensText(total(u))}</div>;
}
/** the whole thread so far: tokens and, for the replies that recorded it, what they would cost at Claude API prices */
function ThreadTotal({ messages }: { messages: ChatMessage[] }) {
  const us = messages.map((m) => m.usage).filter((u): u is Usage => !!u);
  if (us.length < 2) return null;
  const priced = us.filter((u) => u.cost !== undefined), usd = priced.reduce((a, u) => a + u.cost!, 0);
  const sum = `${tokensText(us.reduce((a, u) => a + total(u), 0))}${priced.length ? ` · ${costText(usd)}` : ''}`;
  return <div class="usage thread-total" data-thread-total data-tip={t('chat.priceNote')} aria-label={t('chat.priceNote')}>
    {t('chat.threadTotal', { tokens: sum })}
    {priced.length && priced.length < us.length ? tn('chat.noPrice', us.length - priced.length) : ''}</div>;
}

function Message({ m, presetNames }: { m: ChatMessage; presetNames?: Record<string, string> }) {
  if (m.role === 'user') return (
    <div class="msg user">
      {m.preset && <span class="msg-preset" data-msg-preset>{presetNames?.[m.preset.id] ?? m.preset.id}</span>}
      {m.auto === 'analysis' ? t('chat.autoAnalysis') : m.auto === 'analysis-partial' ? t('chat.autoAnalysisPartial') : m.text}
    </div>
  );
  return (
    <div class="msg assistant">
      <span class="mark" aria-hidden="true"><IconSpark size={14} /></span>
      <div class="body">
        {m.tools?.length ? <Steps tools={m.tools} /> : null}
        {m.text && renderMarkdown(noticeText(m))}
        {m.status === 'stopped' && <div class="note">{t('chat.stopped')}</div>}
        {m.status === 'interrupted' && <div class="note">{t('chat.interrupted')}</div>}
        {m.status === 'error' && m.error && <div class="note err">{chatErrorText(m)}</div>}
        {m.usage && <UsageLine u={m.usage} />}
      </div>
    </div>
  );
}

export interface ChatPanelProps {
  session: ChatSession;
  /** where the panel sits: labels are English in the editor, the chosen language on the home page (default) */
  surface?: 'home' | 'editor';
  hint?: string;
  /** the home page's empty state: a title over the composer and suggestions that fill it */
  welcome?: { title: string; suggestions?: string[]; below?: ComponentChildren };
  attachments?: Attachment[];
  onAttach?: () => void;
  onDetach?: (i: number) => void;
  /** after a message went out (the home page clears its attachments) */
  onSent?: () => void;
  /** the preset picked on the home page, with the styles ticked and the options set in its dialog: a tag in the composer, sent with the message */
  preset?: { info: PresetInfo; styles: string[]; fields?: Record<string, string> } | null;
  onClearPreset?: () => void;
  /** preset id → the name to show on past messages that used it */
  presetNames?: Record<string, string>;
  /** words to put after what is in the box (a preset's style examples); a new `n` puts them in once */
  append?: { text: string; n: number };
}

export function ChatPanel({ session, surface = 'home', hint, welcome, attachments = [], onAttach, onDetach, onSent, preset, onClearPreset, presetNames, append }: ChatPanelProps) {
  const lang = useLang();
  const [, redraw] = useReducer((x: number) => x + 1, 0);
  useEffect(() => session.subscribe(redraw as () => void), [session]);
  const s = session.state, [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null), box = useRef<HTMLTextAreaElement>(null), atBottom = useRef(true);
  // follow new text only while the reader is at the bottom
  useEffect(() => { const el = list.current; if (el && atBottom.current) el.scrollTop = el.scrollHeight; });
  // the box grows with what is typed (up to a limit); a box not on screen (the editor's chat tab before it is opened) measures 0:
  // left to its CSS height then, not pinned at 0
  useEffect(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight ? `${Math.min(240, el.scrollHeight)}px` : ''; } }, [text]);
  // the API menu: the source list is asked for once, when the panel first shows
  const [picking, setPicking] = useState(false), [rows, setRows] = useState<SourceInfo[] | null>(null), [rowsError, setRowsError] = useState('');
  useEffect(() => {
    if (!session.picksSources) return;
    let gone = false;
    session.listSources().then((r) => { if (!gone) setRows(r.sources); }, (e: Error) => { if (!gone) setRowsError(e.message); });
    return () => { gone = true; };
  }, [session]);
  const picked = s.sources ?? [], pickedNames = picked.map((id) => sourceName(id, rows?.find((r) => r.id === id)?.label, surface));
  const closePicker = useCallback(() => setPicking(false), []);
  // a message the server refused comes back into the box (a typed-over box keeps what is in it)
  useEffect(() => { if (s.unsent !== undefined) { const x = session.takeUnsent?.(); if (x) setText((now) => now || x); } }, [s.unsent]);
  // only a new `n` puts words in: a panel made afresh (another thread, or back home) must not take the last ones again
  const appended = useRef(append?.n);
  useEffect(() => {
    if (!append?.text || append.n === appended.current) return;
    appended.current = append.n;
    setText((now) => (now ? `${now}\n${append.text}` : append.text));
    box.current?.focus();
  }, [append?.n]);
  const canSend = !s.running && (!!text.trim() || attachments.length > 0 || !!preset);
  const fieldCount = Object.keys(preset?.fields ?? {}).length;
  const send = () => {
    if (!canSend) return;
    void session.send(withAttachments(text, attachments, surface),preset ? { id: preset.info.id, styles: preset.styles, ...(fieldCount ? { fields: preset.fields } : {}) } : undefined);
    setText('');
    onSent?.();
  };
  const empty = !s.messages.length && !s.partial, attachKey = surface === 'editor' ? 'chat.attachEditor' : 'chat.attach';
  const composer = (
    <div class={`composer${empty && welcome ? ' big' : ''}`}>
      {(attachments.length > 0 || preset) && <div class="chips">{preset && <span class="chip preset-tag" data-preset-tag style={{ '--preset': preset.info.color }}>
        <i class="dot" />{pickText(preset.info.name, lang)}{preset.styles.length > 0 && <small>{tn('chat.styleCount', preset.styles.length, {}, surface === 'editor' ? 'en' : undefined)}</small>}
        {fieldCount > 0 && <small>{tn('chat.fieldCount', fieldCount, {}, surface === 'editor' ? 'en' : undefined)}</small>}
        {onClearPreset && <button class="chip-x" data-tip={t('chat.removePreset')} aria-label={t('chat.removePreset')} onClick={onClearPreset}><IconX size={12} /></button>}</span>}{attachments.map((a, i) => {
        const Icon = kindIcon(a.kind);
        return <span class="chip" data-chip data-tip={a.path}><Icon size={14} />{a.name}{a.kind === 'dir' && <small>{uiLabel('chat.folder', surface)}</small>}
          {onDetach && <button class="chip-x" data-tip={t('chat.remove')} aria-label={t('chat.remove')} onClick={() => onDetach(i)}><IconX size={12} /></button>}</span>;
      })}</div>}
      <textarea data-chat-input ref={box} rows={1} value={text} placeholder={t(empty && welcome ? 'chat.phWelcome' : 'chat.phReply')} data-tip={t('chat.inputTip')}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !(e as any).isComposing) { e.preventDefault(); send(); } }} />
      <div class="composer-bar">
        {onAttach && <button class="icon-btn" data-attach data-tip={t(attachKey)} aria-label={t(attachKey)} onClick={onAttach}><IconPlus /></button>}
        {/* the count on the button and the names in its tip: no tag above the words (a new row made the home page's centred welcome jump) */}
        {session.picksSources && <button class="api-btn" data-api aria-expanded={picking} data-tip={picked.length ? `${t('api.tagTip')}\n${listJoin(pickedNames)}` : t('api.buttonTip')}
          aria-label={t('api.buttonTip')} onClick={() => setPicking(!picking)}>
          <IconPlug size={16} />{uiLabel('api.button', surface)}{picked.length > 0 && <span class="n">{picked.length}</span>}</button>}
        <span class="grow" />
        {s.running
          ? <button class="round stop" data-chat-stop data-tip={t('chat.stop')} aria-label={t('chat.stop')} onClick={() => void session.stop()}><IconStop /></button>
          : <button class="round send" data-chat-send data-tip={t('chat.send')} aria-label={t('chat.send')} disabled={!canSend} onClick={send}><IconArrowUp /></button>}
      </div>
      {picking && <SourcePicker rows={rows} error={rowsError} picked={picked} surface={surface} onClose={closePicker}
        onToggle={(id) => { const now = session.state.sources ?? []; void session.setSources(now.includes(id) ? now.filter((x) => x !== id) : [...now, id]); }}
        onClear={() => void session.setSources([])} />}
    </div>
  );
  if (empty && welcome) return (
    <div class="chat welcome-mode" data-chat>
      <div class="welcome">
        <h2><span class="mark"><IconSpark size={22} /></span>{welcome.title}</h2>
        {composer}
        {welcome.suggestions && <div class="suggest">{welcome.suggestions.map((x) => <button data-suggest onClick={() => { setText(x); box.current?.focus(); }}>{x}</button>)}</div>}
        {welcome.below}
        {s.error && <div class="chat-error">{s.error}</div>}
      </div>
    </div>
  );
  const last = s.partial?.tools.at(-1);
  return (
    <div class="chat" data-chat>
      <div class="msgs" ref={list} onScroll={(e) => { const el = e.currentTarget as HTMLDivElement; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
        <div class="column">
          {empty && hint && <p class="hint">{hint}</p>}
          {s.messages.map((m) => <Message m={m} presetNames={presetNames} />)}
          {!s.partial && <ThreadTotal messages={s.messages} />}
          {s.analyzing && !s.running && <div class="note analyzing" data-analyzing><span class="dots"><i /><i /><i /></span>{t('chat.analysing', { what: s.analysis ? analysisText(s.analysis) : s.analyzing })}</div>}
          {s.partial && <div class="msg assistant running">
            <span class="mark" aria-hidden="true"><IconSpark size={14} /></span>
            <div class="body">
              {s.partial.text ? renderMarkdown(s.partial.text) : null}
              <div class="working"><span class="dots"><i /><i /><i /></span>{last ? toolText(last) : t('chat.working')}</div>
            </div>
          </div>}
        </div>
      </div>
      {s.error && !s.running && <div class="chat-error">{s.error}</div>}
      <div class="dock">{composer}</div>
    </div>
  );
}
