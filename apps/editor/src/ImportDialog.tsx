// The import browser (home page and the editor chat): folders on this PC listed by the server; picked files and folders come back as paths.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Attachment } from './attachments.ts';
import { IconUp, IconX, kindIcon } from './icons.tsx';
import { DICTS, errText, t, uiLabel, type Key } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';

/** a place from the server: `key` (and `drive`) let the page word it; `label` is the server's Chinese, kept for an older server */
export type Place = { key?: string; label: string; path: string; kind: string; drive?: string };
type Entry = { name: string; kind: 'dir' | 'video' | 'image' | 'audio' | 'other'; size?: number };
type Folder = { path: string; parent: string | null; entries: Entry[] };
export interface FsApi {
  places(): Promise<{ places: Place[] }>;
  fsList(path: string): Promise<Folder>;
}

/** a place's name in the UI language; a place without a known code keeps the server's label */
const placeName = (p: Place): string => {
  const k = `import.place.${p.key}` as Key;
  return p.key && k in DICTS.zh ? t(k, { d: p.drive ?? '' }) : p.label;
};
const join = (dir: string, name: string) => (/[\\/]$/.test(dir) ? dir + name : `${dir}${dir.includes('/') && !dir.includes('\\') ? '/' : '\\'}${name}`);
const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
const size = (n?: number) => n === undefined ? '' : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;

export function ImportDialog({ api, onAdd, onClose, surface = 'home' }: { api: FsApi; onAdd: (a: Attachment[]) => void; onClose: () => void; surface?: 'home' | 'editor' }) {
  useLang();
  const [places, setPlaces] = useState<Place[]>([]);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Attachment[]>([]);
  // only the latest request may show: a slow first place must not replace a folder the user went to meanwhile
  const latest = useRef(0);
  const open = async (path: string) => {
    const n = ++latest.current;
    try { const f = await api.fsList(path); if (n !== latest.current) return; setFolder(f); setTyped(f.path); setError(''); }
    catch (e) { if (n === latest.current) setError(errText(e)); }
  };
  useEffect(() => {
    void api.places().then((r) => { setPlaces(r.places); if (r.places[0]) void open(r.places[0].path); }).catch((e) => setError(errText(e)));
  }, []);
  const has = (p: string) => picked.some((x) => x.path === p);
  const toggle = (a: Attachment) => setPicked(has(a.path) ? picked.filter((x) => x.path !== a.path) : [...picked, a]);
  return (
    <div class="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="import" data-import role="dialog" aria-labelledby="import-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <header>
          <h3 id="import-title">{uiLabel('import.title', surface)}</h3>
          <button class="icon-btn" data-tip={t('import.close')} aria-label={t('import.close')} onClick={onClose}><IconX /></button>
        </header>
        <div class="import-body">
          <nav class="places">{places.map((p) => {
            const Icon = kindIcon(p.kind === 'drive' ? 'drive' : 'dir');
            return <button data-place class={folder?.path === p.path ? 'on' : ''} onClick={() => void open(p.path)}><Icon size={16} /><span>{placeName(p)}</span></button>;
          })}</nav>
          <section class="browse">
            <div class="pathbar">
              <button class="icon-btn" data-tip={t('import.up')} aria-label={t('import.up')} disabled={!folder?.parent} onClick={() => folder?.parent && void open(folder.parent)}><IconUp size={16} /></button>
              <input data-path value={typed} placeholder={t('import.pathPh')} onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void open(typed.trim()); } }} />
              {/* one click: this folder (with whatever was ticked) goes in; picking it and then pressing 加入 was easy to miss */}
              <button data-pick-folder class="primary" disabled={!folder} onClick={() => {
                if (!folder) return;
                onAdd(has(folder.path) ? picked : [...picked, { path: folder.path, name: baseName(folder.path), kind: 'dir' }]);
                onClose();
              }}>{uiLabel('import.addFolder', surface)}</button>
            </div>
            {error && <p class="import-error">{error}</p>}
            <ul class="entries">
              {folder?.entries.map((e) => {
                const path = join(folder.path, e.name), Icon = kindIcon(e.kind), media = e.kind !== 'other';
                return (
                  <li data-entry={e.name} class={media ? '' : 'dim'}>
                    <input type="checkbox" disabled={!media} checked={has(path)} onClick={() => media && toggle({ path, name: e.name, kind: e.kind as Attachment['kind'] })} />
                    <span class={`k k-${e.kind}`}><Icon size={16} /></span>
                    {e.kind === 'dir'
                      ? <button class="link" data-open onClick={() => void open(path)}>{e.name}</button>
                      : <span class="name">{e.name}</span>}
                    <span class="size">{size(e.size)}</span>
                  </li>
                );
              })}
              {folder && !folder.entries.length && <li class="empty">{t('import.empty')}</li>}
            </ul>
          </section>
        </div>
        <footer>
          <span class="hint">{t('import.hint')}</span>
          <button onClick={onClose}>{uiLabel('import.cancel', surface)}</button>
          <button class="primary" data-add disabled={!picked.length} onClick={() => { onAdd(picked); onClose(); }}>{uiLabel('import.add', surface, { n: picked.length })}</button>
        </footer>
      </div>
    </div>
  );
}
