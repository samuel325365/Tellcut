// The block gallery page (`/editor/?gallery`, spec 2026-10-17-block-gallery; three columns since 2026-10-20-home-gallery-refresh §6):
// categories, a grid of cards that show what each block looks like, and a detail panel that is never empty — the first card is picked
// on arrival, and again whenever a tab, category or search leaves the pick out. Cards show the name Claude uses and the handle
// people point with (MRK-03, spec 2026-10-22-block-handles); the search finds either. Opened from a project's editor (gallery-link.ts) it lists
// that project's own blocks first and each detail offers "Add to project", which adds at the playhead of the tab that opened it
// (a combo's detail: "Add to timeline", all its layers at once).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { templateName, variantCode, type Project } from '@tellcut/engine';
import { libraryPlayer, PlayerPreview, projectPlayer } from './PlayerPreview.tsx';
import { ParamField } from './fields.tsx';
import { blockCategory, blockProject, byHandle, cardPlays, captionProject, clipMatches, clipProject, clipSections, comboProject, isCaptionBlock, isTitleBlock, titleProject, CLIP_CATEGORY, filterGallery, foundFirst, foundIn, galleryFinder, idFields, libraryBlock, matches, galleryCategories, lookHit, lookHits, lookKey, looksOf, MINE_CATEGORY, mineProject, ownProject, pickedTemplate, pickedVariant, PROJECT_CATEGORY, sameParams, scoreUrl, sfxProject, sfxSections, shown, THEMES, thumbIn, type GalleryBlock, type GalleryBlockVariant, type GalleryCombo, type Look, type GalleryIndex, type GalleryRecipe, type GallerySfx, type GalleryStyle, type OwnProject, type Tab } from './gallery.ts';
import type { GalleryCaption } from '@tellcut/protocol';
import type { AddAnswer, GalleryAdd } from './gallery-link.ts';
import { IconCaptionOut, IconFaceSticker, IconMusic, IconPlay, IconSpark, IconTrash } from './icons.tsx';
import { ThemeToggle } from './theme.tsx';
import { LangSwitch } from './LangSwitch.tsx';
import { tip } from './tip.ts';
import { errText, nameList, t, type Key } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';
import { blockText } from './i18n/blocks.ts';
import { localValues } from './i18n/values.ts';
import { CLIP_FX, handleOf, type ClipFx, type LibraryBlockInfo, type LibraryIndex, type LibraryStyleInfo, type LibraryUsage } from '@tellcut/protocol';
import { getLang } from './i18n/lang.ts';
import { CroppedImg } from './CroppedImg.tsx';
import type { PicCrop } from './pic-crop.ts';

const TABS: Tab[] = ['blocks', 'captions', 'titles', 'sfx', 'combos', 'styles', 'recipes'];
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

/** the heading over a cut.ts line, with the line to copy beside it. The heading's words never break (the copy box squeezed the
 *  Japanese one to three lines); the box goes under them when both do not fit on one line, cut short with an ellipsis there. */
