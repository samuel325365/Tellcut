// Left-hand library (spec §4.1): click picks a source segment, a piece of music, a sound effect or a block;
// double-click auditions it in the preview (audition.ts); the buttons at the bottom add the pick at the playhead, or put a
// picked block or sound in place of the one selected on the timeline. Blocks and sounds are every one the project can use
// (its own fx, the built-in ones, the shared library by category), with a search over names, handles and descriptions.
// Media follows the film by default (media-order.ts): sources in the order the timeline first uses them, the unused ones apart, the
// stretches on the timeline marked, the selected clip's source lit; a downloaded one goes by its title. Narration is apart from music.
// Three pages (Video, Audio: music, narration and sound effects, Effects), each with its own search; all three stay rendered, the
// others hidden, so a pick made on one page can still be added from another.
import { useEffect, useState } from 'preact/hooks';
import type { EditorState } from './store.ts';
import type { Material } from './audition.ts';
import { formatTime } from './timeline/geometry.ts';
import { thumbAt } from './timeline/thumbs.ts';
import { musicLength, replaceProblem, uniqueBlock } from './editor.ts';
import { BLOCK_CATEGORY, handleOf, SFX_CATEGORY } from '@tellcut/protocol';
import { t, type Key } from './i18n/index.ts';
import { matches } from './gallery.ts';
import { blockText } from './i18n/blocks.ts';
import { tip } from './tip.ts';
import { ImportDialog } from './ImportDialog.tsx';
import { liveLinks } from './editor/library.ts';
import { IconPlus } from './icons.tsx';
import { isVoice, mediaUse, orderMedia, segmentUsed, type MediaSort, type MediaTab } from './media-order.ts';

const SORT_NAMES: Record<MediaSort, string> = { timeline: 'Timeline order', added: 'Order added', name: 'Name' };
const PAGES: Array<{ key: MediaTab; label: string }> = [{ key: 'video', label: 'Video' }, { key: 'audio', label: 'Audio' }, { key: 'effects', label: 'Effects' }];
const SEARCH_PH: Record<MediaTab, string> = { video: 'Search footage', audio: 'Search music and sounds', effects: 'Search effects' };

/** a block of My blocks not in this project yet: adding it copies the entry in first (spec 2026-10-29-my-library §3.3) */
type LibPick = { slug: string; type: string; kind: 'scene' | 'overlay' };

/** a button's hover text with the gallery handle of a shared block or sound in front (MRK-03 · double-click to audition) */
/** a block's name in the library: an English editor label (project blocks, fx.*, keep their own) */
const blockName = (d: any): string => blockText(d.type, { label: d.label, doc: '' }, 'en').label;

const withHandle = (type: string, text: string) => { const h = handleOf(type); return h ? `${h} · ${text}` : text; };

/** The library's groups of blocks or sounds: this project's fx first, the built-in ones, then the shared ones in the catalog's
 *  category order (any without a category last). Names are English, like the editor's other labels. */
function groupsOf<T extends { type: string; category?: string }>(list: T[], cats: string[], catKey: 'block' | 'sfx') {
  const name = (k: Key) => t(k, {}, 'en');
  const groups = [
    { key: 'fx', label: name('group.fx'), list: list.filter((d) => d.type.startsWith('fx.')) },
    { key: 'core', label: name('group.core'), list: list.filter((d) => d.type.startsWith('core.')) },
    ...cats.map((c) => ({ key: c, label: name(`cat.${catKey}.${c}` as Key), list: list.filter((d) => !/^(fx|core)./.test(d.type) && d.category === c) })),
  ];
  const placed = new Set(groups.flatMap((g) => g.list));
  groups.push({ key: 'other', label: name('cat.sfx.other'), list: list.filter((d) => !placed.has(d)) });
  return groups.filter((g) => g.list.length);
}

