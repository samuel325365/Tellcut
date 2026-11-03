// The block gallery page (`/editor/?gallery`, spec 2026-10-17-block-gallery; three columns since 2026-10-20-home-gallery-refresh §6):
// categories, a grid of cards that show what each block looks like, and a detail panel that is never empty — the first card is picked
// on arrival, and again whenever a tab, category or search leaves the pick out. Cards show the name Claude uses and the handle
// people point with (MRK-03, spec 2026-10-22-block-handles); the search finds either. Opened from a project's editor (gallery-link.ts) it lists
// that project's own blocks first and each detail offers "Add to project", which adds at the playhead of the tab that opened it.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Project } from '@tellcut/engine';
import { libraryPlayer, PlayerPreview, projectPlayer } from './PlayerPreview.tsx';
import { ParamField } from './fields.tsx';
import { blockCategory, blockProject, byHandle, CLIP_CATEGORY, filterGallery, matches, galleryCategories, MINE_CATEGORY, mineProject, ownProject, PROJECT_CATEGORY, scoreUrl, sfxProject, sfxSections, shown, THEMES, type GalleryBlock, type GalleryIndex, type GalleryRecipe, type GallerySfx, type GalleryStyle, type OwnProject, type Tab } from './gallery.ts';
import type { AddAnswer, GalleryAdd } from './gallery-link.ts';
import { IconMusic, IconPlay, IconSpark, IconTrash } from './icons.tsx';
import { ThemeToggle } from './theme.tsx';
import { LangSwitch } from './LangSwitch.tsx';
import { tip } from './tip.ts';
import { errText, nameList, t, type Key } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';
import { blockText } from './i18n/blocks.ts';
import { localValues } from './i18n/values.ts';
import { CLIP_FX, handleOf, type ClipFx, type LibraryBlockInfo, type LibraryIndex, type LibraryStyleInfo, type LibraryUsage } from '@tellcut/protocol';
import { getLang } from './i18n/lang.ts';

const TABS: Tab[] = ['blocks', 'sfx', 'styles', 'recipes'];
const ALL = 'all';
/** what ParamField needs of a project: no material, and the theme the preview shows (so themed defaults show as such) */
const fieldProject = (themeId = 'none') => ({ sources: {}, media: {}, meta: { theme: THEMES[themeId]?.theme } }) as unknown as Project;

/** copies a text on click (without picking the card under it); true for a moment after */
function useCopy(): [boolean, (e: Event, text: string) => void] {
  const [done, setDone] = useState(false);
  return [done, (e, text) => { e.stopPropagation(); void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }];
}

function CopyName({ name }: { name: string }) {
  const [done, copy] = useCopy();
  return (
    <button class="copy" data-card-type {...tip(t('gallery.copyName', { name }))} onClick={(e) => copy(e, name)}>
      <code>{name}</code>{done ? ' ✓' : ''}
    </button>
  );
}

/** the handle of a block, sound, style (style:<id>), recipe (recipe:<id>) or clip effect: what people say to Claude; a click copies it */
function Handle({ id }: { id: string }) {
  const [done, copy] = useCopy(), h = handleOf(id);
  if (!h) return null;
  return <button class="handle" data-card-handle data-handle={h} {...tip(t('gallery.copyHandle', { handle: h }))} onClick={(e) => copy(e, h)}>{h}{done ? ' ✓' : ''}</button>;
}

function Params({ type, defs, values, onChange, theme }: { type: string; defs: GalleryBlock['params']; values: Record<string, unknown>; onChange: (k: string, v: unknown) => void; theme?: string }) {
  if (!defs.length) return <p class="dim" data-params>{t('gallery.noParams')}</p>;
  // data-params: the parameter NAMES follow the language (params.en/ja.ts), and so do the words a block starts with (values.en/ja.ts,
  // passed in as values); options and what the user types never do
  return <div class="g-params" data-params>{defs.map((d) => <ParamField def={d} type={type} surface="gallery" value={values[d.key]} project={fieldProject(theme)} onCommit={(v) => onChange(d.key, v)} />)}</div>;
}

/** `id`: what the handle is registered under, when it is not the name (style:<id>, recipe:<id>) */
const Head = ({ label, name, id = name }: { label: string; name: string; id?: string }) => <header class="g-head"><h2>{label}</h2><Handle id={id} /><CopyName name={name} /></header>;