const CodeHead = ({ code }: { code: string }) => <h3 class="g-code-head"><span>{t('gallery.clipCode')}</span><CopyName name={code} /></h3>;

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
 *  editor only takes in place of one already there (the library's Add refuses it too). `id`: the detail's own name (two caption
 *  templates add the same block, and a status said for one must not show on the other). */
function AddBar({ id, to, add, scene = false, label = 'gallery.add', tipKey = 'gallery.addTip', mark }: { id: string; to?: ToProject; add: GalleryAdd; scene?: boolean; label?: Key; tipKey?: Key; mark?: string }) {
  const [state, setState] = useState<{ busy: boolean; key: string; answer?: AddAnswer }>({ busy: false, key: '' });
  if (!to) return null;
  const key = id, answer = state.key === key ? state.answer : undefined;   // a card picked since: its own status
  const go = async () => {
    setState({ busy: true, key });
    const a = await to.project.add(add).catch((e: Error): AddAnswer => ({ ok: false, notice: errText(e) }));
    setState({ busy: false, key, answer: a });
  };
  return (
    <div class="g-add" data-gallery-add-bar>
      <button class="primary" data-gallery-add {...(mark ? { [mark]: '' } : {})} disabled={scene || state.busy} {...tip(scene ? t('ed.sceneAdd') : t(tipKey, { name: to.name }))} onClick={() => void go()}>
        {state.busy && state.key === key ? t('gallery.adding') : t(label)}</button>
      {answer && <span class={answer.ok ? 'dim' : 'err'} role="status" data-add-status>{answer.ok ? t('gallery.added', { name: to.name }) : answer.notice ?? ''}</span>}
    </div>
  );
}

/** values someone set on `name`; another name starts from its defaults (in the same render: no frame of the old values) */
function useParams(name: string): [Record<string, unknown>, (p: Record<string, unknown>) => void] {
  const [set, setSet] = useState<{ name: string; params: Record<string, unknown> }>({ name, params: {} });
  return [set.name === name ? set.params : {}, (params) => setSet({ name, params })];
}

/** the first letter of a name: the small box of a look that has no picture (a project's own block) */
const firstChar = (s: string) => Array.from(s.trim())[0] ?? '';

/** What the preview plays while a variant is what is set: the block's words in the UI language, under its sample's params in that
 *  language (the picture its card shows), its option set. Add to project still sends the option alone. */
const variantPlays = (b: GalleryBlock, v: GalleryBlockVariant, lang: string) =>
  ({ ...localValues(b.type, b.params), ...((lang === 'en' || lang === 'ja' ? v.local?.[lang] : undefined) ?? v.params ?? {}), [b.variants!.param]: v.value });

/** A shared block, or (`own`) one of the project's own, whose modules the preview loads from the project folder. `set`: what the user
 *  set on it, held by the page (a card's small pictures set it too). */
function BlockDetail({ b, to, own, set, setParams }: { b: GalleryBlock; to?: ToProject; own?: OwnProject; set: Record<string, unknown>; setParams: (p: Record<string, unknown>) => void }) {
  const id = own ? `own:${b.type}` : b.type;
  const [theme, setTheme] = useState('none'), [n, setN] = useState(0), x = shown(b.type, b);
  // the block as it would be added in this UI language: its Chinese words in that language, under what the user changed
  const params = { ...localValues(b.type, b.params), ...set }, variant = pickedVariant(b, set), tpl = pickedTemplate(b, set);
  // with nothing set, the preview plays what the card is drawn with (its sample's params, theme and sources), so the two agree;
  // once anything is set it plays what Add to project would add
  const sample = !Object.keys(set).length ? b.card : undefined;
  const plays = variant ? variantPlays(b, variant, getLang()) : sample ? cardPlays(b, sample, getLang()) : params;
  return (
    <section class="g-detail" data-detail={id}>
      <Head label={x.label} name={b.type} />
      {own && to ? <PlayerPreview project={ownProject(own, b, params, theme)} playKey={n} src={projectPlayer(to.project.id)} />
        : <PlayerPreview project={blockProject(b, plays, theme, tpl, variant, sample)} playKey={n} />}
      <div class="g-bar">
        <label>{t('gallery.theme')} <select value={theme} onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}>{Object.keys(THEMES).map((k) => <option value={k}>{t(`gallery.theme.${k}` as Key)}</option>)}</select></label>
        <button onClick={() => setN(n + 1)}>{t('gallery.replay')}</button>
        <button onClick={() => setParams({})}>{t('gallery.resetParams')}</button>
      </div>
      {/* only what the user changed goes along: the editor starts the rest from the defaults in its own language */}
      <AddBar id={id} to={to} add={{ kind: 'block', type: b.type, ...(Object.keys(set).length ? { params: set } : {}) }} scene={b.kind === 'scene'} />
      <p class="g-doc">{x.doc || <span class="dim">{t('gallery.noDoc')}</span>}</p>
      {b.needsMedia && <p class="g-warn" data-needs-media>{t('gallery.needsMediaWarn')}</p>}
      {b.variants?.list.length ? <Variants b={b} picked={variant?.value} pick={(p) => setParams(p)} /> : null}
      {b.templates?.length ? <Templates b={b} set={set} pick={(p) => setParams({ ...p })} /> : null}
      <h3>{t('gallery.params')}</h3>
      <Params type={b.type} defs={b.params} values={params} theme={theme} onChange={(k, v) => setParams({ ...set, [k]: v })} />
    </section>
  );
}

/** a row of the detail's Variants or Templates: its picture (the first letter of its name without one), name, how to write it, doc */
function LookRow({ on, attrs, tipText, pick, src, label, code, doc }: { on: boolean; attrs: Record<string, string>; tipText: string; pick: () => void; src?: string; label: string; code: string; doc: string }) {
  return (
    <li class={on ? 'on' : ''} {...attrs} role="button" tabIndex={0} aria-pressed={on} {...tip(tipText)} onClick={pick}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(); } }}>
      <Thumb src={src} mark={firstChar(label)} />
      <span class="g-tpl-text"><strong>{label}</strong><code>{code}</code><small>{doc}</small></span>
    </li>
  );
}

/** A block's variants (engine variants.ts): picking one sets its option alone, so the preview plays its sample and Add to project
 *  adds the block with just that option; the one that is all that is set is marked. */
function Variants({ b, picked, pick }: { b: GalleryBlock; picked?: string; pick: (params: Record<string, unknown>) => void }) {
  const v = b.variants!;
  return <>
    <h3>{t('gallery.variants')}</h3>
    <ul class="g-templates" data-block-variants>
      {v.list.map((x) => { const s = shown(`${b.type}@${x.value}`, x); return <LookRow on={picked === x.value} attrs={{ 'data-block-variant': x.value }} tipText={t('gallery.variantTip')}
        pick={() => pick({ [v.param]: x.value })} src={thumbIn(x.thumb, getLang())} label={s.label} code={variantCode(v.param, x.value)} doc={s.doc} />; })}
    </ul>
  </>;
}

