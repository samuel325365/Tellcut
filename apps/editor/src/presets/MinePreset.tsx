// A preset of the user's own in its dialog on the home page (spec 2026-10-29-my-library §3.6): what it will do point by point and what
// it uses (fonts and colours, a music style, blocks of My blocks — one deleted since says so), with Edit, Rename and Delete; and the
// custom form's "Save as my preset" (§3.7), which keeps the options chosen without making a film first, and the home page's "New
// preset", which starts from nothing: both open the dialog a film's preset is saved in.
import { useEffect, useState } from 'preact/hooks';
import { pickText, type PresetInfo } from '@tellcut/protocol';
import { errText, t } from '../i18n/index.ts';
import { getLang } from '../i18n/lang.ts';
import { SavePresetDialog } from './SavePresetDialog.tsx';
import type { PointRow } from './save.ts';

export interface PresetApi {
  savePreset: (b: Record<string, unknown>) => Promise<PresetInfo>;
  updatePreset: (id: string, b: Record<string, unknown>) => Promise<PresetInfo>;
  deletePreset: (id: string) => Promise<unknown>;
  presetPoster: (id: string, file: Blob) => Promise<PresetInfo>;
  formPoints: (b: Record<string, unknown>) => Promise<{ points: Array<{ text: string; prompt: string }> }>;
}

/** the points and uses, shown in the dialog's body */
export function MinePresetBody({ preset }: { preset: PresetInfo }) {
  const u = preset.uses;
  return <>
    {!!preset.points?.length && <><h5>{t('preset.pointsHead')}</h5><ul class="preset-points" data-preset-points-view>{preset.points.map((p) => <li>{p}</li>)}</ul></>}
    {u && (u.fonts.length > 0 || u.colors.length > 0 || u.score || u.blocks.length > 0) && <><h5>{t('preset.usesHead')}</h5>
      <div class="preset-uses" data-preset-uses>
        {(u.fonts.length > 0 || u.colors.length > 0) && <span class="use">{u.fonts.join(' · ')}{u.colors.map((c) => <i class="swatch" style={{ background: c }} />)}</span>}
        {u.score && <span class={`use${u.score.gone ? ' gone' : ''}`}>♪ {u.score.name}{u.score.gone && <small>{t('preset.gone')}</small>}</span>}
        {u.blocks.map((b) => <span class={`use block${b.gone ? ' gone' : ''}`} data-use-block={b.slug}>{b.thumb && <img src={b.thumb} alt="" />}{b.name}{b.gone && <small>{t('preset.gone')}</small>}</span>)}
      </div></>}
  </>;
}

/** Edit / Rename / Delete, at the left of the dialog's footer; each change reloads the presets (onChanged) */
export function MinePresetActions({ preset, api, onChanged, onGone }: { preset: PresetInfo; api: PresetApi; onChanged: () => void; onGone: () => void }) {
  const lang = getLang(), name = pickText(preset.name, lang) ?? preset.id;
  const [mode, setMode] = useState<null | 'edit' | 'rename' | 'delete'>(null), [nm, setNm] = useState(name), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>, after = onChanged) => { setBusy(true); setError(''); try { await f(); setMode(null); after(); } catch (e) { setError(errText(e)); } finally { setBusy(false); } };
  const u = preset.uses;
  return (
    <div class="mine-actions">
      <button data-preset-edit onClick={() => setMode('edit')}>{t('preset.edit')}</button>
      <button data-preset-rename onClick={() => { setNm(name); setMode(mode === 'rename' ? null : 'rename'); }}>{t('preset.rename')}</button>
      <button class="danger" data-preset-delete onClick={() => setMode(mode === 'delete' ? null : 'delete')}>{t('preset.delete')}</button>
      {mode === 'rename' && <span class="mine-inline"><input data-preset-rename-input value={nm} maxLength={40} onInput={(e) => setNm((e.target as HTMLInputElement).value)} />
        <button class="primary" data-preset-rename-save disabled={busy || !nm.trim()} onClick={() => void run(() => api.updatePreset(preset.id, { name: nm.trim(), lang }))}>{t('preset.renameSave')}</button></span>}
      {mode === 'delete' && <span class="mine-inline" data-preset-delete-confirm-box>{t('preset.deleteConfirm', { name })}
        <button class="danger" data-preset-delete-confirm disabled={busy} onClick={() => void run(() => api.deletePreset(preset.id), onGone)}>{t('preset.delete')}</button></span>}
      {error && <span class="err" role="alert">{error}</span>}
      {mode === 'edit' && <SavePresetDialog mode="edit" surface="home"
        initial={{ name, summary: pickText(preset.summary, lang) ?? '', rows: (preset.points ?? []).map((p) => ({ text: p, orig: p })) }}
        bring={{ fonts: u?.fonts ?? [], colors: u?.colors ?? [], score: u?.score?.name, blocks: (u?.blocks ?? []).map((b) => b.name) }}
        poster={{ src: preset.poster, upload: true }}
        onClose={() => setMode(null)}
        onSave={async (v) => {
          try {
            await api.updatePreset(preset.id, { name: v.name, summary: v.summary, points: v.points, include: v.include, lang });
            if (v.upload) await api.presetPoster(preset.id, v.upload);
          } catch (e) { throw new Error(errText(e)); }
          setMode(null); onChanged();
        }} />}
    </div>
  );
}

const COLOR = '#4263eb';

/** "Save as my preset" from the custom form (`fields`, `examples`: what it has set) or "New preset" from nothing: the same dialog as a
 *  film's, its points first filled from the options chosen (the server words them, with their lines for the agent) */
export function NewPresetDialog({ api, fields, examples, onSaved, onClose }: { api: PresetApi; fields?: Record<string, string>; examples?: string[]; onSaved: () => void; onClose: () => void }) {
  const [rows, setRows] = useState<PointRow[] | null>(fields ? null : [{ text: '' }]), [error, setError] = useState('');
  useEffect(() => {
    if (!fields) return;
    api.formPoints({ fields, examples: examples ?? [], lang: getLang() })
      .then((r) => setRows(r.points.length ? r.points.map((p) => ({ text: p.text, orig: p.text, prompt: p.prompt })) : [{ text: '' }]), (e) => setError(errText(e)));
  }, []);
  if (error) return <span class="err" role="alert">{error}</span>;
  if (!rows) return null;
  return <SavePresetDialog mode="save" surface="home" initial={{ name: '', summary: '', rows }} bring={{ fonts: [], colors: [], blocks: [] }}
    poster={{ src: null, upload: true, color: COLOR }} onClose={onClose}
    onSave={async (v) => {
      try {
        const info = await api.savePreset({ from: 'form', name: v.name, summary: v.summary, color: v.color, fields: fields ?? {}, points: v.points, lang: getLang() });
        if (v.upload) await api.presetPoster(info.id, v.upload);
      } catch (e) { throw new Error(errText(e)); }
      onSaved(); onClose();
    }} />;
}

/** the custom form's "Save as my preset": keeps the options chosen, without making a film first */
export function SaveFormPreset({ api, fields, examples, onSaved }: { api: PresetApi; fields: () => Record<string, string>; examples: () => string[]; onSaved: () => void }) {
  const [open, setOpen] = useState<{ fields: Record<string, string>; examples: string[] } | null>(null);
  return <>
    <button data-preset-save-form data-tip={t('preset.saveFormTip')} onClick={() => setOpen({ fields: fields(), examples: examples() })}>{t('preset.saveForm')}</button>
    {open && <NewPresetDialog api={api} fields={open.fields} examples={open.examples} onSaved={onSaved} onClose={() => setOpen(null)} />}
  </>;
}
