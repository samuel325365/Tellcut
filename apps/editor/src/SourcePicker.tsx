// The chat's API menu (spec 2026-10-24-api-picker §4): the outside sources in their groups, ticked for this conversation — the
// agent may use only those. A popover under the composer on the home page (down; up when the composer is at the bottom of a
// conversation), above it in the editor (up: it floats over the timeline); a tick counts from the next message (the page keeps the ticks and sends them with each one), Esc or a click outside closes it. Sources that cannot be used here are greyed out with the
// reason; one that only lacks its key opens a box under its group to paste one (the server tries it, then keeps it in
// sources.local.json).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { SOURCE_CATEGORIES, type SourceInfo, type SourceKeySaved } from '@tellcut/protocol';
import { DICTS, errText, t, uiLabel, type Key } from './i18n/index.ts';
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

/** The box for one source's key: the key typed or pasted (never shown), Save, and a link to where a key is asked for. Saved: the
 *  menu reloads its list and ticks it (onSaved). */
function KeyBox({ r, surface, onSave, onSaved }: { r: SourceInfo; surface: Surface; onSave: (id: string, key: string) => Promise<SourceKeySaved>; onSaved: (id: string, r: SourceKeySaved) => void }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const save = async () => {
    if (busy || !text.trim()) return;
    setBusy(true); setErr('');
    try { onSaved(r.id, await onSave(r.id, text.trim())); }
    catch (e) { setErr(errText(e)); setBusy(false); }
  };
  const name = sourceName(r.id, r.label, surface);
  return (
    <div class="key-box" data-key-box={r.id}>
      <div class="key-row">
        <input ref={input} type="password" autocomplete="off" spellcheck={false} value={text} disabled={busy} data-key-input
          aria-label={uiLabel('api.key.label', surface, { name })} placeholder={uiLabel('api.key.label', surface, { name })}
          onInput={(e) => { setText((e.target as HTMLInputElement).value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} />
        <button class="btn" data-key-save disabled={busy || !text.trim()} onClick={() => void save()}>{uiLabel(busy ? 'api.key.saving' : 'api.key.save', surface)}</button>
      </div>
      {r.keyUrl && <a href={r.keyUrl} target="_blank" rel="noreferrer noopener" data-key-get>{uiLabel('api.key.get', surface)} ↗</a>}
      {err && <div class="key-msg err" data-key-error>{err}</div>}
    </div>
  );
}

/** onToggle: one source ticked or unticked (against the latest list: two quick clicks must both count); onClear: none;
 *  onSaveKey (left out: no key box): a pasted key sent to the server; onKeySaved: it was kept — reload the list and tick it */
export function SourcePicker({ rows, error, picked, onToggle, onClear, onClose, surface, onSaveKey, onKeySaved }: {
  rows: SourceInfo[] | null; error?: string; picked: string[]; onToggle: (id: string) => void; onClear: () => void; onClose: () => void; surface: Surface;
  onSaveKey?: (id: string, key: string) => Promise<SourceKeySaved>; onKeySaved?: (id: string) => void;
}) {
  const [keying, setKeying] = useState<string | null>(null), [note, setNote] = useState<{ id: string; text: string } | null>(null);
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
                // only its key is missing: a click opens (or closes) its key box instead
                const keyable = !!onSaveKey && !on && r.reason === 'key';
                return (
                  <label class={`pill${on ? ' on' : ''}${r.available ? '' : ' off'}${keyable ? ' keyable' : ''}${keying === r.id ? ' open' : ''}`} data-source={r.id} data-tip={tip || undefined}
                    onClick={keyable ? (e) => { e.preventDefault(); setNote(null); setKeying((k) => (k === r.id ? null : r.id)); } : undefined}>
                    <input type="checkbox" checked={on} disabled={off} onChange={() => onToggle(r.id)} />
                    {on && <IconCheck size={12} />}<span class="nm">{name}</span>{!r.available && <small>{why(r, surface)}</small>}
                  </label>
                );
              })}</div>
              {(() => {
                const r = keying ? list.find((x) => x.id === keying && x.reason === 'key') : undefined;
                return r && onSaveKey && <KeyBox key={r.id} r={r} surface={surface} onSave={onSaveKey}
                  onSaved={(id, res) => { setKeying(null); if (!res.tried) setNote({ id, text: t('api.key.untried', { name: sourceName(id, r.label, surface) }) }); onKeySaved?.(id); }} />;
              })()}
              {note && list.some((x) => x.id === note.id) && <div class="key-msg warn" data-key-note>{note.text}</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
