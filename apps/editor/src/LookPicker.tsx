// The properties panel's look picker (spec 2026-11-23-block-variants §4): a closed row (the current look's small picture and
// name) that opens in place into a grid of tiles, a picture and a name each, the one in use marked; under the grid the tile pointed
// at (else the one in use) shows larger with its one sentence, which tells apart looks whose small pictures do not. Picking a tile
// closes the grid. The Template row uses it with no `current`: a template is applied once, the item never remembers which.
// Pictures are the gallery's (in the UI language); a tile without one, or whose picture fails, shows its name alone.
import { useRef, useState } from 'preact/hooks';
import { thumbIn } from './gallery.ts';
import { getLang } from './i18n/lang.ts';
import { tip } from './tip.ts';

export interface LookTile { key: string; label: string; doc: string; thumb?: string }

/** a picture; `none` in its place (a caption's Aa, a look's first letter) when there is none or it fails to load, else nothing */
export function Pic({ src, none, cls = 'cap-none' }: { src?: string; none?: string; cls?: string }) {
  const [broken, setBroken] = useState('');
  if (src && broken !== src) return <img src={src} alt="" loading="lazy" onError={() => setBroken(src)} />;
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
  const [open, setOpen] = useState(false), [hover, setHover] = useState<string | null>(null);
  const row = useRef<HTMLButtonElement>(null);
  const lang = getLang(), src = (x: LookTile) => thumbIn(x.thumb, lang);
  const now = current === undefined ? undefined : tiles.find((x) => x.key === current);
  // a value no tile names (an old project's) is shown as it is, never dropped
  const words = now ? now.label : current !== undefined ? (fallback ?? current) : (placeholder ?? '');
  const shown = tiles.find((x) => x.key === hover) ?? now;
  // focus goes back to the row: the tile that had it is gone with the grid
  const close = () => { setOpen(false); setHover(null); row.current?.focus(); };
  const pick = (key: string) => { close(); onPick(key); };
  const point = (key: string) => ({ onMouseEnter: () => setHover(key), onMouseLeave: () => setHover(null), onFocus: () => setHover(key), onBlur: () => setHover(null) });
  return (
    <div class={`field look-field${open ? ' open' : ''}`} data-field={name}
      onKeyDown={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
      <span {...(hint ? { 'data-tip': hint } : {})}>{label}</span>
      <button type="button" ref={row} class="look-row" data-look-picker={name} aria-expanded={open} aria-label={`${label}: ${words}`}
        onClick={() => (open ? close() : setOpen(true))}>
        {now && <Pic src={src(now)} />}
        <span class="look-row-name">{words}</span>
        <span class="look-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <>
        <ul class="look-grid" data-look-grid>
          {tiles.map((x) => {
            const on = x.key === current;
            return (
              <li class={`look-tile${on ? ' on' : ''}`} data-look-tile={x.key} role="button" tabIndex={0} aria-pressed={on} {...tip(x.label)} {...point(x.key)}
                onClick={() => pick(x.key)} onKeyDown={(e) => { if (pressed(e)) { e.preventDefault(); pick(x.key); } }}>
                <Pic src={src(x)} none={Array.from(x.label)[0] ?? ''} cls="look-none" />
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