/** A block's named templates (engine templates.ts): picking one puts its params in place of what was set, so the preview plays it
 *  and Add to project adds the block with them; the one whose params are exactly what is set is marked. */
function Templates({ b, set, pick }: { b: GalleryBlock; set: Record<string, unknown>; pick: (params: Record<string, unknown>) => void }) {
  return <>
    <h3>{t('gallery.templates')}</h3>
    <ul class="g-templates" data-block-templates>
      {b.templates!.map((x) => { const s = shown(`${b.type}#${x.id}`, x); return <LookRow on={sameParams(x.params, set)} attrs={{ 'data-block-template': x.id }} tipText={t('gallery.templateTip')}
        pick={() => pick(x.params)} src={thumbIn(x.thumb, getLang())} label={s.label} code={templateName(b.type, x.id)} doc={s.doc} />; })}
    </ul>
  </>;
}

/** two rows of five small pictures under a card's own; past that, nine and a +N that opens the rest */
const LOOK_SLOTS = 10;

/** A card's looks (looksOf): each a small picture (its sample's shape inside a box of one height) that, under the mouse or the
 *  keyboard, takes the card's picture (`onHover`) and, clicked, picks the card with it set (`onPick`). `hits`: the looks a search
 *  found, marked; one of them behind the +N shows them all. `pressed`: the look that is what the picked card has set. */
function CardLooks({ looks, hits, pressed, open, onToggle, onHover, onPick }: { looks: Look[]; hits: string[]; pressed?: string; open: boolean;
  onToggle: () => void; onHover: (key: string | null) => void; onPick: (l: Look) => void }) {
  const lang = getLang(), fits = looks.length <= LOOK_SLOTS, rest = looks.length - (LOOK_SLOTS - 1);
  const found = !fits && hits.some((k) => looks.findIndex((l) => l.key === k) >= LOOK_SLOTS - 1);
  const list = fits || open || found ? looks : looks.slice(0, LOOK_SLOTS - 1);
  return (
    <span class="g-looks" data-card-looks role="group" aria-label={t('gallery.looks')}>
      {list.map((l) => (
        <span class={`g-look${l.thumb ? '' : ' g-look-none'}${hits.includes(l.key) ? ' hit' : ''}${pressed === l.key ? ' on' : ''}`} {...{ [l.kind === 'variant' ? 'data-look-variant' : 'data-look-template']: l.id }}
          role="button" tabIndex={0} aria-pressed={pressed === l.key} {...tip(l.doc)} aria-label={l.label} style={l.thumb && l.bg ? { background: l.bg } : undefined}
          onMouseEnter={() => onHover(l.key)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(l.key)} onBlur={() => onHover(null)}
          onClick={(e) => { e.stopPropagation(); onPick(l); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPick(l); } }}>
          <LookPic src={thumbIn(l.thumb, lang)} mark={firstChar(l.label)} crop={l.crop} />
        </span>))}
      {!fits && !found && <button class="g-look g-looks-more" data-looks-more aria-expanded={open} {...tip(open ? t('gallery.looksLess') : t('gallery.looksMore', { n: rest }))}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}>{open ? '−' : `+${rest}`}</button>}
    </span>
  );
}

/** a look's small picture inside its box: whole, or only where the look is when it has a crop (CroppedImg); the first letter of its
 *  name when it has none (or it fails to load) */
function LookPic({ src, mark, crop }: { src?: string; mark: string; crop?: PicCrop }) {
  const [bad, setBad] = useState<string>();
  if (!src || bad === src) return <span class="g-look-mark" aria-hidden="true">{mark}</span>;
  return crop ? <CroppedImg src={src} crop={crop} onError={() => setBad(src)} /> : <img src={src} alt="" loading="lazy" onError={() => setBad(src)} />;
}

/** A clip effect: its preview looping (the street, to the map for a transition: clipProject), what it is for and its cut.ts line;
 *  one the gallery cannot show says why instead of the preview. */
function ClipDetail({ f }: { f: ClipFx }) {
  const x = shown(f.key, f), [n, setN] = useState(0), project = clipProject(f);
  return (
    <section class="g-detail" data-detail={f.key}>
      <header class="g-head"><h2>{x.label}</h2><Handle id={f.key} /></header>
      {project && <><PlayerPreview project={project} playKey={n} /><div class="g-bar"><button onClick={() => setN(n + 1)}>{t('gallery.replay')}</button></div></>}
      <p class="g-doc">{x.doc}</p>
      <CodeHead code={f.code} />
      <pre>{f.code}</pre>
      <p class="dim" data-clip-note>{project ? t('gallery.clipNote') : t(`gallery.clipNoPreview.${f.key.slice(5)}` as Key)}</p>
    </section>
  );
}

/** the mark of a clip effect without a card picture: its own for those that cannot be shown, else the generic one */
const CLIP_ICON: Record<string, (p: { size?: number }) => preact.JSX.Element> = { 'clip.follow': IconFaceSticker, 'clip.avoidBurned': IconCaptionOut };