// ---------------------------------------------------------------- opened from a project (gallery-link.ts)
/** the project the gallery was opened from: its own blocks, and adding to it through the editor tab that opened the gallery */
export interface GalleryProject {
  id: string;
  load: () => Promise<OwnProject>;
  add: (a: GalleryAdd) => Promise<AddAnswer>;
}
type ToProject = { project: GalleryProject; name: string };

/** "Add to project": what the detail shows, at the playhead of the project's editor tab. `scene`: a background or frame, which the
 *  editor only takes in place of one already there (the library's Add refuses it too). */
function AddBar({ to, add, scene = false }: { to?: ToProject; add: GalleryAdd; scene?: boolean }) {
  const [state, setState] = useState<{ busy: boolean; key: string; answer?: AddAnswer }>({ busy: false, key: '' });
  if (!to) return null;
  const key = `${add.kind}:${add.type}`, answer = state.key === key ? state.answer : undefined;   // a card picked since: its own status
  const go = async () => {
    setState({ busy: true, key });
    const a = await to.project.add(add).catch((e: Error): AddAnswer => ({ ok: false, notice: errText(e) }));
    setState({ busy: false, key, answer: a });
  };
  return (
    <div class="g-add" data-gallery-add-bar>
      <button class="primary" data-gallery-add disabled={scene || state.busy} {...tip(scene ? t('ed.sceneAdd') : t('gallery.addTip', { name: to.name }))} onClick={() => void go()}>
        {state.busy && state.key === key ? t('gallery.adding') : t('gallery.add')}</button>
      {answer && <span class={answer.ok ? 'dim' : 'err'} role="status" data-add-status>{answer.ok ? t('gallery.added', { name: to.name }) : answer.notice ?? ''}</span>}
    </div>
  );
}

/** values someone set on `name`; another name starts from its defaults (in the same render: no frame of the old values) */
function useParams(name: string): [Record<string, unknown>, (p: Record<string, unknown>) => void] {
  const [set, setSet] = useState<{ name: string; params: Record<string, unknown> }>({ name, params: {} });
  return [set.name === name ? set.params : {}, (params) => setSet({ name, params })];
}

/** a shared block, or (`own`) one of the project's own, whose modules the preview loads from the project folder */
function BlockDetail({ b, to, own }: { b: GalleryBlock; to?: ToProject; own?: OwnProject }) {
  const id = own ? `own:${b.type}` : b.type;
  const [set, setParams] = useParams(id), [theme, setTheme] = useState('none'), [n, setN] = useState(0), x = shown(b.type, b);
  // the block as it would be added in this UI language: its Chinese words in that language, under what the user changed
  const params = { ...localValues(b.type, b.params), ...set };
  return (
    <section class="g-detail" data-detail={id}>
      <Head label={x.label} name={b.type} />
      {own && to ? <PlayerPreview project={ownProject(own, b, params, theme)} playKey={n} src={projectPlayer(to.project.id)} /> : <PlayerPreview project={blockProject(b, params, theme)} playKey={n} />}
      <div class="g-bar">
        <label>{t('gallery.theme')} <select value={theme} onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}>{Object.keys(THEMES).map((k) => <option value={k}>{t(`gallery.theme.${k}` as Key)}</option>)}</select></label>
        <button onClick={() => setN(n + 1)}>{t('gallery.replay')}</button>
        <button onClick={() => setParams({})}>{t('gallery.resetParams')}</button>
      </div>
      {/* only what the user changed goes along: the editor starts the rest from the defaults in its own language */}
      <AddBar to={to} add={{ kind: 'block', type: b.type, ...(Object.keys(set).length ? { params: set } : {}) }} scene={b.kind === 'scene'} />
      <p class="g-doc">{x.doc || <span class="dim">{t('gallery.noDoc')}</span>}</p>
      {b.needsMedia && <p class="g-warn" data-needs-media>{t('gallery.needsMediaWarn')}</p>}
      <h3>{t('gallery.params')}</h3>
      <Params type={b.type} defs={b.params} values={params} theme={theme} onChange={(k, v) => setParams({ ...set, [k]: v })} />
    </section>
  );
}

function ClipDetail({ f }: { f: ClipFx }) {
  const x = shown(f.key, f);
  return (
    <section class="g-detail" data-detail={f.key}>
      <header class="g-head"><h2>{x.label}</h2><Handle id={f.key} /></header>
      <p class="g-doc">{x.doc}</p>
      <h3>{t('gallery.clipCode')} <CopyName name={f.code} /></h3>
      <pre>{f.code}</pre>
      <p class="dim">{t('gallery.clipNote')}</p>
    </section>
  );
}

