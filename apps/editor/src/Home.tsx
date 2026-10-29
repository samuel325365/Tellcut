// The home page (spec 2026-10-16-in-editor-chat §2.1): project cards on the left, the chat on the right — like claude.ai.
// Material for a new project comes from the import browser (the composer's ＋) as paths. The chat box can switch between the
// home conversation and any project's (the same conversation as in that project's editor), so work goes on from here.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ChatSession, type ChatApi } from './chat.ts';
import { ChatPanel } from './ChatPanel.tsx';
import { ImportDialog, type FsApi } from './ImportDialog.tsx';
import type { Attachment } from './attachments.ts';
import { DeleteDialog, type DeleteApi } from './DeleteDialog.tsx';
import { IconFilm, IconPlus, IconSpark, IconTrash } from './icons.tsx';
import { ThemeToggle } from './theme.tsx';
import { PresetStrip } from './PresetStrip.tsx';
import { PresetDialog } from './PresetDialog.tsx';
import { NewPresetDialog, type PresetApi } from './presets/MinePreset.tsx';
import { pickText, type ChatTask, type Lang, type PresetInfo } from '@tellcut/protocol';
import { t } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';
import { LangSwitch } from './LangSwitch.tsx';

type ProjectRow = { id: string; name?: string; duration?: number; width?: number; height?: number; poster?: { source: string; t: number } | null; error?: string; missing?: number };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const shape = (p: ProjectRow) => !p.width || !p.height ? '' : t(p.height > p.width * 1.05 ? 'home.shape.portrait' : p.width > p.height * 1.05 ? 'home.shape.landscape' : 'home.shape.square');
/** the conversation the home page's chat box shows, kept for the next visit (this browser only) */
const THREAD_KEY = 'tellcut.homeThread';
const savedThread = () => { try { return localStorage.getItem(THREAD_KEY) || 'home'; } catch { return 'home'; } };
const saveThread = (id: string) => { try { localStorage.setItem(THREAD_KEY, id); } catch { /* not kept */ } };
/** 主頁 is this browser's own draft conversation (home-xxxx): two people starting at once never share one; a new draft after it
 *  became a project or on 新對話 */
const DRAFT_KEY = 'tellcut.homeDraft';
const newDraft = () => { const d = `home-${Math.random().toString(36).slice(2, 12)}`; try { localStorage.setItem(DRAFT_KEY, d); } catch { /* not kept */ } return d; };
const savedDraft = () => { try { const d = localStorage.getItem(DRAFT_KEY); if (d && /^home-[a-z0-9]{6,24}$/.test(d)) return d; } catch { /* none */ } return newDraft(); };

const thumbOf = (p: ProjectRow) => p.poster ? `/api/projects/${encodeURIComponent(p.id)}/media/still?source=${encodeURIComponent(p.poster.source)}&t=${p.poster.t}&w=192` : null;

function Card({ p, onDelete }: { p: ProjectRow; onDelete: () => void }) {
  const [broken, setBroken] = useState(false);
  const thumb = broken ? null : thumbOf(p);
  return (
    <li>
      <a class="card" href={`?id=${encodeURIComponent(p.id)}`}>
        <span class="thumb">{thumb ? <img src={thumb} alt="" loading="lazy" onError={() => setBroken(true)} /> : <IconFilm size={18} />}</span>
        <span class="meta">
          <span class="title">{p.name ?? p.id}</span>
          {p.duration !== undefined && <small>{mmss(p.duration)}{shape(p) ? ` · ${shape(p)}` : ''}</small>}
          {p.error && <small class="err">{p.error}</small>}
          {!!p.missing && <small class="warn" data-missing data-tip={t('home.missingTip')}>{t('home.missing', { n: p.missing })}</small>}
        </span>
      </a>
      <button class="icon-btn card-del" data-delete={p.id} data-tip={t('home.deleteTip')} aria-label={t('home.deleteOf', { name: p.name ?? p.id })}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}><IconTrash size={15} /></button>
    </li>
  );
}

/** a request the gallery handed over ("change with the Agent" on a block of My blocks, spec 2026-10-29-my-library §3.4): sent once
 *  in the home chat, its task with it */
