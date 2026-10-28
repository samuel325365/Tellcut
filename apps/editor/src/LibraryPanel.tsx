// Left-hand library (spec §4.1): click picks a source segment, a piece of music, a sound effect or a block;
// double-click auditions it in the preview (audition.ts); the buttons at the bottom add the pick at the playhead, or put a
// picked block or sound in place of the one selected on the timeline. Blocks and sounds are every one the project can use
// (its own fx, the built-in ones, the shared library by category), with a search over names, handles and descriptions.
import { useState } from 'preact/hooks';
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
import { IconPlus } from './icons.tsx';

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
  const [q, setQ] = useState('');
  const hit = (d: any) => matches(q, handleOf(d.type), d.type, d.label ?? '', d.doc ?? '', blockName(d), blockText(d.type, { label: d.label ?? '', doc: d.doc ?? '' }).doc);
  const blocks = groupsOf((reg?.itemTypes() ?? []).filter(hit), Object.keys(BLOCK_CATEGORY), 'block');
  const sfx = groupsOf((reg?.sfxTypes() ?? []).filter(hit), Object.keys(SFX_CATEGORY), 'sfx');
  const [picked, setPicked] = useState<{ key: string; m: Material } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  /** the click/double-click handlers and the highlight of one library entry */
  const shown = new Set<string>();
  const pick = (key: string, m: Material, base = 'lib-item') => (shown.add(key), {
    class: `${base}${picked?.key === key ? ' picked' : ''}`,
    onClick: () => setPicked({ key, m }),
    onDblClick: () => { setPicked({ key, m }); editor.audition(m); },
  });
  return (
    <aside class="library">
      {/* Import (spec 2026-10-29-media-import): files from this PC straight into the project, without the Agent */}
      <div class="lib-head"><h4>Media</h4>{editor.fs && (
        <button data-import-media disabled={!!s.importing} {...tip(t('ed.importTip'))} onClick={() => setBrowsing(true)}><IconPlus size={12} /> Import</button>
      )}</div>
      {(s.importing || s.importNote) && <p class="lib-note" data-import-note>{s.importing ? t('ed.importing', s.importing) : s.importNote}</p>}
      {browsing && editor.fs && <ImportDialog api={editor.fs} surface="editor" onAdd={(a) => void editor.importMedia(a.map((x) => x.path))} onClose={() => setBrowsing(false)} />}
      {Object.entries(p.sources).map(([id, src]) => (
        <div class="src">
          <div class="src-name">{id} <small>{src.kind === 'image' ? 'Photo' : formatTime(src.duration)}{s.offline.includes(id) ? ` · ${t('ed.libOffline')}` : ''}</small></div>
          <div class="segs">{src.kind === 'image' ? (() => {
            // a photo: one entry (spec 2026-10-14 §5)
            const info = s.thumbs[id], tile = info && thumbAt(info, 0, 18);
            return (
              <button data-add-source={id} data-range="0-3" {...tip(t('ed.photoTip'))} {...pick(`photo:${id}`, { kind: 'clip', source: id, from: 0, len: 3 }, 'seg')}>
                {tile && <span class="seg-thumb" style={{ width: `${tile.w}px`, backgroundImage: `url(${info.url})`, backgroundPosition: tile.bg, backgroundSize: tile.size }} />}
                <span class="seg-t">Photo</span>
              </button>
            );
          })() : segmentsOf(src.duration, s.cuts[id]).map(([a, b]) => {
            const info = s.thumbs[id], tile = info && thumbAt(info, a + Math.min(1, (b - a) / 2), 18);
            return (
              <button data-add-source={id} data-range={`${a}-${b}`} {...tip(t('ed.segTip', { a: a.toFixed(1), b: b.toFixed(1) }))} {...pick(`clip:${id}:${a}`, { kind: 'clip', source: id, from: a, len: b - a }, 'seg')}>
                {tile && <span class="seg-thumb" style={{ width: `${tile.w}px`, backgroundImage: `url(${info.url})`, backgroundPosition: tile.bg, backgroundSize: tile.size }} />}
                <span class="seg-t">{formatTime(a)}</span><small>{(b - a).toFixed(1)}s</small>
              </button>
            );
          })}</div>
        </div>
      ))}
      <h4>Music</h4>
      {Object.keys(p.media).map((m) => { const len = musicLength(s.peaks[`media:${m}`]); return (
        <button data-add-music={m} {...tip(t('ed.dblListen'))} {...pick(`music:${m}`, { kind: 'music', media: m })}>{m}{len ? ` · ${formatTime(len)}` : ''}{s.beats[m] ? ` · ${Math.round(s.beats[m].bpm)} BPM` : ''}</button>
      ); })}
      <input class="lib-search" type="search" data-lib-search placeholder="Search effects and sounds" value={q} {...tip(t('ed.libSearchTip'))}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <h4>Effects</h4>
      {/* a group opens by itself while searching; this project's own fx and the few built-in ones are open from the start */}
      {blocks.map((g) => <details class="lib-group" data-lib-group={`block:${g.key}`} open={!!q.trim() || g.key === 'fx' || g.key === 'core'}>
        <summary>{g.label}<small>{g.list.length}</small></summary>
        {g.list.map((d: any) => { const why = uniqueBlock(reg, p, d.type); return (
          <button data-add-overlay={d.type} disabled={!!why} {...tip(why || withHandle(d.type, d.kind === 'scene' ? t('ed.sceneTip') : t('ed.dblWatch')))} {...pick(`overlay:${d.type}`, { kind: 'overlay', type: d.type })}>{blockName(d)}</button>
        ); })}
      </details>)}
      <h4>Sound effects</h4>
      {sfx.map((g) => <details class="lib-group" data-lib-group={`sfx:${g.key}`} open={!!q.trim() || g.key === 'fx' || g.key === 'core'}>
        <summary>{g.label}<small>{g.list.length}</small></summary>
        {g.list.map((d: any) => <button data-add-sfx={d.type} {...tip(withHandle(d.type, t('ed.dblListen')))} {...pick(`sfx:${d.type}`, { kind: 'sfx', type: d.type })}>{blockName(d)}</button>)}
      </details>)}
      {(() => {
        // the pick must still be in the library: analysis can re-cut a source's segments
        const live = picked && shown.has(picked.key) ? picked : null;
        // a background or frame goes under the video: it can only take the place of one already there
        const scene = live?.m.kind === 'overlay' && reg?.item(live.m.type)?.kind === 'scene';
        const sel = s.selection.length === 1 ? s.selection[0] : undefined;
        const swap = live && (live.m.kind === 'overlay' || live.m.kind === 'sfx') ? live.m.type : undefined;
        const why = swap ? replaceProblem(reg, p, sel, swap) : t('ed.replacePickFirst');
        return (
          <div class="lib-add">
            <button class="primary" data-add-picked disabled={!live || scene} {...tip(!live ? t('ed.addPickedFirst') : scene ? t('ed.sceneAdd') : t('ed.addPickedTip'))}
              onClick={() => live && editor.addMaterial(live.m)}>+ Add at playhead</button>
            <button data-replace-picked disabled={!!why} {...tip(why || t('ed.replaceTip'))}
              onClick={() => sel && swap && editor.replaceBlock(sel, swap)}>⇄ Replace selected</button>
          </div>
        );
      })()}
    </aside>
  );
}