function SfxDetail({ s, plays, to }: { s: GallerySfx; plays: number; to?: ToProject }) {
  const [params, setParams] = useParams(s.type), [n, setN] = useState(0), x = shown(s.type, s);
  return (
    <section class="g-detail" data-detail={s.type}>
      <Head label={x.label} name={s.type} />
      <p class="g-doc">{x.doc || <span class="dim">{t('gallery.noDocShort')}</span>}</p>
      <div class="g-bar"><button class="g-play" onClick={() => setN(n + 1)}><IconPlay size={12} /> {t('gallery.listenAgain')}</button></div>
      <AddBar id={s.type} to={to} add={{ kind: 'sfx', type: s.type, ...(Object.keys(params).length ? { params } : {}) }} />
      <div class="g-hidden-player"><PlayerPreview project={sfxProject(s, params)} loop={false} autoplay={false} playKey={n + plays} /></div>
      <h3>{t('gallery.params')}</h3>
      <Params type={s.type} defs={s.params} values={params} onChange={(k, v) => setParams({ ...params, [k]: v })} />
    </section>
  );
}

/** keyed by the style: the seed, tempo and key typed for one style must not carry over to the next one picked */
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

/** a caption template: common.caption playing it over a picture, what it sets, and Add to project with it */
function CaptionDetail({ c, caption, to, kind = 'caption' }: { c: GalleryCaption; caption?: GalleryBlock; to?: ToProject; kind?: 'caption' | 'title' }) {
  const id = `${kind}:${c.id}`, x = shown(id, c), [n, setN] = useState(0), title = kind === 'title';
  return (
    <section class="g-detail" data-detail={id}>
      <Head label={x.label} name={c.id} id={id} />
      {caption && <PlayerPreview project={(title ? titleProject : captionProject)(caption, c.id, getLang())} playKey={n} />}
      <div class="g-bar"><button onClick={() => setN(n + 1)}>{t('gallery.replay')}</button></div>
      <AddBar id={id} to={to} add={{ kind: 'block', type: title ? 'common.heading' : 'common.caption', params: { template: c.id } }} />
      <p class="g-doc">{x.doc}</p>
      <h3>{t('gallery.captionSets')}</h3>
      <ul class="g-notes" data-caption-params>{Object.entries(c.params).map(([k, v]) => <li><code>{k}</code> {String(v)}</li>)}</ul>
      <p class="dim">{t(title ? 'gallery.titleUse' : 'gallery.captionUse', { id: c.id })}</p>
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

/** a combo's three pictures side by side (start, peak, end: its golden sample); `named`: each with its caption under it */
function ComboStrip({ c, named = false }: { c: GalleryCombo; named?: boolean }) {
  const names: Key[] = ['gallery.comboStart', 'gallery.comboPeak', 'gallery.comboEnd'];
  return <span class={`g-combo-strip${named ? ' g-combo-strip-big' : ''}`} data-combo-frames>{c.frames.map((src, i) => (
    <span class="g-combo-frame"><Thumb src={thumbIn(src, getLang())} />{named && <small>{t(names[i] ?? 'gallery.comboEnd')}</small>}</span>))}</span>;
}

/** seconds from the moment: +0.1, −0.1, 0 */
const fromMoment = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;

/** A combo (engine combos.ts): its live preview on the street (its sounds and shake too), its pictures, what it is for, each layer
 *  (what it is and when it comes), Add to timeline (every layer at the playhead, one undo step in the editor) and how cut.ts places
 *  it. The preview plays when the card is picked and on Replay, never by itself: like a sound effect's, opening the tab or typing
 *  in the search must not make a noise. */
function ComboDetail({ c, g, to, plays }: { c: GalleryCombo; g: GalleryIndex; to?: ToProject; plays: number }) {
  const id = `combo:${c.id}`, x = shown(id, c), code = `c.combo('${c.id}', { at })`, [n, setN] = useState(0);
  const project = useMemo(() => comboProject(c), [c]);
  const what = (p: GalleryCombo['parts'][number]) => {
    if (p.kind === 'shake') return <span>{t('gallery.comboShakeWhat')}</span>;
    if (p.kind === 'sfx') { const s = g.sfx.find((y) => y.type === p.type); return <><span>{s ? shown(s.type, s).label : p.type}</span><code>{p.type}</code></>; }
    const b = g.blocks.find((y) => y.type === p.type), tpl = p.template ? b?.templates?.find((y) => y.id === p.template) : undefined;
    const label = [b ? shown(b.type, b).label : p.type, tpl ? shown(`${b!.type}#${tpl.id}`, tpl).label : ''].filter(Boolean).join(' · ');
    return <><span>{label}{p.layer && <span class="tag">{t(p.layer === 'top' ? 'gallery.comboTop' : 'gallery.comboUnder')}</span>}</span><code>{p.template ? templateName(p.type!, p.template) : p.type}</code></>;
  };
  return (
    <section class="g-detail" data-detail={id}>
      <Head label={x.label} name={c.id} id={id} />
      {project && <div data-combo-preview><PlayerPreview project={project} loop={false} autoplay={false} playKey={n + plays} />
        <div class="g-bar"><button class="g-play" onClick={() => setN(n + 1)}><IconPlay size={12} /> {t('gallery.replay')}</button></div></div>}
      <ComboStrip c={c} named />
      <AddBar id={id} to={to} add={{ kind: 'combo', type: c.id }} label="gallery.addCombo" tipKey="gallery.comboAddTip" mark="data-combo-add" />
      <p class="g-doc">{x.doc}</p>
      <h3>{t('gallery.comboLayers')}</h3>
      <ul class="g-combo-parts" data-combo-parts>{c.parts.map((p) => (
        <li data-combo-part={p.name}>
          <span class="g-combo-kind">{t(`gallery.comboKind.${p.kind}` as Key)}</span>
          <span class="g-tpl-text"><strong>{p.name}</strong>{what(p)}<small>{t('gallery.comboWhen', { at: fromMoment(p.at), len: p.len })}</small></span>
        </li>))}</ul>
      <CodeHead code={code} />
      <pre>{code}</pre>
      <p class="dim">{t('gallery.comboNote')}</p>
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
      <AddBar id={`mine:${b.slug}:${b.type}`} to={to} add={{ kind: 'mine', type: b.type, slug: b.slug, blockKind: b.kind }} scene={b.kind === 'scene'} />
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

/** a block's golden picture; when it has none (or it fails to load) `mark` (a look's first letter), else the category's mark. Which
 *  picture failed is kept, so a card whose picture changes (a look under the mouse) tries the new one. */
function Thumb({ src, mark }: { src?: string; mark?: string }) {
  const [bad, setBad] = useState<string>();
  return <span class="g-thumb">{src && bad !== src ? <img src={src} alt="" loading="lazy" onError={() => setBad(src)} />
    : mark ? <span class="g-thumb-mark" aria-hidden="true">{mark}</span> : <IconSpark size={22} />}</span>;
}

/** A shaking clip's card. Its golden picture is the street where the shake starts, which alone reads as a still photo: tilted, with
 *  two faint copies trailing it, it draws the motion, and (unless the system asks for reduced motion: styles.css) the
 *  picture jolts and settles every few seconds, as the shake does. */
function ShakeThumb({ src }: { src: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <Thumb />;
  return <span class="g-thumb g-thumb-shake" data-clip-shake><span class="g-shake-pic">
    <img src={src} alt="" loading="lazy" onError={() => setBad(true)} />
    <img class="g-ghost" src={src} alt="" aria-hidden="true" loading="lazy" /><img class="g-ghost" src={src} alt="" aria-hidden="true" loading="lazy" />
  </span></span>;
}

export function Gallery({ load, library, project, navigate = (u) => location.assign(u) }: { load: () => Promise<GalleryIndex>; library?: GalleryLibrary; project?: GalleryProject; navigate?: (url: string) => void }) {
  useLang();   // the language switch re-renders the whole page
  const [g, setG] = useState<GalleryIndex | null>(null), [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('blocks'), [q, setQ] = useState(''), [cat, setCat] = useState(ALL);
  const [picked, setPicked] = useState<string | null>(null), [plays, setPlays] = useState(0);
  // what is set on a block card's detail, by card name (the detail's own fields and the card's small pictures both set it); another
  // card starts from its defaults (in the same render: no frame of the old values)
  const [blockSet, setBlockSet] = useState<{ name: string; params: Record<string, unknown> }>({ name: '', params: {} });
  const setOn = (name: string) => (blockSet.name === name ? blockSet.params : {});
  // the look under the mouse or the keyboard (its card shows it), and the cards whose looks are all shown
  const [hover, setHover] = useState<{ card: string; key: string } | null>(null), [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  // a card of Mine asked to be deleted: which, and a count so asking again on the same card opens the confirmation again;
  // the name is cleared once the confirmation opened (one-shot: a detail mounted again later must not reopen it)
  const [del, setDel] = useState<{ name: string; n: number }>({ name: '', n: 0 });
  const asked = () => setDel((d) => ({ name: '', n: d.n }));
  useEffect(() => { load().then(setG, (e: Error) => setErr(errText(e))); }, []);
  // My blocks: loaded alongside, again after a rename or delete; a failure leaves Mine empty (with its note) rather than the page broken
  const [lib, setLib] = useState<LibraryIndex | null>(null), [libErr, setLibErr] = useState('');
  const reloadLib = () => library?.load().then((x) => { setLib(x); setLibErr(''); }, (e: Error) => { setLib({ blocks: [], styles: [] }); setLibErr(errText(e)); });
  useEffect(() => { void reloadLib(); }, []);
  // the project it was opened from: its own blocks; a failure says so above them and leaves the rest of the page as it is
  const [own, setOwn] = useState<OwnProject | null>(null), [ownErr, setOwnErr] = useState('');
  useEffect(() => { project?.load().then(setOwn, (e: Error) => setOwnErr(errText(e))); }, []);
  if (err) return <div class="gallery g-message"><p class="err">{t('gallery.loadFail', { err })}</p></div>;
  if (!g) return <div class="gallery g-message"><p class="dim">{t('gallery.loading')}</p></div>;

  const needle = q.trim().toLowerCase();
  // the clip effects found, in their groups (transitions, shapes, the rest) and the grid's order; their card pictures by key
  const clips = clipSections(CLIP_FX.filter((f) => clipMatches(f, q))).flatMap((x) => x.clips);
  const clipThumb = new Map((g.clips ?? []).map((x) => [x.key, x.thumb]));
  // the Captions and Titles tabs show only their templates: the blocks under them (common.caption / common.heading, and the old
  // core.caption / core.title kept for older projects) would be a second, look-alike card for the same thing (2026-11-05)
  const list = filterGallery(g, tab, q), found = galleryFinder(g, q);
  // My blocks and the project's own are searched by the shared blocks' finder (their names, docs, looks, params; those found only
  // by a param last), so one query finds the same way in every section
  const mineBlocks = foundIn(lib?.blocks ?? [], found, libraryBlock), mineStyles = (lib?.styles ?? []).filter((x) => matches(q, undefined, ...idFields(x.id), x.name, x.desc));
  const ownList = foundIn(own?.blocks ?? [], found, (b) => b);
  const to: ToProject | undefined = project && { project, name: own?.name || project.id };
  const cats = galleryCategories(g.blocks, CLIP_FX.length, library ? (lib?.blocks.length ?? 0) : undefined, own?.blocks.length ?? 0);
  const showOwn = tab === 'blocks' && (cat === ALL || cat === PROJECT_CATEGORY) && (ownList.length > 0 || !!ownErr);
  const showMine = !!library && tab === 'blocks' && (cat === ALL || cat === MINE_CATEGORY);
  // what the grid shows, in order: blocks (by category, or one category; in each, those found only by a param last) then clip
  // effects; or the tab's list
  const sections = tab !== 'blocks' ? [] : cats.filter((c) => cat === ALL || c.key === cat).map((c) => ({ ...c,
    blocks: c.key === CLIP_CATEGORY ? [] : (list as GalleryBlock[]).filter((b) => blockCategory(b) === c.key).sort(foundFirst(found, (a, b) => byHandle(a.type, b.type))),
    clips: c.key === CLIP_CATEGORY ? clips : [] })).filter((x) => x.blocks.length || x.clips.length);
  const names = tab === 'blocks' ? [...(showOwn ? ownList.map((b) => `own:${b.type}`) : []), ...(showMine ? mineBlocks.map((b) => `mine:${b.type}`) : []), ...sections.flatMap((x) => [...x.blocks.map((b) => b.type), ...x.clips.map((f) => f.key)])]
    : tab === 'captions' || tab === 'titles' ? [...(list as GalleryCaption[]).map((c) => `${tab === 'titles' ? 'title' : 'caption'}:${c.id}`)]
    : tab === 'sfx' ? sfxSections(list as GallerySfx[]).flatMap((x) => x.sfx.map((s) => s.type)) : tab === 'combos' ? (list as GalleryCombo[]).map((c) => `combo:${c.id}`) : tab === 'styles' ? [...mineStyles.map((x) => `mine-style:${x.id}`), ...(list as GalleryStyle[]).map((s) => s.id)] : (list as GalleryRecipe[]).map((r) => r.id);
  const on = picked && names.includes(picked) ? picked : names[0] ?? null;
  const pick = (name: string) => { setPicked(name); setPlays(plays + 1); };
  // only Mine's cards can be deleted: a trash button at the corner on hover and the Delete key both pick the card and open its confirmation
  const askDelete = (name: string) => { setPicked(name); setDel((d) => ({ name, n: d.n + 1 })); };
  const card = (name: string, title: string, body: preact.ComponentChildren, extra = '', deletable = false, attrs: Record<string, string> = {}, go: () => void = () => pick(name)) => (
    <li class={`${on === name ? 'on' : ''} ${extra}`} data-card={name} {...attrs} {...tip(title)} role="button" aria-pressed={on === name} tabIndex={0} onClick={go}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        else if (deletable && e.key === 'Delete') { e.preventDefault(); askDelete(name); }
      }}>{body}
      {deletable && <button class="icon-btn g-card-del" data-card-delete={name} {...tip(t('lib.deleteTip'))}
        onClick={(e) => { e.stopPropagation(); askDelete(name); }}><IconTrash size={14} /></button>}</li>
  );
  // a block card's variants and templates: its picture is the one under the mouse, else the one a search found (lookHit), else its own;
  // the line under its name says which (kept, empty, so nothing moves when one shows); a click picks the card with that look set
  const looksCard = (name: string, b: GalleryBlock, src?: string) => {
    const ls = looksOf(b);
    if (!ls.length) return { pic: <Thumb src={src} />, line: null, strip: null, go: undefined };
    const found = needle ? lookHit(b, q) : undefined, hits = found ? lookHits(b, q) : [];
    const showing = (hover?.card === name ? ls.find((l) => l.key === hover.key) : undefined) ?? (found ? ls.find((l) => l.key === lookKey(found)) : undefined);
    const set = on === name ? setOn(name) : undefined, v = set && pickedVariant(b, set), tp = set && !v ? pickedTemplate(b, set) : undefined;
    const pressed = v ? `variant:${v.value}` : tp ? `template:${tp.id}` : undefined;
    // the look a search put on the card is what a click on the card opens (not once something is set on it: those params are the user's)
    const hit = found && !Object.keys(setOn(name)).length ? ls.find((l) => l.key === lookKey(found)) : undefined;
    return {
      go: hit ? () => { pick(name); setBlockSet({ name, params: { ...hit.set } }); } : undefined,
      pic: showing ? <Thumb src={thumbIn(showing.thumb, getLang())} mark={firstChar(showing.label)} /> : <Thumb src={src} />,
      line: <span class="g-look-name" data-look-name>{showing?.label ?? ''}</span>,
      strip: <CardLooks looks={ls} hits={hits} pressed={pressed} open={opened.has(name)}
        onToggle={() => setOpened((s) => { const x = new Set(s); if (!x.delete(name)) x.add(name); return x; })}
        onHover={(key) => setHover(key ? { card: name, key } : (h) => (h?.card === name ? null : h))}
        onPick={(l: Look) => { pick(name); setBlockSet({ name, params: { ...l.set } }); }} />,
    };
  };
  const blockCard = (b: GalleryBlock) => { const x = looksCard(b.type, b, thumbIn(b.thumb, getLang())); return card(b.type, shown(b.type, b).doc, <>
    {x.pic}{x.strip}
    <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(b.type, b).label)}>{shown(b.type, b).label}</strong>{x.line}<Handle id={b.type} /><CopyName name={b.type} />{b.needsMedia && <span class="tag">{t('gallery.needsMedia')}</span>}</span>
  </>, '', false, {}, x.go); };
  // the project's own: no golden picture; the tag says whose it is wherever the card shows
  const ownCard = (b: GalleryBlock) => { const x = looksCard(`own:${b.type}`, b); return card(`own:${b.type}`, shown(b.type, b).doc, <>
    {x.pic}{x.strip}
    <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(b.type, b).label)}>{shown(b.type, b).label}</strong>{x.line}<span class="tag" data-own-tag>{t('gallery.ownTag')}</span><CopyName name={b.type} />{b.needsMedia && <span class="tag">{t('gallery.needsMedia')}</span>}</span>
  </>, 'g-own'); };
  const mineCard = (b: LibraryBlockInfo) => card(`mine:${b.type}`, b.desc, <>
    <Thumb src={b.thumb ?? undefined} />
    <span class="g-card-body card-lines"><strong data-card-name {...tip(b.name)}>{b.name}</strong><span class="g-sub">{fromLine(b)}</span></span>
  </>, '', true);
  // the line under a clip card's name says what kind of thing it is (a transition, a shape, another clip effect)
  const clipCard = (f: ClipFx) => { const Icon = CLIP_ICON[f.key] ?? IconSpark, src = clipThumb.get(f.key); return card(f.key, shown(f.key, f).doc, <>
    {src ? (f.preview?.shake ? <ShakeThumb src={src} /> : <Thumb src={src} />) : <span class="g-thumb g-thumb-icon" data-clip-icon={f.key}><Icon size={22} /></span>}
    <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(f.key, f).label)}>{shown(f.key, f).label}</strong><Handle id={f.key} /><span class="g-sub" data-clip-sub>{t(`gallery.clipSub.${f.group}` as Key)}</span></span>
  </>); };

  const detail = () => {
    if (!on) return <p class="dim g-hint">{t('gallery.emptyHint')}</p>;
    if (on.startsWith('own:') && own) { const b = own.blocks.find((x) => `own:${x.type}` === on); return b && <BlockDetail b={b} own={own} to={to} set={setOn(on)} setParams={(p) => setBlockSet({ name: on, params: p })} />; }
    if (on.startsWith('mine:') && library) { const b = lib?.blocks.find((x) => `mine:${x.type}` === on); return b && <MineDetail b={b} all={lib!.blocks} lib={library} onChanged={() => void reloadLib()} navigate={navigate} ask={del.name === on ? del.n : 0} onAsked={asked} to={to} />; }
    if (on.startsWith('mine-style:') && library) { const x = lib?.styles.find((y) => `mine-style:${y.id}` === on); return x && <MineStyleDetail key={on} s={x} lib={library} onChanged={() => void reloadLib()} navigate={navigate} ask={del.name === on ? del.n : 0} onAsked={asked} />; }
    if (tab === 'blocks') {
      const b = g.blocks.find((x) => x.type === on), f = CLIP_FX.find((x) => x.key === on);
      return b ? <BlockDetail b={b} to={to} set={setOn(on)} setParams={(p) => setBlockSet({ name: on, params: p })} /> : f ? <ClipDetail f={f} /> : null;
    }
    if (tab === 'captions' || tab === 'titles') {
      const kind = tab === 'titles' ? 'title' : 'caption', c = ((kind === 'title' ? g.titles : g.captions) ?? []).find((x) => `${kind}:${x.id}` === on);
      return c && <CaptionDetail c={c} kind={kind} caption={g.blocks.find((b) => b.type === (kind === 'title' ? 'common.heading' : 'common.caption'))} to={to} />;
    }
    if (tab === 'sfx') { const s = g.sfx.find((x) => x.type === on); return s && <SfxDetail s={s} plays={plays} to={to} />; }
    if (tab === 'combos') { const c = (g.combos ?? []).find((x) => `combo:${x.id}` === on); return c && <ComboDetail c={c} g={g} to={to} plays={plays} />; }
    if (tab === 'styles') { const s = g.styles.find((x) => x.id === on); return s && <StyleDetail key={s.id} s={s} />; }
    const r = g.recipes.find((x) => x.id === on); return r && <RecipeDetail r={r} />;
  };

  return (
    <div class="gallery">
      <aside class="g-nav">
        <div class="g-top"><a href="./" class="back">{t('gallery.back')}</a><span class="grow" /><LangSwitch /><ThemeToggle /></div>
        <h1>{t('gallery.title')}</h1>
        <p class="g-lede">{t('gallery.lede')}</p>
        {tab === 'blocks' && <nav class="g-cats" aria-label={t('gallery.cats')}>
          <button class={cat === ALL ? 'on' : ''} data-cat={ALL} onClick={() => setCat(ALL)}>{t('gallery.all')}<small>{g.blocks.filter((b) => !isCaptionBlock(b) && !isTitleBlock(b)).length + CLIP_FX.length + (lib?.blocks.length ?? 0) + (own?.blocks.length ?? 0)}</small></button>
          {cats.map((c) => <button class={cat === c.key ? 'on' : ''} data-cat={c.key} onClick={() => setCat(c.key)}>{c.label}<small>{c.count}</small></button>)}
        </nav>}
      </aside>
      <main class="g-browse">
        <div class="g-toolbar">
          <div class="g-tabs" role="tablist">{TABS.map((k) => <button role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} data-tab={k} onClick={() => setTab(k)}>{t(`gallery.tab.${k}` as Key)}</button>)}</div>
          <input class="g-search" type="search" placeholder={t('gallery.search')} value={q} onInput={(e) => { setQ((e.target as HTMLInputElement).value); setHover(null); }} />
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
            {x.key === CLIP_CATEGORY ? clipSections(x.clips).map((s) => <div class="g-clip-group" data-clip-group={s.group}>
              <h5>{s.label}</h5><ul class="g-grid">{s.clips.map(clipCard)}</ul></div>)
              : <ul class="g-grid">{x.blocks.map(blockCard)}</ul>}
          </section>
        )) : tab === 'captions' || tab === 'titles' ? <section class="g-section" {...(tab === 'titles' ? { 'data-titles': '' } : { 'data-captions': '' })}>
          {list.length > 0 && <h4>{t(tab === 'titles' ? 'gallery.titleTemplates' : 'gallery.capTemplates')}</h4>}
          <ul class="g-grid">{(list as GalleryCaption[]).map((c) => { const id = `${tab === 'titles' ? 'title' : 'caption'}:${c.id}`; return card(id, shown(id, c).doc, <>
            <Thumb src={thumbIn(c.thumb, getLang())} />
            <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(id, c).label)}>{shown(id, c).label}</strong><Handle id={id} /><CopyName name={c.id} /></span>
          </>); })}</ul>
        </section> : tab === 'sfx' ? sfxSections(list as GallerySfx[]).map((x) => (
          <section class="g-section" data-sfx-cat={x.key}>
            <h4>{x.label}</h4>
            <ul class="g-grid g-grid-wide">{x.sfx.map((s) => card(s.type, shown(s.type, s).doc, <>
              <span class="g-thumb g-thumb-icon g-sound"><IconMusic size={20} /><i><IconPlay size={11} /></i></span>
              <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(s.type, s).label)}>{shown(s.type, s).label}</strong><Handle id={s.type} /><CopyName name={s.type} /></span>
            </>, 'g-row'))}</ul>
          </section>
        )) : tab === 'combos' ? <section class="g-section" data-combos>
          <ul class="g-grid g-grid-wide">{(list as GalleryCombo[]).map((c) => { const id = `combo:${c.id}`; return card(id, shown(id, c).doc, <>
            <ComboStrip c={c} />
            <span class="g-card-body card-lines"><strong data-card-name {...tip(shown(id, c).label)}>{shown(id, c).label}</strong><Handle id={id} /><CopyName name={c.id} /></span>
          </>, 'g-combo', false, { 'data-combo': c.id }); })}</ul>
        </section> : (
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