function SfxDetail({ s, plays, to }: { s: GallerySfx; plays: number; to?: ToProject }) {
  const [params, setParams] = useParams(s.type), [n, setN] = useState(0), x = shown(s.type, s);
  return (
    <section class="g-detail" data-detail={s.type}>
      <Head label={x.label} name={s.type} />
      <p class="g-doc">{x.doc || <span class="dim">{t('gallery.noDocShort')}</span>}</p>
      <div class="g-bar"><button class="g-play" onClick={() => setN(n + 1)}><IconPlay size={12} /> {t('gallery.listenAgain')}</button></div>
      <AddBar to={to} add={{ kind: 'sfx', type: s.type, ...(Object.keys(params).length ? { params } : {}) }} />
      <div class="g-hidden-player"><PlayerPreview project={sfxProject(s, params)} loop={false} autoplay={false} playKey={n + plays} /></div>
      <h3>{t('gallery.params')}</h3>
      <Params type={s.type} defs={s.params} values={params} onChange={(k, v) => setParams({ ...params, [k]: v })} />
    </section>
  );
}

function StyleDetail({ s }: { s: GalleryStyle }) {
  const [seed, setSeed] = useState(1), [bpm, setBpm] = useState(''), [key, setKey] = useState(''), x = shown(`style:${s.id}`, s);
  return (
    <section class="g-detail" data-detail={s.id}>
      <Head label={x.label} name={s.id} id={`style:${s.id}`} />
      <p class="g-doc">{x.doc}</p>
      <p class="dim">{t(s.origin === 'library' ? 'gallery.originLibrary' : 'gallery.originBuiltin')}; {t('gallery.styleInfo', { bpm: s.defaults.bpm, key: s.defaults.key })}<code>c.score('{s.id}')</code></p>
      <div class="g-bar">
        <label>seed <input type="number" value={seed} min={1} onChange={(e) => setSeed(Number((e.target as HTMLInputElement).value) || 1)} /></label>
        <label>{t('gallery.tempo')} <input type="number" placeholder={String(s.defaults.bpm)} value={bpm} onChange={(e) => setBpm((e.target as HTMLInputElement).value)} /></label>
        <label>{t('gallery.key')} <input placeholder={s.defaults.key} value={key} onChange={(e) => setKey((e.target as HTMLInputElement).value.trim())} /></label>
      </div>
      <audio controls preload="none" src={scoreUrl(s.id, { seed, bpm: Number(bpm) || undefined, key: key || undefined })} />
      <p class="dim">{t('gallery.scoreNote')}</p>
    </section>
  );
}

function RecipeDetail({ r }: { r: GalleryRecipe }) {
  const text = JSON.stringify(r.example, null, 2), x = blockText(`recipe:${r.id}`, r), notes = x.notes ?? [];
  return (
    <section class="g-detail" data-detail={r.id}>
      <Head label={x.label} name={r.id} id={`recipe:${r.id}`} />
      <p class="g-doc">{x.doc}</p>
      {notes.length > 0 && <ul class="g-notes">{notes.map((n) => <li>{n}</li>)}</ul>}
      <h3>{t('gallery.example')} <button onClick={() => void navigator.clipboard?.writeText(`c.recipe('${r.id}', ${text});`)}>{t('gallery.copy')}</button></h3>
      <pre>{text}</pre>
    </section>
  );
}


// ---------------------------------------------------------------- Mine: the user's own blocks and music styles (spec 2026-10-29-my-library §3.4)
/** what the page needs of My blocks; absent, the page shows no Mine */
export interface GalleryLibrary {
  load: () => Promise<LibraryIndex>;
  renameBlock: (slug: string, type: string, b: { name?: string; desc?: string }) => Promise<unknown>;
  renameStyle: (slug: string, b: { name?: string; desc?: string }) => Promise<unknown>;
  usage: (kind: 'blocks' | 'styles', slug: string) => Promise<LibraryUsage>;
  remove: (kind: 'blocks' | 'styles', slug: string) => Promise<unknown>;
}
// the project by its name (its id when it has none, or is gone)
const fromLine = (x: { from: { project: string; name?: string }; savedAt: string }) => t('lib.fromProject', { project: x.from.name || x.from.project, date: new Date(x.savedAt).toLocaleDateString(getLang()) });
const PENDING = 'tellcut.pendingTask';

/** Rename, change with the Agent (blocks), delete: each opens its own small form under the buttons. `group`: the names of the
 *  entry's other blocks, deleted with it. `ask`: a count the card's trash button (or its Delete key) raises, which opens the delete
 *  confirmation; `onAsked` takes the request back once it has, so the card picked again later does not open it by itself. */