/** Scene segments from the analysed cuts; before analysis, just the first 5 s. */
const segmentsOf = (duration: number, cuts: number[] | undefined): Array<[number, number]> => {
  if (!cuts) return [[0, Math.min(5, duration)]];
  const pts = [0, ...cuts.filter((c) => c > 0 && c < duration), duration];
  return pts.slice(0, -1).map((a, i) => [a, pts[i + 1]]);
};

export function LibraryPanel({ editor, s }: { editor: any; s: EditorState }) {
  const p = s.project!, reg = editor.registry;
  const tab = s.layout.mediaTab, [qs, setQs] = useState<Record<MediaTab, string>>({ video: '', audio: '', effects: '' }), q = qs.effects, qa = qs.audio;
  const hitIn = (query: string) => (d: any) => matches(query, handleOf(d.type), d.type, d.label ?? '', d.doc ?? '', blockName(d), blockText(d.type, { label: d.label ?? '', doc: d.doc ?? '' }).doc);
  const blocks = groupsOf((reg?.itemTypes() ?? []).filter(hitIn(q)), Object.keys(BLOCK_CATEGORY), 'block');
  const sfx = groupsOf((reg?.sfxTypes() ?? []).filter(hitIn(qa)), Object.keys(SFX_CATEGORY), 'sfx');
  const [picked, setPicked] = useState<{ key: string; m?: Material; lib?: LibPick } | null>(null);
  // My blocks (spec 2026-10-29-my-library §3.2, §3.3): the ones saved from this project (★), this project's copies, the rest to add
  const lib = s.library, links = liveLinks(s);
  const savedHere = new Set((lib.index?.blocks ?? []).filter((b) => b.from.project === s.id).map((b) => b.type));
  const linkOf = (type: string) => links.find((l) => l.types.includes(type));
  const mine = (lib.index?.blocks ?? []).filter((b) => !reg?.item(b.type) && !linkOf(b.type)).filter((b) => matches(q, undefined, b.type, b.name, b.desc));
  const star = (type: string) => (
    <button class={`lib-star${savedHere.has(type) ? ' on' : ''}`} data-save-block={type} {...tip(t(savedHere.has(type) ? 'lib.savedTip' : 'lib.saveTip'))}
      onClick={() => editor.openSaveBlock(type)}>{savedHere.has(type) ? '★' : '☆'}</button>
  );
  const [browsing, setBrowsing] = useState(false);
  const use = mediaUse(p), sort = s.layout.mediaSort, label = (id: string) => s.titles[id] ?? id;
  const order = orderMedia(Object.keys(p.sources).filter((id) => matches(qs.video, undefined, id, s.titles[id] ?? '')), sort, use.first, label);
  // the sources and music of what is selected on the timeline: lit here, and scrolled to
  const lit = new Set(p.tracks.flatMap((tr) => tr.items as any[]).filter((it) => s.selection.includes(it.id)).map((it) => it.source ?? it.media).filter(Boolean));
  const litKey = [...lit].join('|');
  // on the page shown (switching to it scrolls too); a page that holds the selection but is not shown has a dot instead
  useEffect(() => { if (lit.size) document.querySelector('.library .lib-page:not([hidden]) :is(.src.lit, .lib-item.lit)')?.scrollIntoView?.({ block: 'nearest' }); }, [litKey, tab]);
  const litPages = new Set<MediaTab>([...lit].map((id) => (id in p.sources ? 'video' : 'audio')));
  const media = Object.keys(p.media).filter((m) => matches(qa, undefined, m, s.titles[m] ?? ''));
  const voice = media.filter((m) => isVoice(p.media[m])), music = media.filter((m) => !isVoice(p.media[m]));
  const counts: Record<MediaTab, number> = { video: Object.keys(p.sources).length, audio: Object.keys(p.media).length + (reg?.sfxTypes().length ?? 0),
    effects: (reg?.itemTypes().length ?? 0) + (lib.index?.blocks ?? []).filter((b) => !reg?.item(b.type) && !linkOf(b.type)).length };
  const setTab = (mediaTab: MediaTab) => editor.setLayout({ mediaTab });
  // an import shows the page its files went to: Audio when they are all sound, else Video
  const importFiles = (a: Array<{ path: string; kind: string }>) => { setTab(a.length && a.every((x) => x.kind === 'audio') ? 'audio' : 'video'); void editor.importMedia(a.map((x) => x.path)); };
  const inOrder = (ids: string[]) => { const o = orderMedia(ids, sort, use.first, label); return [...o.used, ...o.unused]; };
  /** the click/double-click handlers and the highlight of one library entry */
  const shown = new Set<string>();
  const pickLib = (b: LibPick) => { const key = `mine:${b.type}`; shown.add(key); return {
    class: `lib-item${picked?.key === key ? ' picked' : ''}`,
    onClick: () => setPicked({ key, lib: b }),
    onDblClick: () => { setPicked({ key, lib: b }); editor.store.set({ notice: t('lib.mineAudition') }); },
  }; };
  const pick = (key: string, m: Material, base = 'lib-item') => (shown.add(key), {
    class: `${base}${picked?.key === key ? ' picked' : ''}`,
    onClick: () => setPicked({ key, m }),
    onDblClick: () => { setPicked({ key, m }); editor.audition(m); },
  });
  const source = (id: string) => { const src = p.sources[id], title = s.titles[id]; return (
    <div class={`src${lit.has(id) ? ' lit' : ''}`} data-src={id} key={id}>
      <div class="src-name" {...(title ? { 'data-tip': id } : {})}>{title ?? id} <small>{src.kind === 'image' ? 'Photo' : formatTime(src.duration)}{s.offline.includes(id) ? ` · ${t('ed.libOffline')}` : ''}</small></div>
      <div class="segs">{src.kind === 'image' ? (() => {
        // a photo: one entry (spec 2026-10-14 §5)
        const info = s.thumbs[id], tile = info && thumbAt(info, 0, 18);
        return (
          <button data-add-source={id} data-range="0-3" {...tip(t('ed.photoTip') + (use.first.has(id) ? t('ed.onTimeline') : ''))} {...pick(`photo:${id}`, { kind: 'clip', source: id, from: 0, len: 3 }, `seg${use.first.has(id) ? ' used' : ''}`)}>
            {tile && <span class="seg-thumb" style={{ width: `${tile.w}px`, backgroundImage: `url(${info.url})`, backgroundPosition: tile.bg, backgroundSize: tile.size }} />}
            <span class="seg-t">Photo</span>
          </button>
        );
      })() : segmentsOf(src.duration, s.cuts[id]).map(([a, b]) => {
        const info = s.thumbs[id], tile = info && thumbAt(info, a + Math.min(1, (b - a) / 2), 18);
        return (
          <button data-add-source={id} data-range={`${a}-${b}`} {...tip(t('ed.segTip', { a: a.toFixed(1), b: b.toFixed(1) }) + (segmentUsed(use.ranges.get(id), a, b) ? t('ed.onTimeline') : ''))}
            {...pick(`clip:${id}:${a}`, { kind: 'clip', source: id, from: a, len: b - a }, `seg${segmentUsed(use.ranges.get(id), a, b) ? ' used' : ''}`)}>
            {tile && <span class="seg-thumb" style={{ width: `${tile.w}px`, backgroundImage: `url(${info.url})`, backgroundPosition: tile.bg, backgroundSize: tile.size }} />}
            <span class="seg-t">{formatTime(a)}</span><small>{(b - a).toFixed(1)}s</small>
          </button>
        );
      })}</div>
    </div>
  ); };
  // narration shows no tempo: the beats found in speech mean nothing
  const audio = (m: string) => { const len = musicLength(s.peaks[`media:${m}`]), on = use.first.has(m), b = pick(`music:${m}`, { kind: 'music', media: m }); return (
    <button data-add-music={m} {...tip(t('ed.dblListen') + (on ? t('ed.onTimeline') : ''))} {...b} class={`${b.class}${on ? ' used' : ''}${lit.has(m) ? ' lit' : ''}`}>{label(m)}{len ? ` · ${formatTime(len)}` : ''}{s.beats[m] && !isVoice(p.media[m]) ? ` · ${Math.round(s.beats[m].bpm)} BPM` : ''}</button>
  ); };
  return (
    <aside class="library">
      <div class="lib-pages" role="tablist">{PAGES.map((x) => (
        <button role="tab" data-lib-tab={x.key} aria-selected={tab === x.key} class={litPages.has(x.key) && tab !== x.key ? 'has-lit' : undefined}
          {...(litPages.has(x.key) && tab !== x.key ? tip(t('ed.libTabLit')) : {})} onClick={() => setTab(x.key)}>{x.label}<small>{counts[x.key]}</small></button>
      ))}</div>
      <div class="lib-tools">
        <input class="lib-search" type="search" data-lib-search placeholder={SEARCH_PH[tab]} value={qs[tab]} {...tip(t('ed.libSearchTip'))}
          onInput={(e) => { const v = (e.target as HTMLInputElement).value; setQs((x) => ({ ...x, [tab]: v })); }} />
        {/* Import (spec 2026-10-29-media-import): files from this PC straight into the project, without the Agent */}
        {editor.fs && <button data-import-media disabled={!!s.importing} {...tip(t('ed.importTip'))} onClick={() => setBrowsing(true)}><IconPlus size={12} /> Import</button>}
      </div>
      {(s.importing || s.importNote) && <p class="lib-note" data-import-note>{s.importing ? t('ed.importing', s.importing) : s.importNote}</p>}
      {browsing && editor.fs && <ImportDialog api={editor.fs} surface="editor" onAdd={importFiles} onClose={() => setBrowsing(false)} />}
      <div class="lib-page" data-lib-page="video" hidden={tab !== 'video'}>
      <select class="media-sort" data-media-sort value={sort} {...tip(t('ed.mediaSortTip'))} onChange={(e) => editor.setLayout({ mediaSort: (e.target as HTMLSelectElement).value as MediaSort })}>
        {(Object.keys(SORT_NAMES) as MediaSort[]).map((k) => <option value={k}>{SORT_NAMES[k]}</option>)}
      </select>
      {order.used.map(source)}
      {order.unused.length > 0 && (order.used.length
        ? <details class="lib-group media-unused" data-media-unused open><summary>Not used<small>{order.unused.length}</small></summary>{order.unused.map(source)}</details>
        : order.unused.map(source))}
      </div>
      <div class="lib-page" data-lib-page="audio" hidden={tab !== 'audio'}>
      <h4>Music</h4>
      {!!lib.project?.styles.length && <div class="lib-styles" data-project-styles {...tip(t('lib.projectStylesTip'))}><small>This project's music styles</small>
        {lib.project.styles.map((x) => { const on = lib.project!.savedStyles.includes(x.id); return (
          <div class="lib-row"><span class="lib-item lib-text">{x.label}</span>
            <button class={`lib-star${on ? ' on' : ''}`} data-save-style={x.id} {...tip(t(on ? 'lib.savedTip' : 'lib.styleSaveTip'))} onClick={() => editor.openSaveStyle(x.id, x.label)}>{on ? '★' : '☆'}</button></div>
        ); })}</div>}
      {inOrder(music).map(audio)}
      {voice.length > 0 && <><h4 data-voice-head>Voice-over</h4>{inOrder(voice).map(audio)}</>}
      <h4>Sound effects</h4>
      {sfx.map((g) => <details class="lib-group" data-lib-group={`sfx:${g.key}`} open={!!qa.trim() || g.key === 'fx' || g.key === 'core'}>
        <summary>{g.label}<small>{g.list.length}</small></summary>
        {g.list.map((d: any) => <button data-add-sfx={d.type} {...tip(withHandle(d.type, t('ed.dblListen')))} {...pick(`sfx:${d.type}`, { kind: 'sfx', type: d.type })}>{blockName(d)}</button>)}
      </details>)}
      </div>
      <div class="lib-page" data-lib-page="effects" hidden={tab !== 'effects'}>
      {/* a group opens by itself while searching; this project's own fx and the few built-in ones are open from the start */}
      {[...blocks.filter((g) => g.key === 'fx'), ...(mine.length ? [{ key: 'mine', label: t('group.mine', {}, 'en'), list: [] as any[] }] : []), ...blocks.filter((g) => g.key !== 'fx')].map((g) => <details class="lib-group" data-lib-group={`block:${g.key}`} open={!!q.trim() || g.key === 'fx' || g.key === 'mine' || g.key === 'core'}>
        <summary>{g.label}<small>{g.key === 'mine' ? mine.length : g.list.length}</small></summary>
        {g.key === 'mine' ? mine.map((b) => (
          <button data-add-mine={b.type} {...tip(t('lib.mineTip'))} {...pickLib({ slug: b.slug, type: b.type, kind: b.kind })}>{b.name}</button>
        )) : g.list.map((d: any) => { const why = uniqueBlock(reg, p, d.type), button = (
          <button data-add-overlay={d.type} disabled={!!why} {...tip(why || withHandle(d.type, d.kind === 'scene' ? t('ed.sceneTip') : t('ed.dblWatch')))} {...pick(`overlay:${d.type}`, { kind: 'overlay', type: d.type })}>{blockName(d)}</button>
        );
          if (g.key !== 'fx') return button;
          // this project's own: ☆ saves it to My blocks; a copy from My blocks says so, and offers a newer version
          const link = linkOf(d.type);
          return <div class="lib-row">{button}
            {link && <span class="lib-tag" data-from-mine={link.slug} {...tip(t(link.gone ? 'lib.goneTip' : 'lib.fromMineTip'))}>from My blocks</span>}
            {link?.outdated && <button class="lib-update" data-update-block={link.slug} {...tip(t('lib.updateTip'))} onClick={() => void editor.updateLibraryBlock(link.slug)}>Update</button>}
            {!link && star(d.type)}</div>;
        })}
      </details>)}
      </div>
      {(() => {
        // the pick must still be in the library: analysis can re-cut a source's segments
        const live = picked && shown.has(picked.key) ? picked : null;
        // a background or frame goes under the video: it can only take the place of one already there
        const scene = live?.lib ? live.lib.kind === 'scene' : live?.m?.kind === 'overlay' && reg?.item(live.m.type)?.kind === 'scene';
        const sel = s.selection.length === 1 ? s.selection[0] : undefined;
        const swap = live?.m && (live.m.kind === 'overlay' || live.m.kind === 'sfx') ? live.m.type : undefined;
        const why = swap ? replaceProblem(reg, p, sel, swap) : t('ed.replacePickFirst');
        return (
          <div class="lib-add">
            <button class="primary" data-add-picked disabled={!live || scene} {...tip(!live ? t('ed.addPickedFirst') : scene ? t('ed.sceneAdd') : t('ed.addPickedTip'))}
              onClick={() => { if (live?.lib) void editor.useLibraryBlock(live.lib.slug, live.lib.type); else if (live?.m) editor.addMaterial(live.m); }}>+ Add at playhead</button>
            <button data-replace-picked disabled={!!why} {...tip(why || t('ed.replaceTip'))}
              onClick={() => sel && swap && editor.replaceBlock(sel, swap)}>⇄ Replace selected</button>
          </div>
        );
      })()}
    </aside>
  );
}
