// The block gallery page (`/editor/?gallery`, spec 2026-10-17-block-gallery; three columns since 2026-10-20-home-gallery-refresh §6):
// categories, a grid of cards that show what each block looks like, and a detail panel that is never empty — the first card is picked
// on arrival, and again whenever a tab, category or search leaves the pick out. Cards show the name Claude uses and the handle
// people point with (MRK-03, spec 2026-10-22-block-handles); the search finds either.
import { useEffect, useState } from 'preact/hooks';
import type { Project } from '@tellcut/engine';
import { libraryPlayer, PlayerPreview } from './PlayerPreview.tsx';
import { ParamField } from './fields.tsx';
import { blockCategory, blockProject, byHandle, CLIP_CATEGORY, filterGallery, matches, galleryCategories, MINE_CATEGORY, mineProject, scoreUrl, sfxProject, sfxSections, shown, THEMES, type GalleryBlock, type GalleryIndex, type GalleryRecipe, type GallerySfx, type GalleryStyle, type Tab } from './gallery.ts';
import { IconMusic, IconPlay, IconSpark } from './icons.tsx';
import { ThemeToggle } from './theme.tsx';
import { LangSwitch } from './LangSwitch.tsx';
import { tip } from './tip.ts';
import { errText, t, type Key } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';
import { blockText } from './i18n/blocks.ts';
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
  // data-params: the parameter NAMES follow the language (params.en/ja.ts); their values (default text, options) never do
  return <div class="g-params" data-params>{defs.map((d) => <ParamField def={d} type={type} surface="gallery" value={values[d.key]} project={fieldProject(theme)} onCommit={(v) => onChange(d.key, v)} />)}</div>;
}

/** `id`: what the handle is registered under, when it is not the name (style:<id>, recipe:<id>) */
const Head = ({ label, name, id = name }: { label: string; name: string; id?: string }) => <header class="g-head"><h2>{label}</h2><Handle id={id} /><CopyName name={name} /></header>;

/** values someone set on `name`; another name starts from its defaults (in the same render: no frame of the old values) */
function useParams(name: string): [Record<string, unknown>, (p: Record<string, unknown>) => void] {
  const [set, setSet] = useState<{ name: string; params: Record<string, unknown> }>({ name, params: {} });
  return [set.name === name ? set.params : {}, (params) => setSet({ name, params })];
}