function MineActions({ kind, slug, type, name, desc, group, lib, onChanged, navigate, ask = 0, onAsked }: { kind: 'blocks' | 'styles'; slug: string; type: string; name: string; desc: string;
  group: string[]; lib: GalleryLibrary; onChanged: () => void; navigate: (url: string) => void; ask?: number; onAsked?: () => void }) {
  const [mode, setMode] = useState<null | 'rename' | 'agent' | 'delete'>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [nm, setNm] = useState(name), [ds, setDs] = useState(desc), [request, setRequest] = useState(''), [usage, setUsage] = useState<LibraryUsage | null>(null);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setError(''); try { await f(); setMode(null); onChanged(); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  const open = async (m: 'rename' | 'agent' | 'delete') => {
    setError(''); setNm(name); setDs(desc); setMode(m);
    if (m === 'delete') { setUsage(null); try { setUsage(await lib.usage(kind, slug)); } catch (e) { setError(errText(e)); } }
  };
  const confirmBox = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ask) { void open('delete'); onAsked?.(); } }, [ask]);
  useEffect(() => { if (mode === 'delete') confirmBox.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [mode]);
  const handOff = () => {
    const r = request.trim();
    if (!r) return;
    // the home page sends it in its chat when it opens (Home.tsx); the task tells the agent where the entry is
    try { sessionStorage.setItem(PENDING, JSON.stringify({ text: t('lib.editMsg', { name, request: r }), task: { kind: 'library-edit', slug, type, request: r } })); } catch { /* storage blocked */ }
    navigate('./');
  };
  return (
    <div class="g-mine-actions">
      <div class="g-bar">
        <button data-mine-rename onClick={() => void open('rename')}>{t('lib.rename')}</button>
        {kind === 'blocks' && <button data-mine-agent onClick={() => void open('agent')}>{t('lib.agentEdit')}</button>}
        <button class="danger" data-mine-delete onClick={() => void open('delete')}>{t('lib.delete')}</button>
      </div>
      {mode === 'rename' && <div class="g-mine-form">
        <label>{t('lib.name')}<input data-mine-name value={nm} maxLength={60} onInput={(e) => setNm((e.target as HTMLInputElement).value)} /></label>
        <label>{t('lib.desc')}<input data-mine-desc value={ds} maxLength={200} placeholder={t('lib.descPh')} onInput={(e) => setDs((e.target as HTMLInputElement).value)} /></label>
        <div class="g-bar"><button onClick={() => setMode(null)} disabled={busy}>{t('lib.cancel')}</button>
          <button class="primary" data-mine-rename-save disabled={busy || !nm.trim()} onClick={() => void run(() => (kind === 'blocks' ? lib.renameBlock(slug, type, { name: nm.trim(), desc: ds.trim() }) : lib.renameStyle(slug, { name: nm.trim(), desc: ds.trim() })))}>{t('lib.renameSave')}</button></div>
      </div>}
      {mode === 'agent' && <div class="g-mine-form">
        <textarea data-mine-request rows={3} placeholder={t('lib.agentEditPh')} value={request} onInput={(e) => setRequest((e.target as HTMLTextAreaElement).value)} />
        <p class="dim">{t('lib.agentEditNote')}</p>
        <div class="g-bar"><button onClick={() => setMode(null)}>{t('lib.cancel')}</button>
          <button class="primary" data-mine-agent-send disabled={!request.trim()} onClick={handOff}>{t('lib.handOff')}</button></div>
      </div>}
      {mode === 'delete' && <div ref={confirmBox} class="g-mine-form g-mine-confirm" data-mine-confirm role="alertdialog">
        <strong>{t('lib.deleteTitle', { name })}</strong>
        {usage ? <>
          <p>{usage.projects ? t('lib.deleteProjects', { n: usage.projects }) : t('lib.deleteNoProjects')}</p>
          {usage.presets.length > 0 && <p class="warn">{t('lib.deletePresets', { names: nameList(usage.presets) })}</p>}
          {group.length > 0 && <p class="warn">{t('lib.deleteGroup', { names: nameList(group) })}</p>}
        </> : !error && <p class="dim">…</p>}
        <div class="g-bar"><button onClick={() => setMode(null)} disabled={busy}>{t('lib.cancel')}</button>
          <button class="danger" data-mine-delete-confirm disabled={busy || !usage} onClick={() => void run(() => lib.remove(kind, slug))}>{t('lib.delete')}</button></div>
      </div>}
      {error && <p class="err" role="alert">{error}</p>}
    </div>
  );
}

