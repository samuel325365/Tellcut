// The chat's API menu (spec 2026-10-24-api-picker §4): the outside sources in their groups, ticked for this conversation — the
// agent may use only those. A popover under the composer on the home page (down; up when the composer is at the bottom of a
// conversation), above it in the editor (up: it floats over the timeline); a tick counts from the next message (the page keeps the ticks and sends them with each one), Esc or a click outside closes it. Sources that cannot be used here are greyed out with the
// reason.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { SOURCE_CATEGORIES, type SourceInfo } from '@tellcut/protocol';
import { DICTS, t, uiLabel, type Key } from './i18n/index.ts';
import { IconCheck } from './icons.tsx';

type Surface = 'home' | 'editor';
const has = (k: string): k is Key => Object.hasOwn(DICTS.zh, k);

/** a source's name in the page's language; one the dictionaries do not know yet by the server's label */
export const sourceName = (id: string, label: string | undefined, surface: Surface) => (has(`src.${id}`) ? uiLabel(`src.${id}` as Key, surface) : label ?? id);

/** what it gives: pictures, footage, sound effects, music, maps, facts — and whether it is unofficial */
function gives(r: SourceInfo, surface: Surface): string {
  const words = r.kinds.filter((k) => has(`api.kind.${k}`)).map((k) => uiLabel(`api.kind.${k}` as Key, surface));
  if (r.category === 'map') words.push(uiLabel('api.kind.map', surface));
  if (r.data) words.push(uiLabel('api.kind.data', surface));
  if (r.unofficial) words.push(uiLabel('api.unofficial', surface));
  return words.join('・');
}

/** the reason it is greyed out, short (on the row) and in full (its tip) */
const why = (r: SourceInfo, surface: Surface) => uiLabel(has(`api.why.${r.reason}`) ? `api.why.${r.reason}` as Key : 'api.why.off', surface);
const whyTip = (r: SourceInfo) => (has(`api.whyTip.${r.reason}`) ? t(`api.whyTip.${r.reason}` as Key, { env: r.keyEnv ?? '' }) : '');

/** onToggle: one source ticked or unticked (against the latest list: two quick clicks must both count); onClear: none */
export function SourcePicker({ rows, error, picked, onToggle, onClear, onClose, surface }: {
  rows: SourceInfo[] | null; error?: string; picked: string[]; onToggle: (id: string) => void; onClear: () => void; onClose: () => void; surface: Surface;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // the API button toggles it itself: a press on it is not "outside"
    const down = (e: MouseEvent) => { const el = e.target as Element | null; if (!box.current?.contains(el) && !el?.closest?.('[data-api]')) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);
  // the home composer sits mid-page on an empty chat but at the bottom of a conversation: open down only when there is room
  // below, else up; either way no taller than the room on that side
  const [room, setRoom] = useState<{ up: boolean; px: number } | null>(null);
  useLayoutEffect(() => {
    const at = (box.current?.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    if (!at) return;
    const below = innerHeight - at.bottom - 16, above = at.top - 16;
    const up = surface === 'editor' || (below < 240 && above > below);
    setRoom({ up, px: Math.max(120, Math.floor(up ? above : below)) });
  }, [surface]);
  const usable = (rows ?? []).filter((r) => r.available), n = usable.filter((r) => picked.includes(r.id)).length;
  return (
    <div class={`api-pop ${surface} ${room?.up ?? surface === 'editor' ? 'up' : 'down'}`} style={room ? { '--room': `${room.px}px` } : undefined}
      data-api-picker role="dialog" aria-label={uiLabel('api.title', surface)} ref={box}>
      <div class="pop-head">
        <b>{uiLabel('api.title', surface)}</b>
        <span data-api-count>{n ? uiLabel('api.count', surface, { n }) : uiLabel('api.none', surface)}</span>
        <button class="linkbtn" data-api-clear disabled={!picked.length} onClick={onClear}>{uiLabel('api.clear', surface)}</button>
      </div>
      <div class="pop-body">
        {error && <div class="pop-note err">{t('api.loadError', { msg: error })}</div>}
        {!rows && !error && <div class="pop-note">{t('api.loading')}</div>}
        {rows && SOURCE_CATEGORIES.map((g) => {
          const list = rows.filter((r) => r.category === g);
          if (!list.length) return null;
          const ok = list.filter((r) => r.available);
          return (
            <section data-api-group={g}>
              <h6>{uiLabel(`api.cat.${g}` as Key, surface)}<span class="cnt">{ok.filter((r) => picked.includes(r.id)).length}/{ok.length}</span></h6>
              {/* one pill per source, wrapping: what it gives and what it is are in its tip, so the menu stays short */}
              <div class="pills">{list.map((r) => {
                const on = picked.includes(r.id), name = sourceName(r.id, r.label, surface);
                // one that cannot be used can still be unticked (ticked before its key went away), never ticked
                const off = !r.available && !on;
                const about = has(`src.${r.id}.desc`) ? t(`src.${r.id}.desc` as Key) : r.label;
                const tip = r.available ? `${about}\n${gives(r, surface)}` : whyTip(r);
                return (
                  <label class={`pill${on ? ' on' : ''}${r.available ? '' : ' off'}`} data-source={r.id} data-tip={tip || undefined}>
                    <input type="checkbox" checked={on} disabled={off} onChange={() => onToggle(r.id)} />
                    {on && <IconCheck size={12} />}<span class="nm">{name}</span>{!r.available && <small>{why(r, surface)}</small>}
                  </label>
                );
              })}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
