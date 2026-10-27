// Deleting a project for good, from its home card (spec 2026-10-20-home-gallery-refresh §5.1): says what goes with it, focuses
// 取消, and keeps a refused delete open with the server's reason.
import { useEffect, useRef, useState } from 'preact/hooks';
import { IconFilm } from './icons.tsx';
import { errText, t, uiLabel } from './i18n/index.ts';
import { useLang } from './i18n/lang.ts';

export type DeletePreview = { videos: number; fx: number; busy: string | null; /** what busy means, for the page's language */ busyCode?: { code: string; params?: Record<string, string> } };
export interface DeleteApi { deletePreview(id: string): Promise<DeletePreview>; deleteProject(id: string): Promise<unknown> }
type Row = { id: string; name?: string; thumb?: string | null };

export function DeleteDialog({ project, api, onClose, onDeleted, surface = 'home' }: { project: Row; api: DeleteApi; onClose: () => void; onDeleted: () => void; surface?: 'home' | 'editor' }) {
  useLang();
  const [pre, setPre] = useState<DeletePreview | null>(null), [working, setWorking] = useState(false), [error, setError] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  const name = project.name ?? project.id;
  useEffect(() => {
    cancel.current?.focus();
    api.deletePreview(project.id).then(setPre, (e: Error) => setError(errText(e)));
  }, [project.id]);
  const close = () => { if (!working) onClose(); };
  const confirm = async () => {
    setWorking(true); setError('');
    try { await api.deleteProject(project.id); onDeleted(); }
    catch (e) { setError(errText(e)); setWorking(false); }
  };
  return (
    <div class="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="delete-dialog" data-delete-dialog role="alertdialog" aria-labelledby="delete-title" onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
        <div class="delete-head">
          <span class="thumb">{project.thumb ? <img src={project.thumb} alt="" /> : <IconFilm size={18} />}</span>
          <h3 id="delete-title">{uiLabel('delete.title', surface, { name })}</h3>
        </div>
        <p class="delete-lead">{t('delete.lead')}</p>
        <ul class="delete-list">
          <li>{t('delete.timeline')}</li>
          {!!pre?.fx && <li>{t('delete.fx', { n: pre.fx })}</li>}
          <li>{t('delete.chat')}</li>
          <li>{t('delete.media')}</li>
          {!!pre?.videos && <li class="danger">{t('delete.videos', { n: pre.videos })}</li>}
        </ul>
        <p class="delete-note">{t('delete.note')}</p>
        {pre?.busy && <p class="delete-busy" data-delete-busy>{errText({ message: pre.busy, ...pre.busyCode })}</p>}
        {error && <p class="delete-error" role="alert">{error}</p>}
        <footer>
          <button ref={cancel} data-delete-cancel onClick={close} disabled={working}>{uiLabel('delete.cancel', surface)}</button>
          <button class="danger" data-delete-confirm onClick={() => void confirm()} disabled={!pre || !!pre.busy || working}>{uiLabel(working ? 'delete.working' : 'delete.confirm', surface)}</button>
        </footer>
      </div>
    </div>
  );
}
