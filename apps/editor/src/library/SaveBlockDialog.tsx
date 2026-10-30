// "Save to My blocks" (spec 2026-10-29-my-library §3.2): the block playing on the left; its name, description and category on the
// right; "Have the Agent make it generic" with what that means; what is saved along with it; and, when the library already has
// one by the same id, "Replace the old one" or "Keep both" in place of Save. The state is the editor's (editor/library.ts).
import { useEffect, useRef } from 'preact/hooks';
import { BLOCK_CATEGORY } from '@tellcut/protocol';
import type { BlockCategory, Project } from '@tellcut/engine';
import { PlayerPreview, projectPlayer } from '../PlayerPreview.tsx';
import { nameList, t, type Key } from '../i18n/index.ts';
import type { SaveDialog } from '../store.ts';

const LEN = 3;
/** the block alone, as the gallery shows it, with this project's own modules and theme (its preview loads them from the project folder) */
function previewOf(p: Project, type: string, kind: 'scene' | 'overlay') {
  return { version: 1, meta: { name: type, width: 1080, height: 1920, fps: 30, duration: LEN, plugins: p.meta.plugins, background: '#3a4256', mix: p.meta.mix, fx: p.meta.fx ?? [], ...(p.meta.theme ? { theme: p.meta.theme } : {}) },
    sources: {}, media: {}, grids: [], tracks: [{ id: 'g', kind, items: [{ id: 'block', type, start: 0, end: LEN, params: {} }] }] };
}

export function SaveBlockDialog({ d, project, projectId, kind, onPatch, onSave, onClose }: {
  d: SaveDialog; project: Project; projectId: string; kind?: 'scene' | 'overlay';
  onPatch: (p: Partial<Pick<SaveDialog, 'name' | 'desc' | 'category' | 'generalize'>>) => void;
  onSave: (onConflict?: 'replace' | 'keep-both') => void; onClose: () => void;
}) {
  const nameBox = useRef<HTMLInputElement>(null);
  useEffect(() => { nameBox.current?.focus(); nameBox.current?.select(); }, [d.target]);
  const close = () => { if (!d.busy) onClose(); };
  const block = d.kind === 'block', files = d.preview?.files.filter((f) => !f.startsWith('fx/')) ?? [];
  const group = d.preview?.group ?? [];
  // a conflict is settled by the two buttons; making it generic hands it to the Agent, which saves with replace
  const conflict = d.conflict && !d.generalize;
  return (
    <div class="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="save-block" data-save-dialog={d.kind} role="dialog" aria-labelledby="save-block-title" onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
        <h3 id="save-block-title">{t(block ? 'lib.dialogTitle' : 'lib.dialogStyleTitle')}</h3>
        <div class={`save-block-body${block ? '' : ' no-preview'}`}>
          {block && kind && <div class="save-block-preview" aria-label={t('lib.previewTitle')}><PlayerPreview project={previewOf(project, d.target, kind)} src={projectPlayer(projectId)} /></div>}
          <div class="save-block-form">
            <label>{t('lib.name')}<input ref={nameBox} data-save-name value={d.name} maxLength={60} onInput={(e) => onPatch({ name: (e.target as HTMLInputElement).value })} /></label>
            {block && <label>{t('lib.category')}
              <select data-save-category value={d.category} onChange={(e) => onPatch({ category: (e.target as HTMLSelectElement).value })}>
                <option value="">{t('lib.categoryOther')}</option>
                {(Object.keys(BLOCK_CATEGORY) as BlockCategory[]).map((c) => <option value={c}>{t(`cat.block.${c}` as Key)}</option>)}
              </select></label>}
            <label>{t('lib.desc')}<input data-save-desc value={d.desc} maxLength={200} placeholder={t('lib.descPh')} onInput={(e) => onPatch({ desc: (e.target as HTMLInputElement).value })} /></label>
          </div>
        </div>
        {block && <label class="save-block-generalize">
          <input type="checkbox" data-save-generalize checked={d.generalize} onClick={(e) => onPatch({ generalize: (e.target as HTMLInputElement).checked })} />
          <span><strong>{t('lib.generalize')}</strong><small>{t('lib.generalizeHint')}</small></span>
        </label>}
        {block && <div class="save-block-notes" data-save-notes>
          {!d.preview && !d.error && <p class="dim">{t('lib.checking')}</p>}
          {files.length > 0 && <p>{t('lib.withFiles', { files: files.map((f) => f.split('/').pop()).join('、') })}</p>}
          {group.length > 0 && <p>{t('lib.withGroup', { names: nameList(group.map((x) => x.replace(/^fx\./, ''))) })}</p>}
          {!!d.preview?.skipped.length && <p class="warn">{t('lib.skipped', { n: d.preview.skipped.length })}</p>}
        </div>}
        {conflict && <p class="save-block-conflict" data-save-conflict>{t('lib.conflict', { name: d.conflict! })}</p>}
        {d.error && <p class="save-block-error" role="alert">{d.error}</p>}
        <footer>
          <button data-save-cancel onClick={close} disabled={d.busy}>{t('lib.cancel')}</button>
          {conflict ? <>
            <button data-save-keep-both onClick={() => onSave('keep-both')} disabled={d.busy}>{t('lib.keepBoth')}</button>
            <button class="primary" data-save-replace onClick={() => onSave('replace')} disabled={d.busy}>{t('lib.replace')}</button>
          </> : <button class="primary" data-save-confirm onClick={() => onSave()} disabled={d.busy || !d.name.trim()}>
            {t(d.busy ? 'lib.saving' : d.generalize ? 'lib.handOff' : 'lib.save')}</button>}
        </footer>
      </div>
    </div>
  );
}