function MineDetail({ b, all, lib, onChanged, navigate, ask, onAsked, to }: { b: LibraryBlockInfo; all: LibraryBlockInfo[]; lib: GalleryLibrary; onChanged: () => void; navigate: (url: string) => void; ask: number; onAsked: () => void; to?: ToProject }) {
  const id = `mine:${b.type}`, [params, setParams] = useParams(id), [theme, setTheme] = useState('none'), [n, setN] = useState(0);
  return (
    <section class="g-detail" data-detail={id}>
      <header class="g-head"><h2>{b.name}</h2><span class="g-sub">{fromLine(b)}</span></header>
      <PlayerPreview project={mineProject(b, params, theme)} playKey={n} src={libraryPlayer(b.slug)} />
      <div class="g-bar">
        <label>{t('gallery.theme')} <select value={theme} onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}>{Object.keys(THEMES).map((k) => <option value={k}>{t(`gallery.theme.${k}` as Key)}</option>)}</select></label>
        <button onClick={() => setN(n + 1)}>{t('gallery.replay')}</button>
        <button onClick={() => setParams({})}>{t('gallery.resetParams')}</button>
      </div>
      {/* the entry is copied into the project first, as the library's Add does; it starts from its own defaults */}
      <AddBar to={to} add={{ kind: 'mine', type: b.type, slug: b.slug, blockKind: b.kind }} scene={b.kind === 'scene'} />
      <p class="g-doc">{b.desc || <span class="dim">{t('gallery.noDoc')}</span>}</p>
      <MineActions key={id} kind="blocks" slug={b.slug} type={b.type} name={b.name} desc={b.desc} lib={lib} onChanged={onChanged} navigate={navigate} ask={ask} onAsked={onAsked}
        group={b.group.map((x) => all.find((y) => y.type === x)?.name ?? x)} />
      <h3>{t('gallery.params')}</h3>
      <Params type={b.type} defs={b.params} values={params} theme={theme} onChange={(k, v) => setParams({ ...params, [k]: v })} />
    </section>
  );
}

function MineStyleDetail({ s, lib, onChanged, navigate, ask, onAsked }: { s: LibraryStyleInfo; lib: GalleryLibrary; onChanged: () => void; navigate: (url: string) => void; ask: number; onAsked: () => void }) {
  const [seed, setSeed] = useState(1), id = `mine-style:${s.id}`;
  return (
    <section class="g-detail" data-detail={id}>
      <header class="g-head"><h2>{s.name}</h2><span class="g-sub">{fromLine(s)}</span></header>
      <p class="g-doc">{s.desc || <span class="dim">{t('gallery.noDoc')}</span>}</p>
      <p class="dim">{t('gallery.styleInfo', { bpm: s.defaults.bpm, key: s.defaults.key })}</p>
      <div class="g-bar"><label>seed <input type="number" value={seed} min={1} onChange={(e) => setSeed(Number((e.target as HTMLInputElement).value) || 1)} /></label></div>
      <audio controls preload="none" src={scoreUrl(s.id, { seed })} />
      <p class="dim">{t('lib.styleUse')}</p>
      <MineActions key={id} kind="styles" slug={s.slug} type={s.id} name={s.name} desc={s.desc} group={[]} lib={lib} onChanged={onChanged} navigate={navigate} ask={ask} onAsked={onAsked} />
    </section>
  );
}

/** a shared block's thumbnail in the UI language: the server gives the translated picture where the golden one shows Chinese */
export const thumbIn = (src: string | undefined, lang: string) => (src && lang !== 'zh' ? `${src}?lang=${lang}` : src);

