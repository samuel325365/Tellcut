// The properties panel's look picker (spec 2026-11-23-block-variants §4): a closed row (the current look's small picture and
// name) that opens in place into a grid of tiles, a picture and a name each, the one in use marked; under the grid the tile pointed
// at (else the one in use) shows larger with its one sentence, which tells apart looks whose small pictures do not. Picking a tile
// closes the grid. The Template row uses it with no `current`: a template is applied once, the item never remembers which.
// Pictures are the gallery's (in the UI language); a tile without one, or whose picture fails, shows its name alone.
// With many tiles the open grid has a search box on top, focused as it opens (the gallery's rule: Latin at a word's start, in the
// key where one of its parts starts, CJK anywhere), over each tile's key, name, sentence and `words`; Esc empties it first, Enter
// picks the one tile left.
import { useEffect, useRef, useState } from 'preact/hooks';
import { aliasText } from '@tellcut/protocol';
import { idFields, matches, thumbIn } from './gallery.ts';
import { blockText } from './i18n/blocks.ts';
import { t } from './i18n/index.ts';
import { getLang } from './i18n/lang.ts';
import { tip } from './tip.ts';
import { CroppedImg } from './CroppedImg.tsx';
import type { PicCrop } from './pic-crop.ts';

/** a look: `words` are more words search finds it by and nothing shows (its English and Japanese names and sentences, its aliases) */
export interface LookTile { key: string; label: string; doc: string; thumb?: string; words?: string;
  /** the part of the picture the row and the tile show (the gallery's crop of a look drawn in a small part of the frame); the larger
   *  picture under the grid always shows it whole */
  crop?: PicCrop }

/** more tiles than this and the open grid gets a search box: two rows of four are taken in at a glance, more mean scrolling */
export const LOOK_SEARCH_MIN = 8;

/** a look's `words`, as the library's search reads a variant (LibraryPanel variantWords): its English and Japanese name and
 *  sentence and its aliases; `id` is `<type>@<value>` for a variant, `<type>#<id>` for a template */
export function lookWords(id: string, x: { label: string; doc: string }): string {
  const en = blockText(id, x, 'en'), ja = blockText(id, x, 'ja');
  return [en.label, en.doc, ja.label, ja.doc, aliasText(id)].join(' ');
}

/** a picture (only its `crop` when it has one: CroppedImg); `none` in its place (a caption's Aa, a look's first letter) when there
 *  is none or it fails to load, else nothing */
export function Pic({ src, none, cls = 'cap-none', crop }: { src?: string; none?: string; cls?: string; crop?: PicCrop }) {
  const [broken, setBroken] = useState('');
  if (src && broken !== src) return crop ? <CroppedImg src={src} crop={crop} onError={() => setBroken(src)} /> : <img src={src} alt="" loading="lazy" onError={() => setBroken(src)} />;
  return none === undefined ? null : <span class={cls}>{none}</span>;
}

/** Enter or Space on the tile itself */
const pressed = (e: KeyboardEvent) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ');

export function LookPicker({ name, label, hint, tiles, current, placeholder, fallback, onPick }: {
  name: string;                 // data-field
  label: string; hint?: string; // the row's name and its tooltip (as fields.tsx Row does)
  tiles: LookTile[];
  current?: string;             // the tile in use; absent: an action (templates), no tile is marked
  placeholder?: string;         // the closed row's words when nothing is current
  fallback?: string;            // the closed row's words when `current` names no tile (an old project's value)
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false), [hover, setHover] = useState<string | null>(null), [q, setQ] = useState('');
  const row = useRef<HTMLButtonElement>(null), box = useRef<HTMLInputElement>(null), grid = useRef<HTMLUListElement>(null);
  const searchable = tiles.length > LOOK_SEARCH_MIN;
  const list = searchable && q ? tiles.filter((x) => matches(q, undefined, ...idFields(x.key), x.label, x.doc, x.words ?? '')) : tiles;
  // the box takes the focus as the grid opens; without one the focus stays on the row, as it was
  useEffect(() => { if (open) box.current?.focus(); }, [open]);
  const lang = getLang(), src = (x: LookTile) => thumbIn(x.thumb, lang);
  const now = current === undefined ? undefined : tiles.find((x) => x.key === current);
  // a value no tile names (an old project's) is shown as it is, never dropped
  const words = now ? now.label : current !== undefined ? (fallback ?? current) : (placeholder ?? '');
  const shown = tiles.find((x) => x.key === hover) ?? now;
  // focus goes back to the row: the tile that had it is gone with the grid
  const close = () => { setOpen(false); setHover(null); setQ(''); row.current?.focus(); };
  const onBoxKey = (e: KeyboardEvent) => {
    // Esc empties the box first (the grid stays open), and closes it only once the box is empty
    if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); }
    // Enter picks only a single match: with several, which one was meant is a guess
    else if (e.key === 'Enter') { e.preventDefault(); if (list.length === 1) pick(list[0].key); }
    else if (e.key === 'ArrowDown') { const first = grid.current?.querySelector<HTMLElement>('[data-look-tile]'); if (first) { e.preventDefault(); first.focus(); } }
  };
  const pick = (key: string) => { close(); onPick(key); };
  const point = (key: string) => ({ onMouseEnter: () => setHover(key), onMouseLeave: () => setHover(null), onFocus: () => setHover(key), onBlur: () => setHover(null) });
  return (
    <div class={`field look-field${open ? ' open' : ''}`} data-field={name}
      onKeyDown={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
      <span {...(hint ? { 'data-tip': hint } : {})}>{label}</span>
      <button type="button" ref={row} class="look-row" data-look-picker={name} aria-expanded={open} aria-label={`${label}: ${words}`}
        onClick={() => (open ? close() : setOpen(true))}>
        {now && <Pic src={src(now)} crop={now.crop} />}
        <span class="look-row-name">{words}</span>
        <span class="look-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <>
        {searchable && <input type="search" ref={box} class="look-search" data-look-search placeholder={t('ed.lookSearch')} aria-label={t('ed.lookSearch')}
          value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} onKeyDown={onBoxKey} />}
        <ul class="look-grid" data-look-grid ref={grid}>
          {list.length === 0 && <li class="look-empty" data-look-empty>{t('ed.lookEmpty')}</li>}
          {list.map((x) => {
            const on = x.key === current;
            return (
              <li class={`look-tile${on ? ' on' : ''}`} data-look-tile={x.key} role="button" tabIndex={0} aria-pressed={on} {...tip(x.label)} {...point(x.key)}
                onClick={() => pick(x.key)} onKeyDown={(e) => { if (pressed(e)) { e.preventDefault(); pick(x.key); } }}>
                <Pic src={src(x)} none={Array.from(x.label)[0] ?? ''} cls="look-none" crop={x.crop} />
                <span class="look-name">{x.label}</span>
              </li>
            );
          })}
        </ul>
        {shown && <div class="look-shown" data-look-shown={shown.key}>
          <Pic src={src(shown)} />
          <strong>{shown.label}</strong>
          {shown.doc && <p>{shown.doc}</p>}
        </div>}
      </>}
    </div>
  );
}
