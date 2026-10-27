// Left-hand library (spec §4.1): click picks a source segment, a piece of music, a sound effect or an overlay;
// double-click auditions it in the preview (audition.ts); the button at the bottom adds the pick at the playhead.
import { useState } from 'preact/hooks';
import type { EditorState } from './store.ts';
import type { Material } from './audition.ts';
import { formatTime } from './timeline/geometry.ts';
import { thumbAt } from './timeline/thumbs.ts';
import { musicLength, uniqueBlock } from './editor.ts';
import { handleOf } from '@tellcut/protocol';
import { t } from './i18n/index.ts';
import { blockText } from './i18n/blocks.ts';
import { tip } from './tip.ts';

/** a button's hover text with the gallery handle of a shared block or sound in front (MRK-03 · double-click to audition) */
/** a block's name in the library: an English editor label (project blocks, fx.*, keep their own) */
const blockName = (d: any): string => blockText(d.type, { label: d.label, doc: '' }, 'en').label;

const withHandle = (type: string, text: string) => { const h = handleOf(type); return h ? `${h} · ${text}` : text; };

/** Scene segments from the analysed cuts; before analysis, just the first 5 s. */
const segmentsOf = (duration: number, cuts: number[] | undefined): Array<[number, number]> => {
  if (!cuts) return [[0, Math.min(5, duration)]];
  const pts = [0, ...cuts.filter((c) => c > 0 && c < duration), duration];
  return pts.slice(0, -1).map((a, i) => [a, pts[i + 1]]);
};

export function LibraryPanel({ editor, s }: { editor: any; s: EditorState }) {
  const p = s.project!, allowed = new Set(['core', ...p.meta.plugins]);
  const mine = (type: string) => allowed.has(type.split('.')[0]);
  const reg = editor.registry;
  const overlays = (reg?.itemTypes() ?? []).filter((d: any) => d.kind === 'overlay' && mine(d.type));
  const sfx = (reg?.sfxTypes() ?? []).filter((d: any) => mine(d.type));
  const [picked, setPicked] = useState<{ key: string; m: Material } | null>(null);
  /** the click/double-click handlers and the highlight of one library entry */
  const shown = new Set<string>();
  const pick = (key: string, m: Material, base = 'lib-item') => (shown.add(key), {
    class: `${base}${picked?.key === key ? ' picked' : ''}`,
    onClick: () => setPicked({ key, m }),
    onDblClick: () => { setPicked({ key, m }); editor.audition(m); },
  });
  return (
    <aside class="library">
      <h4>Media</h4>
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
      <h4>Sound effects</h4>
      {sfx.map((d: any) => <button data-add-sfx={d.type} {...tip(withHandle(d.type, t('ed.dblListen')))} {...pick(`sfx:${d.type}`, { kind: 'sfx', type: d.type })}>{blockName(d)}</button>)}
      <h4>Effects</h4>
      {overlays.map((d: any) => { const why = uniqueBlock(reg, p, d.type); return (
        <button data-add-overlay={d.type} disabled={!!why} {...tip(why || withHandle(d.type, t('ed.dblWatch')))} {...pick(`overlay:${d.type}`, { kind: 'overlay', type: d.type })}>{blockName(d)}</button>
      ); })}
      {(() => {
        // the pick must still be in the library: analysis can re-cut a source's segments
        const live = picked && shown.has(picked.key) ? picked : null;
        return (
          <div class="lib-add">
            <button class="primary" data-add-picked disabled={!live} {...tip(live ? t('ed.addPickedTip') : t('ed.addPickedFirst'))}
              onClick={() => live && editor.addMaterial(live.m)}>+ Add at playhead</button>
          </div>
        );
      })()}
    </aside>
  );
}
