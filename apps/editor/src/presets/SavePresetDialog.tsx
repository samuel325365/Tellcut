// "Save as my preset" and "Edit my preset" (spec 2026-10-29-my-library §3.5, §3.6): the poster on the left; the name, one line and
// "This preset will:" point by point on the right, each one editable in place, removable and addable; then what it brings along
// (fonts and colours, the music style, the effects), each with a look at what it is and a tick to leave it out. The points are the
// whole of what the agent is told (presets/save.ts): nothing the user cannot see goes with them, and the dialog says so. A preset with
// nothing to say is not saved. One from the custom form or from nothing (MinePreset.tsx) has no film to take a poster from: a colour
// stands in for it until a picture is uploaded.
import { useEffect, useRef, useState } from 'preact/hooks';
import { errText, t, uiLabel } from '../i18n/index.ts';
import { pointsOut, type PointOut, type PointRow } from './save.ts';

export interface PresetBring { fonts: string[]; colors: string[]; score?: string; blocks: string[] }
export interface PresetDialogValue { name: string; summary: string; points: PointOut[]; include: { theme: boolean; score: boolean; blocks: boolean }; useFrame: boolean; upload: File | null; color?: string }

export function SavePresetDialog({ mode, surface, initial, bring, poster, onSave, onClose }: {
  mode: 'save' | 'edit'; surface: 'home' | 'editor';
  initial: { name: string; summary: string; rows: PointRow[] };
  bring: PresetBring;
  /** src: the picture now; frameAt: offer the editor's current frame (its time, shown); upload: offer a picture of the user's own;
   *  color: the card's ground while there is no picture, offered to change */
  poster: { src: string | null; frameAt?: string; upload?: boolean; color?: string };
  onSave: (v: PresetDialogValue) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(initial.name), [summary, setSummary] = useState(initial.summary);
  const [rows, setRows] = useState<PointRow[]>(initial.rows);
  const [include, setInclude] = useState({ theme: true, score: true, blocks: true });
  const [useFrame, setUseFrame] = useState(false), [upload, setUpload] = useState<File | null>(null), [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [color, setColor] = useState(poster.color);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const nameBox = useRef<HTMLInputElement>(null);
  useEffect(() => { nameBox.current?.focus(); }, []);
  useEffect(() => () => { if (uploadUrl) URL.revokeObjectURL(uploadUrl); }, [uploadUrl]);
  const close = () => { if (!busy) onClose(); };
  const setRow = (i: number, text: string) => setRows((r) => r.map((x, k) => (k === i ? { ...x, text } : x)));
  const theme = bring.fonts.length > 0 || bring.colors.length > 0, said = rows.some((r) => r.text.trim());
  const save = async () => {
    setBusy(true); setError('');
    try { await onSave({ name: name.trim(), summary: summary.trim(), points: pointsOut(rows), include, useFrame, upload, ...(color ? { color } : {}) }); }
    catch (e) { setError(errText(e)); setBusy(false); }
  };
  return (
    <div class="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="save-preset" data-save-preset-dialog={mode} role="dialog" aria-labelledby="save-preset-title" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <h3 id="save-preset-title">{uiLabel(mode === 'save' ? 'preset.saveTitle' : 'preset.editTitle', surface)}</h3>
        <div class="save-preset-top">
          <div class="save-preset-poster">
            <div class="poster-box">{uploadUrl || poster.src ? <img src={uploadUrl ?? poster.src!} alt="" />
              : color ? <span class="poster-fallback" data-poster-color style={`background: linear-gradient(160deg, ${color}, ${color}66 70%, #0b0a12)`}>{name}</span>
              : <span class="dim">{t('preset.posterProject')}</span>}
              {useFrame && <span class="poster-frame">{poster.frameAt}</span>}</div>
            {poster.frameAt && <label class="poster-opt"><input type="checkbox" data-preset-use-frame checked={useFrame} onClick={(e) => setUseFrame((e.target as HTMLInputElement).checked)} />{t('preset.posterFrame', { t: poster.frameAt })}</label>}
            {color && !uploadUrl && <label class="poster-opt poster-color">{t('preset.color')}
              <input type="color" data-preset-color value={color} onInput={(e) => setColor((e.target as HTMLInputElement).value)} /></label>}
            {poster.upload && <label class="poster-opt poster-upload">{t('preset.posterUpload')}
              <input type="file" data-preset-upload accept="image/jpeg,image/png,image/webp" onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                setUpload(f); setUploadUrl(f ? URL.createObjectURL(f) : null);
              }} /></label>}
          </div>
          <div class="save-preset-fields">
            <label>{t('preset.name')}<input ref={nameBox} data-preset-name value={name} maxLength={40} placeholder={t('preset.namePh')} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
            <label>{t('preset.summaryLabel')}<input data-preset-summary value={summary} maxLength={120} onInput={(e) => setSummary((e.target as HTMLInputElement).value)} /></label>
          </div>
        </div>
        <div class="save-preset-points">
          <h5>{t('preset.pointsHead')}<small>{t('preset.pointsHint')}</small></h5>
          <p class="dim save-preset-only" data-preset-only>{t('preset.pointsOnly')}</p>
          <ul data-preset-points>{rows.map((r, i) => (
            <li><span class="dot">•</span><input data-preset-point={i} value={r.text} onInput={(e) => setRow(i, (e.target as HTMLInputElement).value)} />
              <button class="x" data-preset-point-remove={i} aria-label={t('preset.removePoint')} data-tip={t('preset.removePoint')} onClick={() => setRows((x) => x.filter((_, k) => k !== i))}>×</button></li>
          ))}</ul>
          <button class="add" data-preset-point-add onClick={() => setRows((x) => [...x, { text: '' }])}>{t('preset.addPoint')}</button>
        </div>
        {(theme || bring.score || bring.blocks.length > 0) && <div class="save-preset-bring">
          <h5>{t('preset.bringHead')}</h5>
          {theme && <label data-bring="theme"><input type="checkbox" checked={include.theme} onClick={(e) => setInclude({ ...include, theme: (e.target as HTMLInputElement).checked })} />
            <span class="what">{t('preset.bringTheme')}</span><span class="look">{bring.fonts.join(' · ')}{bring.colors.map((c) => <i class="swatch" style={{ background: c }} />)}</span></label>}
          {bring.score && <label data-bring="score"><input type="checkbox" checked={include.score} onClick={(e) => setInclude({ ...include, score: (e.target as HTMLInputElement).checked })} />
            <span class="what">{t('preset.bringScore')}</span><span class="look">{bring.score}</span></label>}
          {bring.blocks.length > 0 && <label data-bring="blocks"><input type="checkbox" checked={include.blocks} onClick={(e) => setInclude({ ...include, blocks: (e.target as HTMLInputElement).checked })} />
            <span class="what">{t('preset.bringBlocks', { n: bring.blocks.length })}</span><span class="look">{bring.blocks.join('、')}</span></label>}
          {mode === 'save' && bring.blocks.length > 0 && include.blocks && <p class="dim">{t('preset.bringBlocksNote')}</p>}
        </div>}
        {error && <p class="save-preset-error" role="alert">{error}</p>}
        <footer>
          <button data-preset-cancel onClick={close} disabled={busy}>{uiLabel('lib.cancel', surface)}</button>
          <button class="primary" data-preset-save onClick={() => void save()} disabled={busy || !name.trim() || !said} {...(!said ? { 'data-tip': t('preset.noPoints') } : {})}>{uiLabel(busy ? 'preset.saving' : 'preset.save', surface)}</button>
        </footer>
      </div>
    </div>
  );
}