/** a block's golden picture; the category's mark when it has none (or it fails to load) */
function Thumb({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  return <span class="g-thumb">{src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <IconSpark size={22} />}</span>;
}

export function Gallery({ load, library, project, navigate = (u) => location.assign(u) }: { load: () => Promise<GalleryIndex>; library?: GalleryLibrary; project?: GalleryProject; navigate?: (url: string) => void }) {
  useLang();   // the language switch re-renders the whole page
  const [g, setG] = useState<GalleryIndex | null>(null), [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('blocks'), [q, setQ] = useState(''), [cat, setCat] = useState(ALL);
  const [picked, setPicked] = useState<string | null>(null), [plays, setPlays] = useState(0);
  // a card of Mine asked to be deleted: which, and a count so asking again on the same card opens the confirmation again;
  // the name is cleared once the confirmation opened (one-shot: a detail mounted again later must not reopen it)
  const [del, setDel] = useState<{ name: string; n: number }>({ name: '', n: 0 });
  const asked = () => setDel((d) => ({ name: '', n: d.n }));
  useEffect(() => { load().then(setG, (e: Error) => setErr(e.message)); }, []);
  // My blocks: loaded alongside, again after a rename or delete; a failure leaves Mine empty (with its note) rather than the page broken
  const [lib, setLib] = useState<LibraryIndex | null>(null), [libErr, setLibErr] = useState('');
  const reloadLib = () => library?.load().then((x) => { setLib(x); setLibErr(''); }, (e: Error) => { setLib({ blocks: [], styles: [] }); setLibErr(e.message); });
  useEffect(() => { void reloadLib(); }, []);
  // the project it was opened from: its own blocks; a failure says so above them and leaves the rest of the page as it is
  const [own, setOwn] = useState<OwnProject | null>(null), [ownErr, setOwnErr] = useState('');
  useEffect(() => { project?.load().then(setOwn, (e: Error) => setOwnErr(errText(e))); }, []);
  if (err) return <div class="gallery g-message"><p class="err">{t('gallery.loadFail', { err })}</p></div>;
  if (!g) return <div class="gallery g-message"><p class="dim">{t('gallery.loading')}</p></div>;

  const needle = q.trim().toLowerCase();
  const clips = CLIP_FX.filter((f) => matches(q, handleOf(f.key), f.label, f.doc, f.code, shown(f.key, f).label, shown(f.key, f).doc));
  const mineBlocks = (lib?.blocks ?? []).filter((b) => matches(q, undefined, b.type, b.name, b.desc)), mineStyles = (lib?.styles ?? []).filter((x) => matches(q, undefined, x.id, x.name, x.desc));
  const ownList = (own?.blocks ?? []).filter((b) => matches(q, undefined, b.type, b.label, b.doc, shown(b.type, b).label));
  const to: ToProject | undefined = project && { project, name: own?.name || project.id };
  const cats = galleryCategories(g.blocks, CLIP_FX.length, library ? (lib?.blocks.length ?? 0) : undefined, own?.blocks.length ?? 0);
  const showOwn = tab === 'blocks' && (cat === ALL || cat === PROJECT_CATEGORY) && (ownList.length > 0 || !!ownErr);
  const showMine = !!library && tab === 'blocks' && (cat === ALL || cat === MINE_CATEGORY);
  const list = filterGallery(g, tab, q);
  // what the grid shows, in order: blocks (by category, or one category) then clip effects; or the tab's list
  const sections = tab !== 'blocks' ? [] : cats.filter((c) => cat === ALL || c.key === cat).map((c) => ({ ...c,
    blocks: c.key === CLIP_CATEGORY ? [] : (list as GalleryBlock[]).filter((b) => blockCategory(b) === c.key).sort((a, b) => byHandle(a.type, b.type)),
    clips: c.key === CLIP_CATEGORY ? clips : [] })).filter((x) => x.blocks.length || x.clips.length);
  const names = tab === 'blocks' ? [...(showOwn ? ownList.map((b) => `own:${b.type}`) : []), ...(showMine ? mineBlocks.map((b) => `mine:${b.type}`) : []), ...sections.flatMap((x) => [...x.blocks.map((b) => b.type), ...x.clips.map((f) => f.key)])]
    : tab === 'sfx' ? sfxSections(list as GallerySfx[]).flatMap((x) => x.sfx.map((s) => s.type)) : tab === 'styles' ? [...mineStyles.map((x) => `mine-style:${x.id}`), ...(list as GalleryStyle[]).map((s) => s.id)] : (list as GalleryRecipe[]).map((r) => r.id);
  const on = picked && names.includes(picked) ? picked : names[0] ?? null;
  const pick = (name: string) => { setPicked(name); setPlays(plays + 1); };
  // only Mine's cards can be deleted: a trash button at the corner on hover and the Delete key both pick the card and open its confirmation
  const askDelete = (name: string) => { setPicked(name); setDel((d) => ({ name, n: d.n + 1 })); };
  const card = (name: string, title: string, body: preact.ComponentChildren, extra = '', deletable = false) => (
    <li class={`${on === name ? 'on' : ''} ${extra}`} data-card={name} {...tip(title)} role="button" aria-pressed={on === name} tabIndex={0} onClick={() => pick(name)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(name); }
        else if (deletable && e.key === 'Delete') { e.preventDefault(); askDelete(name); }
      }}>{body}
      {deletable && <button class="icon-btn g-card-del" data-card-delete={name} {...tip(t('lib.deleteTip'))}
        onClick={(e) => { e.stopPropagation(); askDelete(name); }}><IconTrash size={14} /></button>}</li>
  );
  const blockCard = (b: GalleryBlock) => card(b.type, shown(b.type, b).doc, <>
    <Thumb src={thumbIn(b.thumb, getLang())} />
    <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(b.type, b).label)}>{shown(b.type, b).label}</strong><Handle id={b.type} /><CopyName name={b.type} />{b.needsMedia && <span class="tag">{t('gallery.needsMedia')}</span>}</span>
  </>);
  // the project's own: no golden picture; the tag says whose it is wherever the card shows
  const ownCard = (b: GalleryBlock) => card(`own:${b.type}`, shown(b.type, b).doc, <>
    <Thumb />
    <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(b.type, b).label)}>{shown(b.type, b).label}</strong><span class="tag" data-own-tag>{t('gallery.ownTag')}</span><CopyName name={b.type} />{b.needsMedia && <span class="tag">{t('gallery.needsMedia')}</span>}</span>
  </>, 'g-own');
  const mineCard = (b: LibraryBlockInfo) => card(`mine:${b.type}`, b.desc, <>
    <Thumb src={b.thumb ?? undefined} />
    <span class="g-card-body card-lines"><strong data-card-name {...tip(b.name)}>{b.name}</strong><span class="g-sub">{fromLine(b)}</span></span>
  </>, '', true);
  const clipCard = (f: ClipFx) => card(f.key, shown(f.key, f).doc, <>
    <span class="g-thumb g-thumb-icon"><IconSpark size={22} /></span>
    <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(f.key, f).label)}>{shown(f.key, f).label}</strong><Handle id={f.key} /><span class="g-sub">{t('gallery.clipSub')}</span></span>
  </>);

  const detail = () => {
    if (!on) return <p class="dim g-hint">{t('gallery.emptyHint')}</p>;
    if (on.startsWith('own:') && own) { const b = own.blocks.find((x) => `own:${x.type}` === on); return b && <BlockDetail b={b} own={own} to={to} />; }
    if (on.startsWith('mine:') && library) { const b = lib?.blocks.find((x) => `mine:${x.type}` === on); return b && <MineDetail b={b} all={lib!.blocks} lib={library} onChanged={() => void reloadLib()} navigate={navigate} ask={del.name === on ? del.n : 0} onAsked={asked} to={to} />; }
    if (on.startsWith('mine-style:') && library) { const x = lib?.styles.find((y) => `mine-style:${y.id}` === on); return x && <MineStyleDetail s={x} lib={library} onChanged={() => void reloadLib()} navigate={navigate} ask={del.name === on ? del.n : 0} onAsked={asked} />; }
    if (tab === 'blocks') {
      const b = g.blocks.find((x) => x.type === on), f = CLIP_FX.find((x) => x.key === on);
      return b ? <BlockDetail b={b} to={to} /> : f ? <ClipDetail f={f} /> : null;
    }
    if (tab === 'sfx') { const s = g.sfx.find((x) => x.type === on); return s && <SfxDetail s={s} plays={plays} to={to} />; }
    if (tab === 'styles') { const s = g.styles.find((x) => x.id === on); return s && <StyleDetail s={s} />; }
    const r = g.recipes.find((x) => x.id === on); return r && <RecipeDetail r={r} />;
  };

  return (
    <div class="gallery">
      <aside class="g-nav">
        <div class="g-top"><a href="./" class="back">{t('gallery.back')}</a><span class="grow" /><LangSwitch /><ThemeToggle /></div>
        <h1>{t('gallery.title')}</h1>
        <p class="g-lede">{t('gallery.lede')}</p>
        {tab === 'blocks' && <nav class="g-cats" aria-label={t('gallery.cats')}>
          <button class={cat === ALL ? 'on' : ''} data-cat={ALL} onClick={() => setCat(ALL)}>{t('gallery.all')}<small>{g.blocks.length + CLIP_FX.length + (lib?.blocks.length ?? 0) + (own?.blocks.length ?? 0)}</small></button>
          {cats.map((c) => <button class={cat === c.key ? 'on' : ''} data-cat={c.key} onClick={() => setCat(c.key)}>{c.label}<small>{c.count}</small></button>)}
        </nav>}
      </aside>
      <main class="g-browse">
        <div class="g-toolbar">
          <div class="g-tabs" role="tablist">{TABS.map((k) => <button role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} data-tab={k} onClick={() => setTab(k)}>{t(`gallery.tab.${k}` as Key)}</button>)}</div>
          <input class="g-search" type="search" placeholder={t('gallery.search')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
        {showOwn && <section class="g-section" data-own-section>
          {cat === ALL && <h4>{t('gallery.ownHead', { name: to?.name ?? '' })}</h4>}
          {ownErr ? <p class="err g-empty">{t('gallery.ownFail', { err: ownErr })}</p> : <ul class="g-grid">{ownList.map(ownCard)}</ul>}
        </section>}
        {showMine && (mineBlocks.length > 0 || cat === MINE_CATEGORY) && <section class="g-section" data-mine-section>
          {cat === ALL && <h4>{t('cat.mine')}</h4>}
          {mineBlocks.length ? <ul class="g-grid">{mineBlocks.map(mineCard)}</ul> : <p class="dim g-empty" data-mine-empty>{libErr ? t('lib.loadFail', { err: libErr }) : t('lib.mineEmpty')}</p>}
        </section>}
        {tab === 'blocks' && cat === MINE_CATEGORY ? null : tab === 'blocks' ? sections.map((x) => (
          <section class="g-section" {...(x.key === CLIP_CATEGORY ? { 'data-clip-fx': '' } : {})}>
            {(cat === ALL || x.key === CLIP_CATEGORY) && <h4>{x.label}{x.key === CLIP_CATEGORY && <small>{t('gallery.clipNoteShort')}</small>}</h4>}
            <ul class="g-grid">{x.blocks.map(blockCard)}{x.clips.map(clipCard)}</ul>
          </section>
        )) : tab === 'sfx' ? sfxSections(list as GallerySfx[]).map((x) => (
          <section class="g-section" data-sfx-cat={x.key}>
            <h4>{x.label}</h4>
            <ul class="g-grid g-grid-wide">{x.sfx.map((s) => card(s.type, shown(s.type, s).doc, <>
              <span class="g-thumb g-thumb-icon g-sound"><IconMusic size={20} /><i><IconPlay size={11} /></i></span>
              <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(s.type, s).label)}>{shown(s.type, s).label}</strong><Handle id={s.type} /><CopyName name={s.type} /></span>
            </>, 'g-row'))}</ul>
          </section>
        )) : (
          <>{tab === 'styles' && mineStyles.length > 0 && <><h4 class="g-mine-h">{t('lib.mineStyles')}</h4><ul class="g-grid g-grid-wide" data-mine-styles>{mineStyles.map((x) => card(`mine-style:${x.id}`, x.desc, <>
              <span class="g-thumb g-thumb-icon g-sound"><IconMusic size={20} /></span>
              <span class="g-card-body card-lines"><strong data-card-name {...tip(x.name)}>{x.name}</strong><span class="g-sub">{fromLine(x)}　{x.defaults.bpm} BPM · {x.defaults.key}</span></span>
            </>, 'g-row', true))}</ul></>}
          <ul class="g-grid g-grid-wide">{tab === 'styles' ? (list as GalleryStyle[]).map((s) => card(s.id, shown(`style:${s.id}`, s).doc, <>
              <span class="g-thumb g-thumb-icon g-sound"><IconMusic size={20} /></span>
              <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(`style:${s.id}`, s).label)}>{shown(`style:${s.id}`, s).label}</strong><Handle id={`style:${s.id}`} /><span class="g-sub">{t(s.origin === 'library' ? 'gallery.originLibrary' : 'gallery.originBuiltin')}　{s.defaults.bpm} BPM · {s.defaults.key}</span></span>
            </>, 'g-row'))
            : (list as GalleryRecipe[]).map((r) => card(r.id, shown(`recipe:${r.id}`, r).doc, <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(`recipe:${r.id}`, r).label)}>{shown(`recipe:${r.id}`, r).label}</strong><Handle id={`recipe:${r.id}`} /><CopyName name={r.id} /><span class="g-sub">{shown(`recipe:${r.id}`, r).doc}</span></span>, 'g-row'))}</ul></>
        )}
        {names.length === 0 && !(showMine && cat === MINE_CATEGORY) && <p class="dim g-empty">{t('gallery.empty')}</p>}
      </main>
      <aside class="g-side">{detail()}</aside>
    </div>
  );
}