const PENDING = 'tellcut.pendingTask';
const hasPending = () => { try { return !!sessionStorage.getItem(PENDING); } catch { return false; } };
/** sends it when the home chat is free; while a reply runs it stays and goes when that turn ends (Home calls this again) */
function sendPending(session: ChatSession) {
  if (session.state.running) return;
  let x: { text?: unknown; task?: unknown } | null = null;
  try { x = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null'); sessionStorage.removeItem(PENDING); } catch { return; }
  if (x && typeof x.text === 'string' && x.task && typeof x.task === 'object') void session.send(x.text, undefined, x.task as ChatTask);
}

export function Home({ api }: { api: ChatApi & FsApi & DeleteApi & { projects(): Promise<ProjectRow[]>; presets?(): Promise<{ presets: PresetInfo[] }> } & Partial<PresetApi> }) {
  const lang: Lang = useLang();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const [importing, setImporting] = useState(false), [creating, setCreating] = useState(false);
  const [atts, setAtts] = useState<Attachment[]>([]);
  // the presets under the chat box (spec 2026-10-23-presets-and-languages §5): the one picked tags the next message
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [picked, setPicked] = useState<{ id: string; styles: string[]; fields: Record<string, string> } | null>(null), [info, setInfo] = useState<string | null>(null);
  // a preset's style examples picked in its dialog go into the chat box once (they are only words there, not part of the preset)
  const [append, setAppend] = useState<{ text: string; n: number }>({ text: '', n: 0 });
  const loadPresets = () => api.presets?.().then((r) => setPresets(r.presets), () => {});
  useEffect(() => { void loadPresets(); }, [api]);
  const pickedInfo = picked ? presets.find((p) => p.id === picked.id) : undefined, infoOf = info ? presets.find((p) => p.id === info) : undefined;
  const presetNames = useMemo(() => Object.fromEntries(presets.map((p) => [p.id, pickText(p.name, lang) ?? p.id])), [presets, lang]);
  // a request handed over from the gallery goes to the home chat, whichever conversation was open last
  const [thread, setThread] = useState(() => (hasPending() ? 'home' : savedThread())), [draft, setDraft] = useState(savedDraft);
  const pick = (id: string) => { setThread(id); saveThread(id); };
  /** the ticks of a conversation that just moved to the project it made: the same conversation goes on there with them */
  const carried = useRef<{ thread: string; sources: string[] } | null>(null);
  // 主頁 is the draft; a project's chat used from here says so with each message: its editor is not open
  const session = useMemo(() => {
    const s = new ChatSession(thread === 'home' ? draft : thread, api, 'home');
    if (carried.current?.thread === thread) s.setSources(carried.current.sources);
    carried.current = null;
    return s;
  }, [api, thread, draft]);
  /** the project list; false when the chosen project is gone (deleted): 主頁 then, its conversation never asked for (a 404) */
  const loadProjects = () => api.projects().then((ps) => {
    setProjects(ps);
    if (thread !== 'home' && !ps.some((p) => p.id === thread)) { pick('home'); return false; }
    return true;
  }).catch(() => true);
  useEffect(() => {
    session.onTurnEnd = () => { void loadProjects(); if (thread === 'home') sendPending(session); };   // a project the chat created shows up; a handed-over request waiting for the reply goes
    // the chat box follows the conversation there, its ticks with it (else the next message would send none); 主頁 starts afresh
    session.onMoved = (id) => { carried.current = { thread: id, sources: session.state.sources ?? [] }; void loadProjects(); setDraft(newDraft()); pick(id); };
    // a preset still tagged on 主頁 (back from another conversation, or a new draft): its ticks come with it on this session too
    if (thread === 'home' && pickedInfo) void session.presetSources(pickedInfo.sources ?? []);
    // 主頁's draft loads at once; a project's conversation once the list says the project is still there
    if (thread === 'home') { void loadProjects(); void session.load().then(() => sendPending(session)); }
    else void loadProjects().then((there) => { if (there) void session.load(); });
    return () => session.close();
  }, [session]);
  const current = projects.find((p) => p.id === thread), title = current?.name ?? thread;
  const add = (a: Attachment[]) => setAtts([...atts, ...a.filter((x) => !atts.some((y) => y.path === x.path))]);
  return (
    <div class="home">
      <aside class="home-side" data-home-projects>
        <div class="brand"><span class="logo"><IconFilm size={18} /></span>Tellcut<span class="grow" /><LangSwitch /><ThemeToggle /></div>
        <nav class="home-nav">
          <a class="gallery-link" href="?gallery" data-gallery-link><IconSpark size={17} /><span>{t('home.gallery')}<small>{t('home.galleryDesc')}</small></span></a>
        </nav>
        <h4>{t('home.projects')}<small>{projects.length || ''}</small></h4>
        <ul>{projects.map((p) => <Card p={p} onDelete={() => setDeleting(p)} />)}</ul>
      </aside>
      <main class="home-main">
        <header>
          <select class="thread-pick" data-thread data-tip={t('home.threadTip')} aria-label={t('home.threadTip')} value={thread}
            onChange={(e) => pick((e.target as HTMLSelectElement).value)}>
            <option value="home">{t('home.threadHome')}</option>
            {projects.filter((p) => !p.error).map((p) => <option value={p.id}>{p.name ?? p.id}</option>)}
          </select>
          {thread !== 'home' && <a class="open-editor" data-open-editor href={`?id=${encodeURIComponent(thread)}`}>{t('home.openEditor')}</a>}
          <span class="grow" />
          {thread === 'home'
            ? <button class="icon-btn" data-new-chat data-tip={t('home.newChat')} aria-label={t('home.newChat')} onClick={() => setDraft(newDraft())}><IconPlus size={16} /></button>
            : <button class="icon-btn" data-tip={t('home.clearChat')} aria-label={t('home.clearChat')} onClick={() => { if (confirm(t('home.clearConfirm', { name: title }))) void session.clear().catch(() => {}); }}><IconTrash size={16} /></button>}
        </header>
        <ChatPanel key={thread} session={session}
          hint={thread === 'home' ? t('home.hint') : t('home.chatOf', { name: title })}
          welcome={thread === 'home' ? { title: t('home.welcome'), below: <PresetStrip presets={presets} picked={picked?.id ?? null} onOpen={setInfo} onNew={typeof api.savePreset === 'function' ? () => setCreating(true) : undefined} /> } : undefined}
          preset={thread === 'home' && pickedInfo ? { info: pickedInfo, styles: picked!.styles, fields: picked!.fields } : null} onClearPreset={() => { setPicked(null); void session.presetSources([]); }} presetNames={presetNames} append={append}
          attachments={atts} onAttach={() => setImporting(true)} onDetach={(i) => setAtts(atts.filter((_, k) => k !== i))} onSent={() => { setAtts([]); setPicked(null); session.keepPresetSources(); }} />
      </main>
      {infoOf && <PresetDialog preset={infoOf} styles={picked?.id === infoOf.id ? picked.styles : []} fields={picked?.id === infoOf.id ? picked.fields : {}} onClose={() => setInfo(null)}
        api={typeof api.savePreset === 'function' ? api as PresetApi : undefined} onChanged={() => void loadPresets()}
        onGone={() => { if (picked?.id === infoOf.id) setPicked(null); void loadPresets(); }}
        onConfirm={(styles, fields, examples) => {
          setPicked({ id: infoOf.id, styles, fields }); setInfo(null); void session.presetSources(infoOf.sources ?? []);
          if (examples.length) setAppend((a) => ({ text: examples.join('\n'), n: a.n + 1 }));
        }} />}
      {creating && <NewPresetDialog api={api as PresetApi} onSaved={() => void loadPresets()} onClose={() => setCreating(false)} />}
      {importing && <ImportDialog api={api} onAdd={add} onClose={() => setImporting(false)} />}
      {deleting && <DeleteDialog project={{ id: deleting.id, name: deleting.name, thumb: thumbOf(deleting) }} api={api} onClose={() => setDeleting(null)}
        onDeleted={() => { setDeleting(null); void loadProjects(); }} />}
    </div>
  );
}