function BlockDetail({ b }: { b: GalleryBlock }) {
  const [params, setParams] = useParams(b.type), [theme, setTheme] = useState('none'), [n, setN] = useState(0), x = shown(b.type, b);
  return (
    <section class="g-detail" data-detail={b.type}>
      <Head label={x.label} name={b.type} />
      <PlayerPreview project={blockProject(b, params, theme)} playKey={n} />
      <div class="g-bar">
        <label>{t('gallery.theme')} <select value={theme} onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}>{Object.keys(THEMES).map((k) => <option value={k}>{t(`gallery.theme.${k}` as Key)}</option>)}</select></label>
        <button onClick={() => setN(n + 1)}>{t('gallery.replay')}</button>
        <button onClick={() => setParams({})}>{t('gallery.resetParams')}</button>
      </div>
      <p class="g-doc">{x.doc || <span class="dim">{t('gallery.noDoc')}</span>}</p>
      {b.needsMedia && <p class="g-warn" data-needs-media>{t('gallery.needsMediaWarn')}</p>}
      <h3>{t('gallery.params')}</h3>
      <Params type={b.type} defs={b.params} values={params} theme={theme} onChange={(k, v) => setParams({ ...params, [k]: v })} />
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

function SfxDetail({ s, plays }: { s: GallerySfx; plays: number }) {
  const [params, setParams] = useParams(s.type), [n, setN] = useState(0), x = shown(s.type, s);
  return (
    <section class="g-detail" data-detail={s.type}>
      <Head label={x.label} name={s.type} />
      <p class="g-doc">{x.doc || <span class="dim">{t('gallery.noDocShort')}</span>}</p>
      <div class="g-bar"><button class="g-play" onClick={() => setN(n + 1)}><IconPlay size={12} /> {t('gallery.listenAgain')}</button></div>
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
const fromLine = (x: { from: { project: string }; savedAt: string }) => t('lib.fromProject', { project: x.from.project, date: new Date(x.savedAt).toLocaleDateString(getLang()) });
const PENDING = 'tellcut.pendingTask';

/** Rename, change with the Agent (blocks), delete: each opens its own small form under the buttons. `group`: the names of the
 *  entry's other blocks, deleted with it. */
function MineActions({ kind, slug, type, name, desc, group, lib, onChanged, navigate }: { kind: 'blocks' | 'styles'; slug: string; type: string; name: string; desc: string;
  group: string[]; lib: GalleryLibrary; onChanged: () => void; navigate: (url: string) => void }) {
  const [mode, setMode] = useState<null | 'rename' | 'agent' | 'delete'>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [nm, setNm] = useState(name), [ds, setDs] = useState(desc), [request, setRequest] = useState(''), [usage, setUsage] = useState<LibraryUsage | null>(null);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setError(''); try { await f(); setMode(null); onChanged(); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  const open = async (m: 'rename' | 'agent' | 'delete') => {
    setError(''); setNm(name); setDs(desc); setMode(m);
    if (m === 'delete') { setUsage(null); try { setUsage(await lib.usage(kind, slug)); } catch (e) { setError(errText(e)); } }
  };
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
      {mode === 'delete' && <div class="g-mine-form g-mine-confirm" data-mine-confirm role="alertdialog">
        <strong>{t('lib.deleteTitle', { name })}</strong>
        {usage ? <>
          <p>{usage.projects ? t('lib.deleteProjects', { n: usage.projects }) : t('lib.deleteNoProjects')}</p>
          {usage.presets.length > 0 && <p class="warn">{t('lib.deletePresets', { names: usage.presets.map((x) => `「${x}」`).join('、') })}</p>}
          {group.length > 0 && <p class="warn">{t('lib.deleteGroup', { names: group.map((x) => `「${x}」`).join('、') })}</p>}
        </> : !error && <p class="dim">…</p>}
        <div class="g-bar"><button onClick={() => setMode(null)} disabled={busy}>{t('lib.cancel')}</button>
          <button class="danger" data-mine-delete-confirm disabled={busy || !usage} onClick={() => void run(() => lib.remove(kind, slug))}>{t('lib.delete')}</button></div>
      </div>}
      {error && <p class="err" role="alert">{error}</p>}
    </div>
  );
}

function MineDetail({ b, all, lib, onChanged, navigate }: { b: LibraryBlockInfo; all: LibraryBlockInfo[]; lib: GalleryLibrary; onChanged: () => void; navigate: (url: string) => void }) {
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
      <p class="g-doc">{b.desc || <span class="dim">{t('gallery.noDoc')}</span>}</p>
      <MineActions key={id} kind="blocks" slug={b.slug} type={b.type} name={b.name} desc={b.desc} lib={lib} onChanged={onChanged} navigate={navigate}
        group={b.group.map((x) => all.find((y) => y.type === x)?.name ?? x)} />
      <h3>{t('gallery.params')}</h3>
      <Params type={b.type} defs={b.params} values={params} theme={theme} onChange={(k, v) => setParams({ ...params, [k]: v })} />
    </section>
  );
}

function MineStyleDetail({ s, lib, onChanged, navigate }: { s: LibraryStyleInfo; lib: GalleryLibrary; onChanged: () => void; navigate: (url: string) => void }) {
  const [seed, setSeed] = useState(1), id = `mine-style:${s.id}`;
  return (
    <section class="g-detail" data-detail={id}>
      <header class="g-head"><h2>{s.name}</h2><span class="g-sub">{fromLine(s)}</span></header>
      <p class="g-doc">{s.desc || <span class="dim">{t('gallery.noDoc')}</span>}</p>
      <p class="dim">{t('gallery.styleInfo', { bpm: s.defaults.bpm, key: s.defaults.key })}</p>
      <div class="g-bar"><label>seed <input type="number" value={seed} min={1} onChange={(e) => setSeed(Number((e.target as HTMLInputElement).value) || 1)} /></label></div>
      <audio controls preload="none" src={scoreUrl(s.id, { seed })} />
      <p class="dim">{t('lib.styleUse')}</p>
      <MineActions key={id} kind="styles" slug={s.slug} type={s.id} name={s.name} desc={s.desc} group={[]} lib={lib} onChanged={onChanged} navigate={navigate} />
    </section>
  );
}

/** a block's golden picture; the category's mark when it has none (or it fails to load) */
function Thumb({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  return <span class="g-thumb">{src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <IconSpark size={22} />}</span>;
}

export function Gallery({ load, library, navigate = (u) => location.assign(u) }: { load: () => Promise<GalleryIndex>; library?: GalleryLibrary; navigate?: (url: string) => void }) {
  useLang();   // the language switch re-renders the whole page
  const [g, setG] = useState<GalleryIndex | null>(null), [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('blocks'), [q, setQ] = useState(''), [cat, setCat] = useState(ALL);
  const [picked, setPicked] = useState<string | null>(null), [plays, setPlays] = useState(0);
  useEffect(() => { load().then(setG, (e: Error) => setErr(e.message)); }, []);
  // My blocks: loaded alongside, again after a rename or delete; a failure leaves Mine empty (with its note) rather than the page broken
  const [lib, setLib] = useState<LibraryIndex | null>(null), [libErr, setLibErr] = useState('');
  const reloadLib = () => library?.load().then((x) => { setLib(x); setLibErr(''); }, (e: Error) => { setLib({ blocks: [], styles: [] }); setLibErr(e.message); });
  useEffect(() => { void reloadLib(); }, []);
  if (err) return <div class="gallery g-message"><p class="err">{t('gallery.loadFail', { err })}</p></div>;
  if (!g) return <div class="gallery g-message"><p class="dim">{t('gallery.loading')}</p></div>;

  const needle = q.trim().toLowerCase();
  const clips = CLIP_FX.filter((f) => matches(q, handleOf(f.key), f.label, f.doc, f.code, shown(f.key, f).label, shown(f.key, f).doc));
  const mineBlocks = (lib?.blocks ?? []).filter((b) => matches(q, undefined, b.type, b.name, b.desc)), mineStyles = (lib?.styles ?? []).filter((x) => matches(q, undefined, x.id, x.name, x.desc));
  const cats = galleryCategories(g.blocks, CLIP_FX.length, library ? (lib?.blocks.length ?? 0) : undefined);
  const showMine = !!library && tab === 'blocks' && (cat === ALL || cat === MINE_CATEGORY);
  const list = filterGallery(g, tab, q);
  // what the grid shows, in order: blocks (by category, or one category) then clip effects; or the tab's list
  const sections = tab !== 'blocks' ? [] : cats.filter((c) => cat === ALL || c.key === cat).map((c) => ({ ...c,
    blocks: c.key === CLIP_CATEGORY ? [] : (list as GalleryBlock[]).filter((b) => blockCategory(b) === c.key).sort((a, b) => byHandle(a.type, b.type)),
    clips: c.key === CLIP_CATEGORY ? clips : [] })).filter((x) => x.blocks.length || x.clips.length);
  const names = tab === 'blocks' ? [...(showMine ? mineBlocks.map((b) => `mine:${b.type}`) : []), ...sections.flatMap((x) => [...x.blocks.map((b) => b.type), ...x.clips.map((f) => f.key)])]
    : tab === 'sfx' ? sfxSections(list as GallerySfx[]).flatMap((x) => x.sfx.map((s) => s.type)) : tab === 'styles' ? [...mineStyles.map((x) => `mine-style:${x.id}`), ...(list as GalleryStyle[]).map((s) => s.id)] : (list as GalleryRecipe[]).map((r) => r.id);
  const on = picked && names.includes(picked) ? picked : names[0] ?? null;
  const pick = (name: string) => { setPicked(name); setPlays(plays + 1); };
  const card = (name: string, title: string, body: preact.ComponentChildren, extra = '') => (
    <li class={`${on === name ? 'on' : ''} ${extra}`} data-card={name} {...tip(title)} role="button" aria-pressed={on === name} tabIndex={0} onClick={() => pick(name)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(name); } }}>{body}</li>
  );
  const blockCard = (b: GalleryBlock) => card(b.type, shown(b.type, b).doc, <>
    <Thumb src={b.thumb} />
    <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(b.type, b).label)}>{shown(b.type, b).label}</strong><Handle id={b.type} /><CopyName name={b.type} />{b.needsMedia && <span class="tag">{t('gallery.needsMedia')}</span>}</span>
  </>);
  const mineCard = (b: LibraryBlockInfo) => card(`mine:${b.type}`, b.desc, <>
    <Thumb src={b.thumb ?? undefined} />
    <span class="g-card-body card-lines"><strong data-card-name {...tip(b.name)}>{b.name}</strong><span class="g-sub">{fromLine(b)}</span></span>
  </>);
  const clipCard = (f: ClipFx) => card(f.key, shown(f.key, f).doc, <>
    <span class="g-thumb g-thumb-icon"><IconSpark size={22} /></span>
    <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(f.key, f).label)}>{shown(f.key, f).label}</strong><Handle id={f.key} /><span class="g-sub">{t('gallery.clipSub')}</span></span>
  </>);

  const detail = () => {
    if (!on) return <p class="dim g-hint">{t('gallery.emptyHint')}</p>;
    if (on.startsWith('mine:') && library) { const b = lib?.blocks.find((x) => `mine:${x.type}` === on); return b && <MineDetail b={b} all={lib!.blocks} lib={library} onChanged={() => void reloadLib()} navigate={navigate} />; }
    if (on.startsWith('mine-style:') && library) { const x = lib?.styles.find((y) => `mine-style:${y.id}` === on); return x && <MineStyleDetail s={x} lib={library} onChanged={() => void reloadLib()} navigate={navigate} />; }
    if (tab === 'blocks') {
      const b = g.blocks.find((x) => x.type === on), f = CLIP_FX.find((x) => x.key === on);
      return b ? <BlockDetail b={b} /> : f ? <ClipDetail f={f} /> : null;
    }
    if (tab === 'sfx') { const s = g.sfx.find((x) => x.type === on); return s && <SfxDetail s={s} plays={plays} />; }
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
          <button class={cat === ALL ? 'on' : ''} data-cat={ALL} onClick={() => setCat(ALL)}>{t('gallery.all')}<small>{g.blocks.length + CLIP_FX.length + (lib?.blocks.length ?? 0)}</small></button>
          {cats.map((c) => <button class={cat === c.key ? 'on' : ''} data-cat={c.key} onClick={() => setCat(c.key)}>{c.label}<small>{c.count}</small></button>)}
        </nav>}
      </aside>
      <main class="g-browse">
        <div class="g-toolbar">
          <div class="g-tabs" role="tablist">{TABS.map((k) => <button role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} data-tab={k} onClick={() => setTab(k)}>{t(`gallery.tab.${k}` as Key)}</button>)}</div>
          <input class="g-search" type="search" placeholder={t('gallery.search')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
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
            </>, 'g-row'))}</ul></>}
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
